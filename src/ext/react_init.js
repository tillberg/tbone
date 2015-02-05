var React = window.React;
if (React) {
    var origCreateClass = React.createClass;
    React.createClass = function (origOpts) {
        function cleanUpTScopes (inst) {
            _.each(inst.tscopes || [], function (tscope) {
                tscope.destroy();
            });
            inst.tscopes = null;
        }
        function doUpdate (inst) {
            if (!inst.hasUpdateQueued) {
                inst.hasUpdateQueued = true;
                cleanUpTScopes(inst);
                if (inst.isMounted()) {
                    inst.forceUpdate();
                    // console.log(inst.getDOMNode());
                }
            }
        }
        function getWrapperFn (origFn, isFirstWrappedEvent) {
            if (origFn || isFirstWrappedEvent) {
                return function () {
                    var self = this, args = arguments;
                    if (isFirstWrappedEvent) {
                        cleanUpTScopes(self);
                        self.hasUpdateQueued = false;
                    }
                    var rval;
                    if (origFn) {
                        var firstRun = true;
                        var tscope = T(function () {
                            if (firstRun) {
                                rval = origFn.apply(self, args);
                                // console.log('render', self._currentElement.type.displayName);
                                firstRun = false;
                            } else {
                                // console.log('update', self._currentElement.type.displayName);
                                doUpdate(self);
                            }
                        }, tbone.priority.view);
                        tscope.isView = true;
                        if (!self.tscopes) {
                            self.tscopes = [];
                        }
                        self.tscopes.push(tscope);
                    }
                    return rval;
                };
            } else {
                return undefined;
            }
        }

        var componentDidMount = origOpts.componentDidMount ? function () {
            var self = this, args = arguments;
            var rval;
            var tscope = T(function () {
                // Run and re-run componentDidMount until this component is
                // no longer mounted.
                if (self.isMounted()) {
                    rval = origOpts.componentDidMount.apply(self, args);
                }
            });
            tscope.isView = true;
            return rval;
        } : undefined;

        var opts = _.extend({}, origOpts, {
            componentWillUnmount: function () {
                cleanUpTScopes(this);
                if (origOpts.componentWillUnmount) {
                    return origOpts.componentWillUnmount.apply(this, arguments);
                } else {
                    return undefined;
                }
            },
            componentDidMount: componentDidMount,
            componentWillUpdate: getWrapperFn(origOpts.componentWillUpdate, true),
            componentDidUpdate: getWrapperFn(origOpts.componentDidUpdate, false),
            render: getWrapperFn(origOpts.render, false)
        });
        return origCreateClass(opts);
    };
}
