
/**
 * "Don't Get Data" - Special flag for query to return the model/collection instead
 * of calling toJSON() on it.
 * @const
 */
var DONT_GET_DATA = 1;

/**
 * "Iterate Over Models" - Special flag for query to return an iterator over the
 * models of the collection, enabling iteration over models, which is what we want
 * to do when using _.each(collection ...) in a template, as this allows us to
 * use model.query(...) and properly bind references to the models.
 * @const
 */
var ITERATE_OVER_MODELS = 2;

/**
 * @const
 */
var QUERY_PUSH = 3;

/**
 * @const
 */
var QUERY_UNSHIFT = 4;

/**
 * @const
 */
var QUERY_REMOVE_FIRST = 5;

/**
 * @const
 */
var QUERY_REMOVE_LAST = 6;

/**
 * @const
 */
var QUERY_TOGGLE = 7;

/**
 * If you want to select the root, you can either pass __self__ or just an empty
 * string; __self__ is converted to an empty string and this "flag" is used to
 * check for whether we are selecting either.
 * @const
 */
var QUERY_SELF = '';

function query(flag, prop, value) {
    var self = this;
    var dontGetData = flag === DONT_GET_DATA;
    var iterateOverModels = flag === ITERATE_OVER_MODELS;
    var isPush = flag === QUERY_PUSH;
    var isUnshift = flag === QUERY_UNSHIFT;
    var isRemoveFirst = flag === QUERY_REMOVE_FIRST;
    var isRemoveLast = flag === QUERY_REMOVE_LAST;
    var isToggle = flag === QUERY_TOGGLE;
    var isListOp = isPush || isUnshift || isRemoveFirst || isRemoveLast;
    var hasValue = arguments.length === 3;
    var isSet = isListOp || isToggle || hasValue;
    if (typeof flag !== 'number') {
        /**
         * If no flag provided, shift the prop and value over.  We do it this way instead
         * of having flag last so that we can type-check flag and discern optional flags
         * from optional values.  And flag should only be used internally, anyway.
         */
        value = prop;
        prop = flag;
        flag = 0;
        /**
         * Use arguments.length to switch to set mode in order to properly support
         * setting undefined.
         */
        if (arguments.length === 2) {
            isSet = true;
            hasValue = true;
        }
    }

    /**
     * Remove a trailing dot and __self__ references, if any, from the prop.
     **/
    prop = (prop || '').replace('__self__', '');
    var args = prop.split('.');

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

    /**
     * If DONT_GET_DATA, and there's no prop, then this is a self-reference.
     */
    var _data = dontGetData && !prop ? self : self.attributes;

    var name_parts = [];
    var id;
    var arg;
    var doSubQuery;
    var parentCallbacks = [];
    var events = isSet && self._events['change'];

    while ((arg = args.shift()) != null) {
        // Ignore empty string arguments.
        if (arg === QUERY_SELF) {
            continue;
        }

        name_parts.push(arg);
        last_data = _data;

        _data = _data[arg];
        if (events) {
            parentCallbacks = parentCallbacks.concat(events[QUERY_SELF] || []);
            events = events[arg];
        }

        if (_data == null && !isSet) {
            // Couldn't even get to the level of the value we're trying to look up.
            // Concat the rest of args onto name_parts so that we record the full
            // path in the event binding.
            name_parts = name_parts.concat(args);
            break;
        } else if (isQueryable(_data)) {
            // To avoid duplicating the recentLookups code here, we set a flag and do
            // the sub-query after recording queries
            // Skip the sub-query if DONT_GET_DATA is set, there are no more args,
            // or if this is a set operation and value is a queryable.
            doSubQuery = args.length ||
                ((!isSet || !isQueryable(value)) && !dontGetData);
            break;
        } else if (isSet && !isObject(_data) && (args.length || isListOp)) {
            /**
             * When doing an implicit mkdir -p while setting a deep-nested property
             * for the first time, we peek at the next arg and create either an array
             * for a numeric index and an object for anything else.  We set the
             * property via query() so as to fire change events appropriately.
             */
            if (_data != null) {
                log(WARN, this, 'mkdir', 'while writing <%=prop%>, had to overwrite ' +
                    'primitive value <%=primitive%> at <%=partial%>', {
                        prop: prop,
                        primitive: _data,
                        partial: name_parts.join('.')
                    });
            }
            _data = (args.length ? rgxNumber.exec(args[0]) : isListOp) ? [] : {};
            self['query'](name_parts.join('.'), _data);
        }
    }

    if (!isSet && recentLookups) {
        id = uniqueId(self);
        if (!recentLookups[id]) {
            recentLookups[id] = {
                '__obj__': self
            };
        }
        recentLookups[id][name_parts.join('.')] = _data;
    }

    if (doSubQuery) {
        return hasValue ? _data['query'](flag, args.join('.'), value) : _data['query'](flag, args.join('.'));
    }

    if (isSet) {
        if (last_data == null) {
            // Set top-level of model/collection
            self.attributes = value != null ? value : (self.isCollection ? [] : {});
        } else {
            if (isPush) {
                _data.push(value);
            } else if (isUnshift) {
                _data.unshift(value);
            } else if (isRemoveFirst) {
                _data.shift(value);
            } else if (isRemoveLast) {
                _data.pop(value);
            } else if (isToggle) {
                value = last_data[setprop] = !_data;
            } else {
                last_data[setprop] = value;
            }
        }

        var diff = function (evs, curr, prev, exhaustive, depth) {
            // XXX how to handle objects with cycles?
            // Kludge alert: if the objects are too deep, just assume there is
            // a change.
            if (depth > 8) {
                return true;
            }
            evs = evs || {};
            curr = curr || {};
            prev = prev || {};
            var changed = false;
            var k, i, n;
            for (k in evs) {
                if (k === QUERY_SELF) {
                    if (prev !== curr) {
                        // If prev and curr are both "object" types (but not null),
                        // then we need to search recursively for "real" changes.
                        // We want to avoid firing change events when the user sets
                        // something to a deep copy of itself.
                        if (isObject(prev) && isObject(curr)) {
                            exhaustive = true;
                        } else {
                            changed = true;
                        }
                    }
                } else {
                    changed = changed || diff(evs[k], curr[k], prev[k], false, depth + 1);
                }
            }
            if (exhaustive && !changed) {
                // If exhaustive specified, and we haven't yet found a change, search
                // through all keys until we find one (note that this could duplicate
                // some searching done while searching the event tree)
                // This may not be super-efficient to call diff all the time.
                if (isObject(prev) && isObject(curr)) {
                    // prev and curr are both objects/arrays
                    // search through them recursively for any differences
                    var searched = {};
                    var objs = [prev, curr];
                    for (i = 0; i < 2 && !changed; i++) {
                        var obj = objs[i];
                        if (isArray(obj)) {
                            if (prev.length !== curr.length) {
                                changed = true;
                            }
                            for (k = 0; k < obj.length && !changed; k++) {
                                if (!searched[k]) {
                                    searched[k] = true;
                                    if (diff(evs[k], curr[k], prev[k], true, depth + 1)) {
                                        changed = true;
                                    }
                                }
                            }
                        } else {
                            for (k in obj) {
                                if (!searched[k]) {
                                    searched[k] = true;
                                    if (diff(evs[k], curr[k], prev[k], true, depth + 1)) {
                                        changed = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } else if (prev !== curr) {
                    // prev and curr are primitives (i.e. not arrays/objects)
                    // and they are different.  thus, we've found a change and
                    // will pass this outward so that we know to fire all
                    // parent callbacks
                    changed = true;
                }
            }
            if (changed) {
                var callbacks = evs[QUERY_SELF] || [];
                for (n = 0; n < callbacks.length; n++) {
                    callbacks[n].callback.call(callbacks[n].context);
                }
            }
            return changed;
        };
        if (parentCallbacks.length) {
            // If there are any changes at all, then we need to fire one or more
            // callbacks for things we searched for.  Note that "parent" only includes
            // things from this model; change events don't bubble out to parent models.
            if (diff(events, _data, value, true, 0)) {
                for (var i = 0; i < parentCallbacks.length; i++) {
                    parentCallbacks[i].callback.call(parentCallbacks[i].context);
                }
            }
        } else {
            diff(events, _data, value, false, 0);
        }
        return value;
    } else if (!iterateOverModels && self.isCollection && prop === '') {
        /**
         * If iterateOverModels is not set and _data is a collection, return the
         * raw data of each model in a list.  XXX is this ideal?  or too magical?
         */
        _data = _.map(_data, function (d) { return d['query'](); });
    }
    return _data;
}

function queryText(flag, prop) {
    var value = prop == null ? this['query'](flag) : this['query'](flag, prop);
    return (isString(value) || isRealNumber(value) || isDate(value)) && value != null ?
        value + '' : '';
}
