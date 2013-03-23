var recentLookups;

/**
 * "Don't Get Data" - Special flag for lookup to return the model/collection instead
 * of calling toJSON() on it.
 * @const
 */
var DONT_GET_DATA = 1;

/**
 * "Iterate Over Models" - Special flag for lookup to return an iterator over the
 * models of the collection, enabling iteration over models, which is what we want
 * to do when using _.each(collection ...) in a template, as this allows us to
 * use model.lookup(...) and properly bind references to the models.
 * @const
 */
var ITERATE_OVER_MODELS = 2;

/**
 * If you want to select the root, you can either pass __self__ or just an empty
 * string; __self__ is converted to an empty string and this "flag" is used to
 * check for whether we are selecting either.
 * @const
 */
var QUERY_SELF = '';

function lookup(flag, query, value) {
    var self = this;
    var isSet;
    var dontGetData = flag === DONT_GET_DATA;
    var iterateOverModels = flag === ITERATE_OVER_MODELS;
    if (typeof flag === 'string') {
        /**
         * If no flag provided, shift the query and value over.  We do it this way instead
         * of having flag last so that we can type-check flag and discern optional flags
         * from optional values.  And flag should only be used internally, anyway.
         */
        value = query;
        query = flag;
        flag = 0;
        /**
         * Use arguments.length to switch to set mode in order to properly support
         * setting undefined.
         */
        if (arguments.length === 2) {
            isSet = true;
        }
    }

    /**
     * Remove a trailing dot and __self__ references, if any, from the query.
     **/
    query = (query || '').replace(/\.?(__self__)?\.?$/, '');
    var args = query.split('.');

    var setprop;
    if (isSet) {
        /**
         * For set operations, we only want to look up the parent of the property we
         * are modifying; pop the final property we're setting from args and save it
         * for later.
         * @type {string}
         */
        setprop = args.pop();
    }

    /**
     * If this function was called with a bindable context (i.e. a Model or Collection),
     * then use that as the root data object instead of the global tbone.data.
     */
    var last_data;
    var _data = self.isCollection ? self['models'] : self['attributes'];
    var name_parts = [];
    var myRecentLookup = {};
    var id;
    var arg;
    var doSubLookup;

    while ((arg = args.shift()) != null) {
        name_parts.push(arg);
        last_data = _data;

        _data = _data[arg];

        if (_data == null) {
            if (isSet) {
                /**
                 * When doing an implicit mkdir -p while setting a deep-nested property
                 * for the first time, we peek at the next arg and create either an array
                 * for a numeric index and an object for anything else.
                 */
                _data = rgxNumber.exec(args[0]) ? [] : {};
                // Set the property via query so as to fire change events appropriately
                self['query'](name_parts.join('.'), _data);
            } else {
                // Couldn't even get to the level of the value we're trying to look up.
                // Concat the rest of args onto name_parts so that we record the full
                // path in the event binding.
                name_parts = name_parts.concat(args);
                break;
            }
        } else if (_data['isBindable']) {
            doSubLookup = true; // <-- To avoid duplicating the recentLookups code here
            break;
        }
    }

    if (!isSet && recentLookups) {
        id = uniqueId(self);
        myRecentLookup = recentLookups[id] = (recentLookups && recentLookups[id]) || {
            '__obj__': self
        };
        myRecentLookup[name_parts.join('.')] = _data;
    }

    if (doSubLookup) {
        return isSet ? _data['query'](args.join('.'), value) : _data['query'](flag, args.join('.'));
    }

    if (_data) {
        if (isSet) {
            var currProp = (
                query === QUERY_SELF ? _data : // only useful if _data is a model
                _data.isModel ? _data.get(setprop) :
                _data.isCollection ? _data.at(setprop) :
                _data[setprop]);

            if (currProp && currProp.isModel) {
                /**
                 * When setting to an entire model, we use different semantics; we want the
                 * values provided to be set to the model, not replace the model.
                 */
                if (value) {
                    /**
                     * Remove any properties from the model that are not present in the
                     * value we're setting it to.
                     */
                    for (var k in currProp.toJSON()) {
                        if (value[k] === undefined) {
                            currProp.unset(k);
                        }
                    }
                    currProp.set(value);
                } else {
                    currProp.clear();
                }
            } else if (currProp !== value) {
                if (_data.isModel) {
                    /**
                     * Set the value to the top-level model property.  Common case.
                     */
                    _data.set(setprop, value);
                } else if (_data.isCollection) {
                    // XXX What makes sense to do here?
                } else if (_data[setprop] !== value) {
                    /**
                     * Set the value to a property on a regular JS object.
                     */
                    _data[setprop] = value;

                    /**
                     * If we're setting a nested property of a model (or collection?), then
                     * trigger a change event for the top-level property.
                     */
                    if (propAfterRecentLookup) {
                        myRecentLookup['__obj__'].trigger('change:' + propAfterRecentLookup);
                    }
                }
            }
            return undefined;
        } else if (iterateOverModels && _data.isCollection) {
            /**
             * If iterateOverModels is set and _data is a collection, return a list of models
             * instead of either the collection or a list of model data.  This is useful in
             * iterating over models while still being able to bind to models individually.
             */
            myRecentLookup['*'] = _data = _data.models;
        } else if (!dontGetData && _data['isBindable']) {
            /**
             * Unless dontGetData is specified, convert the model/collection to its data.
             * This is often what you want to do when getting data from a model, and this
             * is what is presented to the user via tbone/lookup.
             */
            myRecentLookup['*'] = _data = _data.toJSON();
        }
    }
    return _data;
}

function lookupText() {
    var value = lookup.apply(this, arguments);
    return value != null ? value : '';
}

function toggle(model_and_key) {
    lookup(model_and_key, !lookup(model_and_key));
}
