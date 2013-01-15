# TBone

Automagic event-binding for Backbone.

TBone removes the complexity of manually managing data dependencies in Backbone,
enabling "live" templates as well functions that automatically re-execute when
the data they reference changes.

TBone is designed to scale with your application, enabling simple re-use of
data throughout your application without you needing to tell the page what
to update when that data changes.

At AppNeta, we've used TBone to eliminate a set of custom page events
corresponding such as "refresh data" and "add filter"; with a large application,
it becomes difficult to manage what exactly needs to be refreshed when something
changes.  While Backbone is a critical step toward reducing this complexity,
TBone enables us to do so without even thinking about event binding; every view
and model stays in sync by design and without unnecessary work.

## By Example

Let's create a model:

``` javascript
tbone.createModel('stapler').singleton();
```

This creates a new Backbone.Model with a .name of stapler as well as an instance
of that Model at tbone.data.stapler.

``` javascript
tbone.data.stapler.set('brand', 'Swingline');
```

Now, let's create a template:

``` javascript
tbone.addTemplate('onMyDesk', 'My <%=stapler.color%> <%=stapler.brand%> stapler.');
```

We can augment this with a view to add "document.ready" style JS after-processing.

``` javascript
tbone.createView('onMyDesk', function () {
	this.$el.css('background', tbone.lookup('stapler.color'));
});
var $el = jQuery('<div tmpl="onMyDesk"></div>').appendTo('body');
tbone.render($el);
```

What do we get?

```
My Swingline stapler.
```

Oh shoot!  We forgot to set the color.  No problem.  Just set it, and TBone rerenders
the template and view to keep in sync with its source data.

``` javascript
tbone.set('stapler.color', 'red');
```

[Try it out on JSFiddle](http://jsfiddle.net/dantillberg/dFbpE/)

## License

Copyright (c) 2012 Dan Tillberg, AppNeta

TBone is freely redistributable under the MIT License.  See LICENSE for details.
