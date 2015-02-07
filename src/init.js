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
