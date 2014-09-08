
/**
 * Default flag; passing this has the same effect as omitting the flag parameter.
 * @const
 */
var QUERY_DEFAULT = 0;

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
 * @const
 */
var QUERY_UNSET = 8;

/**
 * @const
 */
var QUERY_INCREMENT = 9;

/**
 * @const
 */
var QUERY_ASSUME_CHANGED = 10;

/**
 * If you want to select the root, you can either pass __self__ or just an empty
 * string; __self__ is converted to an empty string and this "flag" is used to
 * check for whether we are selecting either.
 * @const
 */
var QUERY_SELF = '';

/**
 * @const
 */
var MAX_RECURSIVE_DIFF_DEPTH = 16;

function recursiveDiff (self, evs, curr, prev, exhaustive, depth, fireAll) {
    // Kludge alert: if the objects are too deep, just assume there is
    // a change.
    if (depth > MAX_RECURSIVE_DIFF_DEPTH) {
        log(WARN, self, 'recurseLimit', 'hit recursion depth limit of <%=limit%>', {
            limit: MAX_RECURSIVE_DIFF_DEPTH
        }, {
            curr: curr,
            prev: prev
        });
        return true;
    }
    evs = evs || {};
    curr = curr;
    prev = prev;
    if (isQueryable(prev) || isQueryable(curr)) {
        // The only reason either prev or curr should be queryable is if
        // we're setting a model where there previous was none (or vice versa).
        // In this case, *all* descendant events must be rebound to the new
        // model by firing them all immediately.
        fireAll = true;
    }
    var changed = fireAll;
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
                } else if (isDate(prev) && isDate(curr)) {
                    changed = (prev.getTime() !== curr.getTime()) || changed;
                } else {
                    changed = true;
                }
            }
        } else {
            changed = recursiveDiff(
                self, evs[k], curr && curr[k], prev && prev[k], false, depth + 1, fireAll) || changed;
        }
    }
    if (exhaustive && !changed) {
        // If exhaustive specified, and we haven't yet found a change, search
        // through all keys until we find one (note that this could duplicate
        // some searching done while searching the event tree)
        // This may not be super-efficient to call recursiveDiff all the time.
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
                            if (recursiveDiff(self, evs[k], curr[k], prev[k], true, depth + 1, false)) {
                                changed = true;
                            }
                        }
                    }
                } else {
                    for (k in obj) {
                        if (!searched[k]) {
                            searched[k] = true;
                            if (recursiveDiff(self, evs[k], curr[k], prev[k], true, depth + 1, false)) {
                                changed = true;
                                break;
                            }
                        }
                    }
                }
            }
        } else if (isDate(prev) && isDate(curr)) {
            changed = prev.getTime() !== curr.getTime();
        } else if (prev !== curr) {
            // at least one of prev and curr is a primitive (i.e. not arrays/objects)
            // and they are different.  thus, we've found a change and will pass this
            // outward so that we know to fire all parent callbacks
            changed = true;
        }
    }
    if (changed) {
        var contexts = evs[QUERY_SELF] || {};
        for (var contextId in contexts) {
            contexts[contextId].trigger.call(contexts[contextId]);
        }
    }
    return changed;
}

/**
 * serialize the model in a semi-destructive way.  We don't really care
 * about the result as long as we can use it to test for anything that
 * gets changed behind TBone's back (i.e. by changing arrays/objects that
 * TBone has stored).
 *
 * This is only ever called if TBONE_DEBUG is true.
 */
function serializeForComparison(model) {
    if (opts['aliasCheck']) {
        try {
            var attributes = model.attributes;
            return JSON.stringify(attributes === undefined ? null : attributes, function (key, value) {
                // If value is an array or object, screen its keys for queryables.
                // Queryables track their own changes, so we don't care to
                // check that they haven't changed without this model knowing.
                if (isObject(value)) {
                    // This is not a way to serialize correctly, but
                    // we just want to show that the original structures
                    // were the same, minus queryables.
                    var localized = {};
                    for (var k in value) {
                        if (!isQueryable(value[k])) {
                            localized[k] = value[k];
                        }
                    }
                    return localized;
                } else {
                    return value;
                }
            });
        } catch (e) {
            log(WARN, model, 'aliascheck', 'Failed to serialize attributes to JSON');
        }
    }
    return "null";
}

