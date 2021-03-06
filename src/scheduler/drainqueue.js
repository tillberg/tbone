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
