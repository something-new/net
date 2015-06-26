var client = require("../../lib/nodejs/client");
var messaging = require("../../lib/interface/messaging");
client.start({port: 10083}, function(err, con) {
  console.log("Client %s started and registered", con.id);
  var msg = messaging.sendAndReceive(
    con, client.getConnection(con), {id: con.trackerId}, {
      action: "echo",
      data: "Hello server!"
    }, function(err, answer) {
      console.log("Got answer for echo message", answer);
      client.close(con);
    });
});