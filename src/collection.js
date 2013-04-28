
var baseCollection = baseModel.extend({
    isCollection: true,
    isModel: false,
    'model': baseModel,
    'add': function (data) {
        this['query'](this.attributes.length + '', this['model'].make(data));
    }
});
