(function () {

    function addModelTests(name, base, supports) {
        test(name + ' basic', function () {
            var me = base.make();
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
            var count1 = 0;
            var count2 = 0;
            T(function () {
                other = T('bb2.other');
                count1++;
            });
            T(function () {
                T('bb2.other2');
                count2++;
            });
            T('bb2.other', 10);
            equal(count1, 1);
            equal(count2, 1);
            equal(other, undefined);
            T.drain();
            equal(count1, 2);
            equal(count2, 1);
            equal(other, 10);
        });

        test(name + ' subprop', function () {
            var me = base.make();
            T('bb2', me);
            T('bb2.sub.prop', 42);
            equal(T('bb2.sub.prop'), 42);
            equal(me.query('sub.prop'), 42);
            equal(me.get('sub').prop, 42);
            var other;
            var count1 = 0;
            var count2 = 0;
            T(function () {
                other = T('bb2.sub2.prop2');
                count1++;
            });
            T(function () {
                T('bb2.sub2.prop3');
                count2++;
            })
            T('bb2.sub2.prop2', 12);
            equal(count1, 1);
            equal(count2, 1);
            equal(other, undefined);
            T.drain();
            // count2 gets incremented even though prop3 doesn't change because
            // backbone models don't support deep property binding.
            equal(count1, 2);
            equal(count2, supports.deepBinding ? 1 : 2);
            equal(other, 12);
        });
    }

    addModelTests('backbone', tbone.models.bbbase, {
        deepBinding: false
    });

    addModelTests('tbone', tbone.models.base, {
        deepBinding: true
    });
}());
