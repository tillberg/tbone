'use strict';
(function tboneWrap(){

var root = typeof window === 'undefined' ? {} : window;
var TBONE_DEBUG = !!(root.TBONE_DEBUG == null ? (root.DEBUG == null ? true : root.DEBUG) : root.TBONE_DEBUG);
var _ = typeof require === 'undefined' ? root._ : require('lodash');

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

function ensureArray(v) {
    return _.isArray(v) ? v : [];
}

function splitQueryString(_prop) {
    var prop = _prop ? _prop.replace('__self__', '') : '';
    return prop ? prop.split('.') : [];
}

var EMPTY_OBJECT = {};
Object.freeze(EMPTY_OBJECT);

/**
 * If you want to select the root, you can either pass __self__ or just an empty
 * string; __self__ is converted to an empty string and this "flag" is used to
 * check for whether we are selecting either.
 * @const
 */
var QUERY_SELF = '';

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
 * @param  {string|Backbone.Model|Backbone.View|Runlet} context What is logging this event
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
                context.isRunlet ? 'runlet' : '??');
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
 * Returns true if there is a view that is listening (directly or indirectly)
 * to this model.  Useful for determining whether the current model should
 * be updated (if a model is updated in the forest and nobody is there to
 * hear it, then why update it in the first place?)
 * @param  {Queryable}  self
 * @return {Boolean}
 */
function hasViewListener (self) {
    // console.log('hasViewListener', self.getName());
    var todo = [ self._events ];
    var used = [];
    var next;
    while (!!(next = todo.pop())) {
        if (used.indexOf(next) !== -1) {
            continue;
        }
        used.push(next);
        for (var k in next) {
            var curr = next[k];
            if (k === QUERY_SELF) {
                for (var id in curr) {
                    var listener = curr[id];
                    while (listener) {
                        if (listener.isView) {
                            // console.log('found view listener');
                            return true;
                        }
                        if (listener.contextScoping) {
                            // console.log('found scoped reference (' + listener.contextScoping + ')');
                            var props = splitQueryString(listener.contextScoping);
                            var ev = listener.context._events.attributes;
                            for (var i = 0; ev && i < props.length; i++) {
                                ev = ev[props[i]];
                            }
                            if (ev) {
                                todo.push(ev);
                            }
                            break;
                        }
                        if (listener.context && listener.context.isModel) {
                            // console.log('found model');
                            todo.push(listener.context._events);
                            break;
                        }
                        listener = listener.parentRunlet;
                    }
                }
            } else {
                todo.push(curr);
            }
        }
    }
    // console.log('no view listener');
    return false;
}


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
    if (changed && evs[QUERY_SELF]) {
        var contexts = evs[QUERY_SELF];
        for (var contextId in contexts) {
            contexts[contextId].trigger();
        }
    }
    return changed;
}

function genModelDataProxy(parentModel, prop, childModel) {
    return autorun({
        fn: function() {
            parentModel.query({
                setModelData: true,
            }, prop, childModel.query(''));
        },
        context: parentModel,
        contextScoping: prop,
        immediate: true,
        detached: true,
        priority: PRIORITY_HIGHEST - 1000,
    });
}

function recursivelyDestroySubModelRunlets(_model) {
    if (_model) {
        for (var k in _model) {
            if (k === QUERY_SELF) {
                _model[QUERY_SELF].runlet.destroy();
            } else {
                recursivelyDestroySubModelRunlets(_model[k]);
            }
        }
    }
}

