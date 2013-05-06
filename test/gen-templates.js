#!/usr/bin/env node
var fs = require('fs');
var _ = require('underscore')._;

var templateFiles = fs.readdirSync('templates');
var templates = {}
_.each(templateFiles, function (filename) {
  var template = fs.readFileSync('templates/' + filename, 'utf8');
  templates[filename.replace(/\.html$/, '')] = (' ' + template + ' ').replace(/\s+/g, ' ');
});

var templatesJS = 'var templates = ' + JSON.stringify(templates) + ';';
fs.writeFileSync('static/templates.js', templatesJS);
