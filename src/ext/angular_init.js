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
        var tscope = T(function () {
            if (recentlyChanged !== RECENTLY_CHANGED_ANGULAR) {
                $scope[dest] = T(src);
                recentlyChanged = RECENTLY_CHANGED_TBONE;
                if ($scope['$root']['$$phase'] !== '$digest') {
                    queueScopeDigest($scope);
                }
            }
            recentlyChanged = RECENTLY_CHANGED_NONE;
        }, BASE_PRIORITY_VIEW);
        $scope['$watch'](dest, function (newValue) {
            if (recentlyChanged !== RECENTLY_CHANGED_TBONE) {
                T(src, newValue);
                recentlyChanged = RECENTLY_CHANGED_ANGULAR;
            }
            recentlyChanged = RECENTLY_CHANGED_NONE;
        });
        tscope['$angscope'] = $scope;
        if (!$scope['$tscopes']) {
            $scope['$tscopes'] = [];
        }
        $scope['$tscopes'].push(tscope);
    };

    var origDestroy = $rootscope['$destroy'];
    $rootscope.$destroy = function () {
        if (this['$tscopes']) {
            _.each(this['$tscopes'], function (tscope) {
                tscope['destroy']();
                delete tscope['$angscope'];
            });
            delete this['$tscopes'];
        }
        return origDestroy.apply(this, arguments);
    };
};