function listDiffs(curr, prev, accum) {
    var diffs = {};
    if (isObject(prev) && isObject(curr)) {
        var searched = {};
        var objs = [prev, curr];
        for (var i = 0; i < 2; i++) {
            var obj = objs[i];
            for (var k in obj) {
                if (!searched[k]) {
                    searched[k] = true;
                    _.extend(diffs, listDiffs(prev[k], curr[k], accum.concat(k)));
                }
            }
        }
    } else {
        if (prev !== curr) {
            diffs[accum.join('.')] = prev + ' -> ' + curr;
        }
    }
    return diffs;
}

function query (flag, prop, value) {
    var self = this;
    var hasValue = arguments.length === 3;
    if (typeof flag !== 'number') {
        /**
         * If no flag provided, shift the prop and value over.  We do it this way instead
         * of having flag last so that we can type-check flag and discern optional flags
         * from optional values.  And flag should only be used internally, anyway.
         */
        value = prop;
        prop = flag;
        flag = QUERY_DEFAULT;
        /**
         * Use arguments.length to switch to set mode in order to properly support
         * setting undefined.
         */
        if (arguments.length === 2) {
            hasValue = true;
        }
    }
    var dontGetData = flag === DONT_GET_DATA;
    var iterateOverModels = flag === ITERATE_OVER_MODELS;
    var isPush = flag === QUERY_PUSH;
    var isUnshift = flag === QUERY_UNSHIFT;
    var isRemoveFirst = flag === QUERY_REMOVE_FIRST;
    var isRemoveLast = flag === QUERY_REMOVE_LAST;
    var isToggle = flag === QUERY_TOGGLE;
    var isIncrement = flag === QUERY_INCREMENT;
    var isListOp = isPush || isUnshift || isRemoveFirst || isRemoveLast;
    var isUnset = flag === QUERY_UNSET;
    var assumeChanged = flag === QUERY_ASSUME_CHANGED;
    var isSet = isListOp || isToggle || isUnset || hasValue || isIncrement;

    /**
     * Remove a trailing dot and __self__ references, if any, from the prop.
     **/
    prop = (prop || '').replace('__self__', '');
    var argParts = prop.split('.');
    var args = [];
    var i;
    for (i = 0; i < argParts.length; i++) {
        // Ignore empty string arguments.
        if (argParts[i]) {
            args.push(argParts[i]);
        }
    }

    /**
     * For set operations, we only want to look up the parent of the property we
     * are modifying; pop the final property we're setting from args and save it
     * for later.
     * @type {string}
     */
    var setprop = args[args.length - 1] || 'attributes';

    /**
     * If this function was called with a bindable context (i.e. a Model or Collection),
     * then use that as the root data object instead of the global tbone.data.
     */
    var last_data = self;

    /**
     * If DONT_GET_DATA, and there's no prop, then this is a self-reference.
     */
    var _data = dontGetData && !prop ? self : self.attributes;

    var name_parts = [];
    var id;
    var arg;
    var doSubQuery;
    var parentCallbackContexts = {};
    var events = isSet && self['_events']['change'];

    while (true) {
        if (_data == null && !isSet) {
            // Couldn't even get to the level of the value we're trying to look up.
            // Concat the rest of args onto name_parts so that we record the full
            // path in the event binding.
            name_parts = name_parts.concat(args);
            break;
        } else if (_data !== self && isQueryable(_data)) {
            /**
             * To avoid duplicating the recentLookups code here, we set a flag and do
             * the sub-query after recording queries.
             *
             * Always do the subquery if there are more args.
             * If there are no more args...
             * - and this is a set...
             *   - (but really an unset): Don't do the sub-query regardless.
             *   -        to a queryable: Don't sub-query.  Set property to new queryable.
             *   -    to a non-queryable: Do the sub-query.  Push the value to the
             *                            other model (don't overwrite the model).  This
             *                            is kind of magical?
             * - and this is a get...
             *   -    with DONT_GET_DATA: Don't do sub-query.  Get the model itself.
             *   - without DONT_GET_DATA: Do the sub-query.  Delegate getting that model's
             *                            data to the other model.
             */
            doSubQuery = args.length || (isSet ? !isUnset && !isQueryable(value) : !dontGetData);
            break;
        } else if (isSet && !isObject(_data) && (args.length || isListOp)) {
            /**
             * Don't do implicit mkdir -p if we're just trying to unset something
             * that doesn't exist.
             */
            if (isUnset) {
                return;
            }
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
            /**
             * Decide whether to implicitly create an array or an object.
             *
             * If there are args remaining, then use the next arg to determine;
             * for a number, create an array - anything else, an object.
             *
             * If there are no more args, then create an array if this is a list
             * operation; otherwise, an object.
             */
            _data = (args.length ? rgxNumber.exec(args[0]) : isListOp) ? [] : {};
            self['query'](name_parts.join('.'), _data);
        }

        arg = args.shift();
        if (arg == null) { break; }

        name_parts.push(arg);
        last_data = _data;

        _data = _data[arg];
        if (events) {
            _.extend(parentCallbackContexts, events[QUERY_SELF] || {});
            events = events[arg];
        }
    }

    if (!isSet && recentLookups) {
        id = uniqueId(self);
        if (!recentLookups[id]) {
            recentLookups[id] = {
                'obj': self,
                'props': {}
            };
        }
        recentLookups[id]['props'][name_parts.join('.')] = _data;
    }

    if (doSubQuery) {
        return hasValue ? _data['query'](flag, args.join('.'), value) : _data['query'](flag, args.join('.'));
    }

    if (isSet) {
        /**
         * Only do prevJson comparisons when setting the root property.
         * It's kind of complicated to detect and avoid aliasing issues when
         * setting other properties directly.  But at least this helps detect
         * aliasing for bound models.
         */
        if (TBONE_DEBUG && self.prevJson && !prop) {
            var json = serializeForComparison(self);
            if (json !== self.prevJson) {
                var before = JSON.parse(self.prevJson);
                var after = JSON.parse(json);
                var diffs = listDiffs(after, before, []);
                log(WARN, self, 'aliascheck', 'aliased change detected', {}, {
                    before: before,
                    after: after,
                    diffs: diffs
                });
            }
        }

        // XXX Kludge Alert.  In practice, gives many models a Name that otherwise
        // wouldn't have one by using the first prop name it is set to.  Works for
        // the typical T('modelName', model.make()) and T.push cases.
        var nameProp;

        if (isPush) {
            if (TBONE_DEBUG) {
                nameProp = prop + '.' + _data.length;
            }
            _data.push(value);
        } else if (isUnshift) {
            _data.unshift(value);
        } else if (isRemoveFirst) {
            _data.shift(value);
        } else if (isRemoveLast) {
            _data.pop(value);
        } else if (isUnset) {
            delete last_data[setprop];
        } else if (isToggle) {
            value = last_data[setprop] = !_data;
        } else if (isIncrement) {
            value = last_data[setprop] = (_data || 0) + value;
        } else {
            last_data[setprop] = value;
            if (TBONE_DEBUG) {
                nameProp = prop;
            }
        }

        if (TBONE_DEBUG && isQueryable(value)) {
            if (value['Name'] == null) {
                value['Name'] = nameProp;
            }
            if (value.scope && value.scope['Name'] == null) {
                value.scope['Name'] = 'model_' + nameProp;
            }
        }

        if (!_.isEmpty(parentCallbackContexts)) {
            // If there are any changes at all, then we need to fire one or more
            // callbacks for things we searched for.  Note that "parent" only includes
            // things from this model; change events don't bubble out to parent models.
            if (recursiveDiff(self, events, _data, value, true, 0, assumeChanged)) {
                for (var contextId in parentCallbackContexts) {
                    parentCallbackContexts[contextId].trigger.call(parentCallbackContexts[contextId]);
                }
            }
        } else {
            recursiveDiff(self, events, _data, value, false, 0, assumeChanged);
        }

        if (TBONE_DEBUG) {
            self.prevJson = prop ? null : serializeForComparison(self);
        }
        return value;
    } else if (!iterateOverModels && self.isCollection && prop === '') {
        /**
         * If iterateOverModels is not set and _data is a collection, return the
         * raw data of each model in a list.  XXX is this ideal?  or too magical?
         */
        if (isArray(_data)) {
            _data = _.map(_data, function (d) { return d['query'](); });
        } else if (_data) {
            _data = _.reduce(_.keys(_data), function (memo, k) {
                if (isQueryable(_data[k])) {
                    memo[k] = _data[k]['query']();
                }
                return memo;
            }, {});
        }
    }
    return _data;
}

function queryText(flag, prop) {
    return denullText(prop == null ? this['query'](flag) : this['query'](flag, prop));
}
