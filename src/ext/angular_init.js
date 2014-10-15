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

tbone['initAngular'] = function ($rootscope) {
    var scopesToDigest = [];
    var scopeDigestTimer;
    function digestScopes () {
        scopeDigestTimer = null;
        // console.log('digesting ' + _.uniq(scopesToDigest).length + ' scopes due to ' + scopesToDigest.length + ' changes.');
        _.each(_.uniq(scopesToDigest), function ($scope) {
            $scope.$digest();
        });
        scopesToDigest = [];
    }
    function queueScopeDigest ($scope) {
        if (!scopeDigestTimer) {
            scopeDigestTimer = setTimeout(digestScopes, 0);
        }
        scopesToDigest.push($scope);
    }

    $rootscope['$tbind'] = function (dest, src, opts) {
        var $scope = this;
        var recentlyChanged = RECENTLY_CHANGED_NONE;

        // Create a TBone scope to propagate TBone model changes to the Angular $scope.
        var tscope = T(function () {
            if (recentlyChanged !== RECENTLY_CHANGED_ANGULAR) {
                $scope[dest] = T(src);
                recentlyChanged = RECENTLY_CHANGED_TBONE;
                if ($scope['$root']['$$phase'] !== '$digest') {
                    // console.log('queue scope digest');
                    queueScopeDigest($scope);
                }
            }
            recentlyChanged = RECENTLY_CHANGED_NONE;
        }, BASE_PRIORITY_VIEW);
        tscope['$angscope'] = $scope;
        tscope['isView'] = true; // well, it's almost true...

        // Watch the Angular $scope for property changes to propagate to the TBone model.
        var deregister = $scope['$watch'](dest, function (newValue) {
            if (recentlyChanged !== RECENTLY_CHANGED_TBONE) {
                T(src, newValue);
                recentlyChanged = RECENTLY_CHANGED_ANGULAR;
            }
            recentlyChanged = RECENTLY_CHANGED_NONE;
        });

        if (!$scope['$tbone']) {
            $scope['$tbone'] = { 'bindings': {} };
        }
        $scope['$tbone']['bindings'][dest] = {
            tscope: tscope,
            deregister: deregister
        };
    };

    $rootscope['$tunbind'] = function (dest) {
        var bindings = this['$tbone']['bindings'];
        var binding = bindings[dest];
        binding.tscope['destroy']();
        delete binding.tscope['$angscope'];
        binding.deregister();
        delete bindings[dest];
    };

    var origDestroy = $rootscope['$destroy'];
    $rootscope.$destroy = function () {
        var self = this;
        if (self['$tbone']) {
            _.each(_.keys(self['$tbone']['bindings']), function (key) {
                self['$tunbind'](key);
            });
            delete self['$tbone'];
        }
        return origDestroy.apply(self, arguments);
    };
};
