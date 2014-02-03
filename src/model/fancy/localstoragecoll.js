/**
 * model/fancy/localstoragecoll.js
 */

collections['localStorage'] = baseCollection.extend({
    initialize: function () {
        var self = this;
        var stored = JSON.parse(localStorage[self.key] || "null");
        _.each(stored || [], function (modelData) {
            self.add(modelData);
        });
        autorun(function () {
            localStorage[self.key] = JSON.stringify(self['query']());
        });
    }
});
