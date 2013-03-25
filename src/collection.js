
var baseCollection = baseModel.extend({
    isCollection: true,
    isModel: false,
    'model': baseModel,
    _initialize: function () {
        this._events = {};
        this.attributes = [];
    },
    'add': function (data) {
        this.attributes.push(this['model'].make(data));
    }
});
