/**
 * dom/view/render.js
 */

/**
 * Use to find key/value pairs in tbone attributes on render.
 * @type {RegExp}
 * @const
 */
var rgxTBoneAttribute = /[^\w.]*([\w.]+)[^\w.]+([\w.]+)/g;

/**
 * tbone.render
 *
 * Render an array of HTML elements into Views.  This reads the tbone attribute generates a View
 * for each element accordingly.
 *
 * @param  {Array.<DOMElement>}     $els     elements to render templates from
 * @param  {Backbone.View=}         parent   parent view
 * @param  {Array.<Backbone.View>=} subViews (internal) sub-views created previously; these are used
 *                                           to avoid redundantly regenerating unchanged views.
 * @return {Array.<Backbone.View>}           views created (and/or substituted from subViews)
 */
function render($els, parent, subViews) {
    var subViewMap = {};
    _.each(subViews || [], function (subView) {
        (subViewMap[subView.origOuterHTML] = subViewMap[subView.origOuterHTML] || []).push(subView);
    });
    return _.map($els, function (el) {
        var $this = $(el);
        var outerHTML = el.outerHTML;
        var view = el.__tboneview__;
        if (!view) {
            if (subViewMap[outerHTML] && subViewMap[outerHTML].length) {
                /**
                 * If we have a pre-rendered view available with matching outerHTML (i.e. nothing in
                 * the parent template has changed for this subview's root element), then just swap
                 * the pre-existing element in place along with its undisturbed associated View.
                 */
                var subView = subViewMap[outerHTML].shift();
                log(VERBOSE, parent || 'render', 'reuse', subView);
                $this.replaceWith(subView.el);
                view = subView;
            } else {
                /**
                 * Otherwise, read the tbone attribute from the element and use it to instantiate
                 * a new View.
                 */
                var props = {};
                ($this.attr('tbone') || '').replace(rgxTBoneAttribute, function(__, prop, value) {
                    props[prop] = value;
                });
                var inlineTemplateId = props.inline;
                if (inlineTemplateId) {
                    /**
                     * XXX what's the best way to get the original html back?
                     */
                    var origTemplateHtml = $this.html()
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&');
                    addTemplate(inlineTemplateId, origTemplateHtml);
                }
                var templateId = inlineTemplateId || props.tmpl;
                var viewId = props.view;
                var root = props.root;

                /**
                 * Use either the view or template attributes as the `name` of the view.
                 */
                var name = viewId || templateId;
                if (!name) {
                    error('No view or template was specified for this element: ', el);
                }

                /**
                 * Find the corresponding view matching the name (`viewId` or `templateId`) to the
                 * name passed to `createView.`  If there is no view matching that name, then use
                 * the default view.  You can set the default view using `tbone.defaultView().`
                 * @type {function(new:Backbone.View, Object)}
                 */
                var myView = views[name] || defaultView;

                /**
                 * Add a class matching the view name for CSS.
                 */
                $this.addClass(name);

                /**
                 * Also add a class for each of the parent views, if any.
                 */
                var parentView = myView.parentView;
                while (parentView && parentView.Name) {
                    $this.addClass(parentView.Name);
                    parentView = parentView.parentView;
                }

                var rootObj = hashedObjectCache[root] || tbone;

                var opts = {
                    'Name': name,
                    origOuterHTML: outerHTML,
                    'el': el,
                    templateId: templateId,
                    domParentView: parent,
                    rootObj: rootObj,
                    rootStr: hashedObjectCache[root] ? '' : root
                };

                // This could potentially miss some cached objects (e.g.
                // if the subview was removed during view-ready execution)
                // Might be simpler just to clear hashedObjectCache when
                // the drainQueue finishes?
                delete hashedObjectCache[root];

                view = myView.make(opts);
            }
            el.__tboneview__ = view;
        }
        return view;
    });
}
