#!/usr/bin/env python

import sys
import os
import subprocess

filename = len(sys.argv) > 1 and sys.argv[1]

output = open(filename, 'w') if filename else sys.stdout

os.system("""
mkdir -p build/
mkdir -p tools/
cd tools/
if [ ! -f compiler.jar ]
then
    wget http://closure-compiler.googlecode.com/files/compiler-20120917.tar.gz
    tar xzf compiler-20120917.tar.gz
    rm compiler-20120917.tar.gz
fi
cd ..
""")

optimization_level = os.environ.get('OPTIMIZATION_LEVEL', 'ADVANCED_OPTIMIZATIONS')
debug = os.environ.get('TBONE_DEBUG', False)
mode = 'debug' if debug else 'release'
backbone = os.environ.get('BACKBONE_SUPPORT', True)
minflag = '' if debug else '.min'

def read(name):
    with open('src/%s.js' % (name,), 'r') as f:
        return f.read()

sources = [
    'snippet/header',
    'init',
    'scheduler/timer',
    'scheduler/autorun',
    'scheduler/scope',
    'scheduler/drainqueue',
    'model/core/query',
    'model/core/base',
    'model/core/bound',
    'model/core/async',
    'model/core/collection',
    'model/fancy/sync',
    'model/fancy/ajax',
    'model/fancy/localstorage',
    'model/fancy/location',
    'model/fancy/localstoragecoll',
    'dom/template/init',
    'dom/template/render',
    'dom/view/hash',
    'dom/view/base',
    'dom/view/render',
    'dom/view/create',
    'export',
    'ext/bbsupport' if backbone else None,
    'snippet/footer'
]

all = '\n'.join([read(name) for name in sources if name])

if not debug:
    all = all.replace('var TBONE_DEBUG = root[\'TBONE_DEBUG\'] !== false;', 'var TBONE_DEBUG = false;')

with open('build/tbone.%s.js' % mode, 'w') as f:
    f.write(all)

cmd = [
    "java",
    "-jar",
    "tools/compiler.jar",
    "--compilation_level",
    optimization_level,
    "--create_source_map",
    "build/tbone%s.js.map" % minflag,
    "--source_map_format=V3",
    "--externs",
    "externs/jquery.js",
    "--externs",
    "externs/underscore-1.4.4.js",
    "--externs",
    "externs/backbone-0.9.2.js",
    "--js",
    "build/tbone.%s.js" % mode
]

out, error = subprocess.Popen(cmd, stdout=subprocess.PIPE).communicate()
if error:
    print >> sys.stderr, error
else:
    output.write("//@ sourceMappingURL=tbone%s.js.map\n" % minflag)
    output.write("(function(){")
    output.write(out)
    output.write("}());")
    output.close()
