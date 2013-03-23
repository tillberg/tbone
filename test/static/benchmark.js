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

tbone.addTemplate('box', $('#tmpl_box').html());
$('#grid').append(_.map(_.range(100), function () {
    return '<div tbone="tmpl box root boxProps"></div>';
}).join(''));
tbone.render($('[tbone]'));


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

T(function () {
    $('#fps').text(T('fps'));
});

tbone.onLog(function (level, context, event, msg, data) {
    if (event === 'processQueue') {
        rendered();
    }
});