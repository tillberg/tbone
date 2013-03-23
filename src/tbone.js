
/** @const {boolean} */
var TBONE_DEBUG = window['TBONE_DEBUG'];

var tbone = function (arg0, arg1, arg2) {
    if (arg0) {
        if (typeof arg0 === 'function') {
            return autorun(arg0, arg1, arg2);
        } else if (typeof arg1 === 'function') {
            return autorun(function () {
                T(arg0, arg1());
            });
        } else {
            return lookup.apply(this, arguments);
        }
    }
    /**
     * Does anything make sense to do with no arguments?
     */
};
var models = {};
var collections = {};
var templates = {};
var views = {};

/**
 * Scheduling priority constants
 *
 * The scheduler will update views and models in this order:
 * 1) synchronous (local) models
 * 2) views
 * 3) asynchronous (ajax) models
 *
 * The goals of this ordering are:
 * - never render a view based on an outdated model that
 *   we can update immediately.
 * - defer ajax requests until we know that something in the
 *   UI needs its data.
 */
/** @const */
var BASE_PRIORITY_MODEL_SYNC = 3000;
/** @const */
var BASE_PRIORITY_VIEW = 2000;
/** @const */
var BASE_PRIORITY_MODEL_ASYNC = 1000;
/**
 * We also use the processQueue to initialize models & views.  By adding this delta
 * to priorities for initialization, we ensure that initialization happens in the
 * same order as execution and that it happens before execution.  For example, it
 * may be inefficient for a model to reset before a model that it depends on has
 * initialized, as dependency chains will not yet be established.
 * XXX Does this really matter?  Or matter much?
 * @const
 */
var PRIORITY_INIT_DELTA = 5000;

function identity(x) { return x; }
/** @const */
function noop () { return null; }

function isfunction (x) {
    return typeof x === 'function';
}

function isString(x) {
    return typeof x === 'string';
}

/**
 * Returns a function that returns the elapsed time.
 * @return {function(): Number} Function that returns elapsed time.
 */
function timer() {
    var start = new Date().getTime();
    /**
     * Function that returns elapsed time since the outer function was invoked.
     * @return {Number} Elapsed time in ms
     */
    return function () {
        return new Date().getTime() - start;
    };
}

function warn() {
    if (TBONE_DEBUG) {
        console.warn.apply(console, arguments);
    }
}
function error() {
    if (TBONE_DEBUG) {
        console.error.apply(console, arguments);
    }
}

/** @const */
var ERROR = 1;
/** @const */
var WARN = 2;
/** @const */
var INFO = 3;
/** @const */
var VERBOSE = 4;

var logLevels = {
    type: {

    },
    context: {

    },
    event: {

    },
    base: WARN
};
if (TBONE_DEBUG) {
    tbone['watchLog'] = function (name, level) {
        if (level == null) { level = VERBOSE; }
        logLevels.type[name] = VERBOSE;
        logLevels.context[name] = VERBOSE;
        logLevels.event[name] = VERBOSE;
    };
}

var events = [];

var viewRenders = 0;

/**
 * Dynamic counter of how many ajax requests are inflight.
 * @type {Number}
 */
var inflight = 0;

tbone['isReady'] = function () {
    return !inflight && !schedulerQueue.length;
};

var logCallbacks = [];

function log () {
    if (TBONE_DEBUG) {
        for (var i = 0; i < logCallbacks.length; i++) {
            logCallbacks[i].apply(this, arguments);
        }
    }
}

/**
 * Log an event.  The event is piped to the JS console if the level is less than or equal to the
 * matched maximum log level based on the logLevels configuration above.
 * @param  {Number}                                    level   Log level: 1=error, 2=warn, 3=info, 4=verbose
 * @param  {string|Backbone.Model|Backbone.View|Scope} context What is logging this event
 * @param  {string}                                    event   Short event type string
 * @param  {string|Object}                             msg     Message string with tokens that will be
 *                                                             rendered from data.  Or just relevant data.
 * @param  {Object=}                                   data    Relevant data
 */
