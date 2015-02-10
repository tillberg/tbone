var React = window.React;
if (React) {
    var IS_WILL_UPDATE = 1;
    var IS_POST_RENDER = 2;

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
                    // console.log('update queued for ' + inst._currentElement.type.displayName);
                    inst.forceUpdate();
                    // console.log(inst.getDOMNode());
                } else {
                    // console.log('update NOT queued for ' + inst._currentElement.type.displayName);
                }
            }
        }
        function getWrapperFn (origFn, special) {
            return function () {
                var self = this, args = arguments;
                if (special === IS_WILL_UPDATE) {
                    cleanUpTScopes(self);
                    self.hasUpdateQueued = false;
                }
                var rval;
                var componentDidRender = special === IS_POST_RENDER && origOpts.componentDidRender;
                if (origFn || componentDidRender) {
                    var firstRun = true;
                    var tscope = T(function () {
                        if (firstRun) {
                            if (origFn) {
                                rval = origFn.apply(self, args);
                            }
                            if (componentDidRender) {
                                componentDidRender.call(self);
                            }
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
        }
        var opts = _.extend({}, origOpts, {
            componentWillUnmount: function () {
                cleanUpTScopes(this);
                if (origOpts.componentWillUnmount) {
                    return origOpts.componentWillUnmount.apply(this, arguments);
                } else {
                    return undefined;
                }
            },
            componentWillUpdate: getWrapperFn(origOpts.componentWillUpdate, IS_WILL_UPDATE),
            componentDidUpdate: getWrapperFn(origOpts.componentDidUpdate, IS_POST_RENDER),
            componentDidMount: getWrapperFn(origOpts.componentDidMount, IS_POST_RENDER),
            render: getWrapperFn(origOpts.render)
        });

        return origCreateClass(opts);
    };
}
