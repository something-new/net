var lang = require("lively.lang");
var util = require("util");
var Connection = require("../connection").Connection;

function ReceiverConnection(options) {
  // accepted connection, cannot reconnect itself
  options.autoReconnect = false;
  Connection.call(this, options);
}

util.inherits(ReceiverConnection, Connection);

ReceiverConnection.prototype.connect = function(thenDo) {
  // already connected
  var ws = this._connection;
  thenDo(null, ws);
  ws.emit("open");
  return this;
}

ReceiverConnection.prototype.close = function(thenDo) {
  console.log("TODO IMPLEMENT ws listener close!!!");
  var ws = this._connection;
  ws && ws.close();
  thenDo(null);
  return this;
}

ReceiverConnection.prototype.send = function(msg, thenDo) {
  var ws = this._connection;
  try {
    var msgString = JSON.stringify(msg);
  } catch (e) {
    var errMsg = "Cannot stringify message " + e;
    console.error(errMsg);
    return thenDo && thenDo(new Error(errMsg));
  }

  ws.send(msgString, function(err) { thenDo && thenDo(err); });
}

ReceiverConnection.prototype.send = function(msg, thenDo) {
  var ws = this._connection;
  try {
    var msgString = JSON.stringify(msg);
  } catch (e) {
    var errMsg = "Cannot stringify message " + e;
    console.error(errMsg);
    return thenDo && thenDo(new Error(errMsg));
  }

  ws.send(msgString, function(err) { thenDo && thenDo(err); });
}

ReceiverConnection.prototype.inspect = function() {
  return lang.string.format("nodejs ws server receiver connection [%s]", this.status());
}

module.exports = {

  create: function(ws) {
    return new ReceiverConnection({connection: ws});
  }

}