function logconsole (level, context, event, msg, data) {
    var name = isString(context) ? context : context.name;
    var type = (isString(context) ? context :
                context.isModel ? 'model' :
                context.isView ? 'view' :
                context.isScope ? 'scope' : '??');
    var threshold = Math.max(logLevels.context[name] || 0,
                             logLevels.event[event] || 0,
                             logLevels.type[type] || 0) || logLevels.base;
    if (event === 'lookups') {
        msg = _.reduce(msg, function(memo, map, id) {
            memo[map.__path__] = map;
            return memo;
        }, {});
    }
    if (level <= threshold) {
        /**
         * If a msg is a string, render it as a template with data as the data.
         * If msg is not a string, just output the data below.
         */
        var templated = isString(msg) ? _.template(msg, data || {}) : '';
        var includeColon = !!templated || !!msg;
        var frame = type === name ? type : (type + ' ' + name);
        var message = frame + ' / ' + event + (includeColon ? ': ' : '');
        var logfn = console[(level === ERROR ? 'error' : level === WARN ? 'warn' : 'log')];
        logfn.call(console, message, templated || msg || '');
    }
}

function onLog (cb) {
    logCallbacks.push(cb);
}
if (TBONE_DEBUG) {
    tbone['onLog'] = onLog;
    onLog(logconsole);
}

/**
 * Returns the list of unique listeners attached to the specified model/view.
 * @param  {Backbone.Model|Backbone.View} self
 * @return {Array.<Backbone.Model|Backbone.View|Scope>} array of listeners
 */
function getListeners(self) {
    var listeners = [];
    // Older backbone:
    _.each(_.values(self['_callbacks'] || {}), function (ll) {
        var curr = ll.next;
        while (true) {
            if (curr.context) {
                listeners.push(curr.context);
                curr = curr.next;
            } else {
                break;
            }
        }
    });
    // Newer backbone:
    _.each(_.flatten(_.values(self['_events'] || {})), function (ev) {
        if (ev.context) {
            listeners.push(ev.context);
        }
    });
    return _.uniq(listeners);
}

/**
 * Returns true if there is a view that is listening (directly or indirectly)
 * to this model.  Useful for determining whether the current model should
 * be updated (if a model is updated in the forest and nobody is there to
 * hear it, then why update it in the first place?)
 * @param  {Backbone.Model|Backbone.View}  self
 * @return {Boolean}
 */
function hasViewListener(self) {
    var todo = [];
    var usedModels = {};
    todo.push(self);
    usedModels[self.name] = true;
    while (todo.length) {
        var next = todo.pop();
        var listeners = getListeners(next);
        for (var i = 0; i < listeners.length; i++) {
            var listener = listeners[i];
            if (listener.isScope) {
                // The listener context is the model or view to whom the scope belongs.
                // Here, we care about that model/view, not the scope, because that's
                // what everyone else might be listening to.
                listener = listener.context;
            }
            // listener might be undefined right now if the scope above didn't have a context.
            if (listener) {
                if (listener.isView) {
                    // We found a view that depends on the original model!
                    return true;
                }
                // listener could also have been a scope with a context that was neither
                // a model nor a view.
                if (listener.isModel) {
                    var name = listener['name'];
                    if (name && !usedModels[listener.name]) {
                        todo.push(listener);
                        usedModels[name] = true;
                    }
                }
            }
        }
    }
    return false;
}

/**
 * currentParentScope globally tracks the current executing scope, so that subscopes
 * created during its execution (i.e. by tbone.autorun) can register themselves as
 * subscopes of the parent (this is important for recursive destruction of scopes).
 */
var currentParentScope;

/**
 * An autobinding function execution scope.  See autorun for details.
 * @constructor
 */
function Scope(fn, context, priority, name, onExecuteCb, onExecuteContext) {
    _.extend(this, {
        fn: fn,
        context: context,
        priority: priority,
        name: name,
        onExecuteCb: onExecuteCb,
        onExecuteContext: onExecuteContext,
        subScopes: []
    });
}

