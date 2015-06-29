var lang      = require("lively.lang");
var uuid      = require("node-uuid");
var logger    = require("./logger");
var messaging       = require("./messaging");

function Messenger(options, services) {
  lang.events.makeEmitter(this);
  this._options = options;
  this.id = options.id || ((options.type || "generic messenger") + "-" + uuid.v4());
  this._services = services || {};
  this._connections = {};
  this._connectionListeners = [];
}

Messenger.prototype.options = function() { return this._options; }

Messenger.prototype.send = function(connection, msg, thenDo) {
  throw new Error("Messengers needs to implement customized send method");
}

Messenger.prototype.inspect = function() {
  return lang.string.format("<messenger %s>", this.id);
}

Messenger.prototype.services = function() { return this._services; }
Messenger.prototype.serviceNamed = function(name) { return this._services[name]; }
Messenger.prototype.serviceForMessage = function(msg) { return this.serviceNamed(msg.action); }

Messenger.prototype.close = function(thenDo) {
  var messenger = this;
  lang.fun.waitForAll({timeout: 1*1000},
    this.allConnections().concat(this.allConnectionListeners())
      .map(function(ea) { return ea.close.bind(ea); }),
    function(err, _) {
      messaging.clearCacheFor(messenger);
      logger.log("close", messenger, "");
      thenDo && thenDo(err);
    });
}

Messenger.prototype.connections = function() { return this._connections; }

Messenger.prototype.allConnections = function() {
  return lang.arr.flatten(lang.obj.values(this.connections()))
}

Messenger.prototype.addConnection = function(id, c) {
  var cons = this._connections[id] || (this._connections[id] = []);
  lang.arr.pushIfNotIncluded(cons, c);
  return this;
}

Messenger.prototype.removeConnection = function(idOrConnection) {
  if (typeof idOrConnection === "string") {
    delete this._connections[idOrConnection];
  } else {
    var cons = this._connections[idOrConnection];
    if (cons) {
      this._connections[idOrConnection] = lang.arr.without(cons, idOrConnection);
    }
  }
  return this;
}

Messenger.prototype.connectionListeners = function() { return this._connectionListeners; }

Messenger.prototype.allConnectionListeners = function() { return this._connectionListeners; }

Messenger.prototype.addConnectionListener = function(l) {
  this._connectionListeners.push(l);
  return this;
}

Messenger.prototype.findConnection = function(id, thenDo) {
  var cons = this._connections[id];
  var con = cons && cons[0];
  thenDo(null, con);
  return this;
}

module.exports = {
  Messenger: Messenger
}