function recursivelyFreeze(obj) {
    if (isFunction(obj) || _.isElement(obj)) {
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

    var assumeChanged = opts.assumeChanged;

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
    var setModelData = opts.setModelData;
    var isUnset = opts.unset;
    var isModelSet = isSet && !setModelData && isQueryable(value);
    var queryModel = isModelSet || opts.dontGetData;
    var models = [];
    var _model = self.submodels;
    var eventsBaseProp = queryModel ? 'submodels' : 'attributes';
    var events = isSet && self._events[eventsBaseProp];
    var subModel;

    while (true) {
        subModel = _model && _model[QUERY_SELF] && _model[QUERY_SELF].model;

        // Is there a way we could completely avoid sub-queries on reads?
        // The trouble comes with indirectly-set models, which get written as _data
        // instead of in the _model tree.
        if ((isSet || queryModel) && isQueryable(subModel)) {
            /**
             * To avoid duplicating the recentLookups code here, we set a flag and do
             * the sub-query after recording queries.
             *
             * Do a sub-query to a child model if there are more args remaining.
             */
            doSubQuery = args.length;
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
                throw 'Writing to a sub-property of a primitive value is not allowed.';
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
        if (_model) {
            models.push(_model);
            if (isSet) {
                if (TBONE_DEBUG && _model[QUERY_SELF]) {
                    throw 'Direct writes below a sub-model are not allowed. Write to the sub-model instead.';
                }
                if (isModelSet && !_model[arg]) {
                    _model[arg] = {};
                }
            }
            _model = _model[arg];
        }
        if (events) {
            if (!isModelSet) {
                _.extend(parentCallbackContexts, events[QUERY_SELF] || EMPTY_OBJECT);
            }
            events = events[arg];
        }
    }

    if (!isSet && recentLookups) {
        var id = uniqueId(self);
        if (!recentLookups[id]) {
            recentLookups[id] = {
                obj: self,
                props: {},
            };
        }
        var propsStr = props.join('.');
        propsStr = eventsBaseProp + (propsStr ? '.' : '') + propsStr;
        // console.log('binding ' + propsStr);
        recentLookups[id].props[propsStr] = _data;
    }

    if (doSubQuery) {
        return isSet ? subModel.query(opts, args.join('.'), value) : subModel.query(opts, args.join('.'));
    }

    if (isSet) {
        if (isModelSet) {
            // Skip the destroy/re-bind if the value to set is the same
            // as the model already here.
            if (value === subModel) {
                return value;
            }
            assumeChanged = true;
            var runletWrap = {
                '': {
                    model: value,
                    runlet: genModelDataProxy(self, prop, value),
                },
            };
            // console.log('recursivelyDestroySubModelRunlets A', _model)
            recursivelyDestroySubModelRunlets(_model);
            if (models.length) {
                models[models.length - 1][props[props.length - 1]] = runletWrap;
            } else {
                self.submodels = runletWrap;
            }
        } else {
            var enableFreeze = TBONE_DEBUG && !self.disableFreeze;
            if (enableFreeze) {
                recursivelyFreeze(value);
            }
            // Walk up the object tree, cloning every object and patching in new
            // trees that include the new value in them:
            var last = value;
            for (var i = datas.length - 1; i >= 0; i--) {
                var clone = _.clone(datas[i]);
                clone[props[i]] = last;
                if (isUnset && i === datas.length - 1) {
                    delete clone[props[i]];
                }
                if (enableFreeze) {
                    Object.freeze(clone);
                }
                last = clone;
            }
            self.attributes = last;
            if (!setModelData) {
                // console.log('recursivelyDestroySubModelRunlets B', _model)
                recursivelyDestroySubModelRunlets(_model);
                // Clear the _model keys, too.
                for (var k in _model) {
                    delete _model[k];
                }
            }
        }

        if (TBONE_DEBUG && isQueryable(value)) {
            // XXX Kludge Alert.  In practice, gives many models a Name that otherwise
            // wouldn't have one by using the first prop name it is set to.  Works for
            // the typical T('modelName', model.make()) and T.push cases.
            if (!value.Name) {
                value.Name = prop;
            }
            if (value.runlet && !value.runlet.Name) {
                value.runlet.Name = 'model_' + prop;
            }
        }

        var searchExhaustively = !_.isEmpty(parentCallbackContexts);
        // console.log('parentCallbackContexts', parentCallbackContexts);
        // console.log('recursiveDiff', [events, _data, value, searchExhaustively, 0, opts.assumeChanged]);
        if (recursiveDiff(self, events, _data, value, searchExhaustively, 0, assumeChanged)) {
            // console.log('found diff');
            _.each(parentCallbackContexts, function contextTriggerIter(context) {
                context.trigger();
            });
        }
        return value;
    }
    return queryModel ? subModel : _data;
}

/**
 * model/core/base.js
 */

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
        instance.submodels = {};
        instance._events = {
            submodels: {},
            attributes: {},
        };
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
        var parent = obj.context || obj.parentRunlet;
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
        this.query({ unset: true }, prop, undefined);
    },

    increment: function increment(prop, value) {
        var curr = this.readSilent(prop);
        var newval = (curr || 0) + (value != null ? value : 1);
        this.query(prop, newval);
    },

    wake: function wake(woken) {
        // While base models don't need to be woken themselves, they
        // need to wake up any bound submodels that they may be holding.
        var self = this;
        var myId = uniqueId(self);
        if (!woken[myId]) {
            woken[myId] = true;
            var todo = [ self.submodels ];
            var next;
            while (!!(next = todo.pop())) {
                for (var k in next) {
                    var curr = next[k];
                    if (k === QUERY_SELF) {
                        curr.model.wake(woken);
                    } else {
                        todo.push(curr);
                    }
                }
            }
        }
    },
};

