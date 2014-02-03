_.each(templates, function(template, id) {
    tbone.addTemplate(id, template);
});


function tmpl(name, root) {
    var tmplId = name;
    var attrs = [];
    var inline = !(/^\w+$/).test(name);
    if (inline) {
        // name is actually just an anonymous template
        tmplId = 'tmpl' + (nextId++);
        // attrs.push('inline:' + tmplId);
        attrs.push('tmpl:' + tmplId);
        tbone.addTemplate(tmplId, name);
    } else {
        attrs.push('tmpl:' + tmplId);
    }
    if (root) {
        attrs.push(', root:' + root);
    }
    var $el = $('<div>').attr('tbone', attrs.join(', '));
    if (inline) {
        $el.html(name);
    }
    render($el);
    drain();
    return $el;
}

function text(name, root) {
    var $el = tmpl(name, root);
    return $el.text();
}

test('token render', function () {
    equal(text('There are <%=lights.count%> lights.'), "There are 4 lights.");
});

test('toggle & render', function () {
    T('state.on', undefined);
    var $test2 = tmpl('test2');
    equal($test2.text(), "Off");
    tbone.toggle('state.on');
    equal($test2.text(), "Off");
    drain();
    equal($test2.text(), "On");
    tbone.toggle('state.on');
    equal($test2.text(), "On");
    drain();
    equal($test2.text(), "Off");
});


test('ajax sleep', function () {
    var ajaxModel = tbone.models.ajax.extend({
        ajax: function (opts) {
            T('ajaxFetched.' + this.id, true);
            T.increment('numAjaxReqs');
            opts.success('\u2603');
        },
        url: function () {
            return '/snowman/' + this.id;
        }
    });
    _.each(_.range(6), function (i) {
        T.push('ajaxModels', ajaxModel.make({ id: i }));
        T.push('ajaxFetched', false);
    });
    var $el = tmpl('ajaxSleep');
    T.drain();
    equal(T('ajaxFetched.0'), false);
    equal(T('ajaxFetched.1'), true);
    equal(T('ajaxFetched.2'), true);
    equal(T('ajaxFetched.3'), false);
    equal(T('ajaxFetched.4'), false);
    equal(T('ajaxFetched.5'), false);
    equal(T('numAjaxReqs'), 2);

    T.unset('ajaxModels');
    T.unset('ajaxFetched');
    T.unset('numAjaxReqs');
});


function arrRender(arr) {
    return _.map(arr, function (n) { return n + ''; }).join(' ');
}

function numbersRender(arr) {
    return _.map(arr, function (n) { return '[' + n + ']'; }).join(' ');
}

test('collection binding', function () {
    var things2 = T('things2', thingsType.make());
    things2.push({ number: 2 });
    var $el = tmpl('numbers2', 'things2');
    equal($el.text(), arrRender([2]));
    things2.push({ number: 3 });
    drain();
    equal($el.text(), arrRender([2, 3]));
    // XXX should this keep the reset name from Backbone and reset be changed to
    // something else?
    things2.clear();
    equal($el.text(), arrRender([2, 3]));
    drain();
    equal($el.text(), arrRender([]));

    // model inside collection
    var things4 = T('things4', thingsType.make());
    things4.push({ number: 2 });
    var $el = tmpl(templates.numbers.replace(/things/g, 'things4'));
    equal($el.text(), numbersRender([2]));
    T('things4.0.number', 5);
    equal($el.text(), numbersRender([2]));
    drain();
    equal($el.text(), numbersRender([5]));
});


T('val', function() {
    return {
        truthy: true,
        falsy: false,
        nully: null,
        zero: 0,
        one: 1,
        primes: [2, 3, 5, 7],
        answer: 42,
        bob: 'bob',
        sally: 'sally',
        sub: {
            prop: 'erty'
        }
    };
});

var myNamespace = {
    value: 7,
    countchars: function(s) { return s.length; }
};

var myFunction = function(name) {
    return 'Hi, ' + name + '!';
};

