module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    // Task Configuration
    clean: {
      dist: ['dist/*.js', 'dist/*.gz', 'dist/*.map','test/dist']
    },

    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      src: {
        src: ['src/**/*.js', '!src/snippet/*']
      },
      //test: {
      //  src: ['test/**/*.js']
      //}
    },

    concat: {
      //options: {
      //  separator: ';',
      //},
      coreTmp: {
        src: [
          'src/init.js',
          'src/model/core/base.js',
          'src/scheduler/timer.js',
          'src/scheduler/autorun.js',
          'src/scheduler/scope.js',
          'src/scheduler/drainqueue.js',
          'src/model/core/query.js',
          'src/model/core/bound.js',
        ],
        dest: 'dist/tmp/core.js'
      },
      core: {
        src: [
          'src/snippet/header.js',
          'dist/tmp/core.js',
          'src/snippet/footer.js'
        ],
        dest: 'dist/<%= pkg.name %>.core.js',
      },
      extTmp: {
        src: [
          'src/model/core/async.js',
          'src/model/core/collection.js',
          'src/model/fancy/sync.js',
          'src/model/fancy/ajax.js',
          'src/model/fancy/localstorage.js',
          'src/model/fancy/location.js',
          'src/model/fancy/localstoragecoll.js',
        ],
        dest: 'dist/tmp/core_ext.js'
      },
      ext: {
        src: [
          'src/snippet/header.js',
          'dist/tmp/core.js',
          'dist/tmp/core_ext.js',
          'src/snippet/footer.js'
        ],
        dest: 'dist/<%= pkg.name %>.core_ext.js',
      },
      dist: {
        src: [
          'src/snippet/header.js',
          'dist/tmp/core.js',
          'dist/tmp/core_ext.js',
          'src/dom/template/init.js',
          'src/dom/template/render.js',
          'src/dom/view/hash.js',
          'src/dom/view/base.js',
          'src/dom/view/render.js',
          'src/dom/view/create.js',
          'src/export.js',
          'src/ext/bbsupport.js',
          'src/ext/angular_init.js',
          'src/ext/react_init.js',
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
        compilerFile: 'build/closure_compiler/google/compiler.jar',
        checkModified: true,
        compilerOpts: {
          compilation_level: 'ADVANCED_OPTIMIZATIONS',
          externs: ['build/closure_compiler/externs/*.js'],
          define: ["'TBONE_BUILD_RELEASE=true'"],
          create_source_map: 'dist/<%= pkg.name %>.min.js.map',
          source_map_format: 'v3',
          // warning_level: 'verbose',
          // jscomp_off: ['checkTypes', 'fileoverviewTags'],
          // summary_detail_level: 3,
        }
      },
      core: {
        src: 'dist/<%= pkg.name %>.core.js',
        dest: 'dist/<%= pkg.name %>.core.min.js',
      },
      core_ext: {
        src: 'dist/<%= pkg.name %>.core_ext.js',
        dest: 'dist/<%= pkg.name %>.core_ext.min.js',
      },
      full: {
        src: 'dist/<%= pkg.name %>.js',
        dest: 'dist/<%= pkg.name %>.min.js',
      }
    },

    compress: {
      options: {
        mode: 'gzip',
        level: 9,
      },
      core: {
        pretty: true,
        src: 'dist/tbone.core.min.js',
        dest: 'dist/tbone.core.min.js.gz',
      },
      core_ext: {
        pretty: true,
        src: 'dist/tbone.core_ext.min.js',
        dest: 'dist/tbone.core_ext.min.js.gz',
      },
      full: {
        pretty: true,
        src: 'dist/tbone.min.js',
        dest: 'dist/tbone.min.js.gz',
      },
    },

    copy: {
      qunit: {
        src: 'dist/*',
        dest: 'test/'
      },
      external: process.env.TARGET_PATH ? {
        src: 'dist/tbone.js',
        dest: process.env.TARGET_PATH,
      } : {}
    },

    qunit: {
      debug: {
        options: {
          urls: ['http://localhost:9238/index.html']
        }
      },
      release: {
        options: {
          urls: ['http://localhost:9238/index.html?min=true']
        }
      },
      core: {
        options: {
          urls: ['http://localhost:9238/index.html?variant=core']
        }
      },
      core_release: {
        options: {
          urls: ['http://localhost:9238/index.html?variant=core&min=true']
        }
      },
      core_ext: {
        options: {
          urls: ['http://localhost:9238/index.html?variant=core_ext']
        }
      },
      core_ext_release: {
        options: {
          urls: ['http://localhost:9238/index.html?variant=core_ext&min=true']
        }
      }
    },

    connect: {
      server: {
        options: {
          hostname: '*',
          port: 9238,
          base: './test',
        }
      }
    },

    watch: {
      code: {
        files: ['src/**/*.js', 'test/**/*'],
        tasks: ['_build_with_tests', 'copy:external']
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
  grunt.registerTask('compile', ['get_closure', 'closureCompiler:full']);
  grunt.registerTask('compile_all', ['get_closure', 'closureCompiler']);
  grunt.registerTask('test_debug', ['templates', 'copy:qunit', 'qunit:debug']);
  grunt.registerTask('test_release', ['templates', 'copy:qunit', 'qunit:release']);
  grunt.registerTask('test_core', ['templates', 'copy:qunit', 'qunit:core']);
  grunt.registerTask('test_core_ext', ['templates', 'copy:qunit', 'qunit:core_ext']);
  grunt.registerTask('test_core_release', ['templates', 'copy:qunit', 'qunit:core_release']);
  grunt.registerTask('test_core_ext_release', ['templates', 'copy:qunit', 'qunit:core_ext_release']);
  grunt.registerTask('build', [
    'clean', 'jshint', 'concat', 'compile', 'compress:full', 'copy:external'
  ]);
  grunt.registerTask('_build_all_with_tests', [
    'clean', 'jshint', 'concat',
    'test_core', 'test_core_ext', 'test_debug',
    'compile_all',
    'test_core_release', 'test_core_ext_release', 'test_release',
    'compress'
  ]);
  grunt.registerTask('_build_with_tests', [
    'clean', 'jshint', 'concat', 'test_debug', 'compile', 'test_release', 'compress'
  ]);
  grunt.registerTask('live', ['connect', 'watch']);
  grunt.registerTask('build_with_tests', ['connect', '_build_with_tests']);
  grunt.registerTask('build_all_with_tests', ['connect', '_build_all_with_tests']);
  grunt.registerTask('default', ['build']);
};
