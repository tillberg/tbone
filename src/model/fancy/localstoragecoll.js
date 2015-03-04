/**
 * model/fancy/localstoragecoll.js
 */

collections.localStorage = baseCollection.extend({
    initialize: function initialize() {
        var self = this;
        var stored;
        try {
            stored = JSON.parse(localStorage[self.key]);
        } catch (e) {}
        _.each(stored || [], function initializeAddIter(modelData) {
            self.add(modelData);
        });
        autorun(function initializeAutorun() {
            localStorage[self.key] = JSON.stringify(self.query());
        });
    }
});
