/**
 * Custom Grunt.js tasks for building and testing TBone.
 */

module.exports = function( grunt ) {
  grunt.registerTask('get_closure', 'Task to download closure compiler JAR', function() {
    if (!require('fs').existsSync('build/closure_compiler/google/compiler.jar')) {
      grunt.log.writeln('Fetching closure compiler...');
      var done = this.async();
      var cmd = [
        'wget https://closure-compiler.googlecode.com/files/compiler-20131014.tar.gz',
        'tar xzf compiler-20131014.tar.gz',
        'rm compiler-20131014.tar.gz'
      ].join(';');
      var proc = require('child_process')
        .spawn('sh', ['-c', cmd], { cwd: 'build/closure_compiler/google/' });
      proc.on('close', function (err, out) {
        if (err) {
          grunt.log.writeln('Error downloading closure compiler.');
        } else {
          grunt.log.writeln('Closure compiler download complete.');
        }
        done(!err);
      });
    }
  });
}