test('template parsing of if/else', function () {
    equal(text('<% if (true) { %> yes <% } %>'), 'yes');
    equal(text('<%if(true){%> yes <%}%>'), 'yes');
    equal(text('<%\nif\n(true)\n{\n%> yes <%\n}\n%>'), 'yes');
    equal(text('<%\tif\t(true)\t{\t%> yes <%\t}\t%>'), 'yes');
    equal(text('<%if(true){%>yes<%}%>'), 'yes');
    equal(text('<% \t  if\n (true)\t \n { \t\t\t%> yes <%\t\t \n }\n\t \t %>'), 'yes');
    equal(text('<% if (true) { %> yes <% } else { %> two <% } %>'), 'yes');
    equal(text('<% if (false) { %> yes <% } else { %> two <% } %>'), 'two');
    equal(text('<% if (false) { %> yes <% } \n else\t \t \n{ \t%> two <%\t\t } \t\t\n %>'), 'two');
    equal(text('<% if (true) { %> yes <% } else if (true) { %> two <% } %>'), 'yes');
    equal(text('<% if (true) { %> yes <% } else if (true) { %> two <% } else { %> three <% } %>'), 'yes');
    equal(text('<% if (false) { %> yes <% } else if (false) { %> two <% } else { %> three <% } %>'), 'three');
    equal(text('<% if (false) { %> yes <% } else if (false) { %> two <% } %>'), '');
    equal(text('<%if(false){%> yes <%}else if(true){%> two <%}else{%> three <%}%>'), 'two');
    equal(text('<%\nif\n(false)\n{\n%> yes <%\n}\nelse\nif\n(true)\n{\n%> two <%\n}\nelse\n{\n%> three <%\n}\n%>'), 'two');
    equal(text('<%\t if\n\n(false) \t{%> yes <%\n \t}\t else\t\tif\n\n(false) \n \t {%> two <%\n} else\t{ %> three <%\n\n}\t \t%>'), 'three');

    function exprtest(expr, truthy) {
        equal(text('<% if (' + expr + ') { %> yes <% } %>'), truthy ? 'yes' : '');
    }

    // Don't patch booleans
    exprtest('true', true);
    exprtest('false', false);
    exprtest('!false', true);

    // Don't patch numbers
    exprtest('1', true);
    exprtest('0', false);
    exprtest('!0', true);
    exprtest('0 || 1', true);
    exprtest('1 && 1', true);
    exprtest('1 && 0', false);

    // Don't patch global things, or things declared with tbone.dontPatch
    exprtest('Math.round(0.9)', true);
    exprtest('Math.round(Math.PI) === 3', true);
    exprtest('Array.prototype.join.call(val.primes, ",") === "2,3,5,7"', true);

    tbone.dontPatch('myNamespace');
    exprtest('myNamespace.value === 7', true);

    // Basic lookups
    exprtest('val.truthy', true);
    exprtest('\nval.truthy\n', true);
    exprtest('val.falsy', false);
    exprtest('val.truthy && val.truthy', true);
    exprtest('!val.falsy', true);
    exprtest('!val.nully', true);
    exprtest('val.bob === "bob"', true);
    exprtest('val.sally === "bob"', false);
    exprtest('val.answer == "42"', true);
    exprtest('val.zero', false);
    exprtest('val.zero === 0', true);
    exprtest('typeof val.sub === "object"', true);
    exprtest('val.sub.prop === \'erty\'', true);
    exprtest('(val.sub).prop === \'erty\'', true);
    exprtest('val.sub["prop"] === \'erty\'', true);
    exprtest('(val.sub)["prop"] === \'erty\'', true);
    exprtest('val.bob.sub.prop', false);
    exprtest('val.bob.sub.prop === undefined', true);
    exprtest('val.notexist', false);
    exprtest('val.notexist === undefined', true);
    exprtest('!val.notexist', true);
    exprtest('val.answer===val.one*val.answer', true);
    exprtest('val.answer===(val.one*(val.answer))', true);
    exprtest('val.answer===(val.one*[val.answer][0])', true);
    exprtest('\nval.answer\n===\nval.zero\n', false);
    exprtest('\tval.answer\t===\tval.zero\t', false);

    /**
     * Function evaluation support is limited right now.  The parentheses are required below to
     * prevent .join from being part of the lookup, which would prevent passing context to the
     * join function.
     */
    exprtest('(val.primes || []).join("") === \'2357\'', true);
    exprtest('myNamespace.countchars(val.sally) === 5', true);
    T.dontPatch('myFunction');
    exprtest('myFunction("Sally")', 'Hi, Sally!');
});

