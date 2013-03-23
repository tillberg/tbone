#!/usr/bin/env node

var common = require('./utils');
var _ = require('underscore')._;
var fs = require('fs');
var zlib = require('zlib');

var tasks = [
  {
    name: 'resetself',
    watch: /tbone\/autorun\//,
    exec: function() {
      info('Restarting run.js...');
      _.defer(function() {
        process.exit(0);
      });
    },
    execInterval: 1000,
    execOnStart: false
  },
  {
    name: 'jshint',
    watch: /src\/.+.js/,
    exec: function() {
      info('JSHinting...');
      var files = fs.readdirSync('src/');
      files = _.filter(files, function (f) {
        return f !== 'footer.js' && f !== 'header.js';
      });
      files = _.map(files, function (f) {
        return 'src/' + f;
      });
      var cmd = [
        'autorun/node_modules/jshint/bin/hint --config .jshintrc ' + files.join(' ')
      ].join(';');
      exec('sh', ['-c', cmd], { cwd: './', pipe: true }, function(err) {
        if (err) {
          warn('JSHint/gjslint had errors.');
        } else {
          info('Certified lint free.');
          exec('touch', ['compile.py'], { cwd: './' });
        }
      });
    },
    execInterval: 100
  },
  {
    name: 'compile',
    watch: /compile.py/,
    exec: function() {
      info('Compiling...');
      var sizes = {};
      var variants = [
        'debug minified',
        'debug simpcomp',
        'debug advcomp',
        'release advcomp min'
      ];
      var done = _.after(variants.length, function() {
        info('Compile Succeeded.');
        _.each(variants, function(variant, i) {
          var s = sizes[variant];
          info('<<blue>>' + _.pad(variant.match(/\w+ \w+/), 18) + ': <<green>>' + _.pad(s.raw, 5) +
               '<<grey>> B, ' + (i === variants.length - 1 ? '<<*green*>>' : '<<green>>') +
               _.pad(s.gzipped, 4) + '<<grey>> B gzipped.');
        });
      });
      _.each(variants, function(variant) {
        var parts = variant.split(' ');
        var debug = parts[0] === 'debug' ? 'TBONE_DEBUG=true ' : '';
        var fileext = parts[2];
        var opt_level = ({
          minified: 'WHITESPACE_ONLY',
          simpcomp: 'SIMPLE_OPTIMIZATIONS',
          advcomp: 'ADVANCED_OPTIMIZATIONS'
        })[parts[1]];
        var cmd = debug + 'OPTIMIZATION_LEVEL=' + opt_level + ' python compile.py';
        exec('sh', ['-c', cmd], { cwd: './' }, function(err, data) {
          if (err) {
            warn('Compile failed for ' + variant + '.');
          } else {
            if (fileext) {
              fs.writeFile('build/tbone.' + fileext + '.js', data);
            }
            zlib.gzip(data, function(err, gzipped) {
              sizes[variant] = { raw: data.length, gzipped: gzipped.length };
              done();
            });
          }
        });
      });
    },
    execInterval: 500
  },
  {
    name: 'copy',
    watch: /build\/tbone.min.js$/,
    exec: function() {
      var cmd = [
        'cp build/tbone.debug.js $TARGET_DIR/tbone.js',
        'cp build/tbone.min.js build/tbone.min.js.map $TARGET_DIR/',
        'cp build/tbone.debug.js test/static/tbone.js',
        'cp build/tbone.min.js test/static/tbone.min.js'
      ].join(';');
      exec('sh', ['-c', cmd], { cwd: './' }, function(err, data) {
        if (err) {
          warn('Copy failed.');
        }
      });
    },
    execInterval: 100
  },
  {
    name: 'test',
    watch: /\/tbone\/test\//,
    exec: function() {
      var cmd = [
        'fuser -ks -HUP 9238/tcp',
        'sleep 0.5', // we need to wait for the test process to actually shut down the connection
        './test-headless.js'
      ].join(';');
      exec('sh', ['-c', cmd], { cwd: 'test/', pipe: true });
    },
    execInterval: 2000,
    execOnStart: false
  }
];

_.each(tasks, function(opts) {
  var _exec = opts.exec;
  var timeout;
  opts.exec = function() {
    if (!timeout) {
      timeout = setTimeout(function() {
        timeout = null;
        _exec();
      }, opts.execInterval);
      return true;
    }
    return false;
  };
  if (opts.execOnStart !== false) {
    opts.exec();
  }
});

var path = require('path');
var monitor = exec(path.join(__dirname, 'monitor.py'), [path.resolve('./')], { cwd: './' }, function(err, data) {
  error('monitor exited');
  process.exit(1);
});
monitor.stdout.on('line', function(line) {
  var match = (/(\w+) (.*)/).exec(line);
  var filename = match[2];
  var tasksToExec = _.filter(tasks, function(opts) {
    return filename.match(opts.watch);
  });
  var tasksQueued = _.filter(tasksToExec, function(opts) {
    return opts.exec();
  });
  if (tasksQueued.length) {
    info('executed [' + _.pluck(tasksQueued, 'name').join(', ') + '] due to change: ' + line);
  }
});

info('run.js started.');
