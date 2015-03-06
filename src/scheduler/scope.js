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
        var lookups = self.lookups || {};
        for (var objId in lookups) {
            var propMap = lookups[objId];
            var obj = propMap.obj;
            var props = propMap.props;
            for (var prop in props) {
                obj.off(prop, self);
            }
        }
    },

    /**
     * Destroy any execution scopes that were creation during execution of this function.
     */
    destroySubScopes: function scopeDestroySubScopes() {
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
    destroy: function scopeDestroy() {
        var self = this;
        delete self.parentScope;
        self.unbindAll();
        self.destroySubScopes();
    }
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
    if (_.isFunction(opts)) {
        opts = {fn: opts};
    }
    // Default priority and name if not specified.  Priority is important in
    // preventing unnecessary refreshes of views/subscopes that may be slated
    // for destruction by a parent; the parent should have priority so as
    // to execute first.
    if (priority == null) {
        priority = currentExecutingScope ? currentExecutingScope.priority - 1 : DEFAULT_AUTORUN_PRIORITY;
    }

    var context = opts.context;
    var scope = _.extend({}, scopeBase, {
        Name: opts.fn.name,
    }, opts, {
        fn: opts.fn.bind(context),
        subScopes: [],
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

    // Run the associated function (and bind associated models)
    scope.execute();

    // Return the scope object. Many consumers use the destroy method
    // to kill the scope and all its bindings.
    return scope;
}
