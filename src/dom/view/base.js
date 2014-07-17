/**
 * dom/view/base.js
 */

var renderDepth = 0;

var baseView = {
    make: function (opts) {
        var instance = {};
        _.extend(instance, this);
        instance['initialize'](opts);
        return instance;
    },
    'extend': function (subclass) {
        return _.extend({}, this, subclass, { parentView: this });
    },

    '$': function(selector) {
        return this['$el'].find(selector);
    },

    isView: true,

    'initialize': function (opts) {
        var self = this;
        uniqueId(self);
        _.extend(self, opts);
        self['$el'] = $(self['el']);
        self['el']['view'] = self;
        self.priority = self.domParentView ? self.domParentView.priority - 1 : BASE_PRIORITY_VIEW;
        self.scope = autorun(self.render, self.priority, self, 'view_' + self['Name'],
                             self.onScopeExecute, self, true);
    },

    onScopeExecute: function (scope) {
        log(INFO, this, 'lookups', scope.lookups);
    },

    /**
     * View.destroy
     *
     * Destroys this view, removing all bindings and sub-views (recursively).
     */
    destroy: function (destroyRoot) {
        var self = this;
        log(VERBOSE, self, 'destroy', 'due to re-render of ' + destroyRoot['Name']);
        self.destroyed = true;
        self.scope.destroy();
        _.each(self.subViews || [], function (view) {
            view.destroy(self);
        });
        self['destroyDOM'](self.$el);
    },

    /**
     * View.render
     *
     * This function is called at View init, and again whenever any model properties that this View
     * depended on are changed.
     */
    render: function () {
        var self = this;
        // This view may get a reset call at the same instant that another
        // view gets created to replace it.
        if (self.destroyed) { return; }

        logRender(self);
        renderDepth++;

        if (self.templateId) {
            /**
             * If the DOM fragment to be removed has an active (focused) element, we attempt
             * to restore that focus after refreshing this DOM fragment.  We also attempt
             * to restore the selection start/end, which only works in Webkit/Gecko right
             * now; see the URL below for possible IE compatibility.
             */
            var activeElement = document.activeElement;
            var activeElementSelector, activeElementIndex, selectionStart, selectionEnd;
            if (_.contains($(activeElement).parents(), self.el)) {
                // XXX this could be improved to pick up on IDs/classes/attributes or something?
                activeElementSelector = 'input';
                activeElementIndex = _.indexOf(self.$(activeElementSelector), activeElement);
                // XXX for IE compatibility, this might work:
                // http://the-stickman.com/web-development/javascript/ ...
                // finding-selection-cursor-position-in-a-textarea-in-internet-explorer/
                // The selectionStart and selectionEnd properties are unsupported for
                // some input types.  It's easier to just eat the exception than identify
                // which cases will and won't work.
                try {
                    selectionStart = activeElement.selectionStart;
                    selectionEnd = activeElement.selectionEnd;
                } catch (e) {}
            }

            /**
             * Move all this view's children to another temporary DOM element.  This will be used as the
             * pseudo-parent element for the destroyDOM call.
             */
            var $old = $('<div>').append(this.$el.children());
            var newHtml = renderTemplate(self.templateId, self);
            log(INFO, self, 'newhtml', newHtml);
            self.$el.html(newHtml);

            /**
             * Execute the "fragment ready" callback.
             */
            self['ready']();
            self['postReady']();

            /**
             * (Re-)create sub-views for each descendent element with a tbone attribute.
             * On re-renders, the pre-existing list of sub-views is passed to render, which
             * attempts to pair already-rendered views with matching elements in this view's
             * newly re-rendered template.  Matching views are transferred to the new DOM
             * hierarchy without disruption.
             */
            var oldSubViews = self.subViews || [];
            self.subViews = render(self.$('[tbone]'), self, oldSubViews);
            var obsoleteSubViews = _.difference(oldSubViews, self.subViews);

            /**
             * Destroy all of the sub-views that were not reused.
             */
            _.each(obsoleteSubViews, function (view) {
                view.destroy(self);
            });

            /**
             * Call destroyDOM with the the pseudo-parent created above.  This DOM fragment contains all
             * of the previously-rendered (if any) DOM structure of this view and subviews, minus any
             * subviews that are being reused (which have already been moved to the new parent).
             */
            self['destroyDOM']($old);

            /**
             * If we saved it above, restore the active element focus and selection.
             */
            if (activeElementSelector) {
                var newActiveElement = self.$(activeElementSelector)[activeElementIndex];
                if (newActiveElement) {
                    $(newActiveElement).focus();
                    if (selectionStart != null && selectionEnd != null) {
                        try {
                            newActiveElement.selectionStart = selectionStart;
                            newActiveElement.selectionEnd = selectionEnd;
                        } catch (e) {}
                    }
                }
            }
        } else {
            self['ready']();
            self['postReady']();
        }

        self['postRender']();
        viewRenders++;
        renderDepth--;
    },

    /**
     * View.ready
     *
     * The "template-ready" callback.  This is the restricted tbone equivalent of document-ready.
     * It is the recommended means of adding interactivity/data/whatever to Views.
     *
     * At the moment this callback is executed, subviews are neither rendered nor are they
     * attached to the DOM fragment.  If you need to interact with subviews, use postRender.
     */
    'ready': noop,

    /**
     * View.postReady
     *
     * This is the same as ready, except that it executes after ready.  The typical use case is
     * to override this in your base template to provide automatic application-wide helpers,
     * such as activating a tooltip library, and to use View.ready for specific view logic.
     */
    'postReady': noop,

    /**
     * View.postRender
     *
     * The "fragment-updated" callback.  This is executed whenever this view is re-rendered,
     * and after all sub-views (recursively) have rendered.
     *
     * Note that because we optimistically re-use sub-views, this may be called multiple times
     * with the same sub-view DOM fragments.  Ensure that anything you do to DOM elements in
     * sub-views is idempotent.
     */
    'postRender': noop,

    /**
     * View.destroyDOM
     *
     * The "document-destroy" callback.  Use this to do cleanup on removal of old HTML, e.g.
     * destroying associated tooltips.
     *
     * Note: Destroy contents of the $el parameter, not this.$el!  (XXX make this less error-prone)
     *
     * @param  {!jQuery} $el jQuery selection of DOM fragment to destroy
     */
    'destroyDOM': function ($el) { },

    /**
     * If a root attribute was specified, use that as the root object for this view's
     * render, both in templating automatically as well as available via this.root in
     * `ready` and `postRender` callbacks.
     */
    root: function () {
        return this['query'](DONT_GET_DATA);
    },

    /**
     * Perform a query relative to the view's rootObj and rootStr, delegating to
     * rootObj for the actual query but prepending rootStr to the prop string.
     **/
    'query': function (flag, prop, value) {
        var isSet = false;
        if (typeof flag !== 'number') {
            /**
             * If no flag provided, shift the prop and value over.  We do it this way instead
             * of having flag last so that we can type-check flag and discern optional flags
             * from optional values.  And flag should only be used internally, anyway.
             */
            value = prop;
            prop = flag;
            flag = 0;
            /**
             * Use arguments.length to switch to set mode in order to properly support
             * setting undefined.
             */
            isSet = arguments.length === 2;
        }
        prop = (this.rootStr ? this.rootStr + '.' : '') + (prop || '');
        return isSet ? this.rootObj(flag, prop, value) : this.rootObj(flag, prop);
    },

    'parentRoot': function () {
        return this.domParentView && this.domParentView.root();
    },

    /**
     * Get the DOM parent view, i.e. the view associated with the closest
     * ancestor DOM node that is a view root element.
     */
    'parent': function () {
        return this.domParentView;
    },

    // These are used at template render.  They're really not properties of views so much
    // as it is useful to reference these functions on the view, which is what we pass to
    // _.template already.
    'getHashId': getHashId,
    'isQueryable': isQueryable,
    'denullText': denullText

};

var defaultView = baseView;
/**
 * Set the default View to use when rendering templates with no matching View.
 * @param {ViewPrototype} view
 */
function setDefaultView(view) {
    defaultView = view;
}
