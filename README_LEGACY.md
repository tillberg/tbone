
# Legacy Documentation

Please note that these features have been deprecated.

## TBone Views

- `tbone.createView(name, fn)`: Set the View "ready" function for **name**.
  Match this up to a template by syncing **name** with the template's **name**.
- `tbone.addTemplate(name, template)`: Register a new template, either a string
  or a function.  If a string is passed, it will be passed to _.template after
  re-writing variable references in the template as tbone queries.
- `tbone.dontPatch(prop)`: Don't tbone-query-patch variables starting with
  **prop** in tbone.addTemplate.  For example, if you have a formatting library
  at `window.stringz`, use `tl.dontPatch('stringz')` so that you can use
  stringz from within templates, e.g. `<%= stringz.formatMoney(account.balance) %>`.
- `tbone.render(elementArray)`: Render TBone Views/templates (recursively)
  for each of the DOM elements passed.  Most applications can kick off TBone
  with a single call to `tbone.render($('[tbone]'))`.
- `tbone.setDefaultView(view)`: Set the default View to use when rendering a
  template with no corresponding View.

### View methods

- `view.extend`, `view.make`: Same as for Models.
- `view.query(prop)`: Reads **prop** from the view's **root**.
- `view.$(selector)`: Query DOM elements inside this View.  Always use this
  instead of using the global `$(selector)`.

### View properties

- `view.el`: Root DOM element of the View.
- `view.$el`: JQuery selection of the root DOM element of the View.

Example:
```javascript
tbone.createView('widget', function () {
    this.$('span').text('42');
    this.$('a[href]').click(function () {
        tbone.set('selected.widget', $(this).attr('id'));
        return false;
    })
});
// => creates a view named widget that listens for user interaction and
//    sets the 'selected.widget'
```

### tbone DOM attribute

Views recursively render sub-Views by searching for [tbone] attributes, e.g.:

```html
<div tbone="tmpl awesomeTemplate"></div>
<div tbone="view superView"></div>
<div tbone="tmpl itemTemplate root items.3"></div>
```

Three properties can be specified in these tbone attributes:

- `tmpl <name>`: Renders the template named **name**.  Implies also that
  the View by the same name will also be run after rendering the template.
- `view <name>`: Executes the View named **name** on this element.
- `root <prop>`: Passes **prop** as the View's **root**, which can be used
  by the View ready function to look up properties on that object via
  `this.query(prop)`.
