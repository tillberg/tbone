var React = window['React'];
if (React) {
	var origCreateClass = React['createClass'];
	React['createClass'] = function (origOpts) {
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
				inst.forceUpdate();
			}
		}
		function getWrapperFn (origFn, isFirstWrappedEvent) {
			if (origFn || isFirstWrappedEvent) {
				return function () {
					var self = this;
					if (isFirstWrappedEvent) {
						cleanUpTScopes(self);
						self.hasUpdateQueued = false;
					}
					var rval;
					if (origFn) {
						var firstRun = true;
						var tscope = T(function () {
							if (firstRun) {
								rval = origFn.call(self);
								firstRun = false;
							} else {
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

		var opts = _.extend({}, origOpts, {
			componentWillUnmount: function () {
				cleanUpTScopes(this);
				if (origOpts.componentWillUnmount) {
					return origOpts.componentWillUnmount.apply(this, arguments);
				} else {
					return undefined;
				}
			},
			componentWillUpdate: getWrapperFn(origOpts.componentWillUpdate, true),
			componentDidUpdate: getWrapperFn(origOpts.componentDidUpdate, false),
			render: getWrapperFn(origOpts.render, false)
		});
		return origCreateClass(opts);
	};
}
