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

function getWatcher(model, props) {
  var obj = {};
  _.each(props, function(prop) {
    T(function() {
      model(prop);

      // If you hit this and there's not a bug in TBone, you
      // forgot to add a reset() call:
      assert.notEqual(obj[prop], true, 'getWatchCounter obj.' + prop + ' should not be true');
      obj[prop] = true;
    });
  });
  obj.reset = function reset() {
    _.each(props, function(prop) {
      obj[prop] = false;
    });
  };
  obj.reset();
  return obj;
}

exports['model array mutations'] = function(test) {
    var me = tbone.make();
    me('', []);
    var watch = getWatcher(me, ['__self__', '0', '1', '2', 'length']);
    me.push('', 'hi');
    test.equal(me('0'), 'hi');
    test.equal(me('1'), undefined);
    test.equal(me('length'), 1);
    T.drain();
    test.equal(watch.__self__, true);
    test.equal(watch[0], true);
    test.equal(watch[1], false);
    test.equal(watch[2], false);
    test.equal(watch.length, true);
    watch.reset();
    me.push('', 'world');
    test.equal(watch.__self__, false);
    test.equal(me('1'), 'world');
    test.equal(me('length'), 2);
    T.drain();
    test.equal(watch.__self__, true);
    test.equal(watch[0], false);
    test.equal(watch[1], true);
    test.equal(watch.length, true);
    watch.reset();
    me.unshift('say');
    test.equal(me('0'), 'say');
    test.equal(me('1'), 'hi');
    test.equal(me('2'), 'world');
    test.equal(me('length'), 3);
    T.drain();
    test.equal(watch.__self__, true);
    test.equal(watch[0], true);
    test.equal(watch[1], true);
    test.equal(watch[2], true);
    test.equal(watch.length, true);
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
    me(function() {
      me('prop');
      ranFirst = true;
      me.nonExistent.prop = 'boom';
    }, 2);
  } catch (e) {
    threwException = true;
  }
  test.equal(threwException, true, 'exception bubbles out of autorun invocation');
  me(function() {
    me('prop');
    ranSecond = true;
  }, 1);
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
