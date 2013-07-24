
/**
 * @type {RegExp}
 * @const
 */
var rgxEventSplitter = /[. :]+/;

/**
 * baseModel
 * @constructor
 */
var baseModel = {
    isModel: true,
    make: function (opts) {
        var self = this;
        // Each TBone model/collection is an augmented copy of this TBoneModel function
        var instance = function TBoneModel (arg0, arg1, arg2) {
            if (typeof arg0 === 'function') {
                return autorun(arg0, arg1, arg2);
            } else if (typeof arg1 === 'function' && !isQueryable(arg1)) {
                return instance['query'](arg0, boundModel.extend({ 'state': arg1 }).make());
            } else {
                return (arguments.length === 1 ? instance['query'](arg0) :
                        arguments.length === 2 ? instance['query'](arg0, arg1) :
                                                 instance['query'](arg0, arg1, arg2));
            }
        };
        _.extend(instance, self, isFunction(opts) ? { 'state': opts } : opts || {});

        // Initialize the model instance
        delete instance['tboneid'];
        delete instance['attributes'];
        instance._events = {};
        instance._removeCallbacks = {};
        uniqueId(instance);
        instance['initialize']();

        return instance;
    },
    'extend': function (subclass) {
        return _.extend({}, this, subclass);
    },
    'initialize': noop,
    'on': function (name, callback, context) {
        var parts = name.split(rgxEventSplitter);
        var events = this._events;
        var arg;

        while ((arg = parts.shift()) != null) {
            if (arg === '') {
                continue;
            }
            if (!events[arg]) {
                events[arg] = {};
            }
            events = events[arg];
        }
        var callbacks = events[''];
        if (!callbacks) {
            callbacks = events[''] = [];
        }
        callbacks.push({ callback: callback, context: context });

        /**
         * Wake up and reset this and other models that may be sleeping because
         * they did not need to be updated.
         */
        this.wake({});
    },
    'off': function (name, callback, context) {
        // XXX name & callback not supported.
        // XXX doesn't clean up when callbacks list goes to zero length
        var stack = [ this._events ];
        var next, callbacks, k;

        while (!!(next = stack.pop())) {
            for (k in next) {
                if (k === '') {
                    var newCallbacks = [];
                    callbacks = next[''];
                    for (var i = 0; i < next[k].length; i++) {
                        if (callbacks[i].context !== context) {
                            newCallbacks.push(callbacks[i]);
                        }
                    }
                    next[''] = newCallbacks;
                } else {
                    stack.push(next[k]);
                }
            }
        }
    },
    'trigger': function (name) {
        var self = this;
        var events = self._events;
        var parts = name.split(rgxEventSplitter);
        var arg;
        while ((arg = parts.shift()) != null) {
            if (arg === '') {
                continue;
            }
            if (!events[arg]) {
                events[arg] = {};
            }
            events = events[arg];
        }
        var callbacks = events[QUERY_SELF] || [];
        for (var i = 0; i < callbacks.length; i++) {
            callbacks[i].callback.call(callbacks[i].context);
        }
    },

    'query': query,

    'queryModel': function (prop) {
        return this['query'](DONT_GET_DATA, prop);
    },

    'idAttribute': 'id',

    'queryId': function () {
        return this['query'](this['idAttribute']);
    },

    'toggle': function (prop) {
        this['query'](QUERY_TOGGLE, prop);
    },

    'push': function (prop, value) {
        if (arguments.length === 1) {
            value = prop;
            prop = '';
        }
        this['query'](QUERY_PUSH, prop, value);
    },

    'unshift': function (prop, value) {
        if (arguments.length === 1) {
            value = prop;
            prop = '';
        }
        this['query'](QUERY_UNSHIFT, prop, value);
    },

    'removeFirst': function (prop) {
        this['query'](QUERY_REMOVE_FIRST, prop);
    },

    'removeLast': function (prop) {
        this['query'](QUERY_REMOVE_LAST, prop);
    },

    'unset': function (prop) {
        this['query'](QUERY_UNSET, prop);
    },

    'increment': function (prop, value) {
        this['query'](QUERY_INCREMENT, prop, value != null ? value : 1);
    },

    'clear': function () {
        this['query']('', undefined);
    },

    'toJSON': function () {
        return this.attributes;
    },

    wake: noop,

    'queryText': queryText, // deprecated
    'text': queryText, // deprecated
    'lookup': query, // deprecated
    'lookupText': queryText, // deprecated
    'set': query, // deprecated
    'get': query // deprecated

};

