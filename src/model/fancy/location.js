/**
 * model/fancy/location.js
 */

function changePathGen (method) {
    return function (path) {
        window['history'][method + 'State']({}, '', path);
        $(window).trigger(method + 'state');
    };
}

models['location'] = baseModel.extend({
    /**
     * Example:
     * var loc = tbone.models.location.make();
     * T(function () {
     *     console.log('the hash is ' + loc('hash'));
     * });
     * loc('hash', '#this-is-the-new-hash');
     */
    initialize: function () {
        var self = this;
        function updateHash () {
            self('hash', location.hash);
        }
        function updatePath () {
            self('pathname', location.pathname);
        }

        $(window).bind('hashchange', updateHash);
        $(window).bind('popstate pushstate replacestate', updatePath);
        updateHash();
        updatePath();

        self(function () {
            var hash = self('hash');
            if (location.hash !== hash) {
                location.hash = hash;
            }
        });
        self(function () {
            var pathname = self('pathname');
            if (location.pathname !== pathname) {
                self['pushPath'](pathname);
            }
        });
    },

    'pushPath': changePathGen('push'),

    'replacePath': changePathGen('replace')
});
