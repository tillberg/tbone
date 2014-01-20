/**
 * scheduler/drainqueue.js
 */

/**
 * Generate and return a unique identifier which we attach to an object.
 * The object is typically a view, model, or scope, and is used to compare
 * object references for equality using a hash Object for efficiency.
 * @param  {Object} obj Object to get id from ()
 * @return {string}     Unique ID assigned to this object
 */
function uniqueId(obj) {
    return obj['tboneid'] = obj['tboneid'] || nextId++; // jshint ignore:line
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
 * Flag indicating whether a drainQueue timer has already been set.
 */
var drainQueueTimer;

/**
 * Dynamic counter of how many ajax requests are inflight.
 * @type {Number}
 */
var inflight = 0;

function isReady () {
    return !inflight && !drainQueueTimer;
}

var isReadyTimer;

function updateIsReady () {
    if (!isReadyTimer) {
        isReadyTimer = setTimeout(function () {
            tbone['query']('__isReady__', isReady());
            tbone['query']('__ajaxReady__', !inflight);
            tbone['query']('__numAjaxInFlight__', inflight);
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

/**
 * Attempt to restore scrollTop around drainQueue calls.
 *
 * The basic problem is that removing and re-adding elements to the page
 * will force the scroll up to the minimum height that the page gets to
 * in the midst of that operation.
 *
 * This is really kind of kludgy... Is there a cleaner way to accomplish
 * the same thing?

 * Only supported for JQuery / when scrollTop is available on $.
 */

var origScrollTop = this.$ && $.fn && $.fn.scrollTop;
var $window = origScrollTop && $(window);
var scrollTopChangedProgrammatically;

if (origScrollTop) {
    /**
     * Avoid clobbering intentional programmatic scrollTop changes that
     * occur inside T-functions.  This is not foolproof, and only preserves
     * changes made through $.fn.scrollTop.
     *
     * XXX This could frustrate users that try to change it some other way,
     * only to find that somehow, mysteriously, the scrollTop change gets
     * reverted.
     */
    $.fn.scrollTop = function (value) {
        if (value) {
            scrollTopChangedProgrammatically = true;
        }
        return origScrollTop.apply(this, arguments);
    };
}

function queryScrollTop (value) {
    return origScrollTop && (value ? $window.scrollTop(value) : $window.scrollTop());
}

/**
 * Drain the Scope execution queue, in priority order.
 */
function drainQueue () {
    scrollTopChangedProgrammatically = false;
    var scrollTop = queryScrollTop();
    drainQueueTimer = null;
    var queueDrainStartTime = now();
    var scope;
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
        drainQueueTimer = _.defer(drainQueue);
    }
    log(VERBOSE, 'scheduler', 'drainQueue', 'ran for <%=duration%>ms', {
        'duration': now() - queueDrainStartTime
    });
    log(VERBOSE, 'scheduler', 'viewRenders', 'rendered <%=viewRenders%> total', {
        'viewRenders': viewRenders
    });
    updateIsReady();
    if (scrollTop && !scrollTopChangedProgrammatically && scrollTop !== queryScrollTop()) {
        queryScrollTop(scrollTop);
    }
}

/**
 * Drain to the tbone drainQueue, executing all queued Scopes immediately.
 * This is useful both for testing and MAYBE also for optimizing responsiveness by
 * draining at the end of a keyboard / mouse event handler.
 */
function drain () {
    if (drainQueueTimer) {
        clearTimeout(drainQueueTimer);
    }
    drainQueue();
}

function freeze () {
    frozen = true;
}
