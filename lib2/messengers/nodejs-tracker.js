var lang = require("lively.lang");
var util = require("util");
var logger = require("../logger");
var messaging = require("../messaging");
var Messenger = require("../messenger").Messenger;
var wsServerListener = require("../listeners/nodejs-ws-server-listener");
var client = require("./nodejs-client");

function Tracker(options) {
  Messenger.call(
    this, options,
    lang.obj.merge(
        require("../services/default"),
        require("../services/server")));
}

util.inherits(Tracker, Messenger);

Tracker.prototype.addServer = function(server) {
  var tracker = this;
  this.addConnectionListener(server);
  server.on("error", function(err) { logger.log("error in websocket server", tracker, "%s", err.stack || err); });
  server.on("close", function() { logger.log("websocket server closed", tracker, ""); });
  server.on("connection", function(con) {
    logger.log("websocket server got connection", tracker, "");
    con.on("message", function(msg) { messaging.receive(tracker, con, msg); });
  });
};

Tracker.prototype.federationConnect = function(opts, thenDo) {
  var tracker = this;
  opts = opts || {};
  opts.register = true;
  opts.isFederationConnection = true;
  opts.id = tracker.id;

  logger.log("federation connect", tracker,
    "init connecting to %s", opts.url || opts.port);

  lang.fun.composeAsync(
    function(n) { client.start(opts, n); },
    function(c, n) {
      var tId = c.trackerId();
      logger.log("federation connect", tracker,
        "connected to %s (%s -> %s)", opts.url || opts.port, c.id, tId);

      c.removeAllListeners("message");
      var con = c.getConnection();

      tracker.addConnection(tId, con);

      con.once("close", function() {
        logger.log("tracker federation close", tracker, "disconnected from %s", opts.url);
        tracker.removeConnection(con);
      });

      con.on("message", function(msg) {
        messaging.receive(tracker, con, msg);
      });

      n(null, c);
    }
  )(thenDo);
};

module.exports = {

  create: function(options, thenDo) {
    options = options || {};
    options.type = options.type || "nodejs-tracker";
    var tracker = new Tracker(options);
    thenDo && thenDo(null, tracker);
    return tracker;
  },

  start: function(options, thenDo) {
    var tracker = module.exports.create(options);
    wsServerListener.create(options,
      function(err, wsServer) {
        logger.log("websocket server started", tracker, "port: %s", options.port);
        tracker.addServer(wsServer);
        thenDo && thenDo(err, tracker);
      });
    return tracker;
  }
}