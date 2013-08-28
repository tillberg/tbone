/**
 * model/fancy/localstorage.js
 */

var localStorageModel = baseModel.extend({
    /**
     * To use, extend this model and specify key as a property.
     *
     * For example:
     * var metrics = tbone.models.localStorage.make({ key: 'metrics' });
     * metrics.increment('pageloads');
     * console.log(metrics.query('pageloads'));
     */

    initialize: function () {
        var self = this;
        self['query']('', JSON.parse(localStorage[self['key']] || "null"));
        autorun(function () {
            localStorage[self['key']] = JSON.stringify(self.query(''));
        });
    }
});
