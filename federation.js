var lang      = require("lively.lang");
var messaging = require("./messaging");
var server    = require("./server");
var client    = require("./client");
var logger    = require("./logger");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function connect(tracker, opts, thenDo) {
  opts = opts || {};
  opts.register = true;
  opts.isFederationConnection = true;
  opts.id = tracker.id;

  logger.log("federation connect", tracker, "init connecting to %s", opts.url || opts.port);
  lang.fun.composeAsync(
    function(n) { client.start(opts, n); },
    function(client, n) {
      client.removeAllListeners("message");
      client.on("message", function(msg, connection) {
        tracker.emit("message", msg, connection);
      });
      n(null, client);
    },
    function(client, n) {
      logger.log("federation connect", tracker, "connected to %s (via %s)", opts.url || opts.port, client.id);
      tracker.ownedServerSessions[client.trackerId] = client;
      client.on("close", function() { delete tracker.ownedServerSessions[client.trackerId]; });
      n(null, client);
    }
    // function(client, n) {
      
    // }
  )(thenDo);
//   {port: port2}
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {
  connect: connect
}
