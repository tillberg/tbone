var T = require('../tbone').make();
var tbone = T;
var _ = require('lodash');

var base = tbone.models.base;

exports['basic'] = function(test) {
  var root = base.make();
  var me = base.make();
  root('me', me);
  root('me.prop', 42);
  test.equal(root('me.prop'), 42);
  test.equal(me.query('prop'), 42);
  test.equal(me.query('prop'), 42);
  me.unset('prop');
  root('me.seven', 7);
  test.equal(root('me.prop'), undefined);
  test.equal(me.query('prop'), undefined);
  test.equal(root('me.seven'), 7);
  var other;
  var count1 = 0;
  var count2 = 0;
  T(function() {
    other = root('me.other');
    count1++;
  });
  T(function() {
    root('me.other2');
    count2++;
  });
  root('me.other', 10);
  test.equal(count1, 1);
  test.equal(count2, 1);
  test.equal(other, undefined);
  T.drain();
  test.equal(me('other'), 10);
  test.equal(count1, 2);
  test.equal(count2, 1);
  test.equal(other, 10);
  test.done();
};

exports['subprop'] = function(test) {
  var root = base.make();
  var me = base.make();
  root('me', me);
  root('me.sub.prop', 42);
  test.equal(root('me.sub.prop'), 42);
  test.equal(me.query('sub.prop'), 42);
  test.equal(me.query('sub').prop, 42);
  var other;
  var count1 = 0;
  var count2 = 0;
  T(function() {
    other = root('me.sub2.prop2');
    count1++;
  });
  T(function() {
    root('me.sub2.prop3');
    count2++;
  })
  root('me.sub2.prop2', 12);
  test.equal(count1, 1);
  test.equal(count2, 1);
  test.equal(other, undefined);
  T.drain();
  test.equal(count1, 2);
  test.equal(count2, 1);
  test.equal(other, 12);
  test.done();
};

exports['parent detects subprop changes'] = function(test) {
  var root = base.make();
  var me = base.make();
  root('me', me);
  (function() {
    var fired = 0;
    T(function() {
      root('me');
      fired++;
    });
    root('me.age', 7);
    T.drain();
    test.equal(fired, 2);
  }());
  (function() {
    var fired = 0;
    T(function() {
      root('me.name');
      fired++;
    });
    root('me.name.first', 'sally');
    T.drain();
    test.equal(fired, 2);
  }());
  (function() {
    var fired = 0;
    T(function() {
      root('me');
      root('me.age');
      root('me.name');
      fired++;
    });
    root('me.age', 6);
    root('me.name.last', 'smith');
    T.drain();
    test.equal(fired, 2);
  }());
  test.done();
};

exports['shallow comparison on tree change'] = function(test) {
  var root = base.make();
  var me = base.make();
  root('me', me);
  (function() {
    var fired = 0;
    root('me.age', 7);
    T(function() {
      root('me');
      fired++;
    });
    root('me', {
      age: 7
    });
    T.drain();
    test.equal(fired, 1);
    root('me', {
      age: 8
    });
    T.drain();
    test.equal(fired, 2);
  }());
  (function() {
    var fired = 0;
    root('me.age', 7);
    T(function() {
      root('me.age');
      fired++;
    });
    root('me', {
      age: 7
    });
    T.drain();
    test.equal(fired, 1);
    root('me', {
      age: 8
    });
    T.drain();
    test.equal(fired, 2);
  }());
  test.done();
};

exports['deep comparison on tree change'] = function(test) {
  var root = base.make();
  var me = base.make();
  root('me', me);
  (function() {
    var fired1 = 0;
    var fired2 = 0;
    T(function() {
      root('me.name');
      fired1++;
    });
    T(function() {
      root('me.name.last');
      fired2++;
    });
    root('me.name', {
      first: null,
      last: 0
    });
    T.drain();
    test.equal(fired1, 2);
    test.equal(fired2, 2);
    root('me', {
      name: {
        first: 0,
        last: ''
      }
    });
    T.drain();
    test.equal(fired1, 3);
    test.equal(fired2, 3);
    root('me.name.first', 'bob');
    T.drain();
    test.equal(fired1, 4);
    test.equal(fired2, 3);
    root('me.name', {
      first: 'sally',
      last: 'rogers'
    });
    T.drain();
    test.equal(fired1, 5);
    test.equal(fired2, 4);
  }());
  test.done();
};

exports['non-object root'] = function(test) {
  var root = base.make();
  var me = base.make();
  root('me', me);
  me.query('', 42);
  test.equal(me.query(''), 42);
  test.equal(root('me'), 42);
  // Writing a subproperty to the number will destroy the
  // number (with a console warning).
  root('me.prop', 7);
  test.ok(typeof root('me') === 'object');
  test.equal(root('me').prop, 7);
  test.equal(root('me.prop'), 7);
  test.done();
};

exports['invocation'] = function(test) {
  var me = base.make();
  me('prop', 42);
  test.equal(me('prop'), 42);
  me('week', function() {
    return 7;
  });
  test.equal(me('week'), 7);
  test.done();
};