var tbone = baseModel.make({ Name: 'tbone' });

tbone.hasViewListener = hasViewListener;
tbone.priority = priority;

if (TBONE_DEBUG) {
    tbone.watchLog = watchLog;
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
 * scheduler/runlet.js
 */

/**
 * currentExecutingRunlet globally tracks the current executing runlet, so that subrunlets
 * created during its execution (i.e. by tbone.autorun) can register themselves as
 * subrunlets of the parent (this is important for recursive destruction of runlets).
 */
var currentExecutingRunlet;

var recentLookups;

var runletBase = {

    /**
     * Used to identify that an object is a Runlet
     * @type {Boolean}
     */
    isRunlet: true,

    /**
     * Queue function execution in the scheduler
     */
    trigger: function runletTrigger() {
        if (this.immediate) {
            this.execute();
        } else {
            queueExec(this);
        }
    },

    /**
     * Execute the wrapped function, tracking all values referenced through lookup(),
     * and binding to those data sources such that the function is re-executed whenever
     * those values change.  Each execution re-tracks and re-binds all data sources; the
     * actual sources bound on each execution may differ depending on what is looked up.
     */
    execute: function runletExecute() {
        var self = this;
        var myTimer;
        if (TBONE_DEBUG) {
            myTimer = timer();
        }

        self.unbindAll();
        self.destroySubRunlets();
        // Save our parent's lookups and subrunlets.  It's like pushing our own values
        // onto the top of each stack.
        var oldLookups = recentLookups;
        self.lookups = recentLookups = {};
        var parentRunlet = currentExecutingRunlet;
        currentExecutingRunlet = self;
        tbone.isExecuting = true;

        // ** Call the payload function **
        // This function must be synchronous.  Anything that is looked up using
        // tbone.lookup before this function returns (that is not inside a subrunlet)
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

            // Pop our own lookups and parent runlet off the stack, restoring them to
            // the values we saved above.
            recentLookups = oldLookups;
            currentExecutingRunlet = parentRunlet;
            tbone.isExecuting = !!currentExecutingRunlet;

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
     * runlet is the context of the binding.
     */
    unbindAll: function runletUnbindAll() {
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
     * Destroy any execution runlets that were creation during execution of this function.
     */
    destroySubRunlets: function runletDestroySubRunlets() {
        var self = this;
        for (var i in self.subRunlets) {
            self.subRunlets[i].destroy();
        }
        self.subRunlets = [];
    },

    /**
     * Destroy this runlet.  Which means to unbind everything, destroy runlets recursively,
     * and ignore any execute calls which may already be queued in the scheduler.
     */
    destroy: function runletDestroy() {
        var self = this;
        self.parentRunlet = null;
        self.unbindAll();
        self.destroySubRunlets();
        // Prevent execution even if this runlet is already queued to run:
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
 * @return {Runlet}                A new Runlet created to wrap this function
 */
function autorun (opts) {
    if (typeof opts === 'function') {
        opts = {fn: opts};
    }

    var context = opts.context;
    var runlet = _.extend({}, runletBase, {
        // Default priority and name if not specified.  Priority is important in
        // preventing unnecessary refreshes of views/subrunlets that may be slated
        // for destruction by a parent; the parent should have priority so as
        // to execute first.
        priority: currentExecutingRunlet ? currentExecutingRunlet.priority - 1 : DEFAULT_AUTORUN_PRIORITY,
        Name: opts.fn.name,
        immediate: false,
        detached: false,
        deferExec: false,
        parentRunlet: null,
        onExecuteCb: null,
    }, opts, {
        fn: opts.fn.bind(context),
        subRunlets: [],
        lookups: null,
    });

    if (TBONE_DEBUG && runlet.immediate && !runlet.detached) {
        throw 'Runlets with immediate=true must also set detached=true';
    }

    if (context && context.onRunletExecute) {
        runlet.onExecuteCb = context.onRunletExecute.bind(context, runlet);
    }

    // If this is a subrunlet, add it to its parent's list of subrunlets, and add a reference
    // to the parent runlet.
    if (!runlet.detached && currentExecutingRunlet) {
        currentExecutingRunlet.subRunlets.push(runlet);
        runlet.parentRunlet = currentExecutingRunlet;
    }

    if (runlet.deferExec) {
        // Queue the runlet for execution
        runlet.trigger();
    } else {
        // Run the associated function (and bind associated models)
        runlet.execute();
    }

    // Return the runlet object. Many consumers use the destroy method
    // to kill the runlet and all its bindings.
    return runlet;
}

/**
 * scheduler/drainqueue.js
 */

var nextId = 1;
/**
 * Generate and return a unique identifier which we attach to an object.
 * The object is typically a view, model, or runlet, and is used to compare
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
 * List of Runlets to be executed immediately.
 * @type {Array.<Runlet>}
 */
var schedulerQueue = [];

/**
 * Flag indicating that the schedulerQueue is unsorted.
 * @type {Boolean}
 */
var dirty;

/**
 * Hash map of all the current Runlet uniqueIds that are already
 * scheduled for immediate execution.
 * @type {Object.<string, Boolean>}
 */
var runletsQueued = {};

/**
 * Pop the highest priority Runlet from the schedulerQueue.
 * @return {Runlet} Runlet to be executed next
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
            metrics.query('ajax.isReady', numInFlight === 0);
            metrics.query('ajax.numInFlight', numInFlight);
            metrics.query('ajax.urlsInFlight', _.pluck(inflight, 'fetchedUrl'));
            isReadyTimer = null;
        }, 0);
    }
}

/**
 * Queue the specified Runlet for execution if it is not already queued.
 * @param  {Runlet}   runlet
 */
function queueExec (runlet) {
    var contextId = uniqueId(runlet);
    if (!runletsQueued[contextId]) {
        runletsQueued[contextId] = true;

        /**
         * Push the runlet onto the queue of runlets to be executed immediately.
         */
        schedulerQueue.push(runlet);

        /**
         * Mark the queue as dirty; the priority of the runlet we just added
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
 * Drain the Runlet execution queue, in priority order.
 */
function drainQueue() {
    drainQueueTimer = null;
    if (schedulerQueue.length) {
        var queueDrainStartTime = now();
        var runlet;
        drainQueueTimer = _.defer(drainQueue);
        var remaining = 5000;
        // console.log('drain start');
        while (!(TBONE_DEBUG && frozen) && --remaining && (runlet = pop())) {
            /**
             * Update the runletsQueued map so that this Runlet may be requeued.
             */
            delete runletsQueued[uniqueId(runlet)];

            /**
             * Execute the runlet, and in turn, the wrapped function.
             */
            // console.log('exec runlet ' + runlet.priority + ' ' + tbone.getName(runlet));
            runlet.execute();
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

function tboneDefer(_opts) {
    var opts = _.extend({
        priority: PRIORITY_HIGHEST,
        detached: true,
        deferExec: true,
    }, isFunction(_opts) ? {fn: _opts} : _opts);
    autorun(opts);
}

tbone.defer = tboneDefer;

/**
 * Drain to the tbone drainQueue, executing all queued Runlets immediately.
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
        self.runlet = autorun({
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
        var myId = uniqueId(self);
        if (!woken[myId]) {
            woken[myId] = true;
            if (self.runlet) {
                // Wake up this model if it was sleeping
                if (self.sleeping) {
                    self.sleeping = false;
                    self.reset();
                }

                /**
                 * Wake up models that depend directly on this model that have not already
                 * been woken up.
                 */
                _.each(self.runlet.lookups, function wakeIter(lookup) {
                    if (lookup.obj) {
                        lookup.obj.wake(woken);
                    }
                });
            }
        }
    },

    onRunletExecute: function onRunletExecute(runlet) {
        if (TBONE_DEBUG) {
            log(INFO, this, 'lookups', runlet.lookups);
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
     * Triggers runlet re-execution.
     */
    reset: function reset() {
        if (this.runlet) {
            this.runlet.trigger();
        }
    },

    destroy: function destroy() {
        var self = this;
        if (self.runlet) {
            self.runlet.destroy();
            self.runlet = null;
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
        var runlet;
        function removeCallback() {
            self.increment('size', -1);
            if (lastId != null) {
                self.unset(lastId);
            }
            delete self._removeCallbacks[lastId];
            runlet.destroy();
        }
        function update() {
            var id = child.queryId();
            if (id == null) {
                id = '__unidentified' + (nextTempId++);
            }
            id = '#' + id;
            var prevId = lastId;
            tboneDefer(function() {
                if (prevId !== id && self.queryModel(prevId) === child) {
                    self.unset(prevId);
                }
                self.query(id, child);
            });
            delete self._removeCallbacks[lastId];
            self._removeCallbacks[id] = removeCallback;
            lastId = id;
        }
        self.increment('size');
        runlet = autorun(update);
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
        var id = '#' + (isQueryable(modelOrId) ? modelOrId.queryId() : modelOrId);
        if (this._removeCallbacks[id]) {
            this._removeCallbacks[id]();
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
     * This function is called to fetch data inside the `state` function above.
     * By default, we look for a `$.ajax` to be shared via the global object,
     * and the call signature matches that of `JQuery.ajax`. You can override
     * this to handle requests another way.
     */
    ajax: root.$ && root.$.ajax,

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
        window.dispatchEvent(new root.Event(method + 'state'));
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
        window.addEventListener('hashchange', update);
        window.addEventListener('popstate', update);
        window.addEventListener('pushstate', update);
        window.addEventListener('replacestate', update);
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

tbone.patchReact = function tbonePatchReact(React) {

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

        function destroyTRunlets(inst, key) {
            var runlets = inst.__tbone__[key];
            for (var i in runlets) {
                runlets[i].destroy();
            }
            inst.__tbone__[key] = [];
        }
        function doUpdate (inst) {
            if (!inst.hasUpdateQueued) {
                inst.__tbone__.hasUpdateQueued = 1;
                destroyTRunlets(inst, 'render');
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
                    destroyTRunlets(self, 'render');
                    self.__tbone__.hasUpdateQueued = 0;
                }
                var rval;
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
                destroyTRunlets(this, 'mount');
                destroyTRunlets(this, 'render');
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
};

// This is used by BBVis to hook into the base model/collection/view
// before they are modified.  You can, too.
try{
    root.dispatchEvent(new root.CustomEvent('tbone_loaded'));
} catch(e) {}

}());
