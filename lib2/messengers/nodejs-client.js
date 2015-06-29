var lang = require("lively.lang");
var util = require("util");
var logger  = require('../logger');
var messaging = require("../messaging");
var Messenger = require("../messenger").Messenger;
var wsClient = require("../connections/nodejs-ws");
var defaultServices = require("../services/default");

var defaultPort = 10081;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// helper

function sendRegisterMessage(messenger, thenDo) {
  var opts = messenger.options();
  messaging.sendAndReceive(
    messenger, messenger.getConnection(), null,
    {
      bypassQueue: true,
      action: "register",
      data: {
        id: messenger.id,
        worldURL: require("os").hostname(),
        user: messenger.name || opts.name || "no-name",
        timeOfCreation: Date.now(),
        timeOfRegistration: Date.now(),
        lastActivity: Date.now()
      }
    },
  function(err, answer) {
    messenger._trackerId = lang.Path("data.tracker.id").get(answer);
    thenDo && thenDo(err);
  });
}

function normalizeOptions(opts) {
  opts = opts || {};

  var port = opts.port || defaultPort,
      host = opts.hostname || "localhost",
      path = opts.path || "";
  opts.url = opts.url || "ws://" + host + ":" + port + "/" + path;

  opts.register = opts.hasOwnProperty("register") ?
    !!opts.register : true;

  opts.autoReconnect = opts.hasOwnProperty("autoReconnect") ?
    !!opts.autoReconnect : true;

  opts.type = opts.type || "nodejs-client";

  opts.name = opts.isFederationConnection ?
    "server-to-server connection" :
    "client connection";

  return opts;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function Client(options) {
  Messenger.call(this, options, lang.obj.clone(defaultServices));
  this._trackerId = null;
}

util.inherits(Client, Messenger);

Client.prototype.getConnection = function() {
  return this.allConnections()[0];
}

Client.prototype.trackerId = function() { return this._trackerId; }

Client.prototype.inspect = function() {
  var con = this.getConnection();
  return lang.string.format(
    "<messenger %s connected to %s, state: %s>",
    this.id, this.trackerId() || "NO TRACKER", con ? con.status() : "NO CONNECTION");
}

Client.prototype.connect = function(thenDo) {
  var opts = this.options(),
      messenger = this,
      connection;

  lang.fun.composeAsync(
    function(n) {
      connection = wsClient.start(opts, n);
      messenger.addConnection('tracker', connection);

      connection.once("close", function() {
        messenger._trackerId = null;
        logger.log("client close", messenger, "disconnected from %s", opts.url);
        messenger.removeConnection(connection);
      });

      connection.on("message", function(msg) {
        messaging.receive(messenger, connection, msg);
      });
    },
    function(_, n) {
      if (!opts.register) thenDo(null);
      else sendRegisterMessage(messenger, function(err) {
        if (messenger.trackerId()) {
          // correctly categorize connection
          messenger.removeConnection(connection);
          messenger.addConnection(messenger.trackerId(), connection);
        }
        thenDo && thenDo(err);
      });
    }
  )(thenDo);
  
}

module.exports = {

  start: function(options, thenDo) {
    var client = new Client(normalizeOptions(options));
    client.connect(function(err) { thenDo && thenDo(err, client); });
    return client;
  }

}
