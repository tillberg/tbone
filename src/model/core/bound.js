/**
 * model/core/bound.js
 */

var boundModel = models.bound = baseModel.extend({
    /**
     * Constructor function to initialize each new model instance.
     * @return {[type]}
     */
    initialize: function () {
        var self = this;
        /**
         * Queue the autorun of update.  We want this to happen after the current JS module
         * is loaded but before anything else gets updated.  We can't do that with setTimeout
         * or _.defer because that could possibly fire after drainQueue.
         */
        self.scope = autorun(self.update, self.scopePriority, self,
                             self.Name && 'model_' + self.Name,
                             self.onScopeExecute, self, true);
    },

    scopePriority: BASE_PRIORITY_MODEL_SYNC,

    /**
     * Wake up this model as well as (recursively) any models that depend on
     * it.  Any view that is directly or indirectly depended on by the current
     * model may now be able to be awoken based on the newly-bound listener to
     * this model.
     * @param  {Object.<string, Boolean>} woken Hash map of model IDs already awoken
     */
    wake: function (woken) {
        // Wake up this model if it was sleeping
        if (this.sleeping) {
            this.sleeping = false;
            this.reset();
        }
        /**
         * Wake up models that depend directly on this model that have not already
         * been woken up.
         * XXX - how does this work?
         */
        _.each((this.scope && this.scope.lookups) || [], function (lookup) {
            var bindable = lookup.obj;
            if (bindable && !woken[uniqueId(bindable)]) {
                woken[uniqueId(bindable)] = true;
                bindable.wake(woken);
            }
        });
    },

    onScopeExecute: function (scope) {
        log(INFO, this, 'lookups', scope.lookups);
    },

    update: function () {
        var self = this;
        self.sleeping = self.sleepEnabled && !hasViewListener(self);
        if (self.sleeping) {
            /**
             * This model will not update itself until there's a view listener
             * waiting for data (directly or through a chain of other models)
             * from this model.
             */
            log(INFO, self, 'sleep');
        } else {
            self._update();
        }
    },

    _update: function () {
        var flag = this.assumeChanged ? QUERY_ASSUME_CHANGED : QUERY_DEFAULT;
        this.query(flag, QUERY_SELF, this.state());
        log(VERBOSE, this, 'updated', this.attributes);
    },

    /**
     * Triggers scope re-execution.
     */
    reset: function () {
        if (this.scope) {
            this.scope.trigger();
        }
    },

    destroy: function () {
        if (this.scope) {
            this.scope.destroy();
        }
        this.unset(QUERY_SELF);
    },

    disableSleep: function () {
        // This is intended to be used only interactively for development.
        if (TBONE_DEBUG && this.sleepEnabled) {
            log(WARN, this, 'disableSleep', 'Disabling sleep mode for <%-Name%>.', this);
            this.sleepEnabled = false;
            this.wake();
        }
    },

    /**
     * returns the new state, synchronously
     */
    state: noop,

    sleepEnabled: false
});

function getQuerySetProp (flag, prop) {
    // This is a short version of the start of the `query` function, and it would be nice
    // to refactor that to incorporate this feature without a duplication of that logic.
    var hasValue = arguments.length === 3;
    if (typeof flag !== 'number') {
        prop = flag;
        flag = QUERY_DEFAULT;
        if (arguments.length === 2) {
            hasValue = true;
        }
    }
    var isSet = flag >= MIN_QUERY_SET_FLAG || hasValue;
    prop = (prop || '').replace('__self__', '');
    return isSet ? prop : null;
}

if (TBONE_DEBUG) {
    boundModel.query = function (flag, prop, value) {
        var setProp = getQuerySetProp.apply(this, arguments);
        if (setProp && !this.isMutable) {
            log(WARN, this, 'boundModelSet', 'Attempting to set property <%-prop%> of bound model!', {
                prop: setProp
            });
        }
        return query.apply(this, arguments);
    };
}
