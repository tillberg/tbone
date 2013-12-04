
var tbone = baseModel.make({ 'Name': 'tbone' });

var orig_tbone = root['tbone'];
var orig_T = root['T'];

root['tbone'] = tbone;
root['T'] = tbone;

tbone['models'] = models;
tbone['views'] = views;
tbone['collections'] = collections;
tbone['templates'] = templates;

tbone['createView'] = createView;
tbone['setDefaultView'] = setDefaultView;
tbone['addTemplate'] = addTemplate;
tbone['dontPatch'] = dontPatch;
tbone['render'] = render;
tbone['denullText'] = denullText;

tbone['runOnlyOnce'] = runOnlyOnce;

// Included in minified source, but intended for TESTING only:
tbone['drain'] = drain;
tbone['isReady'] = isReady;

tbone['noConflict'] = function () {
    root['T'] = orig_T;
    root['tbone'] = orig_tbone;
};

/**
 * Core models
 */
models['base'] = baseModel;
models['bound'] = boundModel;
models['async'] = asyncModel;

/**
 * Fancy models
 */
models['ajax'] = ajaxModel;
models['localStorage'] = localStorageModel;
models['location'] = locationModel;

collections['base'] = baseCollection;
collections['localStorage'] = localStorageCollection;
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
