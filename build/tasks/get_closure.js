/**
 * Custom Grunt.js tasks for building and testing TBone.
 */

module.exports = function( grunt ) {
  grunt.registerTask('get_closure', 'Task to download closure compiler JAR', function() {
    if (!require('fs').existsSync('build/closure_compiler/build/compiler.jar')) {
      grunt.log.writeln('Fetching closure compiler...');
      var done = this.async();
      var cmd = [
        'wget https://closure-compiler.googlecode.com/files/compiler-20131014.tar.gz',
        'tar xzf compiler-20131014.tar.gz',
        'rm compiler-20131014.tar.gz'
      ].join(';');
      var proc = require('child_process')
        .spawn('sh', ['-c', cmd], { cwd: 'build/closure_compiler/build/' });
      proc.on('close', function () {
        grunt.log.writeln('Closure compiler download complete.');
        done();
      });
    }
  });
}
