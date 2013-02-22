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

## Download

* [Development version](http://cdn.tbonejs.org/tbone-v0.2.js) *Uncompressed with Comments 60kb*
* [Production version](http://cdn.tbonejs.org/tbone-v0.2.min.js) *Minified 9.1kb*

## CDN

```html
<script src="http://cdn.tbonejs.org/tbone-v0.2.js"></script>
<script src="http://cdn.tbonejs.org/tbone-v0.2.min.js"></script>
```
## TBone

**set** tbone.set(object, value)

Sets a **object** (i.e. an attribute in a model) to a specified value.

```javascript
tbone.set('stapler.color', 'red');
=> sets stapler color attribute to red...
tbone.set('counter.value', 15);
=> sets counter value attribute to 15...
```

**lookup** tbone.lookup(object)

Returns a specified **object**.

```javascript
tbone.set('stapler.color');
=> returns 'red'...
tbone.set('counter.value');
=> returns 15...
```

**createModel** tbone.createModel(name, [baseModel], [options])

Creates your very own Tbone **Model**. You can us chaining to both create and
instantiate the **Model** with the `singleton()` method.

```javascript
tbone.createModel('tweet');
=> creates a model named tweet.
tbone.createModel('post').singleton();
=> create and instantiates a model named post.
```

**createView** tbone.createView(name, baseView, function, [options])

What it does!

```javascript
tbone...
```

**createCollection** tbone.createCollection(arg1, arg2, ...)

What it does!

```javascript
tbone...
```

**render** tbone.render(arg1, arg2, ...)

What it does!

```javascript
tbone...
```

**data** tbone.data

What it does!

```javascript
tbone...
```

## Models

**models** tbone.models

What it does!

```javascript
tbone...
```

## Views

**views** tbone.views

What it does!

```javascript
tbone...
```

## Templates

**templates** tbone.templates

What it does!

```javascript
tbone...
```

**tmpl**

Renders an externally-defined template, and executes the associated view.
You should load that template via tbone.addTemplate(id, templateHTML).

```html
<div tbone=""></div>
```

**inline**

Renders a template define inline, and executes the associated view.  (note:
This is not advised for complex applications, as there are some complications,
especially when using ERB-style delimeters, which are not valid HTML.)

```html
<div tbone=""></div>
```

**view**

Does not render any template for this node, but executes the associated view.

```html
<div tbone=""></div>
```

## License

Copyright (c) 2012 Dan Tillberg, AppNeta

TBone is freely redistributable under the MIT License.  See LICENSE for details.
