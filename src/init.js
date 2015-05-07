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
