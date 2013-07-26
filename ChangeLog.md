## TBone Change Log

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
