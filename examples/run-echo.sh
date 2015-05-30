#!/bin/bash

node examples/echo-server.js &
sleep 1
node examples/echo-client.js &
wait
echo "done"