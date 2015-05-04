
/**
 * Returns true if there is a view that is listening (directly or indirectly)
 * to this model.  Useful for determining whether the current model should
 * be updated (if a model is updated in the forest and nobody is there to
 * hear it, then why update it in the first place?)
 * @param  {Queryable}  self
 * @return {Boolean}
 */
function hasViewListener (self) {
    // console.log('hasViewListener', self.getName());
    var todo = [ self._events ];
    var used = [];
    var next;
    while (!!(next = todo.pop())) {
        if (used.indexOf(next) !== -1) {
            continue;
        }
        used.push(next);
        for (var k in next) {
            var curr = next[k];
            if (k === QUERY_SELF) {
                for (var id in curr) {
                    var listener = curr[id];
                    while (listener) {
                        if (listener.isView) {
                            // console.log('found view listener');
                            return true;
                        }
                        if (listener.contextScoping) {
                            // console.log('found scoped reference (' + listener.contextScoping + ')');
                            var props = splitQueryString(listener.contextScoping);
                            var ev = listener.context._events.attributes;
                            for (var i = 0; ev && i < props.length; i++) {
                                ev = ev[props[i]];
                            }
                            if (ev) {
                                todo.push(ev);
                            }
                            break;
                        }
                        if (listener.context && listener.context.isModel) {
                            // console.log('found model');
                            todo.push(listener.context._events);
                            break;
                        }
                        listener = listener.parentScope;
                    }
                }
            } else {
                todo.push(curr);
            }
        }
    }
    // console.log('no view listener');
    return false;
}
