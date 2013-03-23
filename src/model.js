
Backbone.Model.prototype.isModel = true;

_.extend(Backbone.Model.prototype, {
    set: function(key, val, options) {
        var attr, attrs, unset, changes, silent, changing, prev, current;
        if (key == null) return this;

        // Handle both `"key", value` and `{key: value}` -style arguments.
        if (typeof key === 'object') {
            attrs = key;
            options = val;
        } else {
            (attrs = {})[key] = val;
        }

        if (!options) options = {};

        // Run validation.
        if (!this._validate(attrs, options)) return false;

        // Extract attributes and options.
        unset           = options.unset;
        silent          = options.silent;
        changes         = [];
        changing        = this._changing;
        this._changing  = true;

        if (!changing) {
            this._previousAttributes = _.clone(this.attributes);
            this.changed = {};
        }
        current = this.attributes, prev = this._previousAttributes;

        // Check for changes of `id`.
        if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

        // For each `set` attribute, update or delete the current value.
        for (attr in attrs) {
            val = attrs[attr];
            if (!_.isEqual(current[attr], val)) changes.push(attr);
            if (!_.isEqual(prev[attr], val)) {
                this.changed[attr] = val;
            } else {
                delete this.changed[attr];
            }
            if (unset) {
                delete current[attr];
            } else {
                current[attr] = val;
            }
        }

        // Trigger all relevant attribute changes.
        if (!silent) {
            if (changes.length) this._pending = true;
            for (var i = 0, l = changes.length; i < l; i++) {
                this.trigger('change:' + changes[i], this, current[changes[i]], options);
            }
        }

        // You might be wondering why there's a `while` loop here. Changes can
        // be recursively nested within `"change"` events.
        if (changing) return this;
        if (!silent) {
            while (this._pending) {
                this._pending = false;
                this.trigger('change', this, options);
            }
        }
        this._pending = false;
        this._changing = false;
        return this;
    }

});

/**
 * baseModel
 * @constructor
 * @extends Backbone.Model
 */
var baseModel = Backbone.Model.extend({
    /**
     * Constructor function to initialize each new model instance.
     * @return {[type]}
     */
    initialize: function () {
        var self = this;
        uniqueId(self);
        var isAsync = self.sleeping = self.isAsync();
        var priority = isAsync ? BASE_PRIORITY_MODEL_ASYNC : BASE_PRIORITY_MODEL_SYNC;
        /**
         * Queue the autorun of update.  We want this to happen after the current JS module
         * is loaded but before anything else gets updated.  We can't do that with setTimeout
         * or _.defer because that could possibly fire after processQueue.
         */
        queueExec({
            execute: function () {
                self.scope = autorun(self.update, self, priority, 'model_' + self.name,
                                     self.onScopeExecute, self);
            },
            priority: priority + PRIORITY_INIT_DELTA
        });
    },
    /**
     * Indicates whether this function should use the asynchronous or
     * synchronous logic.
     * @return {Boolean}
     */
    isAsync: function () {
        return !!this['_url'];
    },
    onScopeExecute: function (scope) {
        log(INFO, this, 'lookups', scope.lookups);
    },
    /**
     * Triggers scope re-execution.
     */
    reset: function () {
        if (this.scope) {
            this.scope.trigger();
        }
    },
    'isVisible': function () {
        return hasViewListener(this);
    },
    update: function () {
        var self = this;
        if (self.isAsync()) {
            self.updateAsync();
        } else {
            self.updateSync();
        }
    },
    updateAsync: function () {
        var self = this;
        var expirationSeconds = self['expirationSeconds'];
        function complete() {
            inflight--;
            delete self.__xhr;
            if (expirationSeconds) {
                if (self.expirationTimeout) {
                    clearTimeout(self.expirationTimeout);
                }
                self.expirationTimeout = setTimeout(function () {
                    self.reset();
                }, expirationSeconds * 1000);
            }
        }

        var url = self.url();
        var lastFetchedUrl = self.fetchedUrl;
        self.sleeping = !this['isVisible']();
        if (self.sleeping) {
            /**
             * Regardless of whether url is non-null, this model goes to sleep
             * if there's no view listener waiting for data (directly or through
             * a chain of other models) from this model.
             **/
            log(INFO, self, 'sleep');
            self.sleeping = true;
        } else if (url != null && (expirationSeconds || url !== lastFetchedUrl)) {
            /**
             * If a defined URL function returns null, it will prevent fetching.
             * This can be used e.g. to prevent loading until all required
             * parameters are set.
             **/
            self.fetchedUrl = url;
            self.clear();
            inflight++;
            self.fetch({
                'dataType': 'text',
                success: function () {
                    self['postFetch']();
                    self.trigger('fetch');
                    log(INFO, self, 'updated', self.toJSON());
                    complete();
                },
                error: function () {
                    complete();
                },
                'beforeSend': function (xhr) {
                    // If we have an active XHR in flight, we should abort
                    // it because we don't want that anymore.
                    if (self.__xhr) {
                        log(WARN, self, 'abort',
                            'aborting obsolete ajax request. old: <%=oldurl%>, new: <%=newurl%>', {
                            'oldurl': lastFetchedUrl,
                            'newurl': url
                        });
                        self.__xhr.abort();
                    }
                    self.__xhr = xhr;
                    xhr['__backbone__'] = true;
                },
                url: url
            });
        }
    },
    updateSync: function () {
        var self = this;
        // this.state returns the new state, synchronously
        var newParams = self['state']();
        if (newParams === null) {
            log(VERBOSE, self, 'update cancelled');
            return;
        }
        lookup.call(self, QUERY_SELF, newParams);
        log(INFO, self, 'updated', self.toJSON());
    },
    'state': noop,
    'postFetch': noop
});

/**
 * Create a new model type.
 * @param  {string}                   name Model name
 * @param  {Backbone.Model|Function=} base Parent model -- or state function of simple sync model
 * @param  {Object.<string, Object>=} opts Properties to override (optional)
 * @return {Backbone.Model}
 */
function createModel(name, base, opts) {
    if (TBONE_DEBUG && !isString(name)) {
        throw 'createModel requires name parameter';
    }
    /**
     * If only a name is provided, this is a passive model.  Disable autorun so that this model
     * will only be updated by set() calls.  This is useful in building simple dynamic data
     * sources for other models.
     */
    if (!base) {
        opts = {
            initialize: noop
        };
        base = baseModel;

    /**
     * If the second parameter is a function, use it as the state function of a simple sync model.
     */
    } else if (!base['__super__']) {
        opts = {
            'state': base
        };
        base = baseModel;
    }

    opts = _.extend({
        name: name
    }, opts || {});

    var model = models[name] = base.extend(opts);

    var modelPrototype = model.prototype;
    _.extend(model, /** @lends {model} */ {
        /**
         * Create and return an instance of this model using the model name as the instance name.
         * @return {Backbone.Model}
         */
        'singleton': function () {
            return this['make'](name);
        },
        /**
         * Create and return an instance of this model at tbone.data[instanceName].
         * @return {Backbone.Model}
         */
        'make': function (instanceName) {
            var instance = new model();
            if (instanceName) {
                lookup(instanceName, instance);
            }
            return instance;
        }
    });

    return model;
}
