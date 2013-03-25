
var baseCollection = baseModel.extend({
    isCollection: true,
    _initialize: function () {
        this._events = {};
        this.attributes = [];
    }
});
