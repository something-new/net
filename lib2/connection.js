var lang = require("lively.lang");
var logger = require("./logger");

// Connection states
var UNKNOWN    = "UNKNOWN",
    CLOSED     = "CLOSED",
    CONNECTING = "CONNECTING",
    CONNECTED  = "CONNECTED";

function Connection(options) {
  lang.events.makeEmitter(this);

  this._options = options;
  this._connection = options.connection || null;
  
  var self = this;
  var connection = this._connection;
  this.__defineSetter__("_connection", function(c) {
    logger.log("Got raw connection", self, "%s", c);
    return connection = c;
  });
  this.__defineGetter__("_connection", function() { return connection; });

  this._status = UNKNOWN;
};

Connection.prototype.start = function(thenDo) {
  var con = this,
      opts = con.options();

  if (con.status() === CONNECTED) {
    thenDo && thenDo(null, con);
    return;
  }

  var thenDoEither = lang.fun.either(
        function(err) {
          con.removeListener("open", onConnectionSuccess);
          con.removeListener("error", onConnectionFailure);
          thenDo && thenDo(err, con);
        },
        function() {
          con.removeListener("open", onConnectionSuccess);
          con.removeListener("error", onConnectionFailure);
          thenDo && thenDo(null, con);
        }),
      onConnectionFailure = thenDoEither[0],
      onConnectionSuccess = thenDoEither[1],
      onMessageBound      = onMessage.bind(null, con),
      onCloseBound        = onClose.bind(null, con),
      onErrorBound        = onError.bind(null, con),
      onOpenBound         = onOpen.bind(null, con);

  con.emit("status", CONNECTING);
  con.once("open", onConnectionSuccess);
  con.once("error", onConnectionFailure);

  con.connect(function(err, rawConnection) {
    logger.log("connected", con, "%s", err ? err.stack || err : "");
    if (err) return onConnectionFailure(err);
    con._connection = rawConnection;

    rawConnection.on("message", onMessageBound);
    rawConnection.on("close", onCloseBound);
    rawConnection.on("error", onErrorBound);
    rawConnection.on('open', onOpenBound);

    rawConnection.once('open', onConnectionSuccess);
    rawConnection.once('close', function() {
      rawConnection.removeListener("message", onMessageBound);
      rawConnection.removeListener("close", onCloseBound);
      rawConnection.removeListener("error", onErrorBound);
      rawConnection.removeListener('open', onOpenBound);
      rawConnection.removeListener('open', onConnectionSuccess);
    });
  });

  return con;
}

Connection.prototype.connect = function(thenDo) {
  throw new Error("Connections needs to implement customized connect method");
}

Connection.prototype.close = function(thenDo) {
  throw new Error("Connections needs to implement customized close method");
}

Connection.prototype.send = function(msg, thenDo) {
  throw new Error("Connections needs to implement customized send method");
  return this;
}

Connection.prototype.status = function(spec) {
  return this._status;
},

Connection.prototype.options = function(spec) {
  return this._options;
},

Connection.prototype.inspect = function() {
  return "<l2l connection " + this.status() + ">";
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function onMessage(con, msgString) {
  logger.log("onMessage", con, msgString);
  try {
    var msg = JSON.parse(msgString);
  } catch (e) {
    console.error("Client cannot read incoming message %s", msgString);
    return;
  }
  con.emit("message", msg);
}

function onClose(con) {
  var shouldReconnect = con.options().autoReconnect && con.status() != CLOSED;
  logger.log("onClose", con, "reconnecting: %s", shouldReconnect);
  if (shouldReconnect) {
    con.emit("status", CONNECTING);
    reconnect(con.options(), con, 100, function() {});
  } else {
    con.emit("status", CLOSED);
    con.emit("close");
  }
}

function onError(con, err) {
  logger.log("onError", con, "%s", err.stack || err);
  console.error(err.stack || err);
  con.emit("error", err);
}

function onOpen(con) {
  logger.log("onOpen", con, "");
  con.emit("status", CONNECTED);
  con.emit("open");
}

function reconnect(options, con, delay, thenDo) {
  if (con.status() === CLOSED) {
    return thenDo && thenDo(new Error("Reconnect failed"));
  }
  logger.log("reconnect", con, "");
  con.start(function(err) {
    if (err) {
      if (delay < 3000) delay = delay + 400;
      setTimeout(reconnect.bind(null, options, con, delay, thenDo), delay);
      return;
    } else {
      thenDo && thenDo();
    }
  });
}

function normalizeOptions(options) {
  options = options || {};
  options. debug = options.hasOwnProperty("debug") ? options.debug : true;
  options.autoReconnect = options.hasOwnProperty("autoReconnect") ?
    !!options.autoReconnect : true;
  return options;
}

function create(options) {

  var con = new Connection(normalizeOptions(options));

  con.on("status", function(status) {
    logger.log("status change", con, "=> %s", status);
    con._status = status;
  });

  return con;
}

module.exports = {
  UNKNOWN: UNKNOWN,
  CONNECTING: CONNECTING,
  CONNECTED: CONNECTED,
  CLOSED: CLOSED,

  Connection: Connection,

  create: create
}
