var lang            = require("lively.lang");
var obj             = lang.obj;
var WebSocketServer = require('ws').Server;
var messaging       = require("./messaging");
var logger          = require("./logger");
var client          = require("./client");
var interfaces      = require("./interfaces");

var defaultPort = 10081;

var CONNECTING = messaging.ConnectionStates.CONNECTING;
var CONNECTED =  messaging.ConnectionStates.CONNECTED;
var CLOSED =     messaging.ConnectionStates.CLOSED;

function start(options, thenDo) {
  options = options || {};

  if (!options.server && !options.port) {
    options.port = defaultPort;
  }

  options.clientTracking = true;
  var server = new WebSocketServer(options);

  var tracker = interfaces.createMessenger(
    "nodejs-tracker",
    options,
    {
      server: server,
      clientSessions: {},
      ownedServerSessions: {},
      acceptedServerSessions: {}
    },
  
    obj.merge(
      require("./services"),
      require("./server-services")),
  
    function trackerSend(connection, msg, thenDo) {
      if (!connection) {
        console.error("server send: no websocket");
        return thenDo && thenDo(new Error("No websocket"));
      }

      if (!connection.send && connection.id) {
        var found = lang.arr.detect(allConnections(this),
          function(ea) { return ea.id === connection.id; });
        if (found) connection = found;
      }

      // FIXME cleanup!!!
      if (!connection.send) {
        var err = "Cannot send, " + require("util").inspect(connection, {depth: 0}) + " has no send method send!";
        console.error(err);
        return thenDo(new Error(err));
      }
    
      try {
        var msgString = JSON.stringify(msg);
      } catch (e) {
        var errMsg = "Cannot stringify message " + e;
        console.error(errMsg);
        return thenDo && thenDo(new Error(errMsg));
      }

      connection.send(msgString, function(err) { if (thenDo) thenDo(err); });
    },
  
    function trackerInspect() {
      return lang.string.format(
        "Inspecting tracker\n  state: %s\n  connected clients: %s\n  owned server sessions: %s\n  acceptedServerSessions: %s\n  send state: %s",
        this._connectionState,
        obj.keys(getClientSessions(this)).join(", "),
        obj.keys(getOwnedServerSessions(this)).join(", "),
        obj.keys(getAcceptedServerSessions(this)).join(", "),
        messaging.logStateOf(this).split("\n").join("\n  "));
    });

  tracker.isTracker = true;

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
              ea.close();
              n();
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

function getServices(tracker) {
  return tracker.getState().services || (tracker.getState().services = {});
}

function addService(tracker, name, handler) {
  getServices(tracker)[name] = handler;
  return tracker;
}

function getServer(tracker) {
  return tracker.getState().server;
}

function getClientSessions(tracker) {
  return tracker.getState().clientSessions;
}

function getOwnedServerSessions(tracker) {
  return tracker.getState().ownedServerSessions;
}

function getAcceptedServerSessions(tracker) {
  return tracker.getState().acceptedServerSessions;
}

function allConnections(tracker, exceptIds) {
  exceptIds = exceptIds || [];
  return obj.values(getClientSessions(tracker))
    .concat(obj.values(getOwnedServerSessions(tracker)))
    .concat(obj.values(getAcceptedServerSessions(tracker)))
    .filter(function(sess) { return exceptIds.indexOf(sess.id) === -1; });
}

function getConnectionState(tracker) {
  return tracker.getState().connectionState;
}

function setConnectionState(tracker, state) {
  return tracker.getState().connectionState = state;
}

function getSendState(tracker) {
  return tracker.getState().sendState;
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
