var lang = require("lively.lang");
var util = require("util");
var logger = require("../logger");
var messaging = require("../messaging");
var Messenger = require("../messenger").Messenger;
var wsServerListener = require("../listeners/nodejs-ws-server-listener");

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