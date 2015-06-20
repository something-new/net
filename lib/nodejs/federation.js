var lang      = require("lively.lang");
var messaging = require("../interface/messaging");
var server    = require("./server");
var client    = require("./client");
var logger    = require("../logger");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function connect(tracker, opts, thenDo) {
  opts = opts || {};
  opts.register = true;
  opts.isFederationConnection = true;
  opts.id = tracker.id;

  logger.log("federation connect", tracker,
    "init connecting to %s", opts.url || opts.port);

  lang.fun.composeAsync(
    function(n) { client.start(opts, n); },
    function(c, n) {
      c.removeAllListeners("message");
      var con = client.getConnection(c);
      con.removeAllListeners("message");
      con.on('message', function(msg) {
        messaging.receive(tracker, con, msg);
      });

      n(null, c);
    },
    function(c, n) {
      var tId = client.getTrackerId(c);

      logger.log("federation connect", tracker,
        "connected to %s (%s -> %s)", opts.url || opts.port, c.id, tId);

      // server.getOwnedServerSessions(tracker)[tId] = c;
      server.getOwnedServerSessions(tracker)[tId] = client.getConnection(c);
      c.on("close", function() {
        logger.log("owned federation connection closed", tracker, "%s", opts.url);
        delete server.getOwnedServerSessions(tracker)[tId];
      });
      n(null, c);
    }
  )(thenDo);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {
  connect: connect
}
