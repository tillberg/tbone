var render = tbone.render;
var drain = tbone.drain;

T('lights', function() {
    return {
        count: 4,
        picard: {
            name: 'Jean-Luc'
        }
    };
});

T('state', tbone.models.base.make());

var echo = tbone.models.bound.extend({
    state: function() {
        return {
            echo: tbone.lookup('lights.count')
        };
    }
});

var origText = $.fn.text;
$.fn.text = function() {
    return _.string.trim(origText.call(this)).replace(/\s+/g, ' ');
};

var nextId = 1;

test('autorun', function () {
    T('state2', {});
    T('state2.count', 4);
    var count = 2;
    tbone(function() {
        count = tbone.lookup('state2.count');
    });
    equal(count, 4);
    T('state2.count', 5);
    equal(count, 4);
    drain();
    equal(count, 5);
});

test('create model instance', function () {
    T('echo', echo.make());
    equal(tbone.lookup('echo.echo'), 4);

    // non-top-level
    T('group.echo', echo.make());
    equal(tbone.lookup('group.echo.echo'), 4);
});


var thingsType = tbone.models.base.make();
var things = T('things', thingsType.make());
things.push({ number: 2 });
things.push({ number: 3 });
things.push({ number: 7 });
things.push({ number: 42 });

test('tbone.lookup', function () {
    equal(tbone.lookup('lights').count, 4);
    equal(tbone.lookup('lights.count'), 4);
    equal(tbone.lookup('lights.picard.name'), 'Jean-Luc');
    equal(tbone.lookup('lights.picard.notexist'), undefined);
    equal(tbone.lookup('things.0.number'), 2);
    equal(tbone.lookup('things.3.number'), 42);

    /**
     * XXX should this be the case?
     * model.toJSON() does not return the same object on successive calls.
     */
    // notEqual(T('lights'), T('lights'));

    /**
     * T.lookup <===> T(string)
     */
    equal(T.lookup('lights').count, T('lights').count);
    equal(tbone.lookup('lights.picard.notexist'), T('lights.picard.notexist'));
    equal(tbone.lookup('things.3.number'), T('things.3.number'));
});

test('tbone.set', function () {
    var thing = T('thing', tbone.models.base.make());
    thing.set('count', 4);
    equal(thing.get('count'), 4);
    equal(T('thing.count'), 4);

    T.set('thing.count', 5);
    equal(T('thing.count'), 5);

    T('thing.count', 42);
    equal(thing.get('count'), 42);

    /**
     * XXX This should be made to work, I think.  a la implicit mkdir -p
     */
    // T('thing.sub.prop', 'hi');
    // equal(T('thing.sub.prop'), 'hi');

    T('thing.sub', { prop: 4 });
    equal(T('thing.sub.prop'), 4);

    var subprop;
    T(function() {
        subprop = T('thing.sub.prop');
    });
    equal(subprop, 4);

    T('thing.sub.prop', 5);
    equal(T('thing.sub.prop'), 5);
    equal(subprop, 4);

    T.drain();
    equal(subprop, 5);

    T('thing', { count: 6 });
    // XXX fix these, maybe?
    // equal(T.data.toJSON().thing.name, 'passive');
    // equal(T.data.toJSON().thing.get('count'), 6);

    T('thing', { other: 4 });
    equal(T('thing.other'), 4);
    equal(T('thing.count'), undefined);

    var morethings = T('morethings', thingsType.make());
    morethings.push({ number: 6 });
    equal(T('morethings.0.number'), 6);
    equal(T('morethings.0.number', 100), 100);
    equal(T('morethings.0.number'), 100);

    T('baseprop', 5);
    var baseprop;
    T(function () {
        baseprop = T('baseprop');
    });
    equal(baseprop, 5);
    T('baseprop', 8);
    T.drain();
    equal(baseprop, 8);
});

test('set w/ function', function () {
    T('first', 'sally');
    T('last', 'rogers');
    T('fullname', function () { return T('first') + ' ' + T('last'); });
    T.drain();
    equal(T('fullname'), 'sally rogers');
    T('last', 'smith');
    T.drain();
    equal(T('fullname'), 'sally smith');
});

test('fire change event when adding a model', function () {
    var count = 0;
    T(function() {
        T('mysub.prop');
        count++;
    });
    T('mysub', function () {
        return { 'else': 4 };
    });
    T.drain();
    equal(count, 2);
});

