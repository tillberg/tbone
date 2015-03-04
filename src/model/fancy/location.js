/**
 * model/fancy/location.js
 */

function changePathGen (method) {
    return function changePath(path) {
        root.history[method + 'State']({}, '', path);
        $(root).trigger(method + 'state');
    };
}

models.location = baseModel.extend({
    /**
     * Example:
     * var loc = tbone.models.location.make();
     * T(function () {
     *     console.log('the hash is ' + loc('hash'));
     * });
     * loc('hash', '#this-is-the-new-hash');
     */
    initialize: function initialize() {
        var self = this;
        var recentlyChanged;
        function update (ev) {
            var changed = self('hash') !== location.hash ||
                          self('search') !== location.search ||
                          self('pathname') !== location.pathname;
            if (changed) {
                self('hash', location.hash);
                self('pathname', location.pathname);
                self('search', location.search);
                recentlyChanged = true;
            }
        }
        $(root).bind('hashchange popstate pushstate replacestate', update);
        update();

        autorun(function initializeAutorun() {
            var pathname = self('pathname');
            var search = self('search');
            var hash = self('hash');
            if (!recentlyChanged) {
                self.pushPath(pathname + (search || '') + (hash ? '#' + hash : ''));
            }
            recentlyChanged = false;
        });
    },

    pushPath: changePathGen('push'),
    replacePath: changePathGen('replace')
});
