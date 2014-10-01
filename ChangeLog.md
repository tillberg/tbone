## TBone Change Log

### 0.8.0

- Exposed `dataType` as a configurable ajax model property, and
  changed the default from 'text' to 'json'.
- Add log warnings when making ad hoc changes to a bound model.
- Add initial draft Angular support (unstable).
- Add bower support.

### 0.7.2

- Fix hasViewListener such that references inside T-functions in
  views wake the models they depend on.
- Add disableSleep function to bound models (for debug mode only).

### 0.7.1

- No longer suppresses JS errors during Scope execution, either
  in debug or release mode.
- Set default autorun/T-function priority higher than the
  default view/model priorities.
- Support auto-rendering subviews of views (you no longer need
  to explicitly call tbone.render).

### 0.7.0

- Refactored into three modules: core, core_ext, and full:
  - core includes base/bound models; this is intended for
    use where minimal footprint is needed (~3K gzipped)
  - core_ext adds async/ajax models, collections, and a few
    other "fancy" models; this is best for node apps (~4K gzipped)
  - full adds views and live templates (~7K gzipped)
- Add Travis CI support
- Add assumeChanged flag to optimize bound model updates by
  avoiding recursiveDiff if not needed.

### 0.6.0

- Refactored build & packaging process to use Grunt.
- Async models now support rolling updates.
- Add tbone.runOnlyOnce and model.readSilent functions to more
  easily enable stateful behavior when desired.
- No longer fire change events when overwriting a Date with
  an equivalent Date.
- Bound models' scopes now run detached from any T-function they
  may be declared in.
- Add model.destroy function to destroy the model's scope.
- Expose tbone.priority and make priority the second (optional)
  argument to autorun / T(fn, ...).
- Add __ajaxReady__ and __numAjaxInFlight__ live properties.
- Add tbone.showRenderTrees to aid in debugging render performance.
- Fixed many instances of auto-`Name`ing objects in debug mode.

### 0.5.0

- Event binding performance significantly improved in some cases.
- TBone now binds scope contexts to property changes instead of
  arbitrary functions.  This enables significant performance scaling
  improvements with a large number of scopes bound to a model by
  using the ID of the scope context to index those bindings.
- Fixed a bug where drainQueue would not always eventually execute
  all pending scopes if there were too many queued.
- Bound models may now take naps by setting sleepEnabled to true.
- Added a kludge to attempt to maintain the window scrollTop
  position around drainQueue operations.  This may help prevent
  "scrolling up" when content is temporary replaced/re-rendered,
  modifying temporarily the total body height.
- Added trackable T('__isReady__') property.  This can be used to
  track whether there are any outstanding tbone model ajax requests.
- (dev only) Alias-checking is now turned off by default.  Enable
  by setting tbone.opts.aliasCheck to true.

### 0.4.2

- In dev mode, many models now have Name properties automatically
  set based on the query path to which each model is first assigned.
- Only dots may now be used to separate property names in TBone
  paths.  Previously, colons and spaces were allowed as well.
- Change template root variable to `view`, and added it to the list
  of property names not to query-patch when compiling templates.

### 0.4.1

- Added fancy `localStorage` collection.

### 0.4.0

- Split base model into base, bound, async, and ajax models.
- Collections are now indexed by ID by default and do not support
  simple arrays of models.  Added the `size` live property for
  reading the current number of models in the collection.
  For support of a simple list of models, use a model instead.
- Templates now use `root.denullText` instead of `root.queryText` to
  avoid printing non-text values.
- Added `model.queryModel` to query for models without extracting
  their data.
- Added `model.increment` to support counters.
- Added fancy model implementations `localStorage` and `location`.
- Reorganized source files into subfolders.

### 0.3.4

- Added `collection.remove`
- View root elements now get a class for each of their parent views.
- Added support for use in node.js

### 0.3.3

- Added support for collections indexed by model ID.
- Fixed tbone.isReady() in cases where XHRs are aborted.
- Refined logic for when to do subqueries.
- Added `model.unset`

### 0.3.2

- Added JSON-serialization-based aliasing checks (in debug mode) when
  setting tbone models.
- Added optional lazy-loading of templates from script tags.

### 0.3.1

- Added support for `<%@ ... %>` to pass data from templates into subviews.

### 0.3

- Backbone is now an optional dependency.
- Added TBone-native models and views.
- T is now a TBone model.

### 0.2

- Initial release.