test('template parsing of _.each', function () {
    equal(text('<% _.each([], function(n) { %> <%=n%> <% }); %>'), '');
    equal(text('<% _.each([1], function(n) { %> bob <% }); %>'), 'bob');
    equal(text('<% _.each([1, 2], function(n) { %> bob <% }); %>'), 'bob bob');
    equal(text('<% _.each([1, 2], function(n) { %> <%=n%> <% }); %>'), '1 2');
    equal(text('<%\n_\n.\neach\n(\n[\n1\n,\n2]\n,\nfunction\n(\nn\n)\n{\n%> <%=n%> <%\n}\n)\n;\n%>'), '1 2');
    equal(text('<%_.each([1,2],function(n){%> <%=n%> <%});%>'), '1 2');
    equal(text('<%\t  \n_\t.    each \n(\t[  \n1,\n  2],\t   \n\tfunction\t ( n \t)\t{%> <%=n%> <%\t}  ) \t\n ;%>'), '1 2');
    equal(text('<% _.each([1, 2], function(n) { %><% if (true) { %> <%=n%> <% } %><% }); %>'), '1 2');
    equal(text('<% _.map([1, 2], function(n) { %><% if (true) { %> <%=n%> <% } %><% }); %>'), '1 2');

    equal(text('<% _.each(val.primes, function(prime, i) { %> <%=prime%> <% }); %>'), '2 3 5 7');
    equal(text('<% _.each(val.primes, function(prime, i) { %> <%=i%> <% }); %>'), '0 1 2 3');

    equal(text('numbers'), numbersRender([2, 3, 7, 42]));
    equal(text('<% _.each(things, function() { %> this is a thing <% }); %>'),
        _.map([2, 3, 7, 42], function () { return 'this is a thing'; }).join(' '));

});

test('template render with tb-root', function () {
    equal(text('number', 'things.3'), '[42]');
    equal(text('numbers2', 'things'), arrRender([2, 3, 7, 42]));
    var thingsroot = T('thingsroot', thingsType.make());
    thingsroot.push({ number: 10 });
    thingsroot.push({ number: 20 });
    var $el = tmpl('numbers2', 'thingsroot');
    equal($el.text(), arrRender([10, 20]));
    T('thingsroot.0.number', 11);
    T.drain();
    equal($el.text(), arrRender([11, 20]));
});

var counter_counter;
tbone.createView('counter', function() {
    this.$('a').each(function() {
        counter_counter++;
        this.counter = (this.counter || 0) + 1;
        $(this).attr('class', 'counter-' + this.counter);
    });
});

test('ready called once per view render', function () {
    counter_counter = 0;
    var $el = tmpl('counter');
    equal($el.find('.counter-1').length, 1);
    equal(counter_counter, 1);

    counter_counter = 0;
    var things5 = T('things5', thingsType.make());
    things5.push({ number: 2 });
    things5.push({ number: 3 });
    $el = tmpl('countercoll', 'things5');
    equal(counter_counter, 2);
    equal($el.find('.counter-1').length, 2);

    counter_counter = 0;
    things5.push({ number: 4 });
    T.drain();
    equal(counter_counter, 1); // only the { number: 4 } model needs to be rendered anew
    equal($el.find('.counter-1').length, 3);
});

tbone.createView('interCounter', tbone.views.counter, function () {});
tbone.createView('subCounter', tbone.views.interCounter, function () {});

test('views get CSS class for each parent view', function () {
    var $el = tmpl('subCounter');
    equal($el.hasClass('subCounter'), true);
    equal($el.hasClass('interCounter'), true);
    equal($el.hasClass('counter'), true);
});

test('pass data to view', function () {
    var $el = tmpl('words');
    T('words', [
        { word: 'World' }
    ]);
    T.drain();
    equal($el.text(), '[ World ]');
    T('words.0.word', 'Yo');
    T.drain();
    equal($el.text(), '[ Yo ]');
    T('words.0', { word: 'Hi' });
    T.drain();
    equal($el.text(), '[ Hi ]');
});

test('pass model to view', function () {
    var $el = tmpl('words');
    var world = tbone.make();
    world('word', 'World');
    T('words', [
        world
    ]);
    T.drain();
    equal($el.text(), '[ World ]');
    T('words.0.word', 'Yo');
    T.drain();
    equal($el.text(), '[ Yo ]');
    var hi = tbone.make();
    hi('word', 'Hi');
    T('words.0', hi);
    T.drain();
    equal($el.text(), '[ Hi ]');
});

test('denullText', function () {
    equal(tbone.denullText('hello'), 'hello');
    equal(tbone.denullText(''), '');
    equal(tbone.denullText(undefined), '');
    equal(tbone.denullText(null), '');
    var d = new Date();
    equal(tbone.denullText(d), d + '');
    equal(tbone.denullText(NaN), '');
    equal(tbone.denullText(0), '0');
    equal(tbone.denullText(42), '42');
    equal(tbone.denullText(true), 'true');
    equal(tbone.denullText(false), 'false');
    equal(tbone.denullText({}), '');
    equal(tbone.denullText({ some: 'prop' }), '');
    equal(tbone.denullText([]), '');
    equal(tbone.denullText([42, 100]), '');
});
