var lang            = require("lively.lang");
var WebSocketServer = require('ws').Server;
var uuid            = require("node-uuid");
var defaultServices = require("./services");
var serverServices  = require("./server-services");
var messaging       = require("./messaging");
var logger          = require("./logger");
var client          = require("./client");
var util            = require("./util");

var defaultPort = 10081;

function start(options, thenDo) {
  options = options || {};
  if (!options.server && !options.port) {
    options.port = defaultPort;
  }
  options.clientTracking = true;
  var server = new WebSocketServer(options);
  var tracker = lang.events.makeEmitter({
    isTracker: true,
    id: options.id || "nodejs-tracker-" + uuid.v4(),
    server: server,
    services: lang.obj.merge(defaultServices, serverServices),
    clientSessions: {},
    ownedServerSessions: {},
    acceptedServerSessions: {},

    connectionState: messaging.ConnectionStates.CONNECTING,
    sendState: messaging.SendStates.IDLE,

    sendString: function(receiver, msgString, thenDo) {
      if (!receiver || !receiver.ws) return thenDo && thenDo(new Error("No websocket"));
      receiver.ws.send(msgString, function(err) {
        if (err && thenDo) thenDo(err);
      });
    }
  });

  tracker._connectionState = tracker.connectionState;
  tracker.__defineSetter__("connectionState", function(val) {
      logger.log("tracker state", "%s -> %s",
      util.keyForValue(messaging.ConnectionStates, this._connectionState),
      util.keyForValue(messaging.ConnectionStates, val));
    return this._connectionState = val;
  });
  tracker.__defineGetter__("connectionState", function() {
    return this._connectionState;
  });

  server.on("connection", function(ws) {
    ws.on('message', function(msgString) {
      try {
        var msg = JSON.parse(msgString);
      } catch (e) {
        console.error("Tracker cannot read incoming message " + msgString);
        return;
      }
      receiveMessage(tracker, ws, msg);
    });
  });

  server.on("listening", function() {
    tracker.connectionState = messaging.ConnectionStates.CONNECTED;
    logger.log("tracker started", "%s", tracker.id);
  });

  server.on("error", function(err) { logger.log("tracker error", "%s", tracker.id, err); });
  server.on("close", function() { logger.log("tracker closed", "%s", tracker.id); });

  if (thenDo) thenDo(null, tracker);

  return tracker;
}

function close(tracker, thenDo) {

  lang.fun.composeAsync(
    function(n) {
      lang.fun.waitForAll(
        lang.obj.values(tracker.ownedServerSessions)
          .map(function(ea) {
            return function(n) {
              console.log("server closes client %s", ea.id);
              client.close(ea, n);
            }
          }), n);
    },

    function(_, n) {
      lang.fun.waitForAll(
        lang.obj.values(tracker.acceptedServerSessions)
          .map(function(ea) {
            return function(n) {
              console.log("server closes remote client %s", ea.id);
              messaging.send(tracker, ea, {action: "close"});
              setTimeout(n, 20);
            }
          }), n);
    },

    function(_, n) {
      if (!tracker || !tracker.server) {
        n(new Error("no tracker for close"));
        return;
      }
      tracker.server.close();
      setTimeout(function() {
        tracker.emit("close");
        n();
      }, 100);
    }
  )(thenDo);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function receiveMessage(tracker, ws, msg) {
  logger.log("tracker recv", "%s got %s", tracker.id,
    msg.inResponseTo ?
      "answer for " + msg.action.replace(/Result$/, "") :
      msg.action);

  if (msg.inResponseTo) {
    tracker.emit("message", msg);
    tracker.emit("answer-" + msg.inResponseTo, msg);
    return;
  }

  if (msg.target && msg.target !== tracker.id) {
    if (tracker.clientSessions[msg.target]) {
      messaging.relay(tracker, {ws: ws, id: msg.sender}, tracker.clientSessions[msg.target], msg);
    } else {
      logger.log("relay failed", "tracker %s could not relay %s (%s -> %s)",
        tracker.id, msg.action, msg.sender, msg.target);
      messaging.answer(
        tracker, sender, msg,
        {error: "target not found"});
    }
    return;
  }

  var services = tracker.services || {},
      sender = lang.events.makeEmitter({id: msg.sender, ws: ws}),
      handler = services[msg.action];

  ws.once("close", function() { sender.emit("close"); });

  if (handler) {
    try {
      handler(tracker, sender, msg);
    } catch (e) {
      console.error("Error in service handler %s:", msg.action, e);
    }
  } else {
    messaging.answer(
      tracker, sender, msg,
      {error: "message not understood"});
  }
}

function addService(tracker, name, handler) {
  if (!tracker.services) tracker.services = {};
  tracker.services[name] = handler;
  return tracker;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {
  start: start,
  close: close,
  addService: addService
}
