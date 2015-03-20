TBone [![GitHub version](https://badge.fury.io/gh/appneta%2Ftbone.png)](https://badge.fury.io/gh/appneta%2Ftbone) [![Build Status](https://travis-ci.org/appneta/tbone.png)](https://travis-ci.org/appneta/tbone)
=====

### Dataflow-Oriented Programming for JavaScript

TBone brings the power and expressive ease of live HTML templates to
JavaScript code, giving you the ability to build complex applications
using declarative/idempotent code.

TBone concepts:

- `tbone.models.base`:
  - Set data to it via `.query(prop, value)`.
  - Read and bind to data via `.query(prop)`.
  - Supports deep-lookups and deep-binding, e.g. `.query('users.2.name.first')`.
  - Supports Object, Array, Number, String, Date, null, and undefined.
- `tbone.models.bound`:
  - Extends `tbone.models.base`.
  - Instead of setting data via `query`, the data held is bound to the
    return value of a `state` function.
  - This `state` function can query values from other models as part of
    its calculation; whenever those other models are update, the `state`
    function is automatically re-run in order to recalculate.
- tbone.models.async:
  - Extends `tbone.models.bound`.
  - Similar to bound models, but the `state` function returns data via
    an async callback.
  - Handles update generations for you, preventing older, slower updates
    from overwriting newer, faster updates.
- `tbone.models.ajax`:
  - Extends `tbone.models.async`.
  - A special case of async model where the `state` function calls
    `.url()` to build a URL to GET. The `url` function can `query` other
    models to build the URL, enabling ajax models to respond to state
    transitions by fetching new data.

- `tbone.autorun`:
  - Creates a `FunctionRunner` that wraps a function, executes it,
    attaches bindings to all models `query`ed during execution, then
    re-runs the function whenever any of those bindings fire.
  - Execution is controlled by a central Scheduler that orders functions
    by priority and executes all waiting FunctionRunners synchronously
    after a 0ms-timeout. The short delay removes the need for using
    _.defer to prevent multiple bindings from causing multiple update
    calls to the same FunctionRunner.

### Example

```javascript
// Bind `fullname` to be the concatenation of `first` and `last`
T('fullname', function () {
    return T.text('first') + ' ' + T.text('last');
});

T('first', 'Sally'); // Set `first` to 'Sally'
T('last', 'Smith'); // Set `last` to 'Smith'

// Set `last` to 'Rogers' after 2 seconds
setTimeout(function () {
    T('last', 'Rogers');
}, 2000);

// Create an auto-executing T-function that sets span text based on `fullname`
T(function () {
    $('span').text(T.text('fullname'));
    // -> "Sally Smith"
    // -> after 2 seconds, "Sally Rogers"
});
```

In addition to declarative-programming infrastructure, TBone provides
functions for rendering live templates/views, as well as models and
collections.

TBone was originally built as an extension upon [Backbone](http://backbonejs.org/).

## Download

* [Development version, with comments](//cdn.tbonejs.org/tbone-1.0.0.js) **62kb**
* [Production version, minified](//cdn.tbonejs.org/tbone-1.0.0.min.js) **5kb gzipped**

```html
Development: <script src="//cdn.tbonejs.org/tbone-1.0.0.js"></script>
Production: <script src="//cdn.tbonejs.org/tbone-1.0.0.min.js"></script>
```

## Requirements

* JQuery or Zepto.
* Underscore.js or Lodash.

## Contribute

Bugfix?  Cool new feature?  Alternate style?  Send us a pull request!

Below are some instructions for developing with TBone:

1. Make sure [Node.js](http://nodejs.org/) is installed.

1. Clone TBone

    ```bash
    $ git clone git@github.com:appneta/tbone.git
    $ cd tbone
    ```

1. We use [gulp](http://gulpjs.com/) to develop, test, and compile TBone
   into `/dist`:

    ```bash
    $ npm install -g gulp
    $ npm install
    $ gulp
    ```

1. Create a feature branch and make some code changes

1. Add unit tests (in `/test`) and ensure your tests pass by running
   `gulp`.

1. Send us a detailed pull request explaining your changes.

## The Three (or Four) Tenets of TBone

### run: `T(fn)`

Run **fn** now, and again anytime its dependencies change.

- **fn**: Function.  This is executed immediately.  **fn** will get re-run
  again anytime the T-references it makes change.  Thus, generally **fn**
  should be [idempotent](http://en.wikipedia.org/wiki/Idempotence#Computer_science_meaning),
  though advanced users may find other strategies useful.

### get: `T(prop)`

Gets **prop** and bind current T-function to changes in it.

- **prop**: String.  e.g. 'name' or 'person.name.first'

### set value: `T(prop, value)`

Sets **prop** to **value**.

- **prop**: String.  e.g. 'name' or 'person.name.first'.
- **value**: any serializable object (String, Number, Array, Object, Date),
  or a TBone/Backbone model/collection.

### set function: `T(prop, fn)`

Binds **prop** to the live result of **fn**

- **prop**: String.  e.g. 'name' or 'person.name.first'.
- **fn**: Function.  The return value of this function will be set to **prop**.
  This function gets re-run any time its dependencies change.

## TBone Models

`T` (or `tbone`) is just a TBone model.  You can make more!

- `tbone.models.base`: Base TBone Model
- `tbone.models.bound`: The base class for models that are bound to source data
  via a function.  This is used to implement `T(prop, fn)`.
- `tbone.models.async`: Asynchronous version of the bound model.  Prevents callbacks
  from setting data for out-of-date updates.
- `tbone.models.ajax`: Binds to an ajax endpoint specified by the **url** function
  you define.  Only makes ajax requests when a View depends on this data either
  directly or through a chain of bound models.
- `model.extend(prototypeProperties)`: Creates your very own TBone Model prototype.
- `model.make(instanceProperties)`: Make a new model instance.

### Model methods

- `model(...)`: Models are callable, using the Three (or Four) Tenets of TBone above.
- `model.query(prop, [value])`: Look up **prop**, and either return the current value
  or set it to **value** if specified.
- `model.queryModel(prop)`: Look up **prop** and return the the model found there
  instead of extracting its data.
- `model.toggle(prop)`: sets **prop** to !**prop**, i.e. alternate between
  true and false.
- `model.push(prop, value)`: Add **value** at the end of the list at **prop**.
- `model.unshift(prop, value)`: Insert **value** at beginning of the list at
  **prop**.
- `model.removeFirst(prop)`: Remove the first item from the list at **prop**,
  like `shift` except that you don't get the value back.
- `model.removeLast(prop)`: Remove the last item from the list at **prop**,
  like `pop` except that you don't get the value back.
- `model.unset(prop)`: Delete the specified property.  Practically equivalent
  to using `model.query(prop, undefined)`.
- `model.increment(prop, number)`: Adds **number** to **prop**.  Use a negative
  number to subtract.

### Model properties

- `model.url`: Override this to set either a URL or function that returns
  a URL to fetch data via XHR.  If a function, you can use T-references to
  make this model re-fetch data on a property change (e.g. applying a filter).
- `model.state`: Override this with a function to generate this model's data.
  This has similar utility to `T(prop, fn)`.

### Collections

TBone Collections are a subclass of Model.  The main difference is that the
root data item is an Array instead of an Object.  Define **model** in a
subclass to automatically create models of that type via **add**.

- `tbone.collections.base`: Base TBone Collection.
- `collection.extend`, `collection.make`, etc.: Same as for Models.
- `collection.add(modelOrData)`: Add a model to the collection.  If raw data
  is passed instead, a model (of type specified by the **model** property of
  the collection) is created automatically.
- `collection.remove(modelOrId)`: Remove a model from the collection.

To query for a model in a collection, use the pound sign (#) followed by the
ID of the model.  For example, `T('users.#42.name')`.

## Even more fun stuff!

- `TBONE_DEBUG`: Set to true just before loading TBone in order to enable
  debug output & features (not available using Production minified source).
- `tbone.freeze()`: Freeze the page; no further TBone updates will occur.
- `tbone.watchLog(query)`: Output log information to the console for **query**.
  Interesting things to try: 'scheduler', 'exec', 'lookups', or the name of
  View/Model/Collection.
- `tbone.noConflict()`: Reset `T` and `tbone` to what they were before TBone
  loaded.
- `tbone.isReady()`: There are no pending Model/View updates, including ajax
  models that are waiting for XHRs to finish.  This is helpful for automated
  testing to determine that the page has "settled".
- `tbone.getListeners(model)`: Returns list of all the unique listeners
  that [recursively!] depend on **model**.
- `tbone.hasViewListener(model)`: Returns true if a View is listening
  either directly or indirectly (i.e. through other model dependencies) for
  changes to **model**.  This is used internally by TBone to prevent loading
  ajax data for any models that are not needed as part of the UI currently.
- `model.find(value)`: Search for **value**, and return the prop path of the
  first match found (using referential equality, ===).

## License

Copyright (c) 2012-2015 Dan Tillberg, AppNeta

TBone is freely redistributable under the MIT License.  See LICENSE for details.
