
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
                return instance['query'](arg0, self.extend(arg1).make());
            } else {
                return (arguments.length === 1 ? instance['query'](arg0) :
                        arguments.length === 2 ? instance['query'](arg0, arg1) :
                                                 instance['query'](arg0, arg1, arg2));
            }
        };
        _.extend(instance, self, opts || {});

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
        return _.extend({}, this, typeof subclass === 'function' ? { 'state': subclass } : subclass);
    },
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

    /**
     * Constructor function to initialize each new model instance.
     * @return {[type]}
     */
    'initialize': function () {
        var self = this;

        var isAsync = self.sleeping = self.isAsync();
        var priority = isAsync ? BASE_PRIORITY_MODEL_ASYNC : BASE_PRIORITY_MODEL_SYNC;
        /**
         * Queue the autorun of update.  We want this to happen after the current JS module
         * is loaded but before anything else gets updated.  We can't do that with setTimeout
         * or _.defer because that could possibly fire after processQueue.
         */
        self.scope = autorun(self.update, self, priority, 'model_' + self.Name,
                             self.onScopeExecute, self);
    },

    'query': query,
    'queryText': queryText, // deprecated
    'text': queryText, // deprecated

    'idAttribute': 'id',

    'queryId': function () {
        return this['query'](this['idAttribute']);
    },

    'lookup': query, // deprecated
    'lookupText': queryText, // deprecated
    'set': query, // deprecated
    'get': query, // deprecated

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
         */
        _.each((this.scope && this.scope.lookups) || [], function (lookup) {
            var bindable = lookup.__obj__;
            if (bindable && !woken[uniqueId(bindable)]) {
                woken[uniqueId(bindable)] = true;
                bindable.wake(woken);
            }
        });
    },

    'toJSON': function () {
        return this.attributes;
    },

    /**
     * Indicates whether this function should use the asynchronous or
     * synchronous logic.
     * @return {Boolean}
     */
    isAsync: function () {
        return !!this['url'];
    },
    onScopeExecute: function (scope) {
        log(INFO, this, 'lookups', scope.lookups);
    },
    'clear': function () {
        this['query']('', undefined);
    },
    /**
     * Triggers scope re-execution.
     */
    reset: function () {
        if (this.scope) {
            this.scope.trigger();
        }
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
        var myXhr;
        function complete() {
            if (myXhr === self.xhrInFlight) {
                inflight--;
                delete self.xhrInFlight;
            }
        }

        var url = self.url();
        var lastFetchedUrl = self.fetchedUrl;
        self.sleeping = !hasViewListener(self);
        if (self.sleeping) {
            /**
             * Regardless of whether url is non-null, this model goes to sleep
             * if there's no view listener waiting for data (directly or through
             * a chain of other models) from this model.
             **/
            log(INFO, self, 'sleep');
            self.sleeping = true;
        } else if (url != null && url !== lastFetchedUrl) {
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
                    self['query'](QUERY_SELF, self.parse(resp));
                    self['postFetch']();
                    self.trigger('fetch');
                    log(INFO, self, 'updated', self.attributes);
                },
                'complete': complete,
                'beforeSend': function (xhr) {
                    // If we have an active XHR in flight, we should abort
                    // it because we don't want that anymore.
                    if (self.xhrInFlight) {
                        log(WARN, self, 'abort',
                            'aborting obsolete ajax request. old: <%=oldurl%>, new: <%=newurl%>', {
                            'oldurl': lastFetchedUrl,
                            'newurl': url
                        });
                        self.xhrInFlight.abort();
                        complete(); // Decrement inflight counter
                    }
                    inflight++;
                    myXhr = self.xhrInFlight = xhr;
                    xhr['__tbone__'] = true;
                },
                'url': url
            });
        }
    },
    updateSync: function () {
        var self = this;
        // this.state returns the new state, synchronously
        if (self['state']) {
            self['query'](QUERY_SELF, self['state']());
            log(VERBOSE, self, 'updated', self.attributes);
        }
    },

    /**
     * By default, async models will use $.ajax to fetch data; override this
     * with something else if desired.
     */
    'ajax': function () {
        return $.ajax.apply($, arguments);
    },

    'state': null,
    'postFetch': noop,

    'clearOnFetch': true
};

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
