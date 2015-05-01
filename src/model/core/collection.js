
var nextTempId = 1;

var baseCollection = baseModel.extend({
    isCollection: true,
    // The only place isModel is checked is in hasViewListener.
    // For that function's purposes, TBone collections are models.
    // It might be better to remove isModel and use isQueryable instead.
    isModel: true,
    model: baseModel,

    add: function add(data) {
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
            child = self.model.make();
            child.query('', data);
        }

        /**
         * Watch the child model's idAttribute, updating its location in this
         * collection (which is an object, not an array) in case the child's id
         * changes.  The latter is mostly useful in case the ID is not set
         * initially.  In this case, we assign a temporary ID so that it gets
         * included when iterating over the collection.
         */
        var scope;
        function removeCallback() {
            self.increment('size', -1);
            if (lastId != null) {
                self.unset(lastId);
            }
            delete self._removeCallbacks[lastId];
            scope.destroy();
        }
        function update() {
            var id = child.queryId();
            if (id == null) {
                id = '__unidentified' + (nextTempId++);
            }
            id = '#' + id;
            var prevId = lastId;
            tboneDefer(function() {
                if (prevId !== id && self.queryModel(prevId) === child) {
                    self.unset(prevId);
                }
                self.query(id, child);
            });
            delete self._removeCallbacks[lastId];
            self._removeCallbacks[id] = removeCallback;
            lastId = id;
        }
        self.increment('size');
        scope = autorun(update);
    },

    /**
     * It might be helpful to override `push` with a null or with a function
     * that logs an error in dev mode to avoid confusion with cases where
     * the user could be steered to use a model as a simple list.
     */

    /**
     * Remove a model by ID or by model instance.
     */
    remove: function remove(modelOrId) {
        var id = '#' + (isQueryable(modelOrId) ? modelOrId.queryId() : modelOrId);
        if (this._removeCallbacks[id]) {
            this._removeCallbacks[id]();
        }
    }
});

var collections = tbone.collections = {
    base: baseCollection,
};
