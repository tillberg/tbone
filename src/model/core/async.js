/**
 * model/core/async.js
 */

var asyncModel = boundModel.extend({
    update: function () {
        var self = this;
        self.sleeping = self['sleepEnabled'] && !hasViewListener(self);
        if (self.sleeping) {
            /**
             * This model will not update itself until there's a view listener
             * waiting for data (directly or through a chain of other models)
             * from this model.
             */
            log(INFO, self, 'sleep');
        } else {
            // XXX do we want to allow rolling updates?  i.e., instead of only
            // allowing updates from the current generation, allow updates
            // greater than or equal to the generation of the last update?
            var generation = self.generation = (self.generation || 0) + 1;
            var opts = self['state'](function (value) {
                if (generation === self.generation) {
                    self.abortCallback = null;
                    self['query']('', value);
                }
            });
            self.abortCallback = opts && opts['onAbort'];
        }
    },

    'abortPrevious': function () {
        if (this.abortCallback) {
            this.abortCallback();
        }
    },

    scopePriority: BASE_PRIORITY_MODEL_ASYNC,

    'sleepEnabled': false

});
