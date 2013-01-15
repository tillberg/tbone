#!/usr/bin/env bash
mkdir -p build/
mkdir -p tools/

sudo apt-get install nodejs nodejs-dev npm phantomjs
pip install -r autorun/requirements.txt
sudo easy_install http://closure-linter.googlecode.com/files/closure_linter-latest.tar.gz

cd autorun/
npm install
cd ..
cd test/
npm install
cd ..

while :
do
    killall -q watchd
    node autorun/run.js
    sleep 1
done
