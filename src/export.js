
var tbone = baseModel.make();

var orig_tbone = window['tbone'];
var orig_T = window['T'];

window['tbone'] = window['T'] = tbone;
tbone['models'] = models;
tbone['views'] = views;
tbone['collections'] = collections;
tbone['data'] = tbone; // deprecated
tbone['_data'] = tbone.attributes; // deprecated
tbone['templates'] = templates;

tbone['autorun'] = tbone; // deprecated

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
views['base'] = baseView;

if (TBONE_DEBUG) {
    tbone['watchLog'] = watchLog;
    tbone['getListeners'] = getListeners;
    tbone['hasViewListener'] = hasViewListener;
    tbone['onLog'] = onLog;
    onLog(logconsole);
}

// This is used by BBVis to hook into the base model/collection/view
// before they are modified.  You can, too.
if (window['dispatchEvent'] && window['CustomEvent']) {
    dispatchEvent(new CustomEvent('tbone_loaded'));
}
