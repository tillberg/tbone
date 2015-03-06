var T = require('../tbone').make();
var tbone = T;
var assert = require('assert');
var _ = require('lodash');

T('lights', function() {
  return {
    count: 4,
    picard: {
      name: 'Jean-Luc'
    }
  };
});

exports['autorun'] = function(test) {
  T('state2', {});
  T('state2.count', 4);
  var count = 2;
  tbone(function() {
    count = tbone.query('state2.count');
  });
  test.equal(count, 4);
  T('state2.count', 5);
  test.equal(count, 4);
  T.drain();
  test.equal(count, 5);
  test.done();
};

exports['create model instance'] = function(test) {
  var echo = tbone.models.bound.extend({
    state: function() {
      return {
        echo: tbone.query('lights.count')
      };
    }
  });

  T('echo', echo.make());
  test.equal(tbone.query('echo.echo'), 4);

  // non-top-level
  T('group.echo', echo.make());
  test.equal(tbone.query('group.echo.echo'), 4);
  test.done();
};

var thingsType = tbone.models.base.make();
var things = T('things', thingsType.make());
things.push('', {
  number: 2
});
things.push('', {
  number: 3
});
things.push('', {
  number: 7
});
things.push('', {
  number: 42
});

exports['tbone.query lookup'] = function(test) {
  test.equal(tbone.query('lights').count, 4);
  test.equal(tbone.query('lights.count'), 4);
  test.equal(tbone.query('lights.picard.name'), 'Jean-Luc');
  test.equal(tbone.query('lights.picard.notexist'), undefined);
  test.equal(tbone.query('things.0.number'), 2);
  test.equal(tbone.query('things.3.number'), 42);

  /**
   * XXX should this be the case?
   * model.toJSON() does not return the same object on successive calls.
   */
  // nottest.equal(T('lights'), T('lights'));

  /**
   * T.query <===> T(string)
   */
  test.equal(T.query('lights').count, T('lights').count);
  test.equal(tbone.query('lights.picard.notexist'), T('lights.picard.notexist'));
  test.equal(tbone.query('things.3.number'), T('things.3.number'));
  test.done();
};

exports['tbone.query to set'] = function(test) {
  var thing = T('thing', tbone.models.base.make());
  thing.query('count', 4);
  test.equal(thing.query('count'), 4);
  test.equal(T('thing.count'), 4);

  T.query('thing.count', 5);
  test.equal(T('thing.count'), 5);

  T('thing.count', 42);
  test.equal(thing.query('count'), 42);

  /**
   * XXX This should be made to work, I think.  a la implicit mkdir -p
   */
  // T('thing.sub.prop', 'hi');
  // test.equal(T('thing.sub.prop'), 'hi');

  T('thing.sub', {
    prop: 4
  });
  test.equal(T('thing.sub.prop'), 4);

  var subprop;
  T(function() {
    subprop = T('thing.sub.prop');
  });
  test.equal(subprop, 4);

  T('thing.sub.prop', 5);
  test.equal(T('thing.sub.prop'), 5);
  test.equal(subprop, 4);

  T.drain();
  test.equal(subprop, 5);

  T('thing', {
    count: 6
  });
  // XXX fix these, maybe?
  // test.equal(T.data.toJSON().thing.name, 'passive');
  // test.equal(T.data.toJSON().thing.get('count'), 6);

  T('thing', {
    other: 4
  });
  test.equal(T('thing.other'), 4);
  test.equal(T('thing.count'), undefined);

  var morethings = T('morethings', T.make());
  morethings.push('', {
    number: 6
  });
  test.equal(T('morethings.0.number'), 6);
  test.equal(T('morethings.0.number', 100), 100);
  test.equal(T('morethings.0.number'), 100);

  T('baseprop', 5);
  var baseprop;
  T(function() {
    baseprop = T('baseprop');
  });
  test.equal(baseprop, 5);
  T('baseprop', 8);
  T.drain();
  test.equal(baseprop, 8);
  test.done();
};

