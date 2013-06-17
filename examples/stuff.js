
tbone.createModel('date_raw').singleton();

var updates = 0;
(function updateTime() {
    tbone.set('date_raw.ms', new Date().getTime());
    setTimeout(updateTime, 5);
}());

tbone.createModel('now', function() {
    var ms = tbone.lookup('date_raw.ms');
    return {
        ms: ms,
        date: new Date(ms),
        string: new Date(ms).toISOString()
    };
}).singleton();

T(function() {
    $('#test2').text("It's " + tbone.lookupText('now.string'));
});
