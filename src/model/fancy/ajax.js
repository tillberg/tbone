/**
 * model/fancy/ajax.js
 */

models['ajax'] = asyncModel.extend({

    'state': function (dataCallback) {
        var self = this;
        var myXhr;
        function complete() {
            if (myXhr) {
                inflight--;
                myXhr = null;
                self['onComplete']();
            }
        }

        var url = self.url();
        if (url != null && url !== self.fetchedUrl) {
            /**
             * If a defined URL function returns null, it will prevent fetching.
             * This can be used e.g. to prevent loading until all required
             * parameters are set.
             **/
            self.fetchedUrl = url;
            self['abortPrevious']();
            if (self['clearOnFetch']) {
                self.clear();
            }
            sync('read', self, {
                'dataType': self.dataType,
                'success': function (resp) {
                    /**
                     * dataCallback returns true if this update was accepted (i.e.
                     * is of the current async update generation).  So only fire
                     * the postFetch callback, etc, when the update actually sticks.
                     */
                    if (dataCallback(self.parse(resp))) {
                        self['postFetch']();
                        self.trigger('fetch');
                        log(INFO, self, 'updated', self.attributes);
                    }
                },
                'complete': complete,
                'beforeSend': function (xhr) {
                    inflight++;
                    myXhr = xhr;
                    xhr['__tbone__'] = true;
                },
                'url': url
            });
        }
        return {
            onAbort: function () {
                // If we have an active XHR in flight, we should abort
                // it because we don't want that anymore.
                if (myXhr) {
                    log(WARN, self, 'abort',
                        'aborting obsolete ajax request. old url: <%=oldurl%>', {
                        'oldurl': self.fetchedUrl
                    });
                    myXhr.abort();
                    complete();
                }
            }
        };
    },

    'parse': identity,

    /**
     * By default, async models will use $.ajax to fetch data; override this
     * with something else if desired.
     */
    'ajax': function () {
        return $.ajax.apply($, arguments);
    },

    'postFetch': noop,

    'onComplete': noop,

    'clearOnFetch': true, // XXX move to async model

    'sleepEnabled': true,

    'dataType': 'text' // 'text' or 'json'

});
