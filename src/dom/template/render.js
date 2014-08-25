/**
 * dom/template/render.js
 */

/**
 * Render the named template with the specified view
 * @param {string} id
 * @param {View}   view
 */
function renderTemplate(id, view) {
    var template = templates[id];
    if (template == null) {
        // Attempt to lazy-load the template from a script tag, e.g.
        // <script name="<id>" type="text/tbone-tmpl">...</script>
        // The type doesn't matter, per se, but you should specify one so
        // as not to have your template parsed as javascript.
        template = $('script[name="' + id + '"]').html() || '';
    }
    if (typeof template === 'string') {
        template = templates[id] = initTemplate(template);
    }
    return template(view);
}
