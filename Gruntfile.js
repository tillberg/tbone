module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    // Task Configuration
    clean: {
      dist: ['dist']
    },

    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      src: {
        src: ['src/**/*.js']
      },
      //test: {
      //  src: ['test/**/*.js']
      //}
    },

    concat: {
      //options: {
      //  separator: ';',
      //},
      dist: {
        src: [
          'src/snippet/header.js',
          'src/init.js',
          'src/scheduler/timer.js',
          'src/scheduler/autorun.js',
          'src/scheduler/scope.js',
          'src/scheduler/drainqueue.js',
          'src/model/core/query.js',
          'src/model/core/base.js',
          'src/model/core/bound.js',
          'src/model/core/async.js',
          'src/model/core/collection.js',
          'src/model/fancy/sync.js',
          'src/model/fancy/ajax.js',
          'src/model/fancy/localstorage.js',
          'src/model/fancy/location.js',
          'src/model/fancy/localstoragecoll.js',
          'src/dom/template/init.js',
          'src/dom/template/render.js',
          'src/dom/view/hash.js',
          'src/dom/view/base.js',
          'src/dom/view/render.js',
          'src/dom/view/create.js',
          'src/export.js',
          'src/ext/bbsupport.js',
          'src/snippet/footer.js'
        ],
        dest: 'dist/<%= pkg.name %>.js',
      },
    },

    uglify: {
      options: {
        sourceMap: 'dist/<%= pkg.name %>.js.map',
        banner: '/*! <%= pkg.name %> <%= pkg.version %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
      },
      build: {
        src: 'dist/<%= pkg.name %>.js',
        dest: 'dist/<%= pkg.name %>.min.js'
      }
    },

    qunit: {
      files: ['test/static/index.html']
    },

    connect: {
      server: {
        options: {
          keepalive: true,
          port: 3000,
        }
      }
    },

    watch: {
      scripts: {
        files: ['src/**/*.js'],
        tasks: ['jshint']
      },
    }

  });

  // These plugins provide necessary tasks.
  require('load-grunt-tasks')(grunt);

  // Load custom build tasks
  grunt.loadTasks("build");

  // Default task(s).
  grunt.registerTask('test', ['templates', 'qunit']);
  grunt.registerTask('default', ['clean', 'jshint', 'concat', 'test', 'uglify']);
  grunt.registerTask('server', ['default', 'connect']);

};
