
T('boxProps', function () {
    var count = T('count');
    return {
        top: Math.sin(count / 10) * 10,
        left: Math.cos(count / 10) * 10,
        color: (count) % 255,
        content: count % 100
    };
});

function increment() {
    T('count', (T('count') || 0) + 1);
    _.defer(increment);
}
increment();

_.each($('script[type="text/tbone-tmpl"]'), function (el) {
    var name = $(el).attr('name');
    tbone.addTemplate(name, $(el).html());
});

var N = 100;

var mode = 1;
if (mode === 0) {
    // Use only templates for dynamic CSS
    $('#grid').append(_.map(_.range(N), function () {
        return '<div tbone="tmpl box root boxProps"></div>';
    }).join(''));
    tbone.render($('[tbone]'));
} else if (mode === 1) {
    // No template refreshes; use view w/T-function instead
    $('#grid').append(_.map(_.range(N), function () {
        return '<div class="box" tbone="tmpl box2 root boxProps"></div>';
    }).join(''));
    tbone.createView('box2', function () {
        var self = this;
        var $inner = this.$el.children();
        T(function () {
            var props = self.query();
            $inner.css({
                top: props.top,
                left: props.left,
                background: 'rgb(0,0,' + props.color + ')'
            });
            $inner.text(props.content);
        });
    });
    tbone.render($('[tbone]'));
} else {
    // Use single T-function but still set CSS for each element individually
    $('#grid').append(_.map(_.range(N), function () {
        return '<div class="box" tbone="tmpl box2"></div>';
    }).join(''));
    tbone.render($('[tbone]'));
    var $inners = $('.box-inner');
    T(function () {
        var props = T('boxProps');
        $inners.each(function () {
            var $inner = $(this);
            $inner.css({
                top: props.top,
                left: props.left,
                background: 'rgb(0,0,' + props.color + ')'
            });
            $inner.text(props.content);
        });
    });
}


var renders = 0;
var lastFpsMeasure;
var rendered = function () {
    renders += 1;
};
var fps = 0;
var fpsTimer = function () {
    var now = (new Date()).getTime();
    var dt = now - lastFpsMeasure;
    lastFpsMeasure = now;
    if (!dt || dt > 1000) { dt = 1000; }
    var decay = Math.min(0.2, dt / 1000);
    fps = decay * (1000 * Math.max(0, renders) / dt) + (1 - decay) * fps;
    var rounded = Math.round(fps);
    var prevFps = T('fps');
    if (rounded !== prevFps) {
        T('fps', rounded >= 1 ? rounded : '');
        // avoid counting the re-render of the fps meter toward fps measurement:
        renders = -1;
    } else {
        renders = 0;
    }
    setTimeout(fpsTimer, 100);
};
fpsTimer();

tbone.onLog(function (level, context, event, msg, data) {
    if (event === 'processQueue') {
        rendered();
    }
});