var boundModel = baseModel.extend({
    /**
     * Constructor function to initialize each new model instance.
     * @return {[type]}
     */
    'initialize': function () {
        var self = this;
        /**
         * Queue the autorun of update.  We want this to happen after the current JS module
         * is loaded but before anything else gets updated.  We can't do that with setTimeout
         * or _.defer because that could possibly fire after processQueue.
         */
        self.scope = autorun(self.update, self, self.scopePriority,
                             'model_' + self.Name, self.onScopeExecute, self);
    },

    scopePriority: BASE_PRIORITY_MODEL_SYNC,

    /**
     * Wake up this model as well as (recursively) any models that depend on
     * it.  Any view that is directly or indirectly depended on by the current
     * model may now be able to be awoken based on the newly-bound listener to
     * this model.
     * @param  {Object.<string, Boolean>} woken Hash map of model IDs already awoken
     */
    wake: function (woken) {
        // Wake up this model if it was sleeping
        if (this.sleeping) {
            this.sleeping = false;
            this.reset();
        }
        /**
         * Wake up models that depend directly on this model that have not already
         * been woken up.
         * XXX - how does this work?
         */
        _.each((this.scope && this.scope.lookups) || [], function (lookup) {
            var bindable = lookup.__obj__;
            if (bindable && !woken[uniqueId(bindable)]) {
                woken[uniqueId(bindable)] = true;
                bindable.wake(woken);
            }
        });
    },

    onScopeExecute: function (scope) {
        log(INFO, this, 'lookups', scope.lookups);
    },

    update: function () {
        var self = this;
        self['query'](QUERY_SELF, self['state']());
        log(VERBOSE, self, 'updated', self.attributes);
    },

    /**
     * Triggers scope re-execution.
     */
    reset: function () {
        if (this.scope) {
            this.scope.trigger();
        }
    },

    /**
     * returns the new state, synchronously
     */
    'state': noop
});

var asyncModel = boundModel.extend({
    update: function () {
        var self = this;
        self.sleeping = self['sleepEnabled'] && !hasViewListener(self);
        if (self.sleeping) {
            /**
             * This model will not update itself until there's a view listener
             * waiting for data (directly or through a chain of other models)
             * from this model.
             */
            log(INFO, self, 'sleep');
        } else {
            // XXX do we want to allow rolling updates?  i.e., instead of only
            // allowing updates from the current generation, allow updates
            // greater than or equal to the generation of the last update?
            var generation = self.generation = (self.generation || 0) + 1;
            if (self.abortCallback) {
                self.abortCallback();
            }
            var opts = self['state'](function (value) {
                if (generation === self.generation) {
                    self.abortCallback = null;
                    self['query']('', value);
                }
            });
            self.abortCallback = opts && opts['onAbort'];
        }
    },

    scopePriority: BASE_PRIORITY_MODEL_ASYNC,

    'sleepEnabled': false

});

var ajaxModel = asyncModel.extend({
    'state': function (cb) {
        var self = this;
        var myXhr;
        function complete() {
            if (myXhr) {
                inflight--;
                myXhr = null;
            }
        }

        var url = self.url();
        if (url != null && url !== self.fetchedUrl) {
            /**
             * If a defined URL function returns null, it will prevent fetching.
             * This can be used e.g. to prevent loading until all required
             * parameters are set.
             **/
            self.fetchedUrl = url;
            if (self['clearOnFetch']) {
                self.clear();
            }
            sync('read', self, {
                'dataType': 'text',
                'success': function (resp) {
                    cb(self.parse(resp));
                    self['postFetch']();
                    self.trigger('fetch');
                    log(INFO, self, 'updated', self.attributes);
                },
                'complete': complete,
                'beforeSend': function (xhr) {
                    inflight++;
                    myXhr = xhr;
                    xhr['__tbone__'] = true;
                },
                'url': url
            });
        }
        return {
            onAbort: function () {
                // If we have an active XHR in flight, we should abort
                // it because we don't want that anymore.
                if (myXhr) {
                    log(WARN, self, 'abort',
                        'aborting obsolete ajax request. old url: <%=oldurl%>', {
                        'oldurl': self.fetchedUrl
                    });
                    myXhr.abort();
                    complete();
                }
            }
        };
    },

    /**
     * By default, async models will use $.ajax to fetch data; override this
     * with something else if desired.
     */
    'ajax': function () {
        return $.ajax.apply($, arguments);
    },

    'postFetch': noop,

    'clearOnFetch': true, // XXX move to async model

    'sleepEnabled': true

});

var localStorageModel = baseModel.extend({
    /**
     * To use, extend this model and specify key as a property.
     *
     * For example:
     * var metrics = tbone.models.localStorage.make({ key: 'metrics' });
     * metrics.increment('pageloads');
     * console.log(metrics.query('pageloads'));
     */

    initialize: function () {
        var self = this;
        self.query('', JSON.parse(localStorage[self.key] || "null"));
        self.on('change', function () {
            localStorage[self.key] = JSON.stringify(self.attributes);
        });
    }
});

var hashModel = baseModel.extend({
    /**
     * Example:
     * var hash = tbone.models.hash.make();
     * T(function () {
     *     console.log('the hash is ' + hash('hash'));
     * });
     * hash('hash', '#this-is-the-new-hash');
     */
    initialize: function () {
        var self = this;
        function updateHash () {
            self('hash', location.hash);
        }
        $(window).bind('hashchange', function () {
            updateHash();
        });
        updateHash();

        self(function () {
            var hash = self('hash');
            if (location.hash !== hash) {
                location.hash = hash;
            }
        });
    }
});

if (TBONE_DEBUG) {
    baseModel['find'] = function (obj) {
        function recurse(o, depth) {
            if (depth > 10) {
                return [];
            }
            if (o === obj) {
                return [];
            }
            if (o !== null && typeof o === 'object') {
                var result;
                if (o.push) {
                    for (var i = 0; i < o.length; i++) {
                        if (!!(result = recurse(o[i], depth + 1))) {
                            result.unshift(k);
                            return result;
                        }
                    }
                } else {
                    for (var k in o) {
                        if (!!(result = recurse(o[k], depth + 1))) {
                            result.unshift(k);
                            return result;
                        }
                    }
                }
            }
        }
        var result = recurse(this.attributes, 0);
        return result ? result.join('.') : null;
    };
}
