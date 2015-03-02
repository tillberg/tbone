
/**
 * tbone.autorun
 *
 * Wrap a function call with automatic binding for any model properties accessed
 * during the function's execution.
 *
 * Models and views update automatically by wrapping their reset functions with this.
 *
 * Additionally, this can be used within view `ready` callbacks to section off a smaller
 * block of code to repeat when its own referenced properties are updated, without
 * needing to re-render the entire view.
 * @param  {Function}    fn        Function to invoke
 * @param  {number}      priority  Scheduling priority - higher = sooner
 * @param  {Object}      context   Context to pass on invocation
 * @param  {string}      name      Name for debugging purposes
 * @return {Scope}                 A new Scope created to wrap this function
 */
function autorun (fn, priority, context, name, onExecuteCb, onExecuteContext, detached) {
    // Default priority and name if not specified.  Priority is important in
    // preventing unnecessary refreshes of views/subscopes that may be slated
    // for destruction by a parent; the parent should have priority so as
    // to execute first.
    if (priority == null) {
        priority = currentExecutingScope ? currentExecutingScope.priority - 1 : DEFAULT_AUTORUN_PRIORITY;
    }

    // Create a new scope for this function
    var scope = new Scope(fn, context, priority, name, onExecuteCb, onExecuteContext);

    // If this is a subscope, add it to its parent's list of subscopes, and add a reference
    // to the parent scope.
    if (!detached && currentExecutingScope) {
        currentExecutingScope.subScopes.push(scope);
        scope.parentScope = currentExecutingScope;
    }

    // Run the associated function (and bind associated models)
    scope.execute();

    // Return the scope object; this is used by BaseView to destroy
    // scopes when the associated view is destroyed.
    return scope;
}

function runOnlyOnce (fn) {
    var alreadyRun;
    autorun(function () {
        if (!alreadyRun) {
            fn();
        }
    });
    alreadyRun = true;
}
