/**
 * model/fancy/localstoragecoll.js
 */

var localStorageCollection = baseCollection.extend({
    initialize: function () {
        var self = this;
        var stored = JSON.parse(localStorage[self.key] || "null");
        _.each(stored || [], function (modelData) {
            self.add(modelData);
        });
        self.on('change', function () {
            localStorage[self.key] = JSON.stringify(self['query']());
        });
    }
});
