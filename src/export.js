
tbone['views'] = views;
tbone['templates'] = templates;

tbone['createView'] = createView;
tbone['setDefaultView'] = setDefaultView;
tbone['addTemplate'] = addTemplate;
tbone['dontPatch'] = dontPatch;
tbone['render'] = render;
tbone['denullText'] = denullText;
tbone['priority'] = priority;

views['base'] = baseView;

if (TBONE_DEBUG) {
    tbone['watchLog'] = watchLog;
    tbone['showRenderTrees'] = showRenderTrees;
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