_.extend(Scope.prototype,
    /** @lends {Scope.prototype} */ {
    /**
     * Used to identify that an object is a Scope
     * @type {Boolean}
     */
    isScope: true,
    /**
     * Queue function execution in the scheduler
     */
    trigger: function () {
        queueExec(this);
    },
    /**
     * Execute the wrapped function, tracking all values referenced through lookup(),
     * and binding to those data sources such that the function is re-executed whenever
     * those values change.  Each execution re-tracks and re-binds all data sources; the
     * actual sources bound on each execution may differ depending on what is looked up.
     */
    execute: function () {
        var self = this;
        if (!self.destroyed) {
            self.unbindAll();
            self.destroySubScopes();
            // Save our parent's lookups and subscopes.  It's like pushing our own values
            // onto the top of each stack.
            var oldLookups = recentLookups;
            this.lookups = recentLookups = {};
            var oldParentScope = currentParentScope;
            currentParentScope = self;

            // ** Call the payload function **
            // This function must be synchronous.  Anything that is looked up using
            // tbone.lookup before this function returns (that is not inside a subscope)
            // will get bound below.
            self.fn.call(self.context);

            _.each(recentLookups, function (propMap) {
                var obj = propMap['__obj__'];
                if (obj.isCollection) {
                    /**
                     * This is not as efficient as it could be.
                     */
                    obj.on('add remove reset', self.trigger, self);
                } else {
                    if (propMap['*']) {
                        obj.on('change', self.trigger, self);
                    } else {
                        for (var prop in propMap) {
                            if (prop !== '__obj__' && prop !== '__path__') {
                                obj.on('change:' + prop, self.trigger, self);
                            }
                        }
                    }
                }
            });

            // This is intended primarily for diagnostics.  onExecute may either be a
            // function, or an array with a function and a context to use for the
            // function call.  In either case, this Scope is passed as the only argument.
            if (self.onExecuteCb) {
                self.onExecuteCb.call(self.onExecuteContext, this);
            }

            // Pop our own lookups and parent scope off the stack, restoring them to
            // the values we saved above.
            recentLookups = oldLookups;
            currentParentScope = oldParentScope;
        }
    },
    /**
     * For each model which we've bound, tell it to unbind all events where this
     * scope is the context of the binding.
     */
    unbindAll: function () {
        var self = this;
        _.each(this.lookups || {}, function (propMap) {
            propMap['__obj__'].off(null, null, self);
        });
    },
    /**
     * Destroy any execution scopes that were creation during execution of this function.
     */
    destroySubScopes: function () {
        _.each(this.subScopes, function (subScope) {
            subScope.destroy();
        });
        this.subScopes = [];
    },
    /**
     * Destroy this scope.  Which means to unbind everything, destroy scopes recursively,
     * and ignore any execute calls which may already be queued in the scheduler.
     */
    destroy: function () {
        this.destroyed = true;
        this.unbindAll();
        this.destroySubScopes();
    }
});

/**
 * tbone.autorun
 *
 * Wrap a function call with automatic binding for any model properties accessed
 * during the function's execution.
 *
 * Models and views update automatically by wrapping their reset functions with this.
 *
 * Additionally, this can be used within postRender callbacks to section off a smaller
 * block of code to repeat when its own referenced properties are updated, without
 * needing to re-render the entire view.
 * @param  {Function}                       fn        Function to invoke
 * @param  {Backbone.Model|Backbone.View}   context   Context to pass on invocation
 * @param  {number}                         priority  Scheduling priority - higher = sooner
 * @param  {string}                         name      Name for debugging purposes
 * @return {Scope}                                    A new Scope created to wrap this function
 */
function autorun(fn, context, priority, name, onExecuteCb, onExecuteContext, detached) {
    // Default priority and name if not specified.  Priority is important in
    // preventing unnecessary refreshes of views/subscopes that may be slated
    // for destruction by a parent; the parent should have priority so as
    // to execute first.
    if (!priority) {
        priority = currentParentScope ? currentParentScope.priority - 1 : 0;
    }
    if (!name) {
        name = currentParentScope ? currentParentScope.name + '+' : 'unnamed';
    }

    // Create a new scope for this function
    var scope = new Scope(fn, context, priority, name, onExecuteCb, onExecuteContext);

    // If this is a subscope, add it to its parent's list of subscopes.
    if (!detached && currentParentScope) {
        currentParentScope.subScopes.push(scope);
    }

    // Run the associated function (and bind associated models)
    scope.execute();

    // Return the scope object; this is used by BaseView to destroy
    // scopes when the associated view is destroyed.
    return scope;
}

