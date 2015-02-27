var equal = strictEqual;

test('tbone id queries', function () {
    var coll = tbone.collections.base.make();
    var me = tbone.models.base.make();
    me('coll', coll);
    coll.add({ id: 7, name: 'bob' });
    var model2 = tbone.models.base.make();
    model2.query('', { id: 2, name: 'susan' })
    coll.add(model2);
    coll.add({ id: 42, name: 'sally' });
    equal(me('coll.#2.name'), 'susan');
    var name42;
    T(function () {
        name42 = me('coll.#42.name');
    });
    var name0;
    T(function () {
        name0 = me('coll.#0.name');
    });
    var len;
    T(function () {
        len = coll('size');
    });
    equal(name42, 'sally');
    coll('#42.name', 'polly');
    equal(name42, 'sally');
    T.drain();
    equal(len, 3);
    equal(name42, 'polly');
    me('coll.#42', { id: 0, name: 'robert' });
    equal(name42, 'polly');
    T.drain();
    equal(name42, undefined);
    equal(name0, 'robert');

    // Test adding an unidentified model, then setting its ID
    var count = _.keys(me('coll')).length;
    var john = tbone.models.base.make();
    john('name', 'john');
    coll.add(john);
    T.drain();
    equal(len, 4);
    equal(me('coll.size'), 4);
    equal(_.keys(me('coll')).length, count + 1);
    john('id', 'awesome');
    T.drain();
    equal(me('coll.#awesome.name'), 'john');

    // Test removing a model by model instance
    coll.remove(model2);
    equal(_.keys(me('coll')).length, count);
    equal(coll('#2.name'), undefined);

    // Test removing a non-existent model by id
    coll.remove(42);
    equal(_.keys(me('coll')).length, count);

    // Test removing a model by model by id
    coll.remove(0);
    equal(_.keys(me('coll')).length, count - 1);
    equal(coll('#0.name'), undefined);

    equal(len, 4);
    T.drain();
    equal(len, 2);
});


asyncTest('async model', function () {
    expect( 3 );

    var src = tbone.make();
    src('prop', 42);
    var me = tbone.models.async.make(function (cb) {
        var val = src('prop');
        setTimeout(function () {
            cb({ 'asyncprop': val });
            _.defer(sync);
        }, 10);
    });
    equal(me('asyncprop'), undefined);
    var numUpdates = 0;
    function sync () {
        numUpdates++;
        if (numUpdates === 1) {
            equal(me('asyncprop'), 42);
            src('prop', 100);
        } else {
            equal(me('asyncprop'), 100);
            start();
        }
    }
});

asyncTest('async model abort', function () {
    expect(1);
    var src = tbone.make();
    src('prop', 42);
    var me = tbone.models.async.make(function (cb) {
        src('prop');
        this.abortPrevious();
        return {
            onAbort: function () {
                ok(true, 'called onAbort');
                start();
            }
        }
    });
    setTimeout(function () {
        src('prop', 36);
    }, 0);
});

test('async model with rolling update', function () {
    var callbacks = [];
    var me = tbone.make();
    var model = tbone.models.async.make({
        state: function (cb) {
            me('prop');
            callbacks.push(cb);
        }
    });
    equal(callbacks.length, 1);
    equal(model(''), undefined);
    me('prop', 1);
    T.drain();
    me('prop', 2);
    T.drain();
    equal(callbacks.length, 3);
    callbacks[0]('hello'); // accepted - newer generation than last update
    equal(model(''), 'hello');

    callbacks[2]('yo');
    equal(model(''), 'yo');

    callbacks[1]('hi'); // rejected - old generation
    equal(model(''), 'yo');
});
