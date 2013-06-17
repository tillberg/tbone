
var tbone = baseModel.make();

var orig_tbone = window['tbone'];
var orig_T = window['T'];

window['tbone'] = window['T'] = tbone;
tbone['models'] = models;
tbone['views'] = views;
tbone['collections'] = collections;
tbone['templates'] = templates;

tbone['createView'] = createView;
tbone['setDefaultView'] = setDefaultView;
tbone['addTemplate'] = addTemplate;
tbone['dontPatch'] = dontPatch;
tbone['render'] = render;

// Included in minified source, but intended for TESTING only:
tbone['drain'] = drain;
tbone['isReady'] = isReady;

tbone['noConflict'] = function () {
    window['T'] = orig_T;
    window['tbone'] = orig_tbone;
};

tbone['data'] = tbone; // deprecated
tbone['_data'] = tbone.attributes; // deprecated
tbone['autorun'] = tbone; // deprecated

models['base'] = baseModel;
collections['base'] = baseCollection;
views['base'] = baseView;

if (TBONE_DEBUG) {
    tbone['watchLog'] = watchLog;
    tbone['getListeners'] = getListeners;
    tbone['hasViewListener'] = hasViewListener;
    tbone['onLog'] = onLog;
    tbone['freeze'] = freeze;
    tbone['opts'] = opts;
    onLog(logconsole);
}

// This is used by BBVis to hook into the base model/collection/view
// before they are modified.  You can, too.
try{
    dispatchEvent(new CustomEvent('tbone_loaded'));
} catch(e) {}
