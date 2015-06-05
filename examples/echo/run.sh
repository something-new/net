#!/bin/bash

dir=$(dirname $0)
node $dir/server.js &
sleep 1
node $dir/client.js &
wait
echo "done"