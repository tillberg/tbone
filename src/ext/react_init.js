var React = window.React;
if (React) {
    var IS_WILL_UPDATE = 1;
    var IS_DID_MOUNT = 2;
    var IS_DID_UPDATE = 3;

    var origCreateClass = React.createClass;
    React.createClass = function (origOpts) {
        function cleanUpMountTScopes (inst) {
            _.each(inst.__tbone__.mount, function (tscope) {
                tscope.destroy();
            });
            inst.__tbone__.mount = [];
        }
        function cleanUpRenderTScopes (inst) {
            _.each(inst.__tbone__.render, function (tscope) {
                tscope.destroy();
            });
            inst.__tbone__.render = [];
        }
        function doUpdate (inst) {
            if (!inst.hasUpdateQueued) {
                inst.__tbone__.hasUpdateQueued = 1;
                cleanUpRenderTScopes(inst);
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
                var self = this;
                var args = arguments;
                if (special === IS_WILL_UPDATE) {
                    cleanUpRenderTScopes(self);
                    self.__tbone__.hasUpdateQueued = 0;
                }
                var rval;
                var tscope;
                var isPostRender = special === IS_DID_UPDATE || special == IS_DID_MOUNT;
                if (origFn) {
                    var firstRun = true;
                    tscope = T(function () {
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
                    if (special === IS_DID_MOUNT) {
                        self.__tbone__.mount.push(tscope);
                    } else {
                        self.__tbone__.render.push(tscope);
                    }
                }
                if (isPostRender && origOpts.componentDidRender) {
                    tscope = T(origOpts.componentDidRender.bind(self), tbone.priority.view);
                    tscope.isView = true;
                    self.__tbone__.render.push(tscope);
                }
                return rval;
            };
        }
        var opts = _.extend({}, origOpts, {
            componentWillMount: function () {
                this.__tbone__ = {
                    mount: [],
                    render: [],
                };
                var origFn = origOpts.componentWillMount;
                if (origFn) {
                    return origFn.apply(this, arguments);
                }
            },
            componentWillUnmount: function () {
                cleanUpMountTScopes(this);
                cleanUpRenderTScopes(this);
                if (origOpts.componentWillUnmount) {
                    return origOpts.componentWillUnmount.apply(this, arguments);
                } else {
                    return undefined;
                }
            },
            componentWillUpdate: getWrapperFn(origOpts.componentWillUpdate, IS_WILL_UPDATE),
            componentDidUpdate: getWrapperFn(origOpts.componentDidUpdate, IS_DID_UPDATE),
            componentDidMount: getWrapperFn(origOpts.componentDidMount, IS_DID_MOUNT),
            render: getWrapperFn(origOpts.render)
        });

        return origCreateClass(opts);
    };
}