/**
 * Generate and return a unique identifier which we attach to an object.
 * The object is typically a view, model, or scope, and is used to compare
 * object references for equality using a hash Object for efficiency.
 * @param  {Object} obj Object to get id from ()
 * @return {string}     Unique ID assigned to this object
 */
function uniqueId(obj) {
    return obj['tboneid'] = obj['tboneid'] || nextId++;
}
var nextId = 1;

/**
 * List of Scopes to be executed immediately.
 * @type {Array.<Scope>}
 */
var schedulerQueue = [];

/**
 * Flag indicating that the schedulerQueue is unsorted.
 * @type {Boolean}
 */
var dirty;

/**
 * Hash map of all the current Scope uniqueIds that are already
 * scheduled for immediate execution.
 * @type {Object.<string, Boolean>}
 */
var scopesQueued = {};

/**
 * Pop the highest priority Scope from the schedulerQueue.
 * @return {Scope} Scope to be executed next
 */
function pop() {
    /**
     * The schedulerQueue is lazily sorted using the built-in Array.prototype.sort.
     * This is not as theoretically-efficient as standard priority queue algorithms,
     * but Array.prototype.sort is fast enough that this should work well enough for
     * everyone, hopefully.
     */
    if (dirty) {
        schedulerQueue.sort(function (a, b) {
            /**
             * TODO for sync models, use dependency graph in addition to priority
             * to order execution in such a way as to avoid immediate re-execution.
             */
            return a.priority - b.priority;
        });
        dirty = false;
    }
    return schedulerQueue.pop();
}

/**
 * Flag indicating whether a processQueue timer has already been set.
 */
var processQueueTimer;

/**
 * Queue the specified Scope for execution if it is not already queued.
 * @param  {Scope}   scope
 */
function queueExec (scope) {
    var contextId = uniqueId(scope);
    if (!scopesQueued[contextId]) {
        scopesQueued[contextId] = true;

        /**
         * Push the scope onto the queue of scopes to be executed immediately.
         */
        schedulerQueue.push(scope);

        /**
         * Mark the queue as dirty; the priority of the scope we just added
         * is not immediately reflected in the queue order.
         */
        dirty = true;

        /**
         * If a timer to process the queue is not already set, set one.
         */
        if (!processQueueTimer && unfrozen) {
            processQueueTimer = _.defer(processQueue);
        }
    }
}

var unfrozen = true;

/**
 * Drain the Scope execution queue, in priority order.
 */
function processQueue () {
    processQueueTimer = null;
    var queueProcessTime = timer();
    var scope;
    while (unfrozen && !!(scope = pop())) {
        /**
         * Update the scopesQueued map so that this Scope may be requeued.
         */
        delete scopesQueued[uniqueId(scope)];

        var scopeExecTime;
        if (TBONE_DEBUG) {
            scopeExecTime = timer();
        }

        /**
         * Execute the scope, and in turn, the wrapped function.
         */
        scope.execute();

        if (TBONE_DEBUG) {
            var executionTimeMs = scopeExecTime();
            log(VERBOSE, 'scheduler', 'exec', '<%=priority%> <%=duration%>ms <%=name%>', {
                'priority': scope.priority,
                'name': scope.name,
                'duration': executionTimeMs
            });
            if (executionTimeMs > 10) {
                log(VERBOSE, 'scheduler', 'slowexec', '<%=priority%> <%=duration%>ms <%=name%>', {
                    'priority': scope.priority,
                    'name': scope.name,
                    'duration': executionTimeMs
                });
            }
        }
    }
    log(VERBOSE, 'scheduler', 'processQueue', 'ran for <%=duration%>ms', {
        'duration': queueProcessTime()
    });
    log(VERBOSE, 'scheduler', 'viewRenders', 'rendered <%=viewRenders%> total', {
        'viewRenders': viewRenders
    });
}
/**
 * Drain to the tbone processQueue, processing all scope executes immediately.
 * This is useful both for testing and MAYBE also for optimizing responsiveness by
 * draining at the end of a keyboard / mouse event handler.
 */
tbone['drain'] = function () {
    if (processQueueTimer) {
        clearTimeout(processQueueTimer);
    }
    processQueue();
};

tbone['freeze'] = function () {
    unfrozen = false;
};


