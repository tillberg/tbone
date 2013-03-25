
var baseCollection = baseModel.extend({
    isCollection: true,
    isModel: false,
    'model': baseModel,
    _initialize: function () {
        this._events = {};
        this.attributes = [];
    },
    'add': function (data) {
        this['query'](this.attributes.length + '', this['model'].make(data));
    },
    'clear': function () {
        this['query']('', []);
    }
});
