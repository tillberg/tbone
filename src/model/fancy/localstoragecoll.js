/**
 * model/fancy/localstoragecoll.js
 */

collections.localStorage = baseCollection.extend({
    initialize: function () {
        var self = this;
        var stored;
        try {
            stored = JSON.parse(localStorage[self.key]);
        } catch (e) {}
        _.each(stored || [], function (modelData) {
            self.add(modelData);
        });
        autorun(function () {
            localStorage[self.key] = JSON.stringify(self.query());
        });
    }
});
