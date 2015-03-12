
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

function recursiveDiff (self, evs, curr, prev, _exhaustive, depth, fireAll) {
    // Kludge alert: if the objects are too deep, just assume there is
    // a change.
    if (depth > MAX_RECURSIVE_DIFF_DEPTH) {
        if (TBONE_DEBUG) {
            log(WARN, self, 'recurseLimit', 'hit recursion depth limit of <%=limit%>', {
                limit: MAX_RECURSIVE_DIFF_DEPTH
            }, {
                curr: curr,
                prev: prev
            });
        }
        return true;
    }
    evs = evs || EMPTY_OBJECT;
    curr = curr;
    prev = prev;
    var changed = fireAll;
    var exhaustive = _exhaustive;
    var k;
    if (prev !== curr) {
        // If prev and curr are both "object" types (but not null),
        // then we need to search recursively for "real" changes.
        // We want to avoid firing change events when the user sets
        // something to a deep copy of itself.
        if (isQueryable(prev) || isQueryable(curr)) {
            changed = true;
            fireAll = true;
        } else if (isObjectOrArray(prev) && isObjectOrArray(curr)) {
            exhaustive = true;
        } else if (isDate(prev) && isDate(curr)) {
            if (prev.getTime() !== curr.getTime()) {
                changed = true;
            }
        } else {
            changed = true;
        }
    }
    for (k in evs) {
        if (k !== QUERY_SELF) {
            if (recursiveDiff(self, evs[k], curr && curr[k], prev && prev[k], false, depth + 1, fireAll)) {
                changed = true;
            }
        }
    }
    if (exhaustive && !changed) {
        // If exhaustive specified, and we haven't yet found a change, search
        // through all keys until we find one (note that this could duplicate
        // some searching done while searching the event tree)
        // This may not be super-efficient to call recursiveDiff all the time.
        if (isObjectOrArray(prev) && isObjectOrArray(curr)) {
            // prev and curr are both objects/arrays
            // search through them recursively for any differences
            // Detect changes in length; this catches the difference
            // between [] and [undefined]:
            if (prev.length !== curr.length) {
                changed = true;
            } else {
                for (k in curr) {
                    if (recursiveDiff(self, evs[k], curr[k], prev[k], true, depth + 1, false)) {
                        changed = true;
                        break;
                    }
                }
                if (!changed) {
                    // If there are any entries in prev that were not in curr,
                    // then this has changed.
                    // XXX really, it's the parent that has changed. If you queried
                    // for curr directly, you'd get back undefined before and after.
                    for (k in prev) {
                        if (curr[k] === undefined) {
                            changed = true;
                            break;
                        }
                    }
                }
            }
        }
    }
    if (changed) {
        var contexts = evs[QUERY_SELF] || EMPTY_OBJECT;
        for (var contextId in contexts) {
            contexts[contextId].trigger();
        }
    }
    return changed;
}

function recursivelyFreeze(obj) {
    if (typeof obj === 'object' && obj !== null && !Object.isFrozen(obj)) {
        Object.freeze(obj);
        _.each(obj, recursivelyFreeze);
    }
}

