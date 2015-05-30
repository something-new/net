var client = require("../client");
var endpoint = client.start({port: 10083}, function() {
  console.log("Client %s started and registered", endpoint.id);
  var msg = client.send(endpoint, {
    target: endpoint.trackerId,
    action: "echo",
    data: "Hello server!"
  });
  endpoint.on("answer-" + msg.messageId, function(msg) {
    console.log("Got answer for echo message", msg);
  })
});