
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
collections['base'] = baseCollection;

if (TBONE_DEBUG) {
    tbone['watchLog'] = watchLog;
    tbone['getListeners'] = getListeners;
    tbone['hasViewListener'] = hasViewListener;
    tbone['onLog'] = onLog;
    onLog(logconsole);
}
