
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