function query () {
    var self = this;
    var myargs = arguments;
    var opts = myargs[0];
    var prop = myargs[1];
    var value = myargs[2];
    var isSet = myargs.length === 3;
    if (typeof opts !== 'object') {
        /**
         * If no opts provided, shift the prop and value over.  We do it this way instead
         * of having opts last so that we can type-check opts and discern it from the
         * prop.
         */
        value = prop;
        prop = opts;
        opts = EMPTY_OBJECT;
        /**
         * Use arguments.length to switch to set mode in order to properly support
         * setting undefined.
         */
        if (myargs.length === 2) {
            isSet = true;
        }
    }

    if (!prop && opts.dontGetData) {
        return self;
    }

    /**
     * Remove a trailing dot and __self__ references, if any, from the prop.
     **/
    var args = splitQueryString(prop);

    /**
     * If this function was called with a bindable context (i.e. a Model or Collection),
     * then use that as the root data object instead of the global tbone.data.
     */
    var datas = [];
    var props = [];
    var _data = self.attributes;

    var arg;
    var doSubQuery;
    var parentCallbackContexts = {};
    var events = isSet && self._events;

    while (true) {
        if (isQueryable(_data)) {
            /**
             * To avoid duplicating the recentLookups code here, we set a flag and do
             * the sub-query after recording queries.
             *
             * Always do the subquery if there are more args.
             * If there are no more args...
             * - and this is a set...
             *   -        to a queryable: Don't sub-query.  Set property to new queryable.
             *   -    to a non-queryable: Do the sub-query.  Push the value to the
             *                            other model (don't overwrite the model).  This
             *                            is kind of magical?
             * - and this is a get...
             *   -                always: Do the sub-query.
             */
            doSubQuery = (args && args.length) || !(isSet && isQueryable(value));
            break;
        }

        arg = args.shift();
        if (!arg) {
            break;
        }

        if (isSet && !isObjectOrArray(_data)) {
            /**
             * When doing an implicit mkdir -p while setting a deep-nested property
             * for the first time, we peek at the next arg and create either an array
             * for a numeric index and an object for anything else.  We set the
             * property via query() so as to fire change events appropriately.
             */
            if (TBONE_DEBUG && _data != null) {
                log(WARN, self, 'mkdir', 'while writing <%=prop%>, had to overwrite ' +
                    'primitive value <%=primitive%> at <%=partial%>', {
                        prop: prop,
                        primitive: _data,
                        partial: args.join('.')
                    });
            }
            /**
             * Decide whether to implicitly create an array or an object.
             *
             * If there are args remaining, then use the next arg to determine;
             * for a number, create an array - anything else, an object.
             */
            _data = rgxNumber.exec(arg) ? [] : {};
            self.query(props.join('.'), _data);
        }

        props.push(arg);
        datas.push(_data);

        _data = _data != null ? _data[arg] : undefined;
        if (events) {
            _.extend(parentCallbackContexts, events[QUERY_SELF] || EMPTY_OBJECT);
            events = events[arg];
        }
    }

    if (!isSet && recentLookups) {
        var id = uniqueId(self);
        if (!recentLookups[id]) {
            recentLookups[id] = {
                obj: self,
                props: {}
            };
        }
        recentLookups[id].props[props.join('.')] = _data;
    }

    if (doSubQuery) {
        return isSet ? _data.query(opts, args.join('.'), value) : _data.query(opts, args.join('.'));
    }

    if (isSet) {
        if (TBONE_DEBUG && !self.disableFreeze) {
            recursivelyFreeze(value);
            // Walk up the object tree, cloning every object and patching in new
            // trees that include the new value in them:
            var last = value;
            for (var i = datas.length - 1; i >= 0; i--) {
                var clone = _.clone(datas[i]);
                clone[props[i]] = last;
                Object.freeze(clone);
                last = clone;
            }
            self.attributes = last;
        } else {
            if (datas.length) {
                datas[datas.length - 1][props[props.length - 1]] = value;
            } else {
                self.attributes = value;
            }
        }

        if (TBONE_DEBUG && isQueryable(value)) {
            // XXX Kludge Alert.  In practice, gives many models a Name that otherwise
            // wouldn't have one by using the first prop name it is set to.  Works for
            // the typical T('modelName', model.make()) and T.push cases.
            if (!value.Name) {
                value.Name = prop;
            }
            if (value.scope && !value.scope.Name) {
                value.scope.Name = 'model_' + prop;
            }
        }

        var searchExhaustively = !_.isEmpty(parentCallbackContexts);
        if (recursiveDiff(self, events, _data, value, searchExhaustively, 0, opts.assumeChanged)) {
            _.each(parentCallbackContexts, function contextTriggerIter(context) {
                context.trigger();
            });
        }
        return value;
    }
    return _data;
}
