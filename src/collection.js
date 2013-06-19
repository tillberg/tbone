
var nextTempId = 1;

var baseCollection = baseModel.extend({
    isCollection: true,
    // The only place isModel is checked is in hasViewListener.
    // For that function's purposes, TBone collections are models.
    // It might be better to remove isModel and use isQueryable instead.
    isModel: true,
    'model': baseModel,
    'add': function (data) {
        var self = this;
        var child;
        var lastId;
        /**
         * If data is already a queryable (presumably an instance of baseModel), then
         * use that.  Otherwise, instantiate a model and initialize it with data.
         */
        if (isQueryable(data)) {
            child = data;
        } else {
            child = self['model'].make();
            child['query']('', data);
        }
        if (child['useIds']()) {
            /**
             * If the child model has idAttribute set (or otherwise has useIds() return
             * true), then watch the child model's id attribute, updating its location
             * in this collection (which will be an object, not an array) in case the
             * child's id changes.  This is mostly useful in case the ID is not set
             * initially.  In this case, we assign a random temporary ID so that it
             * gets included when iterating over the collection.
             */
            T(function () {
                if (lastId) {
                    self['unset'](lastId, null);
                    self['trigger']('change:' + lastId);
                }
                var id = child['queryId']();
                if (!id && !lastId) {
                    id = '__unidentified' + (nextTempId++);
                }
                if (id) {
                    id = '#' + id;
                    self['query'](id, child);
                    self['trigger']('change:' + id);
                }
                lastId = id;
            });
        } else {
            /**
             * Otherwise, the collection will act as a simple array of models.
             */
            self['push'](child);
        }
    }
});
