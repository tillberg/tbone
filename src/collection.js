
var nextTempId = 1;

var baseCollection = baseModel.extend({
    isCollection: true,
    // The only place isModel is checked is in hasViewListener.
    // For that function's purposes, TBone collections are models.
    // It might be better to remove isModel and use isQueryable instead.
    isModel: true,
    'model': baseModel,

    'lookupById': false,

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
        if (self['lookupById']) {
            /**
             * If this collection has lookupById set, then watch the child model's
             * idAttribute, updating its location in this collection (which will be
             * an object, not an array) in case the child's id changes.  The latter is
             * mostly useful in case the ID is not set initially.  In this case, we
             * assign a temporary ID so that it gets included when iterating over the
             * collection.
             */
            var removed;
            var update = function () {
                if (lastId != null) {
                    self['unset'](lastId, null);
                    self['trigger']('change:' + lastId);
                    delete self._removeCallbacks[lastId];
                }
                if (!removed) {
                    var id = child['queryId']();
                    if (id == null) {
                        id = '__unidentified' + (nextTempId++);
                    }
                    id = '#' + id;
                    self['query'](id, child);
                    self['trigger']('change:' + id);
                    self._removeCallbacks[id] = remove;
                    lastId = id;
                }
            };
            self['increment']('size');
            var remove = function () {
                self['increment']('size', -1);
                removed = true;
                update();
            };
            autorun(update);
        } else {
            /**
             * Otherwise, the collection will act as a simple array of models.
             */
            self['push'](child);
        }
    },

    /**
     * Remove a model by ID or by model instance.
     *
     * ** This is only supported currently when lookupById is set. **
     */
    'remove': function (model) {
        if (!this['lookupById']) {
            log(ERROR, this, 'removeNotSupported', 'collection.remove is only supported ' +
                'with lookupById set to true.');
        }
        var id = '#' + (isQueryable(model) ? model['queryId']() : model);
        if (this._removeCallbacks[id]) {
            this._removeCallbacks[id]();
        }
    }
});
