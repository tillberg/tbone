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

    $rootscope['$tbind'] = function (dest, src) {
        var $scope = this;
        var tscope = T(function () {
            $scope[dest] = T(src);
            if ($scope['$root']['$$phase'] !== '$digest') {
                queueScopeDigest($scope);
            }
        }, BASE_PRIORITY_VIEW);
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