exports['set w/ function'] = function(test) {
  T('first', 'sally');
  T('last', 'rogers');
  T('fullname', function() {
    return T('first') + ' ' + T('last');
  });
  T.drain();
  test.equal(T('fullname'), 'sally rogers');
  T('last', 'smith');
  T.drain();
  test.equal(T('fullname'), 'sally smith');
  test.done();
};

exports['fire change event when adding a model'] = function(test) {
  var count = 0;
  T(function() {
    T('mysub.prop');
    count++;
  });
  T('mysub', function() {
    return {
      'else': 4
    };
  });
  T.drain();
  test.equal(count, 2);
  test.done();
};

exports['tbone model with simultaneous changes to bound properties'] = function(test) {
  // This is kind of an odd test but it really came up as a bug ~5/6/2013
  var me = tbone.models.base.make();
  me('', {
    a: 5,
    z: 7
  });
  var calls = 0;
  T(function() {
    me('a');
    calls++;
  });
  var calls2 = 0;
  T(function() {
    me('z');
    calls2++;
  });
  me('', {
    a: 4,
    z: 6
  });
  T.drain();
  test.equal(calls, 2);
  test.equal(calls2, 2);
  test.done();
};

exports['model increment'] = function(test) {
  var me = tbone.make();
  me('num', 7);
  var num;
  T(function() {
    num = me('num');
  });
  test.equal(num, 7);
  test.equal(me('num'), 7);
  me.increment('num');
  T.drain();
  test.equal(num, 8);
  test.equal(me('num'), 8);
  me.increment('num', 34);
  T.drain();
  test.equal(num, 42);
  test.equal(me('num'), 42);
  test.done();
};

function lookup(obj, prop) {
  prop = prop.replace('__self__', '');
  if (prop) {
    var parts = prop.split('.');
    var arg;
    while (arg = parts.shift()) {
      if (obj != null) {
        obj = obj[arg];
      } else {
        return undefined;
      }
    }
  }
  return obj;
}

function getWatcher(model, props) {
  var fireds = {};
  _.each(props, function(prop, i) {
    T(function() {
      model(prop);
      // If you hit this and there's not a bug in TBone, you
      // forgot to do an assertion between `T.drain`s:
      assert.notEqual(fireds[prop], true, 'getWatchCounter fireds.' + prop + ' should not be true');
      fireds[prop] = true;
    });
  });
  fireds = {};
  function getState() {
    return _.reduce(props, function(agg, prop) {
      agg[prop] = JSON.stringify(lookup(model.attributes, prop));
      return agg;
    }, {});
  }
  var lastState = getState();
  return function(test, onlyTestForMisses) {
    T.drain();
    var state = getState();
    _.each(props, function(prop) {
      var didFire = !!fireds[prop];
      var shouldHaveFired = state[prop] !== lastState[prop];
      var msg = 'prop [' + prop + '] ';
      if (shouldHaveFired) {
        msg += 'should fire due to change from ' + lastState[prop] + ' to ' + state[prop];
      } else {
        msg += 'should not fire because value remained ' + state[prop];
      }
      if (shouldHaveFired || !onlyTestForMisses) {
        test.equal(shouldHaveFired, didFire, msg);
      }
    });
    lastState = state;
    fireds = {};
  };
}

exports['model array mutations'] = function(test) {
  var me = tbone.make();
  me('', []);
  var drainAndCheckTriggers = getWatcher(me, ['__self__', '0', '1', '2', 'length']);
  me.push('', 'hi');
  test.equal(me('0'), 'hi');
  test.equal(me('1'), undefined);
  test.equal(me('length'), 1);
  drainAndCheckTriggers(test);
  me.push('world');
  test.equal(me('1'), 'world');
  test.equal(me('length'), 2);
  T.drain();
  drainAndCheckTriggers(test);
  me.unshift('say');
  test.equal(me('0'), 'say');
  test.equal(me('1'), 'hi');
  test.equal(me('2'), 'world');
  test.equal(me('length'), 3);
  T.drain();
  drainAndCheckTriggers(test);
  test.done();
};

