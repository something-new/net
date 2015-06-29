var util = require("util");
var Connection = require("../connection").Connection;
var lang       = require("lively.lang");
var WebSocket  = require('ws');
var logger  = require('../logger');

var defaultPort = 10081;

function WsClientConnection(options) {
  Connection.call(this, options);
}

util.inherits(WsClientConnection, Connection);

WsClientConnection.prototype.connect = function(thenDo) {
  logger.log("connecting", this);
  var ws = new WebSocket(this.options().url);
  thenDo && thenDo(null, ws);
  return this;
}

WsClientConnection.prototype.close = function(thenDo) {
  this.options().autoReconnect = false;
  var ws = this._connection;
  ws && ws.close();
  thenDo(null);
  return this;
}

WsClientConnection.prototype.send = function(msg, thenDo) {
  var ws = this._connection;

  if (typeof msg == "string") {
    logger.log("MESSAGE ALREADY IS A STRING", this, msg.slice(0,40));
    msgString = msg;
  } else {
    try {
      var msgString = JSON.stringify(msg);
    } catch (e) {
      var errMsg = "Cannot stringify message " + e;
      console.error(errMsg);
      return thenDo && thenDo(new Error(errMsg));
    }
  }

  ws.send(msgString, function(err) { thenDo && thenDo(err); });
}


WsClientConnection.prototype.inspect = function() {
  return lang.string.format("nodejs ws client connection -> %s [%s]",
    this.options().url, this.status());
}

function normalizeOptions(options) {
  // options: port, hostname, path, id, register, autoReconnect, isFederationConnection
  options = options || {};

  if (!options.url) {
    var port = options.port || defaultPort,
        host = options.hostname || "localhost",
        path = options.path || "";
    options.url = options.url || "ws://" + host + ":" + port + "/" + path;
  }

  return options;
}


module.exports = {

  create: function(options) {
    if (!options.url)
      throw new Error(new Error("no options.url specified!"))
    return new WsClientConnection(normalizeOptions(options))
  },

  start: function(options, thenDo) {
    return module.exports.create(options).start(thenDo);
  }
}
