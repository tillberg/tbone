/**
 * model/fancy/location.js
 */

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
        $(window).bind('hashchange', function () {
            updateHash();
        });
        updateHash();

        self(function () {
            var hash = self('hash');
            if (location.hash !== hash) {
                location.hash = hash;
            }
        });
    }
});
