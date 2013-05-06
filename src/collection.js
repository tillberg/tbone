
var baseCollection = baseModel.extend({
    isCollection: true,
    // The only place isModel is checked is in hasViewListener.
    // For that function's purposes, TBone collections are models.
    // It might be better to remove isModel and use isQueryable instead.
    isModel: true,
    'model': baseModel,
    'add': function (data) {
        this['query'](this.attributes.length + '', this['model'].make(data));
    }
});
