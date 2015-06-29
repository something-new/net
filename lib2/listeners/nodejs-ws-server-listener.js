var lang = require("lively.lang");
var logger = require("../logger");
var wsReceiver = require("../connections/ws-receiver");
var WebSocketServer = require('ws').Server;

var defaultPort = 10081;

function WsListener(options) {
  lang.events.makeEmitter(this);
  options = lang.obj.merge(options || {}, {clientTracking: false});
  this._options = options;
  this._connections = [];
  this.__server = null;
}

WsListener.prototype.options = function() { return this._options; }

WsListener.prototype.connections = function() { return this._connections; }

WsListener.prototype.start = function(thenDo) {
  thenDo = thenDo && lang.fun.once(thenDo);

  if (this._server) {
    return thenDo(new Error("cannot start, ws server listener already has server"));
  }

  // 1. create the server
  var listener = this,
      options = this.options();
  if (!options.port) options.port = defaultPort;
  var server = this._server = options.server || new WebSocketServer(options);

  // 2. wait for listening event and hook up to events
  var started = false;
  server.once("listening", function() {
    started = true;
    thenDo && thenDo(null, listener);
  });

  server.on("error", function(err) {
    listener.emit("error", err);
    if (!started) thenDo && thenDo(err, null);
  });

  server.on("close", function() { listener.emit("close"); });

  server.on("connection", function(ws) {
    var receiverConnection = wsReceiver.create(ws).start();
    listener._connections.push(receiverConnection);
    listener.emit("connection", receiverConnection);
  });

  return this;
}


WsListener.prototype.close = function(thenDo) {
  console.log("TODO IMPLEMENT ws listener / server close!!!");
  if (this._server) this._server.close();
  setTimeout(thenDo, 100);
};

module.exports = {

  create: function(options, thenDo) {
    return new WsListener(options).start(thenDo);
  }

}