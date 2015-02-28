'use strict';

var _ = require('lodash');
var gulp = require('gulp');
var gutil = require('gulp-util');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var concat = require('gulp-concat');
var replace = require('gulp-replace');
var jshint = require('gulp-jshint');
var gzip = require('gulp-gzip');
var size = require('gulp-size');
var mocha = require('gulp-mocha');
var qunit = require('node-qunit-phantomjs');
var del = require('del');

var path = require('path');
var fs = require('fs-extra')
var spawn = require('child_process').spawn;

var dest = 'dist/';

gulp.task('clean', function (cb) {
  del([dest, 'test/dist'], cb);
});

var coreFiles = [
  'src/init.js',
  'src/model/core/base.js',
  'src/scheduler/timer.js',
  'src/scheduler/autorun.js',
  'src/scheduler/scope.js',
  'src/scheduler/drainqueue.js',
  'src/model/core/query.js',
  'src/model/core/bound.js',
];

var extFiles = coreFiles.concat([
  'src/model/core/async.js',
  'src/model/core/collection.js',
  'src/model/fancy/ajax.js',
  'src/model/fancy/localstorage.js',
  'src/model/fancy/location.js',
  'src/model/fancy/localstoragecoll.js',
  'src/ext/react_init.js',
]);

function wrapFiles (files) {
  return ['src/snippet/header.js'].concat(files).concat(['src/snippet/footer.js']);
}

var versions = {
  core: {
    files: wrapFiles(coreFiles),
    suffix: '_core',
  },
  main: {
    files: wrapFiles(extFiles),
    suffix: '',
  },
};

_.each(versions, function (version, name) {
  var files = version.files;
  var suffix = version.suffix;
  function tn (n) {
    return n + ':' + name;
  }

  var jsFilename = 'tbone' + suffix + '.js';
  var jsFullPath = path.join(dest, jsFilename);
  var minJsFilename = 'tbone' + suffix + '.min.js';
  var minJsFullPath = path.join(dest, minJsFilename);

  gulp.task(tn('jshint'), function () {
    return gulp.src(files.concat(['!src/snippet/*.js']))
      .pipe(jshint())
      .pipe(jshint.reporter('jshint-stylish'));
  });

  gulp.task(tn('concat'), [tn('jshint')], function () {
    return gulp.src(files)
      .pipe(concat(jsFilename))
      .pipe(gulp.dest(dest));
  });

  gulp.task(tn('compile'), [tn('concat')], function () {
    return gulp.src([jsFullPath])
      .pipe(concat(minJsFilename))
      .pipe(replace('var TBONE_DEBUG = !!root.TBONE_DEBUG;\n', '\n'))
      .pipe(sourcemaps.init())
      .pipe(uglify({
        compress: {
          unsafe: true,
          global_defs: { TBONE_DEBUG: false },
        }
      }))
      .pipe(sourcemaps.write('./'))
      .pipe(gulp.dest(dest));
  });

  gulp.task(tn('compress'), [tn('compile')], function () {
    return gulp.src([minJsFullPath])
      .pipe(size({ showFiles: true }))
      .pipe(gzip({ gzipOptions: { level: 9 } }))
      .pipe(size({ showFiles: true }))
      .pipe(gulp.dest(dest));
  });

  gulp.task(tn('build'), [tn('concat'), tn('compile'), tn('compress')], _.noop);

  gulp.task(tn('test'), [tn('build')], function (done) {
    var tmpFolder = 'tmp/test_' + name;
    fs.copySync('test/', tmpFolder);
    fs.copySync(jsFullPath, path.join(tmpFolder, 'tbone.js'));
    var mochaOpts = {
      reporter: 'dot',
      exit: false,
    };
    if (name === 'core') {
      mochaOpts.grep = '@core';
    }
    var sources = [
      tmpFolder + '/**/*.js',
      '!' + path.join(tmpFolder, 'tbone.js'),
    ];
    gulp.src(sources, {read: false})
      .pipe(mocha(mochaOpts))
      .on('error', console.error)
      .on('end', done);
  });
});

gulp.task('build_all', _.map(_.keys(versions), function (name) { return 'test:' + name; }), function (cb) {
  if (process.env.TARGET_PATH) {
    var srcFilename = 'tbone.js';
    gutil.log('Copying ' + gutil.colors.blue(srcFilename) + ' to ' + gutil.colors.blue(process.env.TARGET_PATH));
    fs.copy(path.join(dest, srcFilename), process.env.TARGET_PATH, cb);
  } else {
    cb();
  }
});
gulp.task('test', ['build_all']);
gulp.task('default', ['build_all']);

gulp.task('restart-gulp', function () {
  console.log('restarting gulp...');
  process.exit(0);
});

gulp.task('watch', ['build_all'], function () {
  gulp.watch(['gulpfile.js'], ['restart-gulp']);
  gulp.watch(['src/**/*.js', 'test/**/*'], ['build_all']);
});
