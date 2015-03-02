var T = require('../tbone').make();
var tbone = T;
var _ = require('lodash');

var base = tbone.models.base;

exports['basic'] = function(test) {
  var me = base.make();
  T('me', me);
  T('me.prop', 42);
  test.equal(T('me.prop'), 42);
  test.equal(me.query('prop'), 42);
  test.equal(me.query('prop'), 42);
  T('me', {
    seven: 7
  });
  test.equal(T('me.prop'), undefined);
  test.equal(me.query('prop'), undefined);
  test.equal(T('me.seven'), 7);
  var other;
  var count1 = 0;
  var count2 = 0;
  T(function() {
    other = T('me.other');
    count1++;
  });
  T(function() {
    T('me.other2');
    count2++;
  });
  T('me.other', 10);
  test.equal(count1, 1);
  test.equal(count2, 1);
  test.equal(other, undefined);
  T.drain();
  test.equal(count1, 2);
  test.equal(count2, 1);
  test.equal(other, 10);
  test.done();
};

exports['subprop'] = function(test) {
  var me = base.make();
  T('me', me);
  T('me.sub.prop', 42);
  test.equal(T('me.sub.prop'), 42);
  test.equal(me.query('sub.prop'), 42);
  test.equal(me.query('sub').prop, 42);
  var other;
  var count1 = 0;
  var count2 = 0;
  T(function() {
    other = T('me.sub2.prop2');
    count1++;
  });
  T(function() {
    T('me.sub2.prop3');
    count2++;
  })
  T('me.sub2.prop2', 12);
  test.equal(count1, 1);
  test.equal(count2, 1);
  test.equal(other, undefined);
  T.drain();
  // count2 gets incremented even though prop3 doesn't change because
  // backbone models don't support deep property binding.
  test.equal(count1, 2);
  test.equal(count2, 1);
  test.equal(other, 12);
  test.done();
};

exports['parent detects subprop changes'] = function(test) {
  var me = base.make();
  T('me', me);
  (function() {
    var fired = 0;
    T(function() {
      T('me');
      fired++;
    });
    T('me.age', 7);
    T.drain();
    test.equal(fired, 2);
  }());
  (function() {
    var fired = 0;
    T(function() {
      T('me.name');
      fired++;
    });
    T('me.name.first', 'sally');
    T.drain();
    test.equal(fired, 2);
  }());
  (function() {
    var fired = 0;
    T(function() {
      T('me');
      T('me.age');
      T('me.name');
      fired++;
    });
    T('me.age', 6);
    T('me.name.last', 'smith');
    T.drain();
    test.equal(fired, 2);
  }());
  test.done();
};

exports['shallow comparison on tree change'] = function(test) {
  var me = base.make();
  T('me', me);
  (function() {
    var fired = 0;
    T('me.age', 7);
    T(function() {
      T('me');
      fired++;
    });
    T('me', {
      age: 7
    });
    T.drain();
    test.equal(fired, 1);
    T('me', {
      age: 8
    });
    T.drain();
    test.equal(fired, 2);
  }());
  (function() {
    var fired = 0;
    T('me.age', 7);
    T(function() {
      T('me.age');
      fired++;
    });
    T('me', {
      age: 7
    });
    T.drain();
    test.equal(fired, 1);
    T('me', {
      age: 8
    });
    T.drain();
    test.equal(fired, 2);
  }());
  test.done();
};

exports['deep comparison on tree change'] = function(test) {
  var me = base.make();
  T('me', me);
  (function() {
    var fired1 = 0;
    var fired2 = 0;
    T(function() {
      T('me.name');
      fired1++;
    });
    T(function() {
      T('me.name.last');
      fired2++;
    });
    T('me.name', {
      first: null,
      last: 0
    });
    T.drain();
    test.equal(fired1, 2);
    test.equal(fired2, 2);
    T('me', {
      name: {
        first: 0,
        last: ''
      }
    });
    T.drain();
    test.equal(fired1, 3);
    test.equal(fired2, 3);
    T('me.name.first', 'bob');
    T.drain();
    test.equal(fired1, 4);
    test.equal(fired2, 3);
    T('me.name', {
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
  var me = base.make();
  T('me', me);
  me.query('', 42);
  test.equal(me.query(''), 42);
  test.equal(T('me'), 42);
  // Writing a subproperty to the number will destroy the
  // number (with a console warning).
  T('me.prop', 7);
  test.ok(typeof T('me') === 'object');
  test.equal(T('me').prop, 7);
  test.equal(T('me.prop'), 7);
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
  var me = base.make();
  var you = base.make();
  me.query('you', you);
  you.query('prop', 7);
  var calls = 0;
  T(function() {
    me.query('you.prop');
    calls++;
  });
  var calls2 = 0;
  T(function() {
    me.query('you');
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
  me.query('you.prop', 42);
  T.drain();
  you.query('prop', 7);
  T.drain();
  test.equal(calls, 3);
  test.equal(calls2, 3);
  test.equal(calls3, 3);
  test.equal(calls4, 3);
  test.done();
};
