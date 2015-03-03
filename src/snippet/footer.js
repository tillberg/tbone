// This is used by BBVis to hook into the base model/collection/view
// before they are modified.  You can, too.
try{
    root.dispatchEvent(new root.CustomEvent('tbone_loaded'));
} catch(e) {}

}(this));
