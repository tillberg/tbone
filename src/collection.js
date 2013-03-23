
Backbone.Collection.prototype.isCollection = true;
var baseCollection = Backbone.Collection;

function createCollection(name, model) {
    if (TBONE_DEBUG && !isString(name)) {
        throw 'createCollection requires name parameter';
    }

    var opts = {
        name: name,
        model: model || baseModel
    };

    var collection = collections[name] = baseCollection.extend(opts);

    // XXX this is basically the same as in createModel.  Unify.
    var collectionPrototype = collection.prototype;
    _.extend(collection, /** @lends {collection} */ {
        'singleton': function () {
            return this['make'](name);
        },
        'make': function (instanceName) {
            var instance = new collection();
            if (instanceName) {
                lookup(instanceName, instance);
            }
            return instance;
        }
    });

    return collection;
}
