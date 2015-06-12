## Simple websocket-based OO-style messaging

Uses the lively-2-lively JSON protocol.

A message is

```
{
  "target": UUID,
  "action": STRING,
  "data": OBJECT
}
```

Semantics: Send message to `target` and invoke target's `action` service
passing `data` as parameter.

Supports send & forget, events for message responses, response streaming, and custom services.

Tried and trusted by [Lively Web](http://lively-web.org).

## Usage

See the examples folder.

A Simple echo example:

### server

```js
var server = require("./server");
var tracker = server.start({port: 10083}, function(err, tracker) {
  console.log("Tracker %s started", tracker.id);
  setTimeout(function() { server.close(tracker); }, 3*1000);
});
```

### client

```js
var client = require("./client");
var endpoint = client.start({port: 10083}, function() {
  console.log("Client %s started and registered", endpoint.id);
  var msg = client.send(endpoint, {
    target: client.getTrackerId(endpoint),
    action: "echo",
    data: "Hello server!"
  });
  endpoint.on("answer-" + msg.messageId, function(msg) {
    console.log("Got answer for echo message", msg);
  })
});
```

## Tests

```sh
$ node_modules/.bin/mocha \
  --no-colors --ui bdd --reporter min \
  --watch \
  --compilers js:babel-core/register \
  tests/*-test.js
```

## License

MIT License
