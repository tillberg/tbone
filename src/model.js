
/**
 * baseModel
 * @constructor
 * @extends Backbone.Model
 */
var baseModel = {
    isModel: true,
    make: function () {
        var instance = function (arg0, arg1, arg2) {
            if (arg0) {
                if (typeof arg0 === 'function') {
                    return autorun(arg0, arg1, arg2);
                } else if (typeof arg1 === 'function' && !arg1['isBindable']) {
                    return autorun(function () {
                        T(arg0, arg1());
                    });
                } else {
                    return instance['query'].apply(instance, arguments);
                }
            }
        };
        _.extend(instance, this);
        instance.construct();
        return instance;
    },
    construct: function () {
        this._events = {};
        this.attributes = {};
    },
    extend: function (subclass) {
        return _.extend({}, subclass, this);
    },
    on: function (name, callback, context) {
        var parts = name.split(/\W+/);
        var events = this._events;
        var arg;

        while ((arg = parts.shift()) != null) {
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
    },
    off: function (name, callback, context) {
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
};