exports['object mutations'] = function(test) {
  var me = tbone.make();
  var watchProps = [
    '__self__',
    'sub',
    'sub.prop',
    'sub.prop.42',
    'sub.prop.erties',
    'subprop',
    'hello',
    'other',
    'length',
    '0',
    'hi',
    'hi.bob',
  ];
  var drainAndCheckTriggers = getWatcher(me, watchProps);
  me('', null);
  drainAndCheckTriggers(test, true); // XXX remove this true
  me('', {
    sub: {
      prop: 42,
    },
    hello: 'world',
  });
  drainAndCheckTriggers(test, true); // XXX remove this true
  me('sub.prop', 43);
  drainAndCheckTriggers(test);
  me('hi', {sally: 'smith'});
  drainAndCheckTriggers(test);
  me('sub', {prop: 43});
  drainAndCheckTriggers(test);
  me('sub', 'prop');
  drainAndCheckTriggers(test);
  me('hi', {sally: 'smith'});
  drainAndCheckTriggers(test);
  me('0', 'not really an array');
  drainAndCheckTriggers(test);
  me('length', 7);
  drainAndCheckTriggers(test);
  me('__self__', undefined);
  drainAndCheckTriggers(test);
  me('__self__', null);
  drainAndCheckTriggers(test, true); // XXX remove this true
  test.done();
};

exports['recursiveDiff with similar objects'] = function(test) {
  var me = T.make();
  var drainAndCheckTriggers = getWatcher(me, ['', 'prop', 'prop.erty']);
  me('prop.erty', 42);
  drainAndCheckTriggers(test);
  me('prop', {erty: 42});
  drainAndCheckTriggers(test);
  me('prop', {erty: 42});
  drainAndCheckTriggers(test);
  me('', {prop:{erty: 42}});
  drainAndCheckTriggers(test);
  me('prop.erty', 42);
  drainAndCheckTriggers(test);
  me('prop.erty', 42);
  drainAndCheckTriggers(test);
  me('prop', {erty: 42});
  drainAndCheckTriggers(test);
  test.done();
};


exports['length property'] = function(test) {
  var me = T.make();
  var drainAndCheckTriggers = getWatcher(me, ['text.length']);
  me('text', '123456');
  drainAndCheckTriggers(test);
  me('text', '654321');
  drainAndCheckTriggers(test);
  me('text', {length: 6});
  drainAndCheckTriggers(test);
  me('text.length', 6);
  drainAndCheckTriggers(test);
  me('text', [1,2,3,4,5,6]);
  drainAndCheckTriggers(test);
  me('text.length', 6);
  drainAndCheckTriggers(test);
  test.done();
};

exports['only top-level binding'] = function(test) {
  var me = T.make();
  var drainAndCheckTriggers = getWatcher(me, ['']);
  me('sub.prop', 5);
  drainAndCheckTriggers(test);
  me('other.prop', 5);
  drainAndCheckTriggers(test);
  me('', 'hi');
  drainAndCheckTriggers(test);
  test.equal(me(), 'hi');
  test.done();
};

exports['objects with cycles'] = function(test) {
  var me = T.make();
  var count = 0;
  T(function () {
    me('');
    count++;
  });
  var b = [];
  b.push(b);
  me('arr1', b);
  var b2 = [];
  b2.push(b2);
  T.drain();
  me('arr1', b2);
  T.drain();
  var c = [];
  c.push([c]);
  me('arr2', c);
  T.drain();
  var d = {};
  d.prop = d;
  me('obj1', d);
  T.drain();
  var e = {};
  e.prop = {prop: e};
  me('obj2', e);
  T.drain();
  test.equal(count, 6);
  test.done();
};

