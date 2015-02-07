;
(function(){

var root = typeof exports !== 'undefined' ? exports : window;
var _ = root._ || require('lodash');
var TBONE_DEBUG = !!root.TBONE_DEBUG;

var opts = TBONE_DEBUG ? { aliasCheck: false } : {};

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
var DEFAULT_AUTORUN_PRIORITY = 4000;
/** @const */
var BASE_PRIORITY_MODEL_SYNC = 3000;
/** @const */
var BASE_PRIORITY_VIEW = 2000;
/** @const */
var BASE_PRIORITY_MODEL_ASYNC = 1000;

var priority = {
    highest: 10000,
    bound: BASE_PRIORITY_MODEL_SYNC,
    beforeViews: BASE_PRIORITY_VIEW + 500,
    view: BASE_PRIORITY_VIEW,
    afterViews: BASE_PRIORITY_VIEW - 500,
    async: BASE_PRIORITY_MODEL_ASYNC,
    lowest: 0
};

/**
 * We also use the drainQueue to initialize models & views.  By adding this delta
 * to priorities for initialization, we ensure that initialization happens in the
 * same order as execution and that it happens before execution.  For example, it
 * may be inefficient for a model to reset before a model that it depends on has
 * initialized, as dependency chains will not yet be established.
 * XXX Does this really matter?  Or matter much?
 * @const
 */
var PRIORITY_INIT_DELTA = 5000;

function noop () { return undefined; }

var isString = _.isString;
var isBoolean = _.isBoolean;
var isArray = _.isArray;
var isDate = _.isDate;

function isRealObject (x) {
    return x !== null && typeof x === 'object' && !isDate(x);
}

function isQueryable (x) {
    return !!(x && typeof x.query === 'function');
}

/**
 * Use to test whether a string is a number literal.
 * @type {RegExp}
 * @const
 */
var rgxNumber = /^\d+$/;

function warn () {
    if (TBONE_DEBUG) {
        console.warn.apply(console, arguments);
    }
}
function error () {
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

function watchLog (name, level) {
    if (level == null) { level = VERBOSE; }
    logLevels.type[name] = VERBOSE;
    logLevels.context[name] = VERBOSE;
    logLevels.event[name] = VERBOSE;
}

var events = [];

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
function logconsole (level, context, event, msg, data, moredata) {
    var name = isString(context) ? context : context.Name;
    var type = (isString(context) ? context :
                context.isModel ? 'model' :
                context.isView ? 'view' :
                context.isScope ? 'scope' : '??');
    var threshold = Math.max(logLevels.context[name] || 0,
                             logLevels.event[event] || 0,
                             logLevels.type[type] || 0) || logLevels.base;
    if (event === 'lookups') {
        msg = _.reduce(msg, function(memo, map, id) {
            memo[map.obj.Name || ('tboneid-' + map.obj.tboneid)] = map;
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
        if (logfn && logfn.call) {
            logfn.call(console, message, templated || msg || '', moredata || '');
        }
    }
}

function onLog (cb) {
    logCallbacks.push(cb);
}

var getListenersHook = [];
/**
 * Returns the list of unique listeners attached to the specified model/view.
 * @param  {Queryable} self
 * @return {Array.<Queryable|View|Scope>} array of listeners
 */
function getListeners (self) {
    var listeners = [];
    for (var i = 0; i < getListenersHook.length; i++) {
        getListenersHook[i](self, listeners);
    }
    // TBone-native:
    if (isQueryable(self) && _.isFunction(self)) {
        var stack = [ self._events ];
        var next, callbacks, k;
        while (!!(next = stack.pop())) {
            for (k in next) {
                if (k === '') {
                    callbacks = next[''];
                    for (var contextId in callbacks) {
                        listeners.push(callbacks[contextId]);
                    }
                } else {
                    stack.push(next[k]);
                }
            }
        }
    }
    return _.uniq(listeners);
}

/**
 * Returns true if there is a view that is listening (directly or indirectly)
 * to this model.  Useful for determining whether the current model should
 * be updated (if a model is updated in the forest and nobody is there to
 * hear it, then why update it in the first place?)
 * @param  {Queryable}  self
 * @return {Boolean}
 */
function hasViewListener (self) {
    var todo = [ self ];
    var usedModels = [ self ];
    var next;
    while (!!(next = todo.pop())) {
        var listeners = getListeners(next);
        for (var i = 0; i < listeners.length; i++) {
            var listener = listeners[i];
            while (listener && !(listener.isView || listener.isModel)) {
                // The listener context is the model or view to whom the scope belongs.
                // Here, we care about that model/view, not the view's or model's scope
                // or that scope's descendent scopes. Walk up the scope tree to the parent
                // scope or to the scope's context. The target is to find the first model
                // or view in the tree.
                listener = listener.parentScope || listener.context;
            }
            // listener might be undefined right now if this listener is not part of a
            // view or model (i.e. it is an independent scope created by tbone.autorun).
            if (listener) {
                if (listener.isView) {
                    // We found a view that depends on the original model!
                    return true;
                }
                // listener could also have been a scope with a context that was neither
                // a model nor a view.
                if (listener.isModel) {
                    if (usedModels.indexOf(listener) === -1) {
                        todo.push(listener);
                        usedModels.push(listener);
                    }
                }
            }
        }
    }
    return false;
}

/**
 * model/core/base.js
 */

/**
 * @type {RegExp}
 * @const
 */
var rgxEventSplitter = /[.]+/;

/**
 * Split name parameter into components (used in .on() and .trigger())
 *
 * For compatibility with backbone, we support using the colon as the
 * separator between "change" and the remainder of the terms, but only
 * dots after that.
 */
function splitName (name) {
    return name.replace(/^change:/, 'change.').split(rgxEventSplitter);
}

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
                return autorun(arg0, arg1);
            } else if (typeof arg1 === 'function' && !isQueryable(arg1)) {
                return instance.query(arg0, boundModel.extend({ state: arg1 }).make());
            } else {
                return (arguments.length === 0 ? instance.query() :
                        arguments.length === 1 ? instance.query(arg0) :
                        arguments.length === 2 ? instance.query(arg0, arg1) :
                                                 instance.query(arg0, arg1, arg2));
            }
        };
        _.extend(instance, self, _.isFunction(opts) ? { state: opts } : opts || {});

        // Initialize the model instance
        delete instance.tboneid;
        delete instance.attributes;
        if (TBONE_DEBUG) {
            delete instance.prevJson;
        }
        instance._events = {};
        instance._removeCallbacks = {};
        uniqueId(instance);
        instance.initialize();

        return instance;
    },
    extend: function (subclass) {
        return _.extend({}, this, subclass);
    },
    initialize: noop,
    on: function (name, callback, context) {
        // XXX callback is not supported.  assumes context.trigger is the callback
        var parts = splitName(name);
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
        var contexts = events[''];
        if (!contexts) {
            contexts = events[''] = {};
        }
        var contextId = uniqueId(context);
        contexts[contextId] = context;

        /**
         * Wake up and reset this and other models that may be sleeping because
         * they did not need to be updated.
         */
        this.wake({});
    },
    off: function (name, callback, context) {
        // XXX only supports use with both name & context.
        // XXX doesn't clean up when callbacks list goes to zero length
        var parts = splitName(name);
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
        var contexts = events[''];
        if (contexts) {
            var contextId = uniqueId(context);
            delete contexts[contextId];
        }
    },
    trigger: function (name) {
        var self = this;
        var events = self._events;
        var parts = splitName(name);
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
        var contexts = events[QUERY_SELF] || {};
        for (var contextId in contexts) {
            contexts[contextId].trigger.call(contexts[contextId]);
        }
    },

    runOnlyOnce: runOnlyOnce,

    query: query,

    queryModel: function (prop) {
        return this.query(DONT_GET_DATA, prop);
    },

    // query `prop` without binding to changes in its value
    readSilent: function (prop) {
        var tmp = recentLookups;
        recentLookups = null;
        var rval = this.query(prop);
        recentLookups = tmp;
        return rval;
    },

    idAttribute: 'id',

    queryId: function () {
        return this.query(this.idAttribute);
    },

    toggle: function (prop) {
        this.query(QUERY_TOGGLE, prop);
    },

    push: function (prop, value) {
        if (arguments.length === 1) {
            value = prop;
            prop = '';
        }
        this.query(QUERY_PUSH, prop, value);
    },

    unshift: function (prop, value) {
        if (arguments.length === 1) {
            value = prop;
            prop = '';
        }
        this.query(QUERY_UNSHIFT, prop, value);
    },

    removeFirst: function (prop) {
        this.query(QUERY_REMOVE_FIRST, prop);
    },

    removeLast: function (prop) {
        this.query(QUERY_REMOVE_LAST, prop);
    },

    unset: function (prop) {
        this.query(QUERY_UNSET, prop);
    },

    increment: function (prop, value) {
        this.query(QUERY_INCREMENT, prop, value != null ? value : 1);
    },

    clear: function () {
        this.query('', undefined);
    },

    toJSON: function () {
        return this.attributes;
    },

    wake: noop,

    queryText: queryText, // deprecated
    text: queryText, // deprecated
    lookup: query, // deprecated
    lookupText: queryText, // deprecated
    set: query, // deprecated
    get: query // deprecated
};

if (TBONE_DEBUG) {
    baseModel.find = function (obj) {
        function recurse(o, depth) {
            if (depth > 10) {
                return [];
            }
            if (o === obj) {
                return [];
            }
            if (isQueryable(o)) {
                if (!!(result = recurse(o.attributes, depth + 1))) {
                    return result;
                }
            } else if (o !== null && typeof o === 'object') {
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

var tbone = baseModel.make({ Name: 'tbone' });

tbone.hasViewListener = hasViewListener;
tbone.priority = priority;

if (TBONE_DEBUG) {
    tbone.watchLog = watchLog;
    tbone.getListeners = getListeners;
    tbone.onLog = onLog;
    tbone.opts = opts;
    onLog(logconsole);
}

var orig_tbone = root.tbone;
var orig_T = root.T;

root.tbone = tbone;
root.T = tbone;

tbone.noConflict = function () {
    root.T = orig_T;
    root.tbone = orig_tbone;
};

var metrics = baseModel.make({ Name: 'tbone_metrics' });
tbone.metrics = metrics;

var models = {
    base: baseModel,
};
tbone.models = models;

/**
 * scheduler/timer.js
 */

function now () {
    return new Date().getTime();
}

/**
 * Returns a function that returns the elapsed time.
 * This is only used when TBONE_DEBUG is set, and should get removed
 * entirely by the release compile.
 * @return {function(): Number} Function that returns elapsed time.
 */
function timer() {
    var started;
    var cumulative;
    var me = {
        stop: function () {
            cumulative = now() - started;
        },
        start: function () {
            started = now();
        },
        done: function () {
            me.stop();
            timers.pop();
            if (timers.length) {
                timers[timers.length - 1].start();
            }
            return cumulative;
        }
    };
    me.start();
    if (timers.length) {
        timers[timers.length - 1].stop();
    }
    timers.push(me);
    return me;
}

var timers = [];


/**
 * tbone.autorun
 *
 * Wrap a function call with automatic binding for any model properties accessed
 * during the function's execution.
 *
 * Models and views update automatically by wrapping their reset functions with this.
 *
 * Additionally, this can be used within view `ready` callbacks to section off a smaller
 * block of code to repeat when its own referenced properties are updated, without
 * needing to re-render the entire view.
 * @param  {Function}    fn        Function to invoke
 * @param  {number}      priority  Scheduling priority - higher = sooner
 * @param  {Object}      context   Context to pass on invocation
 * @param  {string}      name      Name for debugging purposes
 * @return {Scope}                 A new Scope created to wrap this function
 */
function autorun (fn, priority, context, name, onExecuteCb, onExecuteContext, detached) {
    // Default priority and name if not specified.  Priority is important in
    // preventing unnecessary refreshes of views/subscopes that may be slated
    // for destruction by a parent; the parent should have priority so as
    // to execute first.
    if (priority == null) {
        priority = currentExecutingScope ? currentExecutingScope.priority - 1 : DEFAULT_AUTORUN_PRIORITY;
    }
    if (!name && currentExecutingScope) {
        name = currentExecutingScope.Name + '+';
    }

    // Create a new scope for this function
    var scope = new Scope(fn, context, priority, name, onExecuteCb, onExecuteContext);

    // If this is a subscope, add it to its parent's list of subscopes, and add a reference
    // to the parent scope.
    if (!detached && currentExecutingScope) {
        currentExecutingScope.subScopes.push(scope);
        scope.parentScope = currentExecutingScope;
    }

    // Run the associated function (and bind associated models)
    scope.execute();

    // Return the scope object; this is used by BaseView to destroy
    // scopes when the associated view is destroyed.
    return scope;
}

function runOnlyOnce (fn) {
    var alreadyRun;
    autorun(function () {
        if (!alreadyRun) {
            fn();
        }
    });
    alreadyRun = true;
}

/**
 * scheduler/scope.js
 */

/**
 * currentExecutingScope globally tracks the current executing scope, so that subscopes
 * created during its execution (i.e. by tbone.autorun) can register themselves as
 * subscopes of the parent (this is important for recursive destruction of scopes).
 */
var currentExecutingScope;

var recentLookups;

/**
 * An autobinding function execution scope.  See autorun for details.
 * @constructor
 */
function Scope(fn, context, priority, name, onExecuteCb, onExecuteContext) {
    _.extend(this, {
        fn: fn,
        context: context,
        priority: priority,
        Name: name,
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
        var myTimer;
        if (!self.destroyed) {
            if (TBONE_DEBUG) {
                myTimer = timer();
            }

            self.unbindAll();
            self.destroySubScopes();
            // Save our parent's lookups and subscopes.  It's like pushing our own values
            // onto the top of each stack.
            var oldLookups = recentLookups;
            self.lookups = recentLookups = {};
            var parentScope = currentExecutingScope;
            currentExecutingScope = self;

            // ** Call the payload function **
            // This function must be synchronous.  Anything that is looked up using
            // tbone.lookup before this function returns (that is not inside a subscope)
            // will get bound below.
            try {
                self.fn.call(self.context);
            } finally {
                _.each(recentLookups, function (propMap) {
                    var obj = propMap.obj;
                    var props = propMap.props;
                    if (props['']) {
                        obj.on('change', self.trigger, self);
                    } else {
                        for (var prop in props) {
                            obj.on('change:' + prop, self.trigger, self);
                        }
                    }
                });

                // This is intended primarily for diagnostics.
                if (self.onExecuteCb) {
                    self.onExecuteCb.call(self.onExecuteContext, self);
                }

                // Pop our own lookups and parent scope off the stack, restoring them to
                // the values we saved above.
                recentLookups = oldLookups;
                currentExecutingScope = parentScope;

                if (TBONE_DEBUG) {
                    var executionTimeMs = myTimer.done();
                    log(VERBOSE, self, 'exec', '<%=priority%> <%=duration%>ms <%=name%>', {
                        priority: self.priority,
                        Name: self.Name,
                        duration: executionTimeMs
                    });
                    if (executionTimeMs > 10) {
                        log(VERBOSE, self, 'slowexec', '<%=priority%> <%=duration%>ms <%=name%>', {
                            priority: self.priority,
                            Name: self.Name,
                            duration: executionTimeMs
                        });
                    }
                }
            }

        }
    },

    /**
     * For each model which we've bound, tell it to unbind all events where this
     * scope is the context of the binding.
     */
    unbindAll: function () {
        var self = this;
        var lookups = self.lookups || {};
        for (var objId in lookups) {
            var propMap = lookups[objId];
            var obj = propMap.obj;
            var props = propMap.props;
            for (var prop in props) {
                obj.off('change:' + prop, null, self);
            }
        }
    },

    /**
     * Destroy any execution scopes that were creation during execution of this function.
     */
    destroySubScopes: function () {
        var self = this;
        for (var i = 0; i < self.subScopes.length; i++) {
            self.subScopes[i].destroy();
        }
        self.subScopes = [];
    },

    /**
     * Destroy this scope.  Which means to unbind everything, destroy scopes recursively,
     * and ignore any execute calls which may already be queued in the scheduler.
     */
    destroy: function () {
        var self = this;
        self.destroyed = true;
        delete self.parentScope;
        self.unbindAll();
        self.destroySubScopes();
    }
});

/**
 * scheduler/drainqueue.js
 */

var nextId = 1;
/**
 * Generate and return a unique identifier which we attach to an object.
 * The object is typically a view, model, or scope, and is used to compare
 * object references for equality using a hash Object for efficiency.
 * @param  {Object} obj Object to get id from ()
 * @return {string}     Unique ID assigned to this object
 */
function uniqueId(obj) {
    if (!obj.tboneid) {
        obj.tboneid = nextId++;
    }
    return obj.tboneid;
}

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
 * Flag indicating whether a drainQueue timer has already been set.
 */
var drainQueueTimer;

/**
 * Dynamic counter of how many ajax requests are inflight.
 * @type {Number}
 */
var inflight = {};

function addInFlight (model) {
    var id = model.tboneid;
    if (!inflight[id]) {
        inflight[id] = model;
        metrics.increment('ajax.numReqStarted');
        updateIsReady();
    }
}

function removeInFlight (model) {
    var id = model.tboneid;
    if (inflight[id]) {
        delete inflight[id];
        metrics.increment('ajax.numReqFinished');
        updateIsReady();
    }
}

tbone.isReady = function () {
    return metrics.query('isReady');
};

var isReadyTimer;
function updateIsReady () {
    if (!isReadyTimer) {
        isReadyTimer = setTimeout(function () {
            var numInFlight = _.keys(inflight).length;
            metrics.query('isReady', _.isEmpty(inflight) && !drainQueueTimer);
            metrics.query('ajax.modelsInFlight', _.clone(inflight));
            metrics.query('ajax.isReady', numInFlight === 0);
            metrics.query('ajax.numInFlight', numInFlight);
            isReadyTimer = null;
        }, 20);
    }
}

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
         * If a timer to draing the queue is not already set, set one.
         */
        if (!drainQueueTimer && !(TBONE_DEBUG && frozen)) {
            updateIsReady();
            drainQueueTimer = _.defer(drainQueue);
        }
    }
}

var frozen = false;

function runListOfFunctions (list) {
    _.each(list, function (cb) { cb(); });
}

/**
 * Drain the Scope execution queue, in priority order.
 */
function drainQueue () {
    runListOfFunctions(onBeforeSchedulerDrainQueue);
    var queueDrainStartTime = now();
    var scope;
    drainQueueTimer = null;
    drainQueueTimer = schedulerQueue.length ? _.defer(drainQueue) : null;
    var remaining = 5000;
    while (!(TBONE_DEBUG && frozen) && --remaining && !!(scope = pop())) {
        /**
         * Update the scopesQueued map so that this Scope may be requeued.
         */
        delete scopesQueued[uniqueId(scope)];

        /**
         * Execute the scope, and in turn, the wrapped function.
         */
        scope.execute();
    }
    if (!remaining) {
        log(WARN, 'scheduler', 'drainQueueOverflow', 'exceeded max drainQueue iterations');
    }
    log(VERBOSE, 'scheduler', 'drainQueue', 'ran for <%=duration%>ms', {
        duration: now() - queueDrainStartTime
    });
    updateIsReady();
    runListOfFunctions(onAfterSchedulerDrainQueue);
}

var onBeforeSchedulerDrainQueue = [];
var onAfterSchedulerDrainQueue = [];

/**
 * Drain to the tbone drainQueue, executing all queued Scopes immediately.
 * This is useful both for testing and MAYBE also for optimizing responsiveness by
 * draining at the end of a keyboard / mouse event handler.
 */
var drain = tbone.drain = function () {
    if (drainQueueTimer) {
        clearTimeout(drainQueueTimer);
    }
    drainQueue();
};

if (TBONE_DEBUG) {
    tbone.freeze = function () {
        frozen = true;
    };
}


/**
 * Default flag; passing this has the same effect as omitting the flag parameter.
 * @const
 */
var QUERY_DEFAULT = 0;

/**
 * "Don't Get Data" - Special flag for query to return the model/collection instead
 * of calling toJSON() on it.
 * @const
 */
var DONT_GET_DATA = 1;

/**
 * "Iterate Over Models" - Special flag for query to return an iterator over the
 * models of the collection, enabling iteration over models, which is what we want
 * to do when using _.each(collection ...) in a template, as this allows us to
 * use model.query(...) and properly bind references to the models.
 * @const
 */
var ITERATE_OVER_MODELS = 2;

/**
 * @const
 */
var MIN_QUERY_SET_FLAG = 3;

/**
 * @const
 */
var QUERY_PUSH = 3;

/**
 * @const
 */
var QUERY_UNSHIFT = 4;

/**
 * @const
 */
var QUERY_REMOVE_FIRST = 5;

/**
 * @const
 */
var QUERY_REMOVE_LAST = 6;

/**
 * @const
 */
var QUERY_TOGGLE = 7;

/**
 * @const
 */
var QUERY_UNSET = 8;

/**
 * @const
 */
var QUERY_INCREMENT = 9;

/**
 * @const
 */
var QUERY_ASSUME_CHANGED = 10;

/**
 * If you want to select the root, you can either pass __self__ or just an empty
 * string; __self__ is converted to an empty string and this "flag" is used to
 * check for whether we are selecting either.
 * @const
 */
var QUERY_SELF = '';

/**
 * @const
 */
var MAX_RECURSIVE_DIFF_DEPTH = 16;

function recursiveDiff (self, evs, curr, prev, exhaustive, depth, fireAll) {
    // Kludge alert: if the objects are too deep, just assume there is
    // a change.
    if (depth > MAX_RECURSIVE_DIFF_DEPTH) {
        log(WARN, self, 'recurseLimit', 'hit recursion depth limit of <%=limit%>', {
            limit: MAX_RECURSIVE_DIFF_DEPTH
        }, {
            curr: curr,
            prev: prev
        });
        return true;
    }
    evs = evs || {};
    curr = curr;
    prev = prev;
    if (isQueryable(prev) || isQueryable(curr)) {
        // The only reason either prev or curr should be queryable is if
        // we're setting a model where there previous was none (or vice versa).
        // In this case, *all* descendant events must be rebound to the new
        // model by firing them all immediately.
        fireAll = true;
    }
    var changed = fireAll;
    var k, i, n;
    for (k in evs) {
        if (k === QUERY_SELF) {
            if (prev !== curr) {
                // If prev and curr are both "object" types (but not null),
                // then we need to search recursively for "real" changes.
                // We want to avoid firing change events when the user sets
                // something to a deep copy of itself.
                if (isRealObject(prev) && isRealObject(curr)) {
                    exhaustive = true;
                } else if (isDate(prev) && isDate(curr)) {
                    changed = (prev.getTime() !== curr.getTime()) || changed;
                } else {
                    changed = true;
                }
            }
        } else {
            changed = recursiveDiff(
                self, evs[k], curr && curr[k], prev && prev[k], false, depth + 1, fireAll) || changed;
        }
    }
    if (exhaustive && !changed) {
        // If exhaustive specified, and we haven't yet found a change, search
        // through all keys until we find one (note that this could duplicate
        // some searching done while searching the event tree)
        // This may not be super-efficient to call recursiveDiff all the time.
        if (isRealObject(prev) && isRealObject(curr)) {
            // prev and curr are both objects/arrays
            // search through them recursively for any differences
            var searched = {};
            var objs = [prev, curr];
            for (i = 0; i < 2 && !changed; i++) {
                var obj = objs[i];
                if (isArray(obj)) {
                    if (prev.length !== curr.length) {
                        changed = true;
                    }
                    for (k = 0; k < obj.length && !changed; k++) {
                        if (!searched[k]) {
                            searched[k] = true;
                            if (recursiveDiff(self, evs[k], curr[k], prev[k], true, depth + 1, false)) {
                                changed = true;
                            }
                        }
                    }
                } else {
                    for (k in obj) {
                        if (!searched[k]) {
                            searched[k] = true;
                            if (recursiveDiff(self, evs[k], curr[k], prev[k], true, depth + 1, false)) {
                                changed = true;
                                break;
                            }
                        }
                    }
                }
            }
        } else if (isDate(prev) && isDate(curr)) {
            changed = prev.getTime() !== curr.getTime();
        } else if (prev !== curr) {
            // at least one of prev and curr is a primitive (i.e. not arrays/objects)
            // and they are different.  thus, we've found a change and will pass this
            // outward so that we know to fire all parent callbacks
            changed = true;
        }
    }
    if (changed) {
        var contexts = evs[QUERY_SELF] || {};
        for (var contextId in contexts) {
            contexts[contextId].trigger.call(contexts[contextId]);
        }
    }
    return changed;
}

/**
 * serialize the model in a semi-destructive way.  We don't really care
 * about the result as long as we can use it to test for anything that
 * gets changed behind TBone's back (i.e. by changing arrays/objects that
 * TBone has stored).
 *
 * This is only ever called if TBONE_DEBUG is true.
 */
function serializeForComparison(model) {
    if (opts.aliasCheck) {
        try {
            var attributes = model.attributes;
            return JSON.stringify(attributes === undefined ? null : attributes, function (key, value) {
                // If value is an array or object, screen its keys for queryables.
                // Queryables track their own changes, so we don't care to
                // check that they haven't changed without this model knowing.
                if (isRealObject(value)) {
                    // This is not a way to serialize correctly, but
                    // we just want to show that the original structures
                    // were the same, minus queryables.
                    var localized = {};
                    for (var k in value) {
                        if (!isQueryable(value[k])) {
                            localized[k] = value[k];
                        }
                    }
                    return localized;
                } else {
                    return value;
                }
            });
        } catch (e) {
            log(WARN, model, 'aliascheck', 'Failed to serialize attributes to JSON');
        }
    }
    return "null";
}

function listDiffs(curr, prev, accum) {
    var diffs = {};
    if (isRealObject(prev) && isRealObject(curr)) {
        var searched = {};
        var objs = [prev, curr];
        for (var i = 0; i < 2; i++) {
            var obj = objs[i];
            for (var k in obj) {
                if (!searched[k]) {
                    searched[k] = true;
                    _.extend(diffs, listDiffs(prev[k], curr[k], accum.concat(k)));
                }
            }
        }
    } else {
        if (prev !== curr) {
            diffs[accum.join('.')] = prev + ' -> ' + curr;
        }
    }
    return diffs;
}

function query (flag, prop, value) {
    var self = this;
    var hasValue = arguments.length === 3;
    if (typeof flag !== 'number') {
        /**
         * If no flag provided, shift the prop and value over.  We do it this way instead
         * of having flag last so that we can type-check flag and discern optional flags
         * from optional values.  And flag should only be used internally, anyway.
         */
        value = prop;
        prop = flag;
        flag = QUERY_DEFAULT;
        /**
         * Use arguments.length to switch to set mode in order to properly support
         * setting undefined.
         */
        if (arguments.length === 2) {
            hasValue = true;
        }
    }
    var dontGetData = flag === DONT_GET_DATA;
    var iterateOverModels = flag === ITERATE_OVER_MODELS;
    var isPush = flag === QUERY_PUSH;
    var isUnshift = flag === QUERY_UNSHIFT;
    var isRemoveFirst = flag === QUERY_REMOVE_FIRST;
    var isRemoveLast = flag === QUERY_REMOVE_LAST;
    var isToggle = flag === QUERY_TOGGLE;
    var isIncrement = flag === QUERY_INCREMENT;
    var isListOp = isPush || isUnshift || isRemoveFirst || isRemoveLast;
    var isUnset = flag === QUERY_UNSET;
    var assumeChanged = flag === QUERY_ASSUME_CHANGED;
    var isSet = isListOp || isToggle || isUnset || hasValue || isIncrement;

    /**
     * Remove a trailing dot and __self__ references, if any, from the prop.
     **/
    prop = (prop || '').replace('__self__', '');
    var argParts = prop.split('.');
    var args = [];
    var i;
    for (i = 0; i < argParts.length; i++) {
        // Ignore empty string arguments.
        if (argParts[i]) {
            args.push(argParts[i]);
        }
    }

    /**
     * For set operations, we only want to look up the parent of the property we
     * are modifying; pop the final property we're setting from args and save it
     * for later.
     * @type {string}
     */
    var setprop = args[args.length - 1] || 'attributes';

    /**
     * If this function was called with a bindable context (i.e. a Model or Collection),
     * then use that as the root data object instead of the global tbone.data.
     */
    var last_data = self;

    /**
     * If DONT_GET_DATA, and there's no prop, then this is a self-reference.
     */
    var _data = dontGetData && !prop ? self : self.attributes;

    var name_parts = [];
    var id;
    var arg;
    var doSubQuery;
    var parentCallbackContexts = {};
    var events = isSet && self._events.change;

    while (true) {
        if (_data == null && !isSet) {
            // Couldn't even get to the level of the value we're trying to look up.
            // Concat the rest of args onto name_parts so that we record the full
            // path in the event binding.
            name_parts = name_parts.concat(args);
            break;
        } else if (_data !== self && isQueryable(_data)) {
            /**
             * To avoid duplicating the recentLookups code here, we set a flag and do
             * the sub-query after recording queries.
             *
             * Always do the subquery if there are more args.
             * If there are no more args...
             * - and this is a set...
             *   - (but really an unset): Don't do the sub-query regardless.
             *   -        to a queryable: Don't sub-query.  Set property to new queryable.
             *   -    to a non-queryable: Do the sub-query.  Push the value to the
             *                            other model (don't overwrite the model).  This
             *                            is kind of magical?
             * - and this is a get...
             *   -    with DONT_GET_DATA: Don't do sub-query.  Get the model itself.
             *   - without DONT_GET_DATA: Do the sub-query.  Delegate getting that model's
             *                            data to the other model.
             */
            doSubQuery = args.length || (isSet ? !isUnset && !isQueryable(value) : !dontGetData);
            break;
        } else if (isSet && !isRealObject(_data) && (args.length || isListOp)) {
            /**
             * Don't do implicit mkdir -p if we're just trying to unset something
             * that doesn't exist.
             */
            if (isUnset) {
                return;
            }
            /**
             * When doing an implicit mkdir -p while setting a deep-nested property
             * for the first time, we peek at the next arg and create either an array
             * for a numeric index and an object for anything else.  We set the
             * property via query() so as to fire change events appropriately.
             */
            if (_data != null) {
                log(WARN, this, 'mkdir', 'while writing <%=prop%>, had to overwrite ' +
                    'primitive value <%=primitive%> at <%=partial%>', {
                        prop: prop,
                        primitive: _data,
                        partial: name_parts.join('.')
                    });
            }
            /**
             * Decide whether to implicitly create an array or an object.
             *
             * If there are args remaining, then use the next arg to determine;
             * for a number, create an array - anything else, an object.
             *
             * If there are no more args, then create an array if this is a list
             * operation; otherwise, an object.
             */
            _data = (args.length ? rgxNumber.exec(args[0]) : isListOp) ? [] : {};
            self.query(name_parts.join('.'), _data);
        }

        arg = args.shift();
        if (arg == null) { break; }

        name_parts.push(arg);
        last_data = _data;

        _data = _data[arg];
        if (events) {
            _.extend(parentCallbackContexts, events[QUERY_SELF] || {});
            events = events[arg];
        }
    }

    if (!isSet && recentLookups) {
        id = uniqueId(self);
        if (!recentLookups[id]) {
            recentLookups[id] = {
                obj: self,
                props: {}
            };
        }
        recentLookups[id].props[name_parts.join('.')] = _data;
    }

    if (doSubQuery) {
        return hasValue ? _data.query(flag, args.join('.'), value) : _data.query(flag, args.join('.'));
    }

    if (isSet) {
        /**
         * Only do prevJson comparisons when setting the root property.
         * It's kind of complicated to detect and avoid aliasing issues when
         * setting other properties directly.  But at least this helps detect
         * aliasing for bound models.
         */
        if (TBONE_DEBUG && self.prevJson && !prop) {
            var json = serializeForComparison(self);
            if (json !== self.prevJson) {
                var before = JSON.parse(self.prevJson);
                var after = JSON.parse(json);
                var diffs = listDiffs(after, before, []);
                log(WARN, self, 'aliascheck', 'aliased change detected', {}, {
                    before: before,
                    after: after,
                    diffs: diffs
                });
            }
        }

        // XXX Kludge Alert.  In practice, gives many models a Name that otherwise
        // wouldn't have one by using the first prop name it is set to.  Works for
        // the typical T('modelName', model.make()) and T.push cases.
        var nameProp;

        if (isPush) {
            if (TBONE_DEBUG) {
                nameProp = prop + '.' + _data.length;
            }
            _data.push(value);
        } else if (isUnshift) {
            _data.unshift(value);
        } else if (isRemoveFirst) {
            _data.shift(value);
        } else if (isRemoveLast) {
            _data.pop(value);
        } else if (isUnset) {
            delete last_data[setprop];
        } else if (isToggle) {
            value = last_data[setprop] = !_data;
        } else if (isIncrement) {
            value = last_data[setprop] = (_data || 0) + value;
        } else {
            last_data[setprop] = value;
            if (TBONE_DEBUG) {
                nameProp = prop;
            }
        }

        if (TBONE_DEBUG && isQueryable(value)) {
            if (value.Name == null) {
                value.Name = nameProp;
            }
            if (value.scope && value.scope.Name == null) {
                value.scope.Name = 'model_' + nameProp;
            }
        }

        if (!_.isEmpty(parentCallbackContexts)) {
            // If there are any changes at all, then we need to fire one or more
            // callbacks for things we searched for.  Note that "parent" only includes
            // things from this model; change events don't bubble out to parent models.
            if (recursiveDiff(self, events, _data, value, true, 0, assumeChanged)) {
                for (var contextId in parentCallbackContexts) {
                    parentCallbackContexts[contextId].trigger.call(parentCallbackContexts[contextId]);
                }
            }
        } else {
            recursiveDiff(self, events, _data, value, false, 0, assumeChanged);
        }

        if (TBONE_DEBUG) {
            self.prevJson = prop ? null : serializeForComparison(self);
        }
        return value;
    } else if (!iterateOverModels && self.isCollection && prop === '') {
        /**
         * If iterateOverModels is not set and _data is a collection, return the
         * raw data of each model in a list.  XXX is this ideal?  or too magical?
         */
        if (isArray(_data)) {
            _data = _.map(_data, function (d) { return d.query(); });
        } else if (_data) {
            _data = _.reduce(_.keys(_data), function (memo, k) {
                if (isQueryable(_data[k])) {
                    memo[k] = _data[k].query();
                }
                return memo;
            }, {});
        }
    }
    return _data;
}

function queryText(flag, prop) {
    return denullText(prop == null ? this.query(flag) : this.query(flag, prop));
}

/**
 * model/core/bound.js
 */

var boundModel = models.bound = baseModel.extend({
    /**
     * Constructor function to initialize each new model instance.
     * @return {[type]}
     */
    initialize: function () {
        var self = this;
        /**
         * Queue the autorun of update.  We want this to happen after the current JS module
         * is loaded but before anything else gets updated.  We can't do that with setTimeout
         * or _.defer because that could possibly fire after drainQueue.
         */
        self.scope = autorun(self.update, self.scopePriority, self,
                             self.Name && 'model_' + self.Name,
                             self.onScopeExecute, self, true);
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
            var bindable = lookup.obj;
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
        self.sleeping = self.sleepEnabled && !hasViewListener(self);
        if (self.sleeping) {
            /**
             * This model will not update itself until there's a view listener
             * waiting for data (directly or through a chain of other models)
             * from this model.
             */
            log(INFO, self, 'sleep');
        } else {
            self._update();
        }
    },

    _update: function () {
        var flag = this.assumeChanged ? QUERY_ASSUME_CHANGED : QUERY_DEFAULT;
        this.query(flag, QUERY_SELF, this.state());
        log(VERBOSE, this, 'updated', this.attributes);
    },

    /**
     * Triggers scope re-execution.
     */
    reset: function () {
        if (this.scope) {
            this.scope.trigger();
        }
    },

    destroy: function () {
        if (this.scope) {
            this.scope.destroy();
        }
        this.unset(QUERY_SELF);
    },

    disableSleep: function () {
        // This is intended to be used only interactively for development.
        if (TBONE_DEBUG && this.sleepEnabled) {
            log(WARN, this, 'disableSleep', 'Disabling sleep mode for <%-Name%>.', this);
            this.sleepEnabled = false;
            this.wake();
        }
    },

    /**
     * returns the new state, synchronously
     */
    state: noop,

    sleepEnabled: false
});

function getQuerySetProp (flag, prop) {
    // This is a short version of the start of the `query` function, and it would be nice
    // to refactor that to incorporate this feature without a duplication of that logic.
    var hasValue = arguments.length === 3;
    if (typeof flag !== 'number') {
        prop = flag;
        flag = QUERY_DEFAULT;
        if (arguments.length === 2) {
            hasValue = true;
        }
    }
    var isSet = flag >= MIN_QUERY_SET_FLAG || hasValue;
    prop = (prop || '').replace('__self__', '');
    return isSet ? prop : null;
}

if (TBONE_DEBUG) {
    boundModel.query = function (flag, prop, value) {
        var setProp = getQuerySetProp.apply(this, arguments);
        if (setProp && !this.isMutable) {
            log(WARN, this, 'boundModelSet', 'Attempting to set property <%-prop%> of bound model!', {
                prop: setProp
            });
        }
        return query.apply(this, arguments);
    };
}

// This is used by BBVis to hook into the base model/collection/view
// before they are modified.  You can, too.
try{
    root.dispatchEvent(new root.CustomEvent('tbone_loaded'));
} catch(e) {}

}());
