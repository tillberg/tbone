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
        setprop = args[args.length - 1];
    }

    /**
     * If this function was called with a bindable context (i.e. a Model or Collection),
     * then use that as the root data object instead of the global tbone.data.
     */
    var last_data;
    var _data = self.attributes;
    var name_parts = [];
    var myRecentLookup = {};
    var id;
    var arg;
    var doSubLookup;
    var events = isSet && self._events['change'];

    while ((arg = args.shift()) != null) {
        name_parts.push(arg);
        last_data = _data;

        _data = _data[arg];
        events = events && events[arg];

        if (_data == null && !isSet) {
            // Couldn't even get to the level of the value we're trying to look up.
            // Concat the rest of args onto name_parts so that we record the full
            // path in the event binding.
            name_parts = name_parts.concat(args);
            break;
        } else if (isSet && (_data === null || typeof _data !== 'object') && args.length) {
            /**
             * When doing an implicit mkdir -p while setting a deep-nested property
             * for the first time, we peek at the next arg and create either an array
             * for a numeric index and an object for anything else.  We set the
             * property via query() so as to fire change events appropriately.
             */
            if (_data != null) {
                log(WARN, this, 'mkdir', 'while writing <%=query%>, had to overwrite ' +
                    'primitive value <%=primitive%> at <%=partial%>', {
                        query: query,
                        primitive: _data,
                        partial: name_parts.join('.')
                    });
            }
            self['query'](name_parts.join('.'), _data = rgxNumber.exec(args[0]) ? [] : {});
        } else if (_data && _data['isBindable']) {
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

    // Skip the sub-query if DONT_GET_DATA is set there are no more args
    if (doSubLookup && (!dontGetData || args.length)) {
        return isSet ? _data['query'](args.join('.'), value) : _data['query'](flag, args.join('.'));
    }

    if (isSet) {
        if (last_data == null) {
            // Set top-level of model/collection
            self.attributes = value;
        } else {
            last_data[setprop] = value;
        }

        var diff = function (evs, curr, prev, exhaustive) {
            evs = evs || {};
            curr = curr || {};
            prev = prev || {};
            var changed = false;
            var k;
            for (k in evs) {
                if (k === QUERY_SELF) {
                    if (prev !== curr) {
                        // If prev and curr are both "object" types (but not null),
                        // then we need to search recursively for "real" changes.
                        // We want to avoid firing change events when the user sets
                        // something to a deep copy of itself.
                        if (typeof prev === 'object' && typeof curr === 'object' &&
                            prev !== null && curr !== null) {
                            exhaustive = true;
                        } else {
                            changed = true;
                        }
                    }
                } else {
                    changed = changed || diff(evs[k], curr[k], prev[k]);
                }
            }
            if (exhaustive && !changed) {
                // If exhaustive specified, and we haven't yet found a change, search
                // through all keys until we find one (note that this could duplicate
                // some searching done while searching the event tree)
                // This may not be super-efficient to call diff all the time.
                var searched = {};
                for (k in curr) {
                    searched[k] = true;
                    if (diff(evs[k], curr[k], prev[k], true)) {
                        changed = true;
                        break;
                    }
                }
                if (!changed) {
                    for (k in prev) {
                        if (!searched[k]) {
                            if (diff(evs[k], curr[k], prev[k], true)) {
                                changed = true;
                                break;
                            }
                        }
                    }
                }
            }
            if (changed) {
                var callbacks = evs[QUERY_SELF] || [];
                for (var i = 0; i < callbacks.length; i++) {
                    callbacks[i].callback.call(callbacks[i].context);
                }
            }
            return changed;
        };
        diff(events, _data, value);
        return value;
    } else if (_data) {
        if (!iterateOverModels && self.isCollection) {
            /**
             * If iterateOverModels is not set and _data is a collection, return the
             * raw data of each model in a list.  XXX is this ideal?  or too magical?
             */
            _data = _.map(_data, function (d) { return d['query'](); });
        }
    }
    return _data;
}

function lookupText() {
    var value = lookup.apply(this, arguments);
    return value != null ? value : '';
}

function toggle(model_and_key) {
    lookup.call(this, model_and_key, !lookup.call(this, model_and_key));
}
