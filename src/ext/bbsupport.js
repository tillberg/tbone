
var Backbone = root.Backbone;

if (Backbone) {

    getListenersHook.push(function (self, listeners) {
        // Older backbone:
        _.each(_.values(self._callbacks || {}), function (ll) {
            var curr = ll.next;
            while (true) {
                if (curr.context) {
                    listeners.push(curr.context);
                    curr = curr.next;
                } else {
                    break;
                }
            }
        });
        // Newer backbone:
        _.each(_.flatten(_.values(self._events || {})), function (ev) {
            if (ev.context) {
                listeners.push(ev.context);
            }
        });
    });

    var bbquery = function (flag, prop, value) {
        var dontGetData = flag === DONT_GET_DATA;
        var iterateOverModels = flag === ITERATE_OVER_MODELS;
        var isToggle = flag === QUERY_TOGGLE;
        var hasValue = arguments.length === 3;
        var isSet = isToggle || hasValue;
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
        prop = (prop || '').replace(/\.?(__self__)?\.?$/, '');
        var args = prop.split('.');

        var setprop;
        if (isSet) {
            /**
             * For set operations, we only want to look up the parent of the property we
             * are modifying; pop the final property we're setting from args and save it
             * for later.
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
        var _data = dontGetData && !prop ? this :
            this.isCollection ? this.models : this.attributes;

        var name_parts = [];
        var myRecentQuery = {};
        var firstprop = args[0] || '';
        var firstdata = prop ? _data[firstprop] : _data;
        var id;
        var arg;
        var doSubQuery;

        while ((arg = args.shift()) != null) {
            // Ignore empty string arguments.
            if (arg === QUERY_SELF) {
                continue;
            }

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
                    last_data[arg] = _data;
                } else {
                    break;
                }
            } else if (isQueryable(_data)) {
                doSubQuery = true;
                break;
            }
        }

        if (!isSet && recentLookups) {
            id = uniqueId(this);
            if (!recentLookups[id]) {
                recentLookups[id] = {
                    obj: this,
                    props: {}
                };
            }
            recentLookups[id].props[firstprop] = firstdata;
        }

        // Skip the sub-query if DONT_GET_DATA is set there are no more args
        if (doSubQuery && (!dontGetData || args.length)) {
            return hasValue ? _data.query(flag, args.join('.'), value) : _data.query(flag, args.join('.'));
        }

        if (isSet) {
            if (last_data == null) {
                // Set top-level of model/collection
                /**
                 * When setting to an entire model, we use different semantics; we want the
                 * values provided to be set to the model, not replace the model.
                 */
                if (this.isCollection) {
                    this.reset(value != null ? value : []);
                } else {
                    if (value) {
                        /**
                         * Remove any properties from the model that are not present in the
                         * value we're setting it to.
                         */
                        for (var k in this.toJSON()) {
                            if (value[k] === undefined) {
                                this.unset(k);
                            }
                        }
                        this.set(value);
                    } else {
                        this.clear();
                    }
                }
            } else {
                if (isToggle) {
                    value = last_data[setprop] = !_data;
                } else if (last_data[setprop] !== value) {
                    /**
                     * Set the value to a property on a regular JS object.
                     */
                    last_data[setprop] = value;
                }
                /**
                 * If we're setting a nested property of a model (or collection?), then
                 * trigger a change event for the top-level property.
                 */
                if (firstprop) {
                    this.trigger('change:' + firstprop);
                }
                this.trigger('change');
            }
            return value;
        } else if (_data && !iterateOverModels && this.isCollection && prop === QUERY_SELF) {
            /**
             * If iterateOverModels is not set and _data is a collection, return the
             * raw data of each model in a list.  XXX is this ideal?  or too magical?
             */
            _data = _.map(_data, function (d) { return d.query(); });
        }
        return _data;
    };

    var bbbaseModel = Backbone.Model.extend({
        isModel: true,
        /**
         * Constructor function to initialize each new model instance.
         * @return {[type]}
         */
        initialize: function () {
            var self = this;
            uniqueId(self);
            var isAsync = self.sleeping = self.isAsync();
            var priority = isAsync ? BASE_PRIORITY_MODEL_ASYNC : BASE_PRIORITY_MODEL_SYNC;
            /**
             * Queue the autorun of update.  We want this to happen after the current JS module
             * is loaded but before anything else gets updated.  We can't do that with setTimeout
             * or _.defer because that could possibly fire after drainQueue.
             */
            queueExec({
                execute: function () {
                    self.scope = autorun(self.update, priority, self, 'model_' + self.Name,
                                         self.onScopeExecute, self);
                },
                priority: priority + PRIORITY_INIT_DELTA
            });
        },
        /**
         * Indicates whether this function should use the asynchronous or
         * synchronous logic.
         * @return {Boolean}
         */
        isAsync: function () {
            return !!this._url;
        },
        onScopeExecute: function (scope) {
            if (TBONE_DEBUG) {
                log(INFO, this, 'lookups', scope.lookups);
            }
        },
        /**
         * Triggers scope re-execution.
         */
        reset: function () {
            if (this.scope) {
                this.scope.trigger();
            }
        },
        isVisible: function () {
            return hasViewListener(this);
        },
        update: function () {
            var self = this;
            if (self.isAsync()) {
                self.updateAsync();
            } else {
                self.updateSync();
            }
        },
        updateAsync: function () {
            var self = this;
            var myXhr;
            function complete() {
                if (myXhr === self.xhrInFlight) {
                    removeInFlight(self);
                    delete self.xhrInFlight;
                }
            }

            var url = self.url();
            var lastFetchedUrl = self.fetchedUrl;
            self.sleeping = !this.isVisible();
            if (self.sleeping) {
                /**
                 * Regardless of whether url is non-null, this model goes to sleep
                 * if there's no view listener waiting for data (directly or through
                 * a chain of other models) from this model.
                 **/
                if (TBONE_DEBUG) {
                    log(INFO, self, 'sleep');
                }
                self.sleeping = true;
            } else if (url != null) {
                /**
                 * If a defined URL function returns null, it will prevent fetching.
                 * This can be used e.g. to prevent loading until all required
                 * parameters are set.
                 **/
                self.fetchedUrl = url;
                self.preFetch();
                self.fetch({
                    dataType: 'text',
                    success: function () {
                        self.postFetch();
                        self.trigger('fetch');
                        if (TBONE_DEBUG) {
                            log(INFO, self, 'updated', self.toJSON());
                        }
                    },
                    complete: complete,
                    beforeSend: function (xhr) {
                        // If we have an active XHR in flight, we should abort
                        // it because we don't want that anymore.
                        if (self.xhrInFlight) {
                            if (TBONE_DEBUG) {
                                log(WARN, self, 'abort',
                                    'aborting obsolete ajax request. old: <%=oldurl%>, new: <%=newurl%>', {
                                    oldurl: lastFetchedUrl,
                                    newurl: url
                                });
                            }
                            self.xhrInFlight.abort();
                            complete(); // Decrement inflight counter
                        }
                        addInFlight(self);
                        myXhr = self.xhrInFlight = xhr;
                    },
                    url: url
                });
            }
        },
        updateSync: function () {
            var self = this;
            // this.state returns the new state, synchronously
            if (self.state) {
                self.query(QUERY_SELF, self.state());
                if (TBONE_DEBUG) {
                    log(INFO, self, 'updated', self.toJSON());
                }
            }
        },
        state: null,
        preFetch: function () {
            this.clear();
        },
        postFetch: noop,
    });

    _.each([Backbone.Model.prototype, Backbone.Collection.prototype], function (proto) {
        _.extend(proto, {
            isBackbone: true,

            /**
             * Copy query and text onto the Model, View, and Collection.
             *
             */
            query: bbquery,

            /**
             * Wake up this model as well as (recursively) any models that depend on
             * it.  Any view that is directly or indirectly depended on by the current
             * model may now be able to be awoken based on the newly-bound listener to
             * this model.
             * @param  {Object.<string, Boolean>} woken Hash map of model IDs already awoken
             */
            wake: function (woken) {
                // Wake up this model if it was sleeping
                if (this.sleeping) {
                    this.trigger('wake');
                    this.sleeping = false;
                    this.reset();
                }
                /**
                 * Wake up models that depend directly on this model that have not already
                 * been woken up.
                 */
                _.each((this.scope && this.scope.lookups) || [], function (lookup) {
                    var bindable = lookup.obj;
                    if (bindable && !woken[uniqueId(bindable)]) {
                        woken[uniqueId(bindable)] = true;
                        bindable.wake(woken);
                    }
                });
            }
        });

        /**
         * We wrap proto.on in order to wake up and reset models
         * that were previously sleeping because they did not need to be updated.
         * This passes through execution to the original on function.
         */
        var originalOn = proto.on;
        proto.on = function () {
            this.wake({});
            return originalOn.apply(this, arguments);
        };
    });

    var bbModel = models.bbbase = bbbaseModel;
    var bbCollection = collections.bbbase = Backbone.Collection.extend({
        isCollection: true
    });

    _.each([bbModel, bbCollection], function (obj) {
        _.extend(obj.prototype, {
            /**
             * Disable backbone-based validation; by using validation to prevent populating
             * form input data to models, backbone validation is at odds with the TBone
             * concept that all data in the UI should be backed by model data.
             *
             * By overriding _validate, we can still use isValid and validate, but Backbone
             * will no longer prevent set() calls from succeeding with invalid data.
             */
            _validate: function () { return true; }
        });
    });
}
