var T = require('../tbone').make();
var tbone = T;
var _ = require('lodash');

exports['tbone id queries'] = function(test) {
  var coll = tbone.collections.base.make();
  var me = tbone.models.base.make();
  me('coll', coll);
  coll.add({
    id: 7,
    name: 'bob'
  });
  var model2 = tbone.models.base.make();
  model2.query('', {
    id: 2,
    name: 'susan'
  })
  coll.add(model2);
  coll.add({
    id: 42,
    name: 'sally'
  });
  test.equal(me('coll.#2.name'), 'susan');
  var name42;
  T(function() {
    name42 = me('coll.#42.name');
  });
  var name0;
  T(function() {
    name0 = me('coll.#0.name');
  });
  var len;
  T(function() {
    len = coll('size');
  });
  test.equal(name42, 'sally');
  coll('#42.name', 'polly');
  test.equal(name42, 'sally');
  T.drain();
  test.equal(len, 3);
  test.equal(name42, 'polly');
  me('coll.#42', {
    id: 0,
    name: 'robert'
  });
  test.equal(name42, 'polly');
  T.drain();
  test.equal(name42, undefined);
  test.equal(name0, 'robert');

  // Test adding an unidentified model, then setting its ID
  var count = _.keys(me('coll')).length;
  var john = tbone.models.base.make();
  john('name', 'john');
  coll.add(john);
  T.drain();
  test.equal(len, 4);
  test.equal(me('coll.size'), 4);
  test.equal(_.keys(me('coll')).length, count + 1);
  john('id', 'awesome');
  T.drain();
  test.equal(me('coll.#awesome.name'), 'john');

  // Test removing a model by model instance
  coll.remove(model2);
  test.equal(_.keys(me('coll')).length, count);
  test.equal(coll('#2.name'), undefined);

  // Test removing a non-existent model by id
  coll.remove(42);
  test.equal(_.keys(me('coll')).length, count);

  // Test removing a model by model by id
  coll.remove(0);
  test.equal(_.keys(me('coll')).length, count - 1);
  test.equal(coll('#0.name'), undefined);

  test.equal(len, 4);
  T.drain();
  test.equal(len, 2);
  test.done();
};


exports['async model'] = function(test) {
  test.expect(3);

  var src = tbone.make();
  src('prop', 42);
  var me = tbone.models.async.make(function(cb) {
    var val = src('prop');
    setTimeout(function() {
      cb({
        'asyncprop': val
      });
      _.defer(sync);
    }, 10);
  });
  test.equal(me('asyncprop'), undefined);
  var numUpdates = 0;

  function sync() {
    numUpdates++;
    if (numUpdates === 1) {
      test.equal(me('asyncprop'), 42);
      src('prop', 100);
    } else {
      test.equal(me('asyncprop'), 100);
      test.done();
    }
  }
};

exports['async model abort'] = function(test) {
  test.expect(1);
  var src = tbone.make();
  src('prop', 42);
  var me = tbone.models.async.make(function(cb) {
    src('prop');
    this.abortPrevious();
    return {
      onAbort: function() {
        test.ok(true, 'called onAbort');
        test.done();
      }
    }
  });
  setTimeout(function() {
    src('prop', 36);
  }, 0);
};

exports['async model with rolling update'] = function(test) {
  var callbacks = [];
  var me = tbone.make();
  var model = tbone.models.async.make({
    state: function(cb) {
      me('prop');
      callbacks.push(cb);
    }
  });
  test.equal(callbacks.length, 1);
  test.equal(model(''), undefined);
  me('prop', 1);
  T.drain();
  me('prop', 2);
  T.drain();
  test.equal(callbacks.length, 3);
  callbacks[0]('hello'); // accepted - newer generation than last update
  test.equal(model(''), 'hello');

  callbacks[2]('yo');
  test.equal(model(''), 'yo');

  callbacks[1]('hi'); // rejected - old generation
  test.equal(model(''), 'yo');
  test.done()
};

var ajaxBase = T.models.ajax.make({
  url: '/',
  ajax: function (opts) {
    var self = this;
    setTimeout(function () {
      var data = self.successData || self.errorData;
      if (self.successData) {
        opts.success(data);
      } else {
        opts.error(data);
      }
      if (opts.complete) {
        opts.complete(data);
      }
    }, self.delay);
  },
  delay: 0,
});

exports['ajax model stuff'] = function(test) {
  test.expect(5);
  var me = ajaxBase.make({
    successData: { hello: 'world' },
  });
  var done = _.once(test.done.bind(test));
  var firstRun = true;
  T({
    fn: function() {
      if (firstRun) {
        test.equal(me('hello'), undefined);
        test.equal(me.sleeping, true);
        firstRun = false;
      } else {
        test.equal(me('hello'), 'world');
        test.equal(me().hello, 'world');
        test.equal(me.sleeping, false);
        done();
      }
    },
    isView: true,
  });
  setTimeout(done, 100);
};