Backbone.Model.prototype.isModel = true;

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

Backbone.Collection.prototype.isCollection = true;
var baseCollection = Backbone.Collection;

function createCollection(name, model) {
    if (TBONE_DEBUG && !isString(name)) {
        throw 'createCollection requires name parameter';
    }

    var opts = {
        name: name,
        model: model || baseModel
    };

    var collection = collections[name] = baseCollection.extend(opts);

    // XXX this is basically the same as in createModel.  Unify.
    var collectionPrototype = collection.prototype;
    _.extend(collection, /** @lends {collection} */ {
        'singleton': function () {
            return this['make'](name);
        },
        'make': function (instanceName) {
            var instance = new collection();
            if (instanceName) {
                lookup(instanceName, instance);
            }
            return instance;
        }
    });

    return collection;
}
var global = window;
var recentLookups;

/**
 * "Don't Get Data" - Special flag for lookup to return the model/collection instead
 * of calling toJSON() on it.
 * @const
 */
var DONT_GET_DATA = 1;

/**
 * "Iterate Over Models" - Special flag for lookup to return an iterator over the
 * models of the collection, enabling iteration over models, which is what we want
 * to do when using _.each(collection ...) in a template, as this allows us to
 * use model.lookup(...) and properly bind references to the models.
 * @const
 */
var ITERATE_OVER_MODELS = 2;

/**
 * "Extend on set" - instead of replacing an entire object or model's values on
 * set, extend that object/model instead.
 * @const
 */
var EXTEND_ON_SET = 3;

/**
 * If you want to select the root, you can either pass __self__ or just an empty
 * string; __self__ is converted to an empty string and this "flag" is used to
 * check for whether we are selecting either.
 * @const
 */
var QUERY_SELF = '';

