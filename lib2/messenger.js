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
  this._sessionData = {};
  this._connectionListeners = [];
}

Messenger.prototype.options = function() { return this._options; }

Messenger.prototype.send = function(connection, msg, thenDo) {
  throw new Error("Messengers needs to implement customized send method");
}

Messenger.prototype.inspect = function() {
  return lang.string.format("<messenger %s>", this.id);
}

Messenger.prototype.addService = function(name, handler) { return this._services[name] = handler; }
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

// Messenger.prototype.knownMessengers = function(thenDo) {
//   var data = 
//   thenDo(null, lang.arr.uniq(Object.keys(this._connections)));
// }

// Messenger.prototype.knownMessengersLocally = function() {
//   return lang.arr.uniq(Object.keys(this._connections));
// }

Messenger.prototype.sessionData = function() {
  // usually
  // id: STRING
  // worldURL: STRING
  // user: STRING
  // timeOfCreation: TIMESTAMP
  // timeOfRegistration: TIMESTAMP
  // lastActivity: TIMESTAMP
  return this._sessionData || {};
}

Messenger.prototype.addSessionData = function(id, data) {
  var existing = this._sessionData[id] || {};
  this._sessionData[id] = lang.obj.merge(existing, data);
  return this;
}

Messenger.prototype.removeSessionData = function(id) {
  delete this._sessionData[id];
  return this;
}

Messenger.prototype.connections = function() { return this._connections; }

Messenger.prototype.allConnections = function() {
  return lang.arr.flatten(lang.obj.values(this.connections()))
}

Messenger.prototype.addConnection = function(id, c) {
  var cons = this._connections[id] || (this._connections[id] = []);
  lang.arr.pushIfNotIncluded(cons, c);
  this.addSessionData(id, {});
  return this;
}

Messenger.prototype.removeConnection = function(idOrConnection) {

  if (typeof idOrConnection === "string") {
    delete this._connections[idOrConnection];
    this.removeSessionData(idOrConnection);
    return this;
  }

  var con = idOrConnection, cons, found;
  for (var id in this._connections) {
    cons = this._connections[id];
    if (!cons || cons.indexOf(con) === -1) continue;
    found = id;
    break;
  }
  if (!found) return this; 
  if (cons) cons = this._connections[found] = lang.arr.without(cons, con);
  if (!cons || !cons.length) this.removeSessionData(found);  

  return this;
}

Messenger.prototype.connectionListeners = function() { return this._connectionListeners; }

Messenger.prototype.allConnectionListeners = function() { return this._connectionListeners; }

Messenger.prototype.addConnectionListener = function(l) {
  this._connectionListeners.push(l);
  return this;
}

Messenger.prototype.findConnection = function(id, thenDo) {
  var cons = this._connections[id],
      con = cons && cons[0];
  thenDo(null, con);
  return this;
}

module.exports = {
  Messenger: Messenger
}
