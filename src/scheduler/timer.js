/**
 * scheduler/timer.js
 */

function now () {
    return new Date().getTime();
}

/**
 * Returns a function that returns the elapsed time.
 * This is only used when TBONE_DEBUG is set, and should get removed
 * entirely by the release compile.
 * @return {function(): Number} Function that returns elapsed time.
 */
function timer() {
    var started;
    var cumulative;
    var me = {
        stop: function stop() {
            cumulative = now() - started;
        },
        start: function start() {
            started = now();
        },
        done: function done() {
            me.stop();
            timers.pop();
            if (timers.length) {
                timers[timers.length - 1].start();
            }
            return cumulative;
        }
    };
    me.start();
    if (timers.length) {
        timers[timers.length - 1].stop();
    }
    timers.push(me);
    return me;
}

var timers = [];
