/**
 * @const
 */
var RECENTLY_CHANGED_NONE;

/**
 * @const
 */
var RECENTLY_CHANGED_TBONE = 1;

/**
 * @const
 */
var RECENTLY_CHANGED_ANGULAR = 2;

function doDigest () {
    var $scope = this;
    if ($scope['$root'] && $scope['$root']['$$phase'] !== '$digest') {
        // console.log('queueing scope digest');
        $scope['$digest']();
    } else {
        // console.log('not queueing scope digest; already in digest phase');
    }
}

var angTData = {};
function getTData ($scope, create) {
    var id = $scope['$id'];
    if (create && !angTData[id]) {
        angTData[id] = {
            bindings: {},
            scopes: [],
            digestRunlet: new Runlet(doDigest, $scope, BASE_PRIORITY_VIEW)
        };
    }
    return angTData[id];
}

var angular = root.angular;
if (angular) {
    var scopesToDigest = [];
    var scopeDigestTimer;
    var queueRunletDigest = function ($scope) {
        if (!scopeDigestTimer) {
            scopeDigestTimer = setTimeout(digestRunlets, 0);
        }
        scopesToDigest.push($scope);
    };

    angular
        .module('tbone', [])
        .run(['$rootRunlet', function ($rootRunlet) {
            $rootRunlet['$tbind'] = function (dest, src, opts) {
                var $scope = this;
                var recentlyChanged = RECENTLY_CHANGED_NONE;
                if (!opts) { opts = {}; }

                var tdata = getTData($scope, true);

                // Create a TBone scope to propagate TBone model changes to the Angular $scope.
                var runlet = this.$trun(function () {
                    if (recentlyChanged !== RECENTLY_CHANGED_ANGULAR) {
                        $scope[dest] = T(src);
                        // console.log('src ' + src + ' is', $scope[dest]);
                        recentlyChanged = RECENTLY_CHANGED_TBONE;
                        tdata.digestRunlet.trigger();
                    }
                    recentlyChanged = RECENTLY_CHANGED_NONE;
                }, BASE_PRIORITY_VIEW);

                var deregister;
                if (opts.twoWay) {
                    // Watch the Angular $scope for property changes to propagate to the TBone model.
                    deregister = $scope['$watch'](dest, function (newValue) {
                        if (recentlyChanged !== RECENTLY_CHANGED_TBONE) {
                            T(src, newValue);
                            recentlyChanged = RECENTLY_CHANGED_ANGULAR;
                        }
                        recentlyChanged = RECENTLY_CHANGED_NONE;
                    });
                }
                tdata.bindings[dest] = {
                    runlet: runlet,
                    deregister: deregister || noop
                };
            };

            $rootRunlet['$tbind2'] = function (dest, src, opts) {
                return this['$tbind'](dest, src, _.extend({}, opts, { twoWay: true }));
            };

            $rootRunlet['$tunbind'] = function (dest) {
                // console.log('$tunbinding ' + dest);
                var bindings = getTData(this).bindings;
                var binding = bindings[dest];
                binding.runlet.destroy();
                binding.deregister();
                delete bindings[dest];
            };

            $rootRunlet['$trun'] = function (fn, priority) {
                var runlet = T(fn, priority);
                runlet.isView = true; // it's almost true
                getTData(this, true).scopes.push(runlet);
                return runlet;
            };

            var origDestroy = $rootRunlet['$destroy'];
            $rootRunlet['$destroy'] = function () {
                var self = this;
                var tdata = getTData(self);
                if (tdata) {
                    _.each(_.keys(tdata.bindings), function (key) {
                        self['$tunbind'](key);
                    });
                    _.each(_.keys(tdata.runlets), function (runlet) {
                        runlet.destroy();
                    });
                    tdata.digestRunlet.destroy();
                    delete angTData[self['$id']];
                }
                return origDestroy.apply(self, arguments);
            };
        }]);
}