test('tbone model with simultaneous changes to bound properties', function () {
    // This is kind of an odd test but it really came up as a bug ~5/6/2013
    var me = tbone.models.base.make();
    me('', { a: 5, z: 7 });
    var calls = 0;
    T(function () {
        me('a');
        calls++;
    });
    var calls2 = 0;
    T(function () {
        me('z');
        calls2++;
    });
    me('', { a: 4, z: 6 });
    T.drain();
    equal(calls, 2);
    equal(calls2, 2);
});

test('model increment', function () {
    var me = tbone.make();
    me('num', 7);
    var num;
    T(function () {
        num = me('num');
    });
    equal(num, 7);
    equal(me('num'), 7);
    me.increment('num');
    T.drain();
    equal(num, 8);
    equal(me('num'), 8);
    me.increment('num', 34);
    T.drain();
    equal(num, 42);
    equal(me('num'), 42);
});

test('unbind property on second pass', function () {
    var me = tbone.make();
    var count = 0;
    var runOnce = false;
    T(function () {
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
    equal(count, 2);
});

test('update date to same time', function () {
    var me = tbone.make();
    var count = 0;
    me('date', new Date(1383851885098));
    T(function () {
        me('date');
        count++;
    });
    me('date', new Date(1383851885098));
    T.drain();
    equal(count, 1);
    // sanity check:
    me('date', new Date(1383851885099));
    T.drain();
    equal(count, 2);
});

test('runOnlyOnce', function () {
    var me = tbone.make();
    var count = 0;
    T.runOnlyOnce(function () {
        count += 1;
        me('prop');
    });
    me('prop', 10);
    T.drain();
    equal(count, 1);
});

test('readSilent', function () {
    var me = tbone.make();
    var prop;
    me('prop', 20);
    T(function () {
        prop = me.readSilent('prop');
    });
    me('prop', 30);
    T.drain();
    equal(prop, 20);
});

test('create bound model inside T-function', function () {
    // bound models should run their own T-functions as top-level
    // T-functions, not as children of any T-function that may have
    // created them.
    var me = tbone.make();
    var val;
    me('num', 3);
    T(function () {
        var num = me('num');
        me('sub.' + num, function () {
            return num * me('num');
        });
    });
    T.drain();
    equal(me('sub.3'), 3 * 3);
    me('num', 5);
    T.drain();
    equal(me('sub.3'), 3 * 5);
    equal(me('sub.5'), 5 * 5);
    me('num', 7);
    T.drain();
    equal(me('sub.3'), 3 * 7);
    equal(me('sub.5'), 5 * 7);
    equal(me('sub.7'), 7 * 7);
});

test('model destroy', function () {
    var me = tbone.make();
    var val;
    me('num', 42);
    me('prop', function () {
        val = me('num');
        return val;
    });
    var prop = me.queryModel('prop');
    equal(val, 42);
    T.drain();
    equal(me('prop'), 42);
    prop.destroy();
    me('num', 43);
    T.drain();
    equal(val, 42);
    equal(me('prop'), undefined);
});

asyncTest('autorun js error handling', function () {
    // autorun should not intercept JS errors -- they should break all the way
    // out past scope.execute and drainqueue -- but we should still continue to
    // execute other scopes after a setTimeout.
    expect( 7 );
    var me = tbone.make();
    me('prop', 10);
    var ranFirst = false;
    var ranSecond = false;
    var threwException = false;
    try {
        me(function () {
            me('prop');
            ranFirst = true;
            me.nonExistent.prop = 'boom';
        }, 2);
    } catch (e) {
        threwException = true;
    }
    equal(threwException, true, 'exception bubbles out of autorun invocation');
    me(function () {
        me('prop');
        ranSecond = true;
    }, 1);
    equal(ranFirst, true, 'first function ran');
    equal(ranSecond, true, 'second function ran');
    me('prop', 20);
    threwException = false;
    ranFirst = false;
    ranSecond = false;
    try {
        T.drain();
    } catch (e) {
        threwException = true;
    }
    equal(threwException, true, 'exception bubbles out of drain invocation');
    equal(ranFirst, true, 'first function ran second time');
    equal(ranSecond, false, 'second function should not have run yet');
    var checksLeft = 10;
    function check () {
        if (ranSecond || !checksLeft) {
            equal(ranSecond, true, 'second function ran second time');
            QUnit.start();
        } else {
            checksLeft--;
            setTimeout(check, 1);
        }
    }
    check();
});
