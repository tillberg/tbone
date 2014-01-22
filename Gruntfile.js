module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    // Task Configuration
    clean: {
      dist: ['dist', 'test/dist']
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
        report: 'min',
        sourceMap: 'dist/<%= pkg.name %>.js.map',
        banner: '/*! <%= pkg.name %> <%= pkg.version %> <%= grunt.template.today("yyyy-mm-dd") %> */'
      },
      build: {
        src: 'dist/<%= pkg.name %>.js',
        dest: 'dist/<%= pkg.name %>.min.js'
      }
    },

    closureCompiler: {
      options: {
        compilerFile: 'build/closure_compiler/build/compiler.jar',
        checkModified: true,
        compilerOpts: {
          compilation_level: 'ADVANCED_OPTIMIZATIONS',
          externs: ['build/closure_compiler/externs/*.js'],
          define: ["'TBONE_BUILD_RELEASE=true'"],
          create_source_map: 'dist/<%= pkg.name %>.js.map',
          source_map_format: 'v3',
          // warning_level: 'verbose',
          // jscomp_off: ['checkTypes', 'fileoverviewTags'],
          // summary_detail_level: 3,
          // output_wrapper: '"(function(){%output%}).call(this);"'
        }
      },
      all: {
        src: 'dist/<%= pkg.name %>.js',
        dest: 'dist/<%= pkg.name %>.min.js',
      }
    },

    compress: {
      release: {
        options: {
          mode: 'gzip',
          level: 9,
        },
        pretty: true,
        expand: true,
        src: 'dist/tbone.min.js',
        dest: './',
      }
    },

    copy: {
      qunit: {
        src: 'dist/*',
        dest: 'test/'
      }
    },

    qunit: {
      debug: {
        options: {
          urls: ['http://localhost:9238/index.html']
        }
      },
      release: {
        options: {
          urls: ['http://localhost:9238/index.html?mode=release']
        }
      }
    },

    connect: {
      server: {
        options: {
          hostname: '*',
          port: 9238,
          base: 'test/',
        }
      }
    },

    watch: {
      code: {
        files: ['src/**/*.js', 'test/**/*'],
        tasks: ['_build_with_tests']
      },
      options: {
        atBegin: true
      }
    },

  });

  // These plugins provide necessary tasks.
  require('load-grunt-tasks')(grunt);

  // Load custom build tasks
  grunt.loadTasks("build/tasks");

  // Default task(s).
  grunt.registerTask('test_debug', ['templates', 'copy:qunit', 'qunit:debug']);
  grunt.registerTask('test_release', ['templates', 'copy:qunit', 'qunit:release']);
  grunt.registerTask('build', ['clean', 'jshint', 'concat', 'closureCompiler', 'compress:release']);
  grunt.registerTask('_build_with_tests', [
    'clean', 'jshint', 'concat', 'test_debug', 'closureCompiler', 'test_release', 'compress:release'
  ]);
  grunt.registerTask('live', ['connect', 'watch']);
  grunt.registerTask('build_with_tests', ['connect', '_build_with_tests']);
  grunt.registerTask('default', ['build']);
};
