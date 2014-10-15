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
    // `this` is an angular scope
    this['$digest']();
}

var angTData = {};
function getTData ($scope, create) {
    var id = $scope['$id'];
    if (create && !angTData[id]) {
        angTData[id] = {
            'bindings': {},
            'digestScope': new Scope(doDigest, $scope, BASE_PRIORITY_VIEW)
        };
    }
    return angTData[id];
}

tbone['initAngular'] = function ($rootscope) {
    var scopesToDigest = [];
    var scopeDigestTimer;
    function queueScopeDigest ($scope) {
        if (!scopeDigestTimer) {
            scopeDigestTimer = setTimeout(digestScopes, 0);
        }
        scopesToDigest.push($scope);
    }

    $rootscope['$tbind'] = function (dest, src, opts) {
        var $scope = this;
        var recentlyChanged = RECENTLY_CHANGED_NONE;
        if (!opts) { opts = {}; }

        var tdata = getTData($scope, true);

        // Create a TBone scope to propagate TBone model changes to the Angular $scope.
        var tscope = T(function () {
            if (recentlyChanged !== RECENTLY_CHANGED_ANGULAR) {
                $scope[dest] = T(src);
                // console.log('src ' + src + ' is', $scope[dest]);
                recentlyChanged = RECENTLY_CHANGED_TBONE;
                if ($scope['$root']['$$phase'] !== '$digest') {
                    // console.log('queueing scope digest');
                    tdata['digestScope'].trigger();
                } else {
                    // console.log('not queueing scope digest; already in digest phase');
                }
            }
            recentlyChanged = RECENTLY_CHANGED_NONE;
        }, BASE_PRIORITY_VIEW);
        tscope['$angscope'] = $scope;
        tscope['isView'] = true; // well, it's almost true...

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

        tdata['bindings'][dest] = {
            tscope: tscope,
            deregister: deregister || noop
        };
    };

    $rootscope['$tbind2'] = function (dest, src, opts) {
        return this['$tbind'](dest, src, _.extend({}, opts, { twoWay: true }));
    };

    $rootscope['$tunbind'] = function (dest) {
        // console.log('$tunbinding ' + dest);
        var bindings = getTData(this)['bindings'];
        var binding = bindings[dest];
        binding.tscope['destroy']();
        delete binding.tscope['$angscope'];
        binding.deregister();
        delete bindings[dest];
    };

    var origDestroy = $rootscope['$destroy'];
    $rootscope.$destroy = function () {
        var self = this;
        var tdata = getTData(self);
        if (tdata) {
            _.each(_.keys(tdata['bindings']), function (key) {
                self['$tunbind'](key);
            });
            tdata['digestScope']['destroy']();
            delete angTData[self['$id']];
        }
        return origDestroy.apply(self, arguments);
    };
};
