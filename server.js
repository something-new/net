var lang            = require("lively.lang");
var obj             = lang.obj;
var WebSocketServer = require('ws').Server;
var uuid            = require("node-uuid");
var messaging       = require("./messaging");
var logger          = require("./logger");
var client          = require("./client");
var util            = require("./util");

var defaultPort = 10081;

var CONNECTING = messaging.ConnectionStates.CONNECTING;
var CONNECTED =  messaging.ConnectionStates.CONNECTED;
var CLOSED =     messaging.ConnectionStates.CLOSED;

var IDLE = messaging.SendStates.IDLE;

function start(options, thenDo) {
  options = options || {};

  if (!options.server && !options.port) {
    options.port = defaultPort;
  }

  options.clientTracking = true;
  var server = new WebSocketServer(options)
  var tracker = lang.events.makeEmitter({
    options: options,
    isTracker: true,
    id: options.id || "nodejs-tracker-" + uuid.v4(),

    state: {
      services: obj.merge(
        require("./services"),
        require("./server-services")),
      server: server,
      clientSessions: {},
      ownedServerSessions: {},
      acceptedServerSessions: {},
      connectionState: CONNECTING,
      sendState: IDLE
    },

    getState: function() { return stateFor(this); },

    sendString: function(receiver, msgString, thenDo) {
      var con = receiver && (receiver.state ? receiver.state.connection : receiver.connection);
      if (!con) {
        console.error("server send: no websocket");
        return thenDo && thenDo(new Error("No websocket"));
      }
      // FIXME cleanup!!!
      con.send(msgString, function(err) { if (thenDo) thenDo(err); });
    },

    inspect: function() {
      return lang.string.format(
        "Inspecting tracker\n  state: %s\n  connected clients: %s\n  owned server sessions: %s\n  acceptedServerSessions: %s\n  send state: %s",
        this._connectionState,
        obj.keys(getClientSessions(this)).join(", "),
        obj.keys(getOwnedServerSessions(this)).join(", "),
        obj.keys(getAcceptedServerSessions(this)).join(", "),
        messaging.logStateOf(this).split("\n").join("\n  "));
    }
  });

  tracker.state._connectionState = tracker.state.connectionState;
  tracker.state.__defineGetter__("connectionState", function() {
    return this._connectionState;
  });
  tracker.state.__defineSetter__("connectionState", function(val) {
    logger.log("tracker state", tracker, "%s -> %s", this._connectionState, val);
    return this._connectionState = val;
  });

  server.on("connection", function(ws) {
    ws.on('message', function(msgString) {
      try {
        var msg = JSON.parse(msgString);
      } catch (e) {
        console.error("Tracker cannot read incoming message " + msgString);
        return;
      }
      messaging.receive(tracker, ws, msg);
    });
  });

  server.on("listening", function() {
    setConnectionState(tracker, CONNECTED);
    logger.log("tracker started", tracker, "");
  });

  server.on("error", function(err) { logger.log("tracker error", tracker, err); });
  server.on("close", function() { logger.log("tracker closed", tracker); });

  if (thenDo) thenDo(null, tracker);

  return tracker;
}

function close(tracker, thenDo) {
  setConnectionState(tracker, messaging.ConnectionStates.CLOSED);

  lang.fun.composeAsync(
    function(n) {
      lang.fun.waitForAll(
        obj.values(getOwnedServerSessions(tracker))
          .map(function(ea) {
            return function(n) {
              logger.log("server closes client", tracker, ea.id);
              client.close(ea, n);
            }
          }), n);
    },

    function(_, n) {
      lang.fun.waitForAll(
        obj.values(getAcceptedServerSessions(tracker))
          .map(function(ea) {
            return function(n) {
              logger.log("server closes remote client", tracker, ea.id);
              messaging.send(tracker, ea, {action: "close"});
              setTimeout(n, 20);
            }
          }), n);
    },

    function(_, n) {
      if (!getServer(tracker)) {
        n(new Error("no tracker for close"));
        return;
      }
      getServer(tracker).close();
      messaging.clearCacheFor(tracker);
      setTimeout(function() { tracker.emit("close"); n(); }, 100);
    }
  )(thenDo);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function stateFor(tracker) { return (tracker && tracker.state) || {}; }

function getServices(tracker) {
  return stateFor(tracker).services || (stateFor(tracker).services = {});
}

function addService(tracker, name, handler) {
  getServices(tracker)[name] = handler;
  return tracker;
}

function getServer(tracker) {
  return stateFor(tracker).server;
}

function getClientSessions(tracker) {
  return stateFor(tracker).clientSessions;
}

function getOwnedServerSessions(tracker) {
  return stateFor(tracker).ownedServerSessions;
}

function getAcceptedServerSessions(tracker) {
  return stateFor(tracker).acceptedServerSessions;
}

function allConnections(tracker, exceptIds) {
  exceptIds = exceptIds || [];
  return obj.values(getClientSessions(tracker))
    .concat(obj.values(getOwnedServerSessions(tracker)))
    .concat(obj.values(getAcceptedServerSessions(tracker)))
    .filter(function(sess) { return exceptIds.indexOf(sess.id) === -1; });
}

function getConnectionState(tracker) {
  return stateFor(tracker).connectionState;
}

function setConnectionState(tracker, state) {
  return stateFor(tracker).connectionState = state;
}

function getSendState(tracker) {
  return stateFor(tracker).sendState;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {
  start: start,
  close: close,
  getServices: getServices,
  addService: addService,
  getServer: getServer,
  getClientSessions: getClientSessions,
  getOwnedServerSessions: getOwnedServerSessions,
  getAcceptedServerSessions: getAcceptedServerSessions,
  allConnections: allConnections,
  getConnectionState: getConnectionState,
  setConnectionState: setConnectionState,
  getSendState: getSendState,
}