exports['self-reference'] = function(test) {
  var me = base.make();
  me.query('prop', 42);
  test.equal(me.attributes.prop, 42);
  test.ok(me.query({dontGetData: true}, ''));
  test.ok(me.query({dontGetData: true}, '').attributes);
  test.equal(me.query({dontGetData: true}, '').attributes.prop, 42);
  test.done();
};

exports['toggle'] = function(test) {
  var me = base.make();
  me.query('prop', false);
  test.equal(me.query('prop'), false);
  me.toggle('prop');
  test.equal(me.query('prop'), true);
  test.done();
};

exports['overwrite falsy value'] = function(test) {
  var me = base.make();
  me.query('prop', false);
  test.strictEqual(me.query('prop'), false);
  me.query('prop', true);
  test.strictEqual(me.query('prop'), true);

  me.query('prop', '');
  test.strictEqual(me.query('prop'), '');
  me.query('prop', 'hello');
  test.strictEqual(me.query('prop'), 'hello');

  me.query('prop', null);
  test.strictEqual(me.query('prop'), null);
  me.query('prop', 42);
  test.strictEqual(me.query('prop'), 42);

  me.query('prop', 0);
  test.strictEqual(me.query('prop'), 0);
  me.query('prop', undefined);
  test.strictEqual(me.query('prop'), undefined);
  me.query('prop', 'awesome');
  test.strictEqual(me.query('prop'), 'awesome');
  test.done();
};

exports['push'] = function(test) {
  var me = base.make();
  var val;
  T(function() {
    val = me.query('coll.0');
  });
  me.push('coll', 42);
  T.drain();
  test.equal(val, 42);
  me.push('coll', 7);
  me.push('coll', 10);
  T.drain();
  test.equal(val, 42);
  test.equal(me('coll.2'), 10);
  test.equal(me('coll.length'), 3);
  test.done();
};

exports['unshift'] = function(test) {
  var me = base.make();
  var val;
  T(function() {
    val = me.query('coll.1');
  });
  me.unshift('coll', 42);
  T.drain();
  test.strictEqual(val, undefined);
  me.unshift('coll', 7);
  test.strictEqual(val, undefined);
  T.drain();
  test.equal(val, 42);
  me.unshift('coll', 10);
  test.equal(val, 42);
  T.drain();
  test.equal(val, 7);
  test.equal(me('coll.2'), 42);
  test.equal(me('coll.length'), 3);
  test.done();
};

exports['remove first/last'] = function(test) {
  var me = base.make();
  me.query('coll', [5, 10, 15, 20, 25]);
  var val;
  T(function() {
    val = me.query('coll.2');
  });
  me.removeFirst('coll');
  T.drain();
  test.equal(val, 20);
  test.equal(me.query('coll.0'), 10);
  me.removeLast('coll');
  me.removeLast('coll');
  T.drain();
  test.strictEqual(val, undefined);
  test.equal(me.query('coll.length'), 2);
  test.done();
};

exports['detects date change'] = function(test) {
  var me = base.make();
  var calls = 0;
  T(function() {
    me.query('prop.date');
    calls++;
  });
  var calls2 = 0;
  T(function() {
    me.query('prop');
    calls2++;
  });
  me.query('prop.date', new Date(1333333333333));
  T.drain();
  me.query('prop.date', new Date(1444444444444));
  T.drain();
  test.equal(calls, 3);
  test.equal(calls2, 3);
  test.done();
};

exports['detects array length change'] = function(test) {
  var me = base.make();
  me.query('prop', [undefined]);
  var calls = 0;
  T(function() {
    me.query('prop');
    calls++;
  });
  me.query('prop', []);
  T.drain();
  test.equal(calls, 2);
  test.done();
};

exports['binding to nested model property'] = function(test) {
  var root = base.make();
  var you = base.make();
  root.query('you', you);
  you.query('prop', 7);
  var calls = 0;
  T(function() {
    root.query('you.prop');
    calls++;
  });
  var calls2 = 0;
  T(function() {
    root.query('you');
    calls2++;
  });
  var calls3 = 0;
  T(function() {
    you.query('');
    calls3++;
  });
  var calls4 = 0;
  T(function() {
    you.query('prop');
    calls4++;
  });
  root.query('you.prop', 42);
  T.drain();
  you.query('prop', 7);
  T.drain();
  test.equal(calls, 3);
  test.equal(calls2, 3);
  test.equal(calls3, 3);
  test.equal(calls4, 3);
  test.done();
};

exports['model bindings overwrite each other'] = function(test) {
  var me = base.make();
  me('prop', 2);
  me('other', 3);
  me('model', function() {
    return me('prop');
  });
  T.drain();
  test.equal(me('model'), 2);
  test.equal(me('').model, 2);
  me('model', function() {
    return me('other');
  });
  T.drain();
  test.equal(me('model'), 3);
  test.equal(me('').model, 3);
  me('prop', 4);
  T.drain();
  test.equal(me('model'), 3);
  test.equal(me('').model, 3);
  test.done();
};
