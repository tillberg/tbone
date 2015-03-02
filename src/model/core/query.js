
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
                if (isRealObject(prev) && isRealObject(curr)) {
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
        if (isRealObject(prev) && isRealObject(curr)) {
            // prev and curr are both objects/arrays
            // search through them recursively for any differences
            var searched = {};
            var objs = [prev, curr];
            for (i = 0; i < 2 && !changed; i++) {
                var obj = objs[i];
                // Detect changes in length; this catches the difference
                // between [] and [undefined]:
                if (prev.length !== curr.length) {
                    changed = true;
                }
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

function query (opts, prop, value) {
    var self = this;
    var isSet = arguments.length === 3;
    if (typeof opts !== 'object') {
        /**
         * If no opts provided, shift the prop and value over.  We do it this way instead
         * of having opts last so that we can type-check opts and discern it from the
         * prop.
         */
        value = prop;
        prop = opts;
        opts = {};
        /**
         * Use arguments.length to switch to set mode in order to properly support
         * setting undefined.
         */
        if (arguments.length === 2) {
            isSet = true;
        }
    }
    var dontGetData = opts.dontGetData;
    var assumeChanged = opts.assumeChanged;

    /**
     * Remove a trailing dot and __self__ references, if any, from the prop.
     **/
    var args;
    prop = (prop || '').replace('__self__', '');
    if (prop) {
        args = prop.split('.');
    } else if (dontGetData) {
        return self;
    }

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
    var events = isSet && self._events.change;

    while (args) {
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

        if (isSet && !isRealObject(_data)) {
            /**
             * When doing an implicit mkdir -p while setting a deep-nested property
             * for the first time, we peek at the next arg and create either an array
             * for a numeric index and an object for anything else.  We set the
             * property via query() so as to fire change events appropriately.
             */
            if (TBONE_DEBUG && _data != null) {
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
             */
            _data = rgxNumber.exec(arg) ? [] : {};
            self.query(props.join('.'), _data);
        }

        props.push(arg);
        datas.push(_data);

        _data = _data != null ? _data[arg] : undefined;
        if (events) {
            _.extend(parentCallbackContexts, events[QUERY_SELF] || {});
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
        var last = value;
        // Recursively freeze the new value:
        if (typeof value === 'object') {
            var toFreeze = [value];
            while (arg = toFreeze.pop()) { // jshint ignore:line
                for (var k in arg) {
                    var newObj = arg[k];
                    // Guard against reference cycles causing infinite loops:
                    if (typeof newObj === 'object' && newObj !== arg && toFreeze.indexOf(newObj) === -1) {
                        toFreeze.push(newObj);
                    }
                }
                Object.freeze(arg);
            }
        }
        // Walk up the object tree, cloning every object and patching in new
        // trees that include the new value in them:
        for (var i = datas.length - 1; i >= 0; i--) {
            var clone = _.clone(datas[i]);
            clone[props[i]] = last;
            Object.freeze(clone);
            last = clone;
        }
        self.attributes = last;

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

        return value;
    }
    return _data;
}
