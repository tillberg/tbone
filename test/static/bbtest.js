(function () {

    var base = tbone.models.bbbase;


    test('backbone basic', function () {
        var me = new base();
        T('bb1', me);
        T('bb1.prop', 42);
        equal(T('bb1.prop'), 42);
        equal(me.query('prop'), 42);
        equal(me.get('prop'), 42);
        T('bb1', { other: 7 });
        equal(T('bb1.prop'), undefined);
        equal(me.query('prop'), undefined);
        equal(T('bb1.other'), 7);
        var other;
        T(function () {
            other = T('bb2.other');
        });
        T('bb2.other', 10);
        equal(other, undefined);
        T.drain();
        equal(other, 10);
    });

    test('backbone subprop', function () {
        var me = new base();
        T('bb2', me);
        T('bb2.sub.prop', 42);
        equal(T('bb2.sub.prop'), 42);
        equal(me.query('sub.prop'), 42);
        equal(me.get('sub').prop, 42);
        var other;
        T(function () {
            other = T('bb2.sub2.prop2');
        });
        T('bb2.sub2.prop2', 12);
        equal(other, undefined);
        T.drain();
        equal(other, 12);
    });

}());
