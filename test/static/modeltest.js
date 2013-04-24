(function () {

    tbone.models.bbbase.make = function (opts) {
        return new this(opts);
    };

    function addModelTests(name, base, supports) {
        test(name + ' basic', function () {
            var me = base.make();
            T('me', me);
            T('me.prop', 42);
            equal(T('me.prop'), 42);
            equal(me.query('prop'), 42);
            equal(me.get('prop'), 42);
            T('me', { seven: 7 });
            equal(T('me.prop'), undefined);
            equal(me.query('prop'), undefined);
            equal(T('me.seven'), 7);
            var other;
            var count1 = 0;
            var count2 = 0;
            T(function () {
                other = T('me.other');
                count1++;
            });
            T(function () {
                T('me.other2');
                count2++;
            });
            T('me.other', 10);
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
            T('me', me);
            T('me.sub.prop', 42);
            equal(T('me.sub.prop'), 42);
            equal(me.query('sub.prop'), 42);
            equal(me.get('sub').prop, 42);
            var other;
            var count1 = 0;
            var count2 = 0;
            T(function () {
                other = T('me.sub2.prop2');
                count1++;
            });
            T(function () {
                T('me.sub2.prop3');
                count2++;
            })
            T('me.sub2.prop2', 12);
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

        test(name + ' text lookup', function () {
            var me = base.make();
            T('me', me);
            me.query('name', { first: 'sally', last: 'smith' });
            me.query('answer', 42);
            me.query('question', parseFloat('not a number'));
            me.query('nullified', null);
            var now = new Date();
            me.query('now', now);
            equal(me.text('name'), '');
            equal(me.text('name.first'), 'sally');
            equal(me.text('answer'), '42');
            equal(me.text('question'), '');
            equal(me.text('notexists'), '');
            equal(me.text('nullified'), '');
            equal(me.text('now'), now.toString());
        });

        test(name + ' parent detects subprop changes', function () {
            var me = base.make();
            T('me', me);
            (function () {
                var fired = 0;
                T(function () {
                    T('me');
                    fired++;
                });
                T('me.age', 7);
                T.drain();
                equal(fired, 2);
            }());
            (function () {
                var fired = 0;
                T(function () {
                    T('me.name');
                    fired++;
                });
                T('me.name.first', 'sally');
                T.drain();
                equal(fired, 2);
            }());
            (function () {
                var fired = 0;
                T(function () {
                    T('me');
                    T('me.age');
                    T('me.name');
                    fired++;
                });
                T('me.age', 6);
                T('me.name.last', 'smith');
                T.drain();
                equal(fired, 2);
            }());
        });

        test(name + ' shallow comparison on tree change', function () {
            var me = base.make();
            T('me', me);
            (function () {
                var fired = 0;
                T('me.age', 7);
                T(function () {
                    T('me');
                    fired++;
                });
                T('me', { age: 7 });
                T.drain();
                equal(fired, 1);
                T('me', { age: 8 });
                T.drain();
                equal(fired, 2);
            }());
            (function () {
                var fired = 0;
                T('me.age', 7);
                T(function () {
                    T('me.age');
                    fired++;
                });
                T('me', { age: 7 });
                T.drain();
                equal(fired, 1);
                T('me', { age: 8 });
                T.drain();
                equal(fired, 2);
            }());
        });

        if (supports.deepBinding) {
            test(name + ' deep comparison on tree change', function () {
                var me = base.make();
                T('me', me);
                (function () {
                    var fired = 0;
                    T('me.name', { first: 'sally', last: 'smith' });
                    T(function () {
                        T('me.name');
                        fired++;
                    });
                    T('me.name', { first: 'sally', last: 'smith' });
                    T.drain();
                    equal(fired, 1);
                    T('me.name', { first: 'sally', last: 'rogers' });
                    T.drain();
                    equal(fired, 2);
                }());
            });
        }

        if (supports.nonObjectRoot) {
            test(name + ' non-object root', function () {
                var me = base.make();
                T('me', me);
                me.query('', 42);
                equal(me.query(''), 42);
                equal(T('me'), 42);
                // Subproperties are no longer supported (this is a JS
                // restriction, more or less)
                T('me.prop', 7);
                equal(T('me.prop'), undefined);
            });
        }

        if (supports.invocable) {
            test(name + ' invocation', function () {
                var me = base.make();
                me('prop', 42);
                equal(me('prop'), 42);
                me('week', function () { return 7; });
                equal(me('week'), 7);
            });
        }

        test(name + ' self-reference', function () {
            var me = base.make();
            me.query('prop', 42);
            equal(me.attributes.prop, 42);
            ok(me.query(1, ''));
            ok(me.query(1, '').attributes);
            equal(me.query(1, '').attributes.prop, 42);
        });
    }

    addModelTests('backbone', tbone.models.bbbase, {
        deepBinding: false,
        nonObjectRoot: false,
        invocable: false
    });

    addModelTests('tbone', tbone.models.base, {
        deepBinding: true,
        nonObjectRoot: true,
        invocable: true
    });
}());
