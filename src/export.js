
_.each([baseModel], function (proto) {
    _.extend(proto, {
        /**
         * isBindable is just a convenience used to identify whether an object is
         * either a Model or a Collection.
         */
        'isBindable': true,

        /**
         * Copy query and text onto the Model, View, and Collection.
         *
         */
        'query': lookup,
        'text': lookupText,

        // deprecated?
        'lookup': lookup,
        'lookupText': lookupText,
        'set': lookup,
        'get': lookup,

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
                var bindable = lookup.__obj__;
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
    proto['on'] = function () {
        this.wake({});
        return originalOn.apply(this, arguments);
    };
});

// _.each([baseModel, baseCollection], function (obj) {
//     _.extend(obj.prototype, {
        /**
         * Disable backbone-based validation; by using validation to prevent populating
         * form input data to models, backbone validation is at odds with the TBone
         * concept that all data in the UI should be backed by model data.
         *
         * By overriding _validate, we can still use isValid and validate, but Backbone
         * will no longer prevent set() calls from succeeding with invalid data.
         */
//         '_validate': function () { return true; }
//     });
// });

var tbone = baseModel.make();

var orig_tbone = window['tbone'];
var orig_T = window['T'];

window['tbone'] = window['T'] = tbone;
tbone['models'] = models;
tbone['views'] = views;
tbone['collections'] = collections;
tbone['data'] = tbone;
tbone['_data'] = tbone.attributes; // XXX don't use this
tbone['templates'] = templates;

tbone['autorun'] = tbone['lookup'] = tbone;
tbone['lookupText'] = lookupText;
tbone['toggle'] = toggle;

tbone['createCollection'] = createCollection;
tbone['createView'] = createView;
tbone['defaultView'] = __defaultView;
tbone['addTemplate'] = addTemplate;
tbone['dontPatch'] = dontPatch;
tbone['render'] = render;

tbone['isReady'] = isReady;
tbone['drain'] = drain;
tbone['freeze'] = freeze;

tbone['noConflict'] = function () {
    window['T'] = orig_T;
    window['tbone'] = orig_tbone;
};

models['base'] = baseModel;

if (TBONE_DEBUG) {
    tbone['watchLog'] = watchLog;
    tbone['getListeners'] = getListeners;
    tbone['hasViewListener'] = hasViewListener;
    tbone['onLog'] = onLog;
    onLog(logconsole);
}
