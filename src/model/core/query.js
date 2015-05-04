
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
    if (changed && evs[QUERY_SELF]) {
        var contexts = evs[QUERY_SELF];
        for (var contextId in contexts) {
            contexts[contextId].trigger();
        }
    }
    return changed;
}

function genModelDataProxy(parentModel, prop, childModel) {
    return autorun({
        fn: function() {
            parentModel.query({
                setModelData: true,
            }, prop, childModel.query(''));
        },
        context: parentModel,
        contextScoping: prop,
        immediate: true,
        detached: true,
        priority: PRIORITY_HIGHEST - 1000,
    });
}

function recursivelyDestroySubModelScopes(_model) {
    if (_model) {
        for (var k in _model) {
            if (k === QUERY_SELF) {
                _model[QUERY_SELF].scope.destroy();
            } else {
                recursivelyDestroySubModelScopes(_model[k]);
            }
        }
    }
}

function recursivelyFreeze(obj) {
    if (isFunction(obj) || _.isElement(obj)) {
        throw 'Functions and DOM elements should not be set to TBone models.';
    }
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

    var assumeChanged = opts.assumeChanged;

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
    var setModelData = opts.setModelData;
    var isUnset = opts.unset;
    var isModelSet = isSet && !setModelData && isQueryable(value);
    var queryModel = isModelSet || opts.dontGetData;
    var models = [];
    var _model = self.submodels;
    var eventsBaseProp = queryModel ? 'submodels' : 'attributes';
    var events = isSet && self._events[eventsBaseProp];
    var subModel;

    while (true) {
        subModel = _model && _model[QUERY_SELF] && _model[QUERY_SELF].model;

        // Is there a way we could completely avoid sub-queries on reads?
        // The trouble comes with indirectly-set models, which get written as _data
        // instead of in the _model tree.
        if ((isSet || queryModel) && isQueryable(subModel)) {
            /**
             * To avoid duplicating the recentLookups code here, we set a flag and do
             * the sub-query after recording queries.
             *
             * Do a sub-query to a child model if there are more args remaining.
             */
            doSubQuery = args.length;
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
                throw 'Writing to a sub-property of a primitive value is not allowed.';
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
        if (_model) {
            models.push(_model);
            if (isSet) {
                if (TBONE_DEBUG && _model[QUERY_SELF]) {
                    throw 'Direct writes below a sub-model are not allowed. Write to the sub-model instead.';
                }
                if (isModelSet && !_model[arg]) {
                    _model[arg] = {};
                }
            }
            _model = _model[arg];
        }
        if (events) {
            if (!isModelSet) {
                _.extend(parentCallbackContexts, events[QUERY_SELF] || EMPTY_OBJECT);
            }
            events = events[arg];
        }
    }

    if (!isSet && recentLookups) {
        var id = uniqueId(self);
        if (!recentLookups[id]) {
            recentLookups[id] = {
                obj: self,
                props: {},
            };
        }
        var propsStr = props.join('.');
        propsStr = eventsBaseProp + (propsStr ? '.' : '') + propsStr;
        // console.log('binding ' + propsStr);
        recentLookups[id].props[propsStr] = _data;
    }

    if (doSubQuery) {
        return isSet ? subModel.query(opts, args.join('.'), value) : subModel.query(opts, args.join('.'));
    }

    if (isSet) {
        if (isModelSet) {
            // Skip the destroy/re-bind if the value to set is the same
            // as the model already here.
            if (value === subModel) {
                return value;
            }
            assumeChanged = true;
            var scopeWrap = {
                '': {
                    model: value,
                    scope: genModelDataProxy(self, prop, value),
                },
            };
            // console.log('recursivelyDestroySubModelScopes A', _model)
            recursivelyDestroySubModelScopes(_model);
            if (models.length) {
                models[models.length - 1][props[props.length - 1]] = scopeWrap;
            } else {
                self.submodels = scopeWrap;
            }
        } else {
            var enableFreeze = TBONE_DEBUG && !self.disableFreeze;
            if (enableFreeze) {
                recursivelyFreeze(value);
            }
            // Walk up the object tree, cloning every object and patching in new
            // trees that include the new value in them:
            var last = value;
            for (var i = datas.length - 1; i >= 0; i--) {
                var clone = _.clone(datas[i]);
                clone[props[i]] = last;
                if (isUnset && i === datas.length - 1) {
                    delete clone[props[i]];
                }
                if (enableFreeze) {
                    Object.freeze(clone);
                }
                last = clone;
            }
            self.attributes = last;
            if (!setModelData) {
                // console.log('recursivelyDestroySubModelScopes B', _model)
                recursivelyDestroySubModelScopes(_model);
                // Clear the _model keys, too.
                for (var k in _model) {
                    delete _model[k];
                }
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
        // console.log('parentCallbackContexts', parentCallbackContexts);
        // console.log('recursiveDiff', [events, _data, value, searchExhaustively, 0, opts.assumeChanged]);
        if (recursiveDiff(self, events, _data, value, searchExhaustively, 0, assumeChanged)) {
            // console.log('found diff');
            _.each(parentCallbackContexts, function contextTriggerIter(context) {
                context.trigger();
            });
        }
        return value;
    }
    return queryModel ? subModel : _data;
}
