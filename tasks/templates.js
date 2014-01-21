/**
 * Custom Grunt.js tasks for building and testing TBone.
 */

module.exports = function( grunt ) {

  var fs = require('fs');
  var _ = require('underscore')._;

  grunt.registerTask('templates', 'A task for generating templates.js', function() {
    var templateFiles = fs.readdirSync('test/templates');
    var templates = {};

    _.each(templateFiles, function (filename) {
      var template = fs.readFileSync('test/templates/' + filename, 'utf8');
      templates[filename.replace(/\.html$/, '')] = (' ' + template + ' ').replace(/\s+/g, ' ');
    });

    var templatesJS = 'var templates = ' + JSON.stringify(templates) + ';';
    fs.writeFileSync('test/static/templates.js', templatesJS);

    grunt.log.writeln('File "test/static/templates.js" created.');
  });

}
