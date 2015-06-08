#!/bin/bash

dir=$(dirname $0)
node --harmony --expose-gc $dir/run.js
