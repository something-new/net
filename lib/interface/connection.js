var lang = require("lively.lang");
var messaging = require("./messaging");
var logger          = require("../logger");

// Connection states
var UNKNOWN    = "UNKNOWN",
    CLOSED     = "CLOSED",
    CONNECTING = "CONNECTING",
    CONNECTED  = "CONNECTED";

var ConnectionPrototype = {

  startFunction: null,
  closeFunction: null,
  sendFunction: null,
  inspectFunction: null,

  _options: null,
  _connection: null,
  _status: UNKNOWN,

  start: function(thenDo) {

logger.log("before start", this, "????" + this);

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

    this.startFunction(opts, this, function(err, rawConnection) {
      logger.log("starting", con, "%s", err ? err.stack || err : "");
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
  },

  close: function(thenDo) {
    if (this.status() === CLOSED) {
      thenDo && thenDo();
    } else {
      this.options().autoReconnect = false;
      this.once("close", function() { thenDo && thenDo(); });
      this.closeFunction(this.options, this);
    }
    return this;
  },

  send: function(msg, thenDo) {
    this.sendFunction(this.options, this, msg, thenDo);
    return this;
  },

  status: function(spec) { return this._status; },

  options: function(spec) { return this._options; },

  inspect: function() { return this.inspectFunction(); }
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
  logger.log("onClose", con, "reconnecting: %s", !!con.options().autoReconnect);
  if (con.options().autoReconnect) {
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

function create(options,
                startFunction,
                closeFunction,
                sendFunction,
                inspectFunction) {

  var con = lang.events.makeEmitter(Object.create(ConnectionPrototype, {
    startFunction: {value: startFunction},
    closeFunction: {value: closeFunction},
    sendFunction: {value: sendFunction},
    inspectFunction: {value: inspectFunction || function() { return "<l2l connection " + con.status() + ">"; }}
  }));

  con._options = normalizeOptions(options);

  con.on("status", function(status) { con._status = status; });

  return con;
}

module.exports = {
  UNKNOWN: UNKNOWN,
  CONNECTING: CONNECTING,
  CONNECTED: CONNECTED,
  CLOSED: CLOSED,

  create: create
}
