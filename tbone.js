'use strict';
(function tboneWrap(){

var root = typeof window === 'undefined' ? {} : window;
var TBONE_DEBUG = !!(root.TBONE_DEBUG == null ? root.DEBUG : root.TBONE_DEBUG);
var _ = typeof require === 'undefined' ? root._ : require('lodash');
var $ = typeof require === 'undefined' ? root.$ : require('jquery');

if (TBONE_DEBUG && !_) {
    console.error('TBone requires lodash or underscore. Found nothing at window._');
    return;
}

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
var PRIORITY_HIGHEST = 10000;
/** @const */
var DEFAULT_AUTORUN_PRIORITY = 4000;
/** @const */
var BASE_PRIORITY_MODEL_SYNC = 3000;
/** @const */
var BASE_PRIORITY_VIEW = 2000;
/** @const */
var BASE_PRIORITY_MODEL_ASYNC = 1000;

var priority = {
    highest: PRIORITY_HIGHEST,
    bound: BASE_PRIORITY_MODEL_SYNC,
    beforeViews: BASE_PRIORITY_VIEW + 500,
    view: BASE_PRIORITY_VIEW,
    afterViews: BASE_PRIORITY_VIEW - 500,
    async: BASE_PRIORITY_MODEL_ASYNC,
    lowest: 0,
};

function noop () { return undefined; }

var isDate = _.isDate;
var isFunction = _.isFunction;

function isObjectOrArray(x) {
    return x !== null && typeof x === 'object' && !isDate(x);
}

function isQueryable(x) {
    return !!(x && typeof x.query === 'function');
}

function isNonQueryableFunction(x) {
    return isFunction(x) && !isQueryable(x);
}

var EMPTY_OBJECT = {};
Object.freeze(EMPTY_OBJECT);

/**
 * Use to test whether a string is a number literal.
 * @type {RegExp}
 * @const
 */
var rgxNumber = /^\d+$/;

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
    var name = _.isString(context) ? context : context.Name;
    var type = (_.isString(context) ? context :
                context.isModel ? 'model' :
                context.isView ? 'view' :
                context.isScope ? 'scope' : '??');
    var threshold = Math.max(logLevels.context[name] || 0,
                             logLevels.event[event] || 0,
                             logLevels.type[type] || 0) || logLevels.base;
    if (event === 'lookups') {
        msg = _.reduce(msg, function logconsoleReduce(memo, map, id) {
            memo[map.obj.Name || ('tboneid-' + map.obj.tboneid)] = map;
            return memo;
        }, {});
    }
    if (level <= threshold) {
        /**
         * If a msg is a string, render it as a template with data as the data.
         * If msg is not a string, just output the data below.
         */
        var templated = _.isString(msg) ? _.template(msg)(data || EMPTY_OBJECT) : '';
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

/**
 * Returns the list of unique listeners attached to the specified model/view.
 * @param  {Queryable} self
 * @return {Array.<Queryable|View|Scope>} array of listeners
 */
function getListeners (self) {
    var listeners = [];
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

function recursiveDiff (self, evs, curr, prev, _exhaustive, depth, fireAll) {
    // Kludge alert: if the objects are too deep, just assume there is
    // a change.
    if (depth > MAX_RECURSIVE_DIFF_DEPTH) {
        if (TBONE_DEBUG) {
            log(WARN, self, 'recurseLimit', 'hit recursion depth limit of <%=limit%>', {
                limit: MAX_RECURSIVE_DIFF_DEPTH
            }, {
                curr: curr,
                prev: prev
            });
        }
        return true;
    }
    evs = evs || EMPTY_OBJECT;
    curr = curr;
    prev = prev;
    var changed = fireAll;
    var exhaustive = _exhaustive;
    var k;
    if (prev !== curr) {
        // If prev and curr are both "object" types (but not null),
        // then we need to search recursively for "real" changes.
        // We want to avoid firing change events when the user sets
        // something to a deep copy of itself.
        if (isQueryable(prev) || isQueryable(curr)) {
            changed = true;
            fireAll = true;
        } else if (isObjectOrArray(prev) && isObjectOrArray(curr)) {
            exhaustive = true;
        } else if (isDate(prev) && isDate(curr)) {
            if (prev.getTime() !== curr.getTime()) {
                changed = true;
            }
        } else {
            changed = true;
        }
    }
    for (k in evs) {
        if (k !== QUERY_SELF) {
            if (recursiveDiff(self, evs[k], curr && curr[k], prev && prev[k], false, depth + 1, fireAll)) {
                changed = true;
            }
        }
    }
    if (exhaustive && !changed) {
        // If exhaustive specified, and we haven't yet found a change, search
        // through all keys until we find one (note that this could duplicate
        // some searching done while searching the event tree)
        // This may not be super-efficient to call recursiveDiff all the time.
        if (isObjectOrArray(prev) && isObjectOrArray(curr)) {
            // prev and curr are both objects/arrays
            // search through them recursively for any differences
            // Detect changes in length; this catches the difference
            // between [] and [undefined]:
            if (prev.length !== curr.length) {
                changed = true;
            } else {
                for (k in curr) {
                    if (recursiveDiff(self, evs[k], curr[k], prev[k], true, depth + 1, false)) {
                        changed = true;
                        break;
                    }
                }
                if (!changed) {
                    // If there are any entries in prev that were not in curr,
                    // then this has changed.
                    // XXX really, it's the parent that has changed. If you queried
                    // for curr directly, you'd get back undefined before and after.
                    for (k in prev) {
                        if (curr[k] === undefined) {
                            changed = true;
                            break;
                        }
                    }
                }
            }
        }
    }
    if (changed) {
        var contexts = evs[QUERY_SELF] || EMPTY_OBJECT;
        for (var contextId in contexts) {
            contexts[contextId].trigger();
        }
    }
    return changed;
}

function recursivelyFreeze(obj) {
    if (isNonQueryableFunction(obj) || _.isElement(obj)) {
        throw 'Functions and DOM elements should not be set to TBone models.';
    }
    if (typeof obj === 'object' && obj !== null && !Object.isFrozen(obj)) {
        Object.freeze(obj);
        _.each(obj, recursivelyFreeze);
    }
}

function query () {
    var self = this;
    var myargs = arguments;
    var opts = myargs[0];
    var prop = myargs[1];
    var value = myargs[2];
    var isSet = myargs.length === 3;
    if (typeof opts !== 'object') {
        /**
         * If no opts provided, shift the prop and value over.  We do it this way instead
         * of having opts last so that we can type-check opts and discern it from the
         * prop.
         */
        value = prop;
        prop = opts;
        opts = EMPTY_OBJECT;
        /**
         * Use arguments.length to switch to set mode in order to properly support
         * setting undefined.
         */
        if (myargs.length === 2) {
            isSet = true;
        }
    }

    if (!prop && opts.dontGetData) {
        return self;
    }

    /**
     * Remove a trailing dot and __self__ references, if any, from the prop.
     **/
    var args = splitQueryString(prop);

    /**
     * If this function was called with a bindable context (i.e. a Model or Collection),
     * then use that as the root data object instead of the global tbone.data.
     */
    var datas = [];
    var props = [];
    var _data = self.attributes;

    var arg;
    var doSubQuery;
    var parentCallbackContexts = {};
    var events = isSet && self._events;

    while (true) {
        if (isQueryable(_data)) {
            /**
             * To avoid duplicating the recentLookups code here, we set a flag and do
             * the sub-query after recording queries.
             *
             * Always do the subquery if there are more args.
             * If there are no more args...
             * - and this is a set...
             *   -        to a queryable: Don't sub-query.  Set property to new queryable.
             *   -    to a non-queryable: Do the sub-query.  Push the value to the
             *                            other model (don't overwrite the model).  This
             *                            is kind of magical?
             * - and this is a get...
             *   -                always: Do the sub-query.
             */
            doSubQuery = (args && args.length) || !(isSet && isQueryable(value));
            break;
        }

        arg = args.shift();
        if (!arg) {
            break;
        }

        if (isSet && !isObjectOrArray(_data)) {
            /**
             * When doing an implicit mkdir -p while setting a deep-nested property
             * for the first time, we peek at the next arg and create either an array
             * for a numeric index and an object for anything else.  We set the
             * property via query() so as to fire change events appropriately.
             */
            if (TBONE_DEBUG && _data != null) {
                log(WARN, self, 'mkdir', 'while writing <%=prop%>, had to overwrite ' +
                    'primitive value <%=primitive%> at <%=partial%>', {
                        prop: prop,
                        primitive: _data,
                        partial: args.join('.')
                    });
            }
            /**
             * Decide whether to implicitly create an array or an object.
             *
             * If there are args remaining, then use the next arg to determine;
             * for a number, create an array - anything else, an object.
             */
            _data = rgxNumber.exec(arg) ? [] : {};
            self.query(props.join('.'), _data);
        }

        props.push(arg);
        datas.push(_data);

        _data = _data != null ? _data[arg] : undefined;
        if (events) {
            _.extend(parentCallbackContexts, events[QUERY_SELF] || EMPTY_OBJECT);
            events = events[arg];
        }
    }

    if (!isSet && recentLookups) {
        var id = uniqueId(self);
        if (!recentLookups[id]) {
            recentLookups[id] = {
                obj: self,
                props: {}
            };
        }
        recentLookups[id].props[props.join('.')] = _data;
    }

    if (doSubQuery) {
        return isSet ? _data.query(opts, args.join('.'), value) : _data.query(opts, args.join('.'));
    }

    if (isSet) {
        if (TBONE_DEBUG && !self.disableFreeze) {
            recursivelyFreeze(value);
            // Walk up the object tree, cloning every object and patching in new
            // trees that include the new value in them:
            var last = value;
            for (var i = datas.length - 1; i >= 0; i--) {
                var clone = _.clone(datas[i]);
                clone[props[i]] = last;
                Object.freeze(clone);
                last = clone;
            }
            self.attributes = last;
        } else {
            if (datas.length) {
                datas[datas.length - 1][props[props.length - 1]] = value;
            } else {
                self.attributes = value;
            }
        }

        if (TBONE_DEBUG && isQueryable(value)) {
            // XXX Kludge Alert.  In practice, gives many models a Name that otherwise
            // wouldn't have one by using the first prop name it is set to.  Works for
            // the typical T('modelName', model.make()) and T.push cases.
            if (!value.Name) {
                value.Name = prop;
            }
            if (value.scope && !value.scope.Name) {
                value.scope.Name = 'model_' + prop;
            }
        }

        var searchExhaustively = !_.isEmpty(parentCallbackContexts);
        if (recursiveDiff(self, events, _data, value, searchExhaustively, 0, opts.assumeChanged)) {
            _.each(parentCallbackContexts, function contextTriggerIter(context) {
                context.trigger();
            });
        }
        return value;
    }
    return _data;
}

/**
 * model/core/base.js
 */

function ensureArray(v) {
    return _.isArray(v) ? v : [];
}

function splitQueryString(_prop) {
    var prop = _prop ? _prop.replace('__self__', '') : '';
    return prop ? prop.split('.') : [];
}

var boundModel;

/**
 * baseModel
 * @constructor
 */
var baseModel = {
    isModel: true,
    make: function make(opts) {
        var self = this;
        // Each TBone model/collection is an augmented copy of this TBoneModel function
        var instance = function TBoneModel (arg0, arg1) {
            var typeofArg0 = typeof arg0;
            if (typeofArg0 === 'function' || typeofArg0 === 'object') {
                return autorun(arg0);
            } else if (typeof arg1 === 'function' && !isQueryable(arg1)) {
                return instance.query(arg0, instance.bound(arg1));
            }
            return (arguments.length === 0 ? instance.query() :
                    arguments.length === 1 ? instance.query(arg0) :
                                             instance.query(arg0, arg1));
        };
        _.extend(instance, self, isFunction(opts) ? {
            state: opts,
            Name: opts.name,
        } : opts || EMPTY_OBJECT);

        // Initialize the model instance
        instance.tboneid = undefined;
        instance.attributes = undefined;
        instance._events = {};
        instance._removeCallbacks = {};
        uniqueId(instance);
        instance.initialize();
        return instance;
    },
    extend: function extend(subclass) {
        return _.extend({}, this, subclass);
    },
    initialize: noop,
    on: function on(name, context) {
        var parts = splitQueryString(name);
        var events = this._events;
        var arg;

        while ((arg = parts.shift()) != null) {
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
    off: function off(name, context) {
        // XXX doesn't clean up when callbacks list goes to zero length
        var parts = splitQueryString(name);
        var events = this._events;
        var arg;

        while ((arg = parts.shift()) != null) {
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
    trigger: function trigger(name) {
        var self = this;
        var events = self._events;
        var parts = splitQueryString(name);
        var arg;
        while ((arg = parts.shift()) != null) {
            if (!events[arg]) {
                events[arg] = {};
            }
            events = events[arg];
        }
        var contexts = events[QUERY_SELF] || EMPTY_OBJECT;
        for (var contextId in contexts) {
            contexts[contextId].trigger();
        }
    },

    runOnlyOnce: function runOnlyOnce(fn) {
        autorun(fn).destroy();
    },

    query: query,

    queryModel: function queryModel(prop) {
        return this.query({dontGetData: true}, prop);
    },

    // query `prop` without binding to changes in its value
    readSilent: function readSilent(prop) {
        var tmp = recentLookups;
        recentLookups = null;
        var rval = this.query(prop);
        recentLookups = tmp;
        return rval;
    },

    idAttribute: 'id',

    queryId: function queryId() {
        return this.query(this.idAttribute);
    },

    bound: function bound(fn) {
        return boundModel.make(fn);
    },

    getName: function getName(obj) {
        if (!obj) {
            obj = this;
        }
        if (obj.Name) {
            return obj.Name;
        }
        var parent = obj.context || obj.parentScope;
        if (parent) {
            return this.getName(parent) + '+';
        }
        return 'na-' + obj.tboneid;
    },

    toggle: function toggle(prop) {
        this.query(prop, !this.readSilent(prop));
    },

    push: function push(prop, value) {
        if (arguments.length === 1) {
            value = prop;
            prop = '';
        }
        return this.query(prop, ensureArray(this.readSilent(prop)).concat([value]));
    },

    unshift: function unshift(prop, value) {
        if (arguments.length === 1) {
            value = prop;
            prop = '';
        }
        return this.query(prop, [value].concat(ensureArray(this.readSilent(prop))));
    },

    removeFirst: function removeFirst(prop) {
        return this.query(prop, ensureArray(this.readSilent(prop)).slice(1));
    },

    removeLast: function removeLast(prop) {
        return this.query(prop, ensureArray(this.readSilent(prop)).slice(0, -1));
    },

    unset: function unset(prop) {
        if (prop) {
            var parts = prop.split('.');
            var child = parts.pop();
            var parent = parts.join('.');
            this.query(parent, _.omit(this.readSilent(parent), child));
        } else {
            this.query('', undefined);
        }
    },

    increment: function increment(prop, value) {
        var curr = this.readSilent(prop);
        var newval = (curr || 0) + (value != null ? value : 1);
        this.query(prop, newval);
    },

    wake: noop,
};

var tbone = baseModel.make({ Name: 'tbone' });

tbone.hasViewListener = hasViewListener;
tbone.priority = priority;

if (TBONE_DEBUG) {
    tbone.watchLog = watchLog;
    tbone.getListeners = getListeners;
    tbone.onLog = onLog;
    onLog(logconsole);
}

// Export for node:
if (typeof module !== 'undefined') {
    module.exports = tbone;
}

// Browser-land
var orig_T = root.T;
var orig_tbone = root.tbone;
root.T = tbone;
root.tbone = tbone;
tbone.noConflict = function noConflict() {
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
        stop: function stop() {
            cumulative = now() - started;
        },
        start: function start() {
            started = now();
        },
        done: function done() {
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
 * scheduler/scope.js
 */

/**
 * currentExecutingScope globally tracks the current executing scope, so that subscopes
 * created during its execution (i.e. by tbone.autorun) can register themselves as
 * subscopes of the parent (this is important for recursive destruction of scopes).
 */
var currentExecutingScope;

var recentLookups;

var scopeBase = {

    /**
     * Used to identify that an object is a Scope
     * @type {Boolean}
     */
    isScope: true,

    /**
     * Queue function execution in the scheduler
     */
    trigger: function scopeTrigger() {
        queueExec(this);
    },

    /**
     * Execute the wrapped function, tracking all values referenced through lookup(),
     * and binding to those data sources such that the function is re-executed whenever
     * those values change.  Each execution re-tracks and re-binds all data sources; the
     * actual sources bound on each execution may differ depending on what is looked up.
     */
    execute: function scopeExecute() {
        var self = this;
        var myTimer;
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
        tbone.isExecuting = true;

        // ** Call the payload function **
        // This function must be synchronous.  Anything that is looked up using
        // tbone.lookup before this function returns (that is not inside a subscope)
        // will get bound below.
        try {
            self.fn();
        } finally {
            _.each(recentLookups, function executeRecentLookupsIter(propMap) {
                var obj = propMap.obj;
                var props = propMap.props;
                if (props['']) {
                    obj.on('', self);
                } else {
                    for (var prop in props) {
                        obj.on(prop, self);
                    }
                }
            });

            // This is intended primarily for diagnostics.
            if (self.onExecuteCb) {
                self.onExecuteCb();
            }

            // Pop our own lookups and parent scope off the stack, restoring them to
            // the values we saved above.
            recentLookups = oldLookups;
            currentExecutingScope = parentScope;
            tbone.isExecuting = !!currentExecutingScope;

            if (TBONE_DEBUG) {
                var executionTimeMs = myTimer.done();
                log(VERBOSE, self, 'exec', '<%=priority%> <%=duration%>ms <%=name%>', {
                    priority: self.priority,
                    duration: executionTimeMs
                });
                if (executionTimeMs > 10) {
                    log(VERBOSE, self, 'slowexec', '<%=priority%> <%=duration%>ms <%=name%>', {
                        priority: self.priority,
                        duration: executionTimeMs
                    });
                }
            }
        }
    },

    /**
     * For each model which we've bound, tell it to unbind all events where this
     * scope is the context of the binding.
     */
    unbindAll: function scopeUnbindAll() {
        var self = this;
        if (self.lookups) {
            for (var objId in self.lookups) {
                var propMap = self.lookups[objId];
                var obj = propMap.obj;
                var props = propMap.props;
                for (var prop in props) {
                    obj.off(prop, self);
                }
            }
            self.lookups = null;
        }
    },

    /**
     * Destroy any execution scopes that were creation during execution of this function.
     */
    destroySubScopes: function scopeDestroySubScopes() {
        var self = this;
        for (var i in self.subScopes) {
            self.subScopes[i].destroy();
        }
        self.subScopes = [];
    },

    /**
     * Destroy this scope.  Which means to unbind everything, destroy scopes recursively,
     * and ignore any execute calls which may already be queued in the scheduler.
     */
    destroy: function scopeDestroy() {
        var self = this;
        self.parentScope = null;
        self.unbindAll();
        self.destroySubScopes();
        // Prevent execution even if this scope is already queued to run:
        self.execute = noop;
    },
};

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
 * @param  {number}      priority  Scheduling priority: higher goes sooner
 * @param  {Object}      context   Context to pass on invocation
 * @param  {string}      name      Name for debugging purposes
 * @return {Scope}                 A new Scope created to wrap this function
 */
function autorun (opts) {
    if (typeof opts === 'function') {
        opts = {fn: opts};
    }

    var context = opts.context;
    var scope = _.extend({}, scopeBase, {
        // Default priority and name if not specified.  Priority is important in
        // preventing unnecessary refreshes of views/subscopes that may be slated
        // for destruction by a parent; the parent should have priority so as
        // to execute first.
        priority: currentExecutingScope ? currentExecutingScope.priority - 1 : DEFAULT_AUTORUN_PRIORITY,
        Name: opts.fn.name,
    }, opts, {
        fn: opts.fn.bind(context),
        subScopes: [],
        lookups: null,
    });

    if (context && context.onScopeExecute) {
        scope.onExecuteCb = context.onScopeExecute.bind(context, scope);
    }

    // If this is a subscope, add it to its parent's list of subscopes, and add a reference
    // to the parent scope.
    if (!scope.detached && currentExecutingScope) {
        currentExecutingScope.subScopes.push(scope);
        scope.parentScope = currentExecutingScope;
    }

    if (scope.deferExec) {
        // Queue the scope for execution
        scope.trigger();
    } else {
        // Run the associated function (and bind associated models)
        scope.execute();
    }

    // Return the scope object. Many consumers use the destroy method
    // to kill the scope and all its bindings.
    return scope;
}

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
        schedulerQueue.sort(function schedulerSortFn(a, b) {
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

tbone.isReady = function isReady() {
    return metrics.query('isReady');
};

var isReadyTimer;
function updateIsReady () {
    if (!isReadyTimer) {
        isReadyTimer = setTimeout(function _updateIsReady() {
            var numInFlight = _.keys(inflight).length;
            metrics.query('isReady', _.isEmpty(inflight) && !drainQueueTimer);
            metrics.query('ajax.modelsInFlight', _.clone(inflight));
            metrics.query('ajax.isReady', numInFlight === 0);
            metrics.query('ajax.numInFlight', numInFlight);
            isReadyTimer = null;
        }, 0);
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

/**
 * Drain the Scope execution queue, in priority order.
 */
function drainQueue() {
    drainQueueTimer = null;
    if (schedulerQueue.length) {
        var queueDrainStartTime = now();
        var scope;
        drainQueueTimer = _.defer(drainQueue);
        var remaining = 5000;
        // console.log('drain start');
        while (!(TBONE_DEBUG && frozen) && --remaining && (scope = pop())) {
            /**
             * Update the scopesQueued map so that this Scope may be requeued.
             */
            delete scopesQueued[uniqueId(scope)];

            /**
             * Execute the scope, and in turn, the wrapped function.
             */
            // console.log('exec scope ' + scope.priority + ' ' + tbone.getName(scope));
            scope.execute();
        }
        // console.log('drain end');
        if (TBONE_DEBUG) {
            if (!remaining) {
                log(WARN, 'scheduler', 'drainQueueOverflow', 'exceeded max drainQueue iterations');
            }
            log(VERBOSE, 'scheduler', 'drainQueue', 'ran for <%=duration%>ms', {
                duration: now() - queueDrainStartTime
            });
        }
        updateIsReady();
    }
}

tbone.defer = function tboneDefer(_opts) {
    var opts = _.extend({
        priority: PRIORITY_HIGHEST,
        detached: true,
        deferExec: true,
    }, isFunction(_opts) ? {fn: _opts} : _opts);
    autorun(opts);
};

/**
 * Drain to the tbone drainQueue, executing all queued Scopes immediately.
 * This is useful both for testing and MAYBE also for optimizing responsiveness by
 * draining at the end of a keyboard / mouse event handler.
 */
var drain = tbone.drain = function tboneDrain() {
    if (drainQueueTimer) {
        clearTimeout(drainQueueTimer);
    }
    drainQueue();
};

if (TBONE_DEBUG) {
    tbone.freeze = function freeze() {
        frozen = true;
    };

    tbone.unfreeze = function unfreeze() {
        frozen = false;
        drain();
    };
}

/**
 * model/core/bound.js
 */

boundModel = models.bound = baseModel.extend({
    /**
     * Constructor function to initialize each new model instance.
     * @return {[type]}
     */
    initialize: function initialize() {
        var self = this;
        /**
         * Queue the autorun of update.  We want this to happen after the current JS module
         * is loaded but before anything else gets updated.  We can't do that with setTimeout
         * or _.defer because that could possibly fire after drainQueue.
         */
        self.scope = autorun({
            fn: self.update,
            priority: self.priority,
            context: self,
            detached: true,
            Name: self.Name && ('model_' + self.Name),
        });
    },

    priority: BASE_PRIORITY_MODEL_SYNC,

    /**
     * Wake up this model as well as (recursively) any models that depend on
     * it.  Any view that is directly or indirectly depended on by the current
     * model may now be able to be awoken based on the newly-bound listener to
     * this model.
     * @param  {Object.<string, Boolean>} woken Hash map of model IDs already awoken
     */
    wake: function wake(woken) {
        var self = this;
        if (self.scope) {
            // Wake up this model if it was sleeping
            if (self.sleeping) {
                self.sleeping = false;
                self.reset();
            }

            /**
             * Wake up models that depend directly on this model that have not already
             * been woken up.
             */
            _.each(self.scope.lookups, function wakeIter(lookup) {
                var bindable = lookup.obj;
                if (bindable && !woken[uniqueId(bindable)]) {
                    woken[uniqueId(bindable)] = true;
                    bindable.wake(woken);
                }
            });
        }
    },

    onScopeExecute: function onScopeExecute(scope) {
        if (TBONE_DEBUG) {
            log(INFO, this, 'lookups', scope.lookups);
        }
    },

    update: function update() {
        var self = this;
        self.sleeping = self.sleepEnabled && !hasViewListener(self);
        if (self.sleeping) {
            /**
             * This model will not update itself until there's a view listener
             * waiting for data (directly or through a chain of other models)
             * from this model.
             */
            if (TBONE_DEBUG) {
                log(INFO, self, 'sleep');
            }
        } else {
            self._update();
        }
    },

    _update: function _update() {
        var opts = this.assumeChanged ? {assumeChanged : true} : EMPTY_OBJECT;
        this.query(opts, QUERY_SELF, this.state());
        if (TBONE_DEBUG) {
            log(VERBOSE, this, 'updated', this.attributes);
        }
    },

    /**
     * Triggers scope re-execution.
     */
    reset: function reset() {
        if (this.scope) {
            this.scope.trigger();
        }
    },

    destroy: function destroy() {
        var self = this;
        if (self.scope) {
            self.scope.destroy();
            self.scope = null;
        }
        self.unset(QUERY_SELF);
    },

    /**
     * returns the new state, synchronously
     */
    state: noop,

    sleepEnabled: false
});

if (TBONE_DEBUG) {
    boundModel.disableSleep = function disableSleep() {
        // This is intended to be used only interactively for development.
        if (this.sleepEnabled) {
            log(WARN, this, 'disableSleep', 'Disabling sleep mode for <%-Name%>.', this);
            this.sleepEnabled = false;
            this.wake();
        }
    };

    boundModel.query = function boundQueryWrapper(opts, prop) {
        var args = _.toArray(arguments);
        if (!this.isMutable) {
            // This is a short version of the start of the `query` function, and it would be nice
            // to refactor that to incorporate this feature without a duplication of that logic.
            var isSet = arguments.length === 3;
            if (typeof opts === 'string') {
                prop = opts;
                if (arguments.length === 2) {
                    isSet = true;
                }
            }
            if (isSet) {
                prop = (prop || '').replace('__self__', '');
                var setProp = isSet ? prop : null;
                if (setProp && !prop.match(/^__/)) {
                    log(WARN, this, 'boundModelSet', 'Attempting to set property <%-prop%> of bound model!', {
                        prop: setProp
                    });
                }
            }
        }
        return query.apply(this, args);
    };
}

/**
 * model/core/async.js
 */

var asyncModel = models.async = boundModel.extend({
    _update: function asyncUpdate() {
        var self = this;
        // Allow updates that are as new or newer than the last *update* generation.
        // This allows rolling updates, where the model may have one or more requests
        // in flight for newer data, yet it will still accept earlier-generation
        // data that arrives as long as it is newer than what it had before.
        var reqGeneration = self.reqGeneration = (self.reqGeneration || 0) + 1;
        var callbackCalledImmediately = false;
        var opts = self.state(function asyncUpdateStateCallback(value) {
            callbackCalledImmediately = true;
            if (reqGeneration >= (self.updateGeneration || 0)) {
                self.updateGeneration = reqGeneration;
                self.abortCallback = null;
                self.query('', value);
                return true;
            }
            return undefined;
        });
        if (!callbackCalledImmediately) {
            self.abortCallback = opts && opts.onAbort;
        }
    },

    abortPrevious: function asyncAbortPrevious() {
        if (this.abortCallback) {
            this.abortCallback();
        }
    },

    priority: BASE_PRIORITY_MODEL_ASYNC
});


var nextTempId = 1;

var baseCollection = baseModel.extend({
    isCollection: true,
    // The only place isModel is checked is in hasViewListener.
    // For that function's purposes, TBone collections are models.
    // It might be better to remove isModel and use isQueryable instead.
    isModel: true,
    model: baseModel,

    add: function add(data) {
        var self = this;
        var child;
        var lastId;

        /**
         * If data is already a queryable (presumably an instance of baseModel), then
         * use that.  Otherwise, instantiate a model and initialize it with data.
         */
        if (isQueryable(data)) {
            child = data;
        } else {
            child = self.model.make();
            child.query('', data);
        }

        /**
         * Watch the child model's idAttribute, updating its location in this
         * collection (which is an object, not an array) in case the child's id
         * changes.  The latter is mostly useful in case the ID is not set
         * initially.  In this case, we assign a temporary ID so that it gets
         * included when iterating over the collection.
         */
        var removed;
        function update() {
            if (lastId != null) {
                self.unset(lastId);
                self.trigger(lastId);
                delete self._removeCallbacks[lastId];
            }
            if (!removed) {
                var id = child.queryId();
                if (id == null) {
                    id = '__unidentified' + (nextTempId++);
                }
                id = '#' + id;
                self.query(id, child);
                self.trigger(id);
                self._removeCallbacks[id] = removeCallback;
                lastId = id;
            }
        }
        self.increment('size');
        function removeCallback() {
            self.increment('size', -1);
            removed = true;
            update();
        }
        autorun(update);
    },

    /**
     * It might be helpful to override `push` with a null or with a function
     * that logs an error in dev mode to avoid confusion with cases where
     * the user could be steered to use a model as a simple list.
     */

    /**
     * Remove a model by ID or by model instance.
     */
    remove: function remove(modelOrId) {
        modelOrId = '#' + (isQueryable(modelOrId) ? modelOrId.queryId() : modelOrId);
        if (this._removeCallbacks[modelOrId]) {
            this._removeCallbacks[modelOrId]();
        }
    }
});

var collections = tbone.collections = {
    base: baseCollection,
};

/**
 * model/fancy/ajax.js
 */

models.ajax = asyncModel.extend({

    state: function asyncState(dataCallback) {
        var self = this;
        function complete() {
            removeInFlight(self);
            self.onComplete();
        }

        var url = _.isString(self.url) ? self.url : self.url();
        if (url == null) {
            dataCallback(null);
        } else {
            /**
             * If a defined URL function returns null, it will prevent fetching.
             * This can be used e.g. to prevent loading until all required
             * parameters are set.
             **/
            self.abortPrevious();
            self.fetchedUrl = url;
            self.preFetch();
            addInFlight(self);
            var onData = function asyncStateOnData(str) {
                /**
                 * dataCallback returns true if this update was accepted (i.e.
                 * is of the current async update generation).  So only fire
                 * the postFetch callback, etc, when the update actually sticks.
                 */
                if (dataCallback(self.parse(str))) {
                    self.postFetch();
                    if (TBONE_DEBUG) {
                        log(INFO, self, 'updated', self.attributes);
                    }
                }
            };
            self.ajax({
                url: url,
                type: 'GET',
                dataType: self.dataType,
                success: onData,
                error: function error(xhr) {
                    onData(xhr && xhr.responseText);
                },
                complete: complete,
            });
        }
        return {
            onAbort: function onAbort() {
                // If we have an active XHR in flight, we should abort
                // it because we don't want that anymore.
                if (TBONE_DEBUG) {
                    log(WARN, self, 'abort',
                        'aborting obsolete ajax request. old url: <%=oldurl%>', {
                        oldurl: self.fetchedUrl
                    });
                }
                complete();
            }
        };
    },

    parse: _.identity,

    /**
     * By default, async models will use $.ajax to fetch data; override this
     * with something else if desired.
     */
    ajax: function ajax() {
        return $.ajax.apply($, arguments);
    },

    preFetch: function preFetch() {
        this.unset();
    },

    postFetch: noop,

    onComplete: noop,

    sleepEnabled: true,

    dataType: 'json'

});

/**
 * model/fancy/localstorage.js
 */

var localStorage = root.localStorage;

models.localStorage = baseModel.extend({
    /**
     * To use, extend this model and specify key as a property.
     *
     * For example:
     * var metrics = tbone.models.localStorage.make({ key: 'metrics' });
     * metrics.increment('pageloads');
     * console.log(metrics.query('pageloads'));
     */

    initialize: function initialize() {
        var self = this;
        var data;
        try {
            data = JSON.parse(localStorage[self.key]);
        } catch (e) {}
        self.query('', data);
        autorun(function initializeAutorun() {
            localStorage[self.key] = JSON.stringify(self.query(''));
        });
    }
});

/**
 * model/fancy/location.js
 */

function changePathGen (method) {
    return function changePath(path) {
        root.history[method + 'State'](EMPTY_OBJECT, '', path);
        $(root).trigger(method + 'state');
    };
}

models.location = baseModel.extend({
    /**
     * Example:
     * var loc = tbone.models.location.make();
     * T(function () {
     *     console.log('the hash is ' + loc('hash'));
     * });
     * loc('hash', '#this-is-the-new-hash');
     */
    initialize: function initialize() {
        var self = this;
        var recentlyChanged;
        function update (ev) {
            var changed = self('hash') !== location.hash ||
                          self('search') !== location.search ||
                          self('pathname') !== location.pathname;
            if (changed) {
                self('hash', location.hash);
                self('pathname', location.pathname);
                self('search', location.search);
                recentlyChanged = true;
            }
        }
        $(root).bind('hashchange popstate pushstate replacestate', update);
        update();

        autorun(function initializeAutorun() {
            var pathname = self('pathname');
            var search = self('search');
            var hash = self('hash');
            if (!recentlyChanged) {
                self.pushPath(pathname + (search || '') + (hash ? '#' + hash : ''));
            }
            recentlyChanged = false;
        });
    },

    pushPath: changePathGen('push'),
    replacePath: changePathGen('replace')
});

/**
 * model/fancy/localstoragecoll.js
 */

collections.localStorage = baseCollection.extend({
    initialize: function initialize() {
        var self = this;
        var stored;
        try {
            stored = JSON.parse(localStorage[self.key]);
        } catch (e) {}
        _.each(stored || [], function initializeAddIter(modelData) {
            self.add(modelData);
        });
        autorun(function initializeAutorun() {
            localStorage[self.key] = JSON.stringify(self.query());
        });
    }
});

var React = root && root.React || (typeof require !== 'undefined' && require('react'));
if (React) {
    var IS_WILL_UPDATE = 1;
    var IS_DID_MOUNT = 2;
    var IS_DID_UPDATE = 3;

    var origCreateClass = React.createClass;
    React.createClass = function tboneReactClassWrapper(origOpts) {
        function myAutorun (fn, inst, name) {
            return autorun({
                fn: fn,
                priority: tbone.priority.view,
                context: inst,
                detached: true,
                Name: 'react_' + inst.constructor.displayName + ':' + name,
                isView: true,
            });
        }

        function destroyTScopes(inst, key) {
            var scopes = inst.__tbone__[key];
            for (var i in scopes) {
                scopes[i].destroy();
            }
            inst.__tbone__[key] = [];
        }
        function doUpdate (inst) {
            if (!inst.hasUpdateQueued) {
                inst.__tbone__.hasUpdateQueued = 1;
                destroyTScopes(inst, 'render');
                if (inst.isMounted()) {
                    // console.log('update queued for ' + inst._currentElement.type.displayName);
                    inst.forceUpdate();
                } else {
                    // console.log('update NOT queued for ' + inst._currentElement.type.displayName);
                }
            }
        }
        function getWrapperFn (origFn, special) {
            return function tboneReactWrapper() {
                var self = this;
                var args = arguments;
                if (special === IS_WILL_UPDATE) {
                    destroyTScopes(self, 'render');
                    self.__tbone__.hasUpdateQueued = 0;
                }
                var rval;
                var tscope;
                var isDidMount = special == IS_DID_MOUNT;
                var isPostRender = special === IS_DID_UPDATE || isDidMount;
                if (origFn) {
                    if (isDidMount) {
                        self.__tbone__.mount.push(myAutorun(origFn.bind(self), self, 'DidMount'));
                    } else {
                        var firstRun = true;
                        var name = isPostRender ? 'DidUpdate' :
                                   special ? 'WillUpdate' : 'Render';
                        self.__tbone__.render.push(myAutorun(function tboneReactAutorunWrapper() {
                            if (firstRun) {
                                rval = origFn.apply(self, args);
                                // console.log('render', self._currentElement.type.displayName);
                                firstRun = false;
                            } else {
                                // console.log('update', self._currentElement.type.displayName);
                                doUpdate(self);
                            }
                        }, self, name));
                    }
                }
                if (isPostRender && origOpts.componentDidRender) {
                    self.__tbone__.render.push(myAutorun(origOpts.componentDidRender.bind(self), self, 'DidRender'));
                }
                return rval;
            };
        }
        var opts = _.extend({}, origOpts, {
            componentWillMount: function tboneComponentWillMountWrapper() {
                this.__tbone__ = {
                    mount: [],
                    render: [],
                };
                var origFn = origOpts.componentWillMount;
                if (origFn) {
                    return origFn.apply(this, arguments);
                }
            },
            componentWillUnmount: function tboneComponentWillUnmountWrapper() {
                destroyTScopes(this, 'mount');
                destroyTScopes(this, 'render');
                if (origOpts.componentWillUnmount) {
                    return origOpts.componentWillUnmount.apply(this, arguments);
                }
            },
            componentWillUpdate: getWrapperFn(origOpts.componentWillUpdate, IS_WILL_UPDATE),
            componentDidUpdate: getWrapperFn(origOpts.componentDidUpdate, IS_DID_UPDATE),
            componentDidMount: getWrapperFn(origOpts.componentDidMount, IS_DID_MOUNT),
            render: getWrapperFn(origOpts.render)
        });

        return origCreateClass(opts);
    };
}

// This is used by BBVis to hook into the base model/collection/view
// before they are modified.  You can, too.
try{
    root.dispatchEvent(new root.CustomEvent('tbone_loaded'));
} catch(e) {}

}());
