/**
 * model/fancy/localstorage.js
 */

var localStorage = root.localStorage;

models.localStorage = baseModel.extend({
    /**
     * To use, extend this model and specify key as a property.
     *
     * For example:
     * var metrics = tbone.models.localStorage.make({ key: 'metrics' });
     * metrics.increment('pageloads');
     * console.log(metrics.query('pageloads'));
     */

    initialize: function initialize() {
        var self = this;
        var data;
        try {
            data = JSON.parse(localStorage[self.key]);
        } catch (e) {}
        self.query('', data);
        autorun(function initializeAutorun() {
            localStorage[self.key] = JSON.stringify(self.query(''));
        });
    }
});
