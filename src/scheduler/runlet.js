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
