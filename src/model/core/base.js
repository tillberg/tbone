/**
 * model/core/base.js
 */

var boundModel;

/**
 * baseModel
 * @constructor
 */
var baseModel = {
    isModel: true,
    make: function make(opts) {
        var self = this;
        // Each TBone model/collection is an augmented copy of this TBoneModel function
        var instance = function TBoneModel (arg0, arg1) {
            var typeofArg0 = typeof arg0;
            if (typeofArg0 === 'function' || typeofArg0 === 'object') {
                return autorun(arg0);
            } else if (typeof arg1 === 'function' && !isQueryable(arg1)) {
                return instance.query(arg0, instance.bound(arg1));
            }
            return (arguments.length === 0 ? instance.query() :
                    arguments.length === 1 ? instance.query(arg0) :
                                             instance.query(arg0, arg1));
        };
        _.extend(instance, self, isFunction(opts) ? {
            state: opts,
            Name: opts.name,
        } : opts || EMPTY_OBJECT);

        // Initialize the model instance
        instance.tboneid = undefined;
        instance.attributes = undefined;
        instance.submodels = {};
        instance._events = {
            submodels: {},
            attributes: {},
        };
        instance._removeCallbacks = {};
        uniqueId(instance);
        instance.initialize();
        return instance;
    },
    extend: function extend(subclass) {
        return _.extend({}, this, subclass);
    },
    initialize: noop,
    on: function on(name, context) {
        var parts = splitQueryString(name);
        var events = this._events;
        var arg;

        while ((arg = parts.shift()) != null) {
            if (!events[arg]) {
                events[arg] = {};
            }
            events = events[arg];
        }
        var contexts = events[''];
        if (!contexts) {
            contexts = events[''] = {};
        }
        var contextId = uniqueId(context);
        contexts[contextId] = context;

        /**
         * Wake up and reset this and other models that may be sleeping because
         * they did not need to be updated.
         */
        this.wake({});
    },
    off: function off(name, context) {
        // XXX doesn't clean up when callbacks list goes to zero length
        var parts = splitQueryString(name);
        var events = this._events;
        var arg;

        while ((arg = parts.shift()) != null) {
            if (!events[arg]) {
                events[arg] = {};
            }
            events = events[arg];
        }
        var contexts = events[''];
        if (contexts) {
            var contextId = uniqueId(context);
            delete contexts[contextId];
        }
    },
    trigger: function trigger(name) {
        var self = this;
        var events = self._events;
        var parts = splitQueryString(name);
        var arg;
        while ((arg = parts.shift()) != null) {
            if (!events[arg]) {
                events[arg] = {};
            }
            events = events[arg];
        }
        var contexts = events[QUERY_SELF] || EMPTY_OBJECT;
        for (var contextId in contexts) {
            contexts[contextId].trigger();
        }
    },

    runOnlyOnce: function runOnlyOnce(fn) {
        autorun(fn).destroy();
    },

    query: query,

    queryModel: function queryModel(prop) {
        return this.query({dontGetData: true}, prop);
    },

    // query `prop` without binding to changes in its value
    readSilent: function readSilent(prop) {
        var tmp = recentLookups;
        recentLookups = null;
        var rval = this.query(prop);
        recentLookups = tmp;
        return rval;
    },

    idAttribute: 'id',

    queryId: function queryId() {
        return this.query(this.idAttribute);
    },

    bound: function bound(fn) {
        return boundModel.make(fn);
    },

    getName: function getName(obj) {
        if (!obj) {
            obj = this;
        }
        if (obj.Name) {
            return obj.Name;
        }
        var parent = obj.context || obj.parentScope;
        if (parent) {
            return this.getName(parent) + '+';
        }
        return 'na-' + obj.tboneid;
    },

    toggle: function toggle(prop) {
        this.query(prop, !this.readSilent(prop));
    },

    push: function push(prop, value) {
        if (arguments.length === 1) {
            value = prop;
            prop = '';
        }
        return this.query(prop, ensureArray(this.readSilent(prop)).concat([value]));
    },

    unshift: function unshift(prop, value) {
        if (arguments.length === 1) {
            value = prop;
            prop = '';
        }
        return this.query(prop, [value].concat(ensureArray(this.readSilent(prop))));
    },

    removeFirst: function removeFirst(prop) {
        return this.query(prop, ensureArray(this.readSilent(prop)).slice(1));
    },

    removeLast: function removeLast(prop) {
        return this.query(prop, ensureArray(this.readSilent(prop)).slice(0, -1));
    },

    unset: function unset(prop) {
        this.query({ unset: true }, prop, undefined);
    },

    increment: function increment(prop, value) {
        var curr = this.readSilent(prop);
        var newval = (curr || 0) + (value != null ? value : 1);
        this.query(prop, newval);
    },

    wake: function wake(woken) {
        // While base models don't need to be woken themselves, they
        // need to wake up any bound submodels that they may be holding.
        var self = this;
        var myId = uniqueId(self);
        if (!woken[myId]) {
            woken[myId] = true;
            var todo = [ self.submodels ];
            var next;
            while (!!(next = todo.pop())) {
                for (var k in next) {
                    var curr = next[k];
                    if (k === QUERY_SELF) {
                        curr.model.wake(woken);
                    } else {
                        todo.push(curr);
                    }
                }
            }
        }
    },
};

var tbone = baseModel.make({ Name: 'tbone' });

tbone.hasViewListener = hasViewListener;
tbone.priority = priority;

if (TBONE_DEBUG) {
    tbone.watchLog = watchLog;
    tbone.onLog = onLog;
    onLog(logconsole);
}

// Export for node:
if (typeof module !== 'undefined') {
    module.exports = tbone;
}

// Browser-land
var orig_T = root.T;
var orig_tbone = root.tbone;
root.T = tbone;
root.tbone = tbone;
tbone.noConflict = function noConflict() {
    root.T = orig_T;
    root.tbone = orig_tbone;
};

var metrics = baseModel.make({ Name: 'tbone_metrics' });
tbone.metrics = metrics;

var models = {
    base: baseModel,
};
tbone.models = models;
