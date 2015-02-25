var React = window.React;
if (React) {
    var IS_WILL_UPDATE = 1;
    var IS_DID_MOUNT = 2;
    var IS_DID_UPDATE = 3;

    var origCreateClass = React.createClass;
    React.createClass = function (origOpts) {
        function myAutorun (fn, inst, name) {
            tscope = autorun(fn, tbone.priority.view, inst, inst.constructor.displayName + ':' + name, null, null, true);
            tscope.isView = true;
            return tscope;
        }

        function cleanUpTScopes(inst, key) {
            _.each(inst.__tbone__[key], function (tscope) {
                tscope.destroy();
            });
            inst.__tbone__[key] = [];
        }
        function cleanUpRenderTScopes (inst) {
            cleanUpTScopes(inst, 'render');
        }
        function doUpdate (inst) {
            if (!inst.hasUpdateQueued) {
                inst.__tbone__.hasUpdateQueued = 1;
                cleanUpRenderTScopes(inst);
                if (inst.isMounted()) {
                    // console.log('update queued for ' + inst._currentElement.type.displayName);
                    inst.forceUpdate();
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
                var isDidMount = special == IS_DID_MOUNT;
                var isPostRender = special === IS_DID_UPDATE || isDidMount;
                if (origFn) {
                    if (isDidMount) {
                        self.__tbone__.mount.push(myAutorun(origFn.bind(self), self, 'DidMount'));
                    } else {
                        var firstRun = true;
                        var name = isPostRender ? 'DidUpdate' :
                                   special ? 'WillUpdate' : 'Render';
                        self.__tbone__.render.push(myAutorun(function () {
                            if (firstRun) {
                                rval = origFn.apply(self, args);
                                // console.log('render', self._currentElement.type.displayName);
                                firstRun = false;
                            } else {
                                // console.log('update', self._currentElement.type.displayName);
                                doUpdate(self);
                            }
                        }, self, name));
                    }
                }
                if (isPostRender && origOpts.componentDidRender) {
                    self.__tbone__.render.push(myAutorun(origOpts.componentDidRender.bind(self), self, 'DidRender'));
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
                cleanUpTScopes(this, 'mount');
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