exports['removing a prop with only a global binding'] = function(test) {
  var me = T.make();
  var drainAndCheckTriggers = getWatcher(me, ['']);
  me('sub', {hello: 1});
  drainAndCheckTriggers(test);
  me('sub', {hello: 1, sdkjfhs: 2});
  drainAndCheckTriggers(test);
  me('sub', {hello: 1});
  drainAndCheckTriggers(test);
  me('sub', {hello: 1, sdkjfhs: undefined});
  drainAndCheckTriggers(test, true); // XXX remove this true
  test.done();
};

exports['changing a date with only a global binding'] = function(test) {
  var me = T.make();
  var drainAndCheckTriggers = getWatcher(me, ['']);
  me('sub', {date: new Date(2398523132)});
  drainAndCheckTriggers(test);
  me('sub', {date: new Date(2398523133)});
  drainAndCheckTriggers(test);
  test.done();
};

exports['dates'] = function(test) {
  var me = T.make();
  var drainAndCheckTriggers = getWatcher(me, ['']);
  var a = new Date(928374938);
  me('', a);
  drainAndCheckTriggers(test);
  me('', new Date(928374938));
  drainAndCheckTriggers(test);
  me('', new Date(928374939));
  drainAndCheckTriggers(test);
  test.done();
};

exports['unbind property on second pass'] = function(test) {
  var me = tbone.make();
  var count = 0;
  var runOnce = false;
  T(function() {
    if (!runOnce) {
      T('hello');
      runOnce = true;
    }
    count++;
  });
  T.drain();
  T('hello', 'to');
  T.drain();
  T('hello', 'you');
  T.drain();
  test.equal(count, 2);
  test.done();
};

exports['update date to same time'] = function(test) {
  var me = tbone.make();
  var count = 0;
  me('date', new Date(1383851885098));
  T(function() {
    me('date');
    count++;
  });
  me('date', new Date(1383851885098));
  T.drain();
  test.equal(count, 1);
  // sanity check:
  me('date', new Date(1383851885099));
  T.drain();
  test.equal(count, 2);
  test.done();
};

exports['runOnlyOnce'] = function(test) {
  var me = tbone.make();
  var count = 0;
  T.runOnlyOnce(function() {
    count += 1;
    me('prop');
  });
  me('prop', 10);
  T.drain();
  test.equal(count, 1);
  test.done();
};

exports['readSilent'] = function(test) {
  var me = tbone.make();
  var prop;
  me('prop', 20);
  T(function() {
    prop = me.readSilent('prop');
  });
  me('prop', 30);
  T.drain();
  test.equal(prop, 20);
  test.done();
};

exports['create bound model inside T-function'] = function(test) {
  // bound models should run their own T-functions as top-level
  // T-functions, not as children of any T-function that may have
  // created them.
  var me = tbone.make();
  var val;
  me('num', 3);
  T(function() {
    var num = me('num');
    me('sub.' + num, function() {
      return num * me('num');
    });
  });
  T.drain();
  test.equal(me('sub.3'), 3 * 3);
  me('num', 5);
  T.drain();
  test.equal(me('sub.3'), 3 * 5);
  test.equal(me('sub.5'), 5 * 5);
  me('num', 7);
  T.drain();
  test.equal(me('sub.3'), 3 * 7);
  test.equal(me('sub.5'), 5 * 7);
  test.equal(me('sub.7'), 7 * 7);
  test.done();
};

exports['model in a model'] = function(test) {
  var a = T.make();
  var b = T.make();
  a('', b);
  b('', 5);
  test.equal(a(''), 5);
  test.done();
};

exports['model destroy'] = function(test) {
  var me = tbone.make();
  var val;
  me('num', 42);
  me('prop', function() {
    val = me('num');
    return val;
  });
  var prop = me.queryModel('prop');
  test.equal(val, 42);
  T.drain();
  test.equal(me('prop'), 42);
  prop.destroy();
  me('num', 43);
  T.drain();
  test.equal(val, 42);
  test.equal(me('prop'), undefined);
  prop.destroy();
  test.done();
};

