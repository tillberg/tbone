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
        'Name': name,
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
            this.lookups = recentLookups = {};
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
                    self.onExecuteCb.call(self.onExecuteContext, this);
                }

                // Pop our own lookups and parent scope off the stack, restoring them to
                // the values we saved above.
                recentLookups = oldLookups;
                currentExecutingScope = parentScope;

                if (TBONE_DEBUG) {
                    var executionTimeMs = myTimer.done();
                    log(VERBOSE, self, 'exec', '<%=priority%> <%=duration%>ms <%=name%>', {
                        'priority': self.priority,
                        'Name': self.Name,
                        'duration': executionTimeMs
                    });
                    if (executionTimeMs > 10) {
                        log(VERBOSE, self, 'slowexec', '<%=priority%> <%=duration%>ms <%=name%>', {
                            'priority': self.priority,
                            'Name': self.Name,
                            'duration': executionTimeMs
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
        for (var i = 0; i < this.subScopes.length; i++) {
            this.subScopes[i].destroy();
        }
        this.subScopes = [];
    },

    /**
     * Destroy this scope.  Which means to unbind everything, destroy scopes recursively,
     * and ignore any execute calls which may already be queued in the scheduler.
     */
    destroy: function () {
        this.destroyed = true;
        delete this.parentScope;
        this.unbindAll();
        this.destroySubScopes();
    }
});