function lookup(flag, query, value) {
    var isSet;
    var dontGetData = flag === DONT_GET_DATA;
    var iterateOverModels = flag === ITERATE_OVER_MODELS;
    var extendOnSet = flag === EXTEND_ON_SET;
    if (!dontGetData && !iterateOverModels && !extendOnSet) {
        /**
         * If no flag provided, shift the query and value over.  We do it this way instead
         * of having flag last so that we can type-check flag and discern optional flags
         * from optional values.  And flag should only be used internally, anyway.
         */
        value = query;
        query = flag;
        flag = null;
        /**
         * Use arguments.length to switch to set mode in order to properly support
         * setting undefined.
         */
        if (arguments.length === 2) {
            isSet = true;
        }
    } else if (extendOnSet) {
        isSet = true;
    }

    /**
     * Remove a trailing dot and __self__ references, if any, from the query.
     **/
    query = (query || '').replace(/\.?(__self__)?\.?$/, '');
    var args = query.split('.');

    var setprop;
    if (isSet) {
        /**
         * For set operations, we only want to look up the parent of the property we
         * are modifying; pop the final property we're setting from args and save it
         * for later.
         * @type {string}
         */
        setprop = args.pop();
    }

    /**
     * If this function was called with a bindable context (i.e. a Model or Collection),
     * then use that as the root data object instead of the global tbone.data.
     */
    var last_data;
    var _data = (!this || !this['isBindable']) ? data : this;
    var name_parts = [];
    var myRootLookup;
    var myRecentLookup = {};
    var propAfterRecentLookup;
    var id;
    var arg;
    var foundBindable;
    if (_data['isBindable']) {
        id = uniqueId(_data);
        foundBindable = true;
        myRootLookup = myRecentLookup = (recentLookups && recentLookups[id]) || {
            '__obj__': _data
        };
    }
    while ((arg = args.shift()) != null) {
        name_parts.push(arg);
        last_data = _data;
        if (_data['isBindable']) {
            foundBindable = true;
            if (_data.isModel) {
                _data = _data.get(arg);
            } else if (_data.isCollection) {
                // XXX should we support .get() for collections?  e.g. IDs starting with #?
                myRecentLookup[arg] = _data = _data.at(arg);
            }
            if (!propAfterRecentLookup) {
                propAfterRecentLookup = arg;
                myRecentLookup[arg] = _data;
            }
        } else {
            _data = _data[arg];
        }
        if (_data == null) {
            if (isSet) {
                /**
                 * When doing an implicit mkdir -p while setting a deep-nested property
                 * for the first time, we peek at the next arg and create either an array
                 * for a numeric index and an object for anything else.
                 */
                _data = rgxNumber.exec(args[0]) ? [] : {};
                if (last_data.isModel) {
                    last_data.set(arg, _data);
                } else if (last_data.isCollection) {
                    // XXX Maybe you just shouldn't do this?
                    log(ERROR, 'lookup', 'implicit deep nesting error',
                        "Don't implicitly set subproperties of collections.");
                    break;
                } else {
                    last_data[arg] = _data;
                }
            } else {
                break;
            }
        } else if (_data['isBindable']) {
            foundBindable = true;
            id = uniqueId(_data);
            myRecentLookup = (recentLookups && recentLookups[id]) || {
                '__obj__': _data,
                '__path__': name_parts.join('.') // XXX a model could exist at two paths]
            };
            if (recentLookups) {
                recentLookups[id] = myRecentLookup;
            }
            propAfterRecentLookup = null;
        }
    }

    /**
     * If we haven't found a model / collection in the process of looking something up,
     * log an error.  A common mistake could be to attempt to read values before models
     * are initialized.
     **/
    if (TBONE_DEBUG && !isSet && !foundBindable) {
        log(ERROR, 'lookup', 'no bindable found',
            'No model/collection found while looking up "<%=query%>".', {
            query: query
        });
    }

    /**
     * Only include the root lookup if there were no others.
     * XXX This is a good target for future optimization/improvement.
     **/
    if (recentLookups && myRootLookup && myRecentLookup === myRootLookup) {
        recentLookups[id] = myRootLookup;
    }

    if (_data) {
        if (isSet) {
            var currProp = (
                query === QUERY_SELF ? _data : // only useful if _data is a model
                _data.isModel ? _data.get(setprop) :
                _data.isCollection ? _data.at(setprop) :
                _data[setprop]);

            if (currProp && currProp.isModel) {
                /**
                 * When setting to an entire model, we use different semantics; we want the
                 * values provided to be set to the model, not replace the model.
                 */
                if (value) {
                    /**
                     * Unless extendOnSet is set, remove any properties from the model that
                     * are not present in the value we're setting it to.  Extend-semantics
                     * are made available to the user via tbone.extend.
                     */
                    if (!extendOnSet) {
                        for (var k in currProp.toJSON()) {
                            if (value[k] === undefined) {
                                currProp.unset(k);
                            }
                        }
                    }
                    currProp.set(value);
                } else {
                    currProp.clear();
                }
            } else if (currProp !== value) {
                if (_data.isModel) {
                    /**
                     * Set the value to the top-level model property.  Common case.
                     */
                    _data.set(setprop, value);
                } else if (_data.isCollection) {
                    // XXX What makes sense to do here?
                } else if (_data[setprop] !== value) {
                    /**
                     * Set the value to a property on a regular JS object.
                     */
                    _data[setprop] = value;

                    /**
                     * If we're setting a nested property of a model (or collection?), then
                     * trigger a change event for the top-level property.
                     */
                    if (propAfterRecentLookup) {
                        myRecentLookup['__obj__'].trigger('change:' + propAfterRecentLookup);
                    }
                }
            }
            return undefined;
        } else if (iterateOverModels && _data.isCollection) {
            /**
             * If iterateOverModels is set and _data is a collection, return a list of models
             * instead of either the collection or a list of model data.  This is useful in
             * iterating over models while still being able to bind to models individually.
             */
            myRecentLookup['*'] = _data = _data.models;
        } else if (!dontGetData && _data['isBindable']) {
            /**
             * Unless dontGetData is specified, convert the model/collection to its data.
             * This is often what you want to do when getting data from a model, and this
             * is what is presented to the user via tbone/lookup.
             */
            myRecentLookup['*'] = _data = _data.toJSON();
        }
    }
    return _data;
}

function lookupText() {
    var value = lookup.apply(this, arguments);
    return value != null ? value : '';
}

function toggle(model_and_key) {
    lookup(model_and_key, !lookup(model_and_key));
}

function extend(prop, value) {
    return lookup.call(this, EXTEND_ON_SET, prop, value);
}