exports['assumeChanged'] = function(test) {
  var me = T.make();
  var count = 0;
  var bound = T.bound({
    state: function() {
      me('');
      count++;
      return 42;
    },
    assumeChanged: true,
  });
  me('prop', 7);
  T.drain();
  test.equal(count, 2);
  me('prop', 8);
  T.drain();
  test.equal(count, 3);
  test.done();
};

exports['autorun js error handling'] = function(test) {
  // autorun should not intercept JS errors -- they should break all the way
  // out past scope.execute and drainqueue -- but we should still continue to
  // execute other scopes after a setTimeout.
  // expect( 7 );
  var me = tbone.make();
  me('prop', 10);
  var ranFirst = false;
  var ranSecond = false;
  var threwException = false;
  try {
    me({
      fn: function() {
        me('prop');
        ranFirst = true;
        me.nonExistent.prop = 'boom';
      },
      priority: 2,
    });
  } catch (e) {
    threwException = true;
  }
  test.equal(threwException, true, 'exception bubbles out of autorun invocation');
  me({
    fn: function() {
      me('prop');
      ranSecond = true;
    },
    priority: 1,
  });
  test.equal(ranFirst, true, 'first function ran');
  test.equal(ranSecond, true, 'second function ran');
  me('prop', 20);
  threwException = false;
  ranFirst = false;
  ranSecond = false;
  try {
    T.drain();
  } catch (e) {
    threwException = true;
  }
  test.equal(threwException, true, 'exception bubbles out of drain invocation');
  test.equal(ranFirst, true, 'first function ran second time');
  test.equal(ranSecond, false, 'second function should not have run yet');
  var checksLeft = 10;

  function check() {
    if (ranSecond || !checksLeft) {
      test.equal(ranSecond, true, 'second function ran second time');
      test.done();
    } else {
      checksLeft--;
      setTimeout(check, 1);
    }
  }
  check();
};

exports['autorun scope destruction'] = function(test) {
  var scope1;
  var scope2;
  var scope3;
  scope1 = T(function() {
    scope2 = T({
      fn:function() {
        scope3 = T(function() {});
      },
      detached: true,
    });
  });
  test.equal(scope1.parentScope, undefined);
  test.equal(scope2.parentScope, undefined);
  test.equal(scope3.parentScope, scope2);
  scope2.destroy();
  test.equal(scope3.parentScope, undefined);
  test.done();
};

exports['autorun priority'] = function(test) {
  var scope1;
  var scope2;
  var scope3;
  scope1 = T(function() {
    scope2 = T(function() {
      scope3 = T(function() {});
    });
  });
  test.equal(scope1.priority, 4000); // a.k.a. DEFAULT_AUTORUN_PRIORITY
  test.equal(scope2.priority, 3999);
  test.equal(scope3.priority, 3998);
  var scope4;
  var scope5;
  scope4 = T({
    fn: function() {
      scope5 = T(function() {});
    },
    priority: tbone.priority.highest,
  });
  test.equal(scope4.priority, tbone.priority.highest);
  test.equal(scope5.priority, tbone.priority.highest - 1);
  test.done();
};

exports['getName'] = function(test) {
  var me = T.bound(function fn1() {});
  test.equal(T.getName(me), 'fn1');
  test.equal(me.getName(), 'fn1');
  var scope1;
  var scope2;
  var scope3;
  scope1 = T(function fn2() {
    scope2 = T(function() {
      scope3 = T(function() {});
    });
  });
  test.equal(T.getName(scope1), 'fn2');
  test.equal(T.getName(scope2), 'fn2+');
  test.equal(T.getName(scope3), 'fn2++');
  var scope4 = T(function() {});
  test.equal(T.getName(scope4), 'na-' + scope4.tboneid);
  test.done();
};
