/**
 * model/core/async.js
 */

var asyncModel = models.async = boundModel.extend({
    _update: function asyncUpdate() {
        var self = this;
        // Allow updates that are as new or newer than the last *update* generation.
        // This allows rolling updates, where the model may have one or more requests
        // in flight for newer data, yet it will still accept earlier-generation
        // data that arrives as long as it is newer than what it had before.
        var reqGeneration = self.reqGeneration = (self.reqGeneration || 0) + 1;
        var callbackCalledImmediately = false;
        var opts = self.state(function asyncUpdateStateCallback(value) {
            callbackCalledImmediately = true;
            if (reqGeneration >= (self.updateGeneration || 0)) {
                self.updateGeneration = reqGeneration;
                self.abortCallback = null;
                self.query('', value);
                return true;
            }
            return undefined;
        });
        if (!callbackCalledImmediately) {
            self.abortCallback = opts && opts.onAbort;
        }
    },

    abortPrevious: function asyncAbortPrevious() {
        if (this.abortCallback) {
            this.abortCallback();
        }
    },

    priority: BASE_PRIORITY_MODEL_ASYNC
});
