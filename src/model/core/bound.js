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
