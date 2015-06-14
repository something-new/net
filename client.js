var lang            = require("lively.lang");
var WebSocket       = require('ws');
var messaging       = require("./messaging");
var logger          = require("./logger");
var util            = require("./util");
var defaultServices = require("./services");
var interfaces      = require("./interfaces");

var defaultPort = 10081;

var CONNECTING = messaging.ConnectionStates.CONNECTING;
var CONNECTED =  messaging.ConnectionStates.CONNECTED;
var CLOSED =     messaging.ConnectionStates.CLOSED;

function createWsConnection(client, options, thenDo) {
  var actions = lang.fun.either(
    function(err) { thenDo && thenDo(err, client); },
    function() { thenDo && thenDo(null, client); }),
      onConnectionFailure = actions[0],
      onConnectionSuccess = actions[1];

  if (getConnectionState(client) === CONNECTED)
    console.warn("creating a new websocket for client but an old one exist?");

  if (getConnectionState(client) !== CONNECTING)
    setConnectionState(client, CONNECTING);

  var ws = setConnection(client, new WebSocket(options.url)),
      onMessageBound = onMessage.bind(null, client);

  ws.on("message", onMessageBound);

  ws.once("close", function() {
    ws.removeListener("message", onMessageBound);
    client.emit("close", client);
  });

  ws.once("error", function(err) {
    logger.log("client ws creation error", client, err);
    onConnectionFailure(err);
  });

  ws.once('open', function() {
    setConnectionState(client, CONNECTED);
    client.emit('open', client);
    if (!options.register) onConnectionSuccess();
    else sendRegisterMessage(client, options, onConnectionSuccess);
  });

}

function onMessage(client, msgString) {
  try {
    var msg = JSON.parse(msgString);
  } catch (e) {
    console.error("Client cannot read incoming message %s", msgString);
    return;
  }
  messaging.receive(client, getConnection(client), msg);
}

function onClose(client) {
  if (!client.options.autoReconnect) setConnectionState(client, CLOSED);
  else if (getConnectionState(client) !== CLOSED) setConnectionState(client, CONNECTING);

  logger.log("client close", client, "disconnected from %s, reconnecting: %s",
    client.options.url, getConnectionState(client) !== CLOSED);
  if (getConnectionState(client) === CLOSED) return;

  reconnect(client, 100);

  function reconnect(client, delay) {
    if (getConnectionState(client) === CLOSED) return;

    logger.log("client reconnect", client, "to %s", client.options.url);

    createWsConnection(client, client.options, function(err) {
      if (err) {
        if (delay < 3000) delay = delay + 400;
        setTimeout(reconnect.bind(null, client, delay), delay);
        return;
      }
    });
  }
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function sendRegisterMessage(client, opts, thenDo) {
  var msg = messaging.sendAndReceive(client, null, {
    bypassQueue: true,
    action: opts.isFederationConnection ? "registerServer" : "registerClient",
    id: client.id,
    worldURL: require("os").hostname(),
    user: client.name || "no-name",
    timeOfCreation: Date.now(),
    timeOfRegistration: Date.now(),
    lastActivity: Date.now()
  },
  function(err, answer) {
    setTrackerId(client, lang.Path("data.tracker.id").get(answer));
    thenDo && thenDo(err);
  });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function start(options, thenDo) {
  // options: port, hostname, path, id, register, autoReconnect, isFederationConnection
  options = options || {};

  var port = options.port || defaultPort,
      host = options.hostname || "localhost",
      path = options.path || "";
  options.url = options.url || "ws://" + host + ":" + port + "/" + path;
  options.register = options.hasOwnProperty("register") ?
    !!options.register : true;
  options.autoReconnect = options.hasOwnProperty("autoReconnect") ?
    !!options.autoReconnect : true;

  var client = interfaces.createMessenger(
    "nodejs-client",
    options,
    {connection: null},
    lang.obj.clone(defaultServices),

    function clientSend(_, msgString, thenDo) {
      return getConnection(client).send(msgString, thenDo);
    },

    function clientInspect() {
      return lang.string.format(
        "Inspecting client %s\n  state: %s\n connected to: %s\n  send state: %s",
        client.id,
        this.state.connectionState,
        getTrackerId(this),
        messaging.logStateOf(this).split("\n").join("\n  "));
    });

  client.trackerId = null;

  client.on("close", onClose);

  createWsConnection(client, options, thenDo);

  return client;

}

function close(client, thenDo) {
  if (!client) {
    if (thenDo) thenDo(new Error("no client to close"));
    return;
  }

  setConnectionState(client, CLOSED);

  messaging.clearCacheFor(client);

  var ws = getConnection(client);
  ws && ws.close();
  if (!thenDo) return;
  if (!ws || ws.readyState === WebSocket.CLOSED) return thenDo(null);
  ws.once("close", function() { thenDo(null); });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function getServices(client) {
  return client.getState().services || (client.getState().services = {});
}

function addService(client, name, handler) {
  getServices(client)[name] = handler;
  return client;
}

function getTrackerId(client) {
  return client.trackerId;
}

function setTrackerId(client, trackerId) {
  getConnection(client).id = trackerId;
  return client.trackerId = trackerId;
}

function getConnection(client) {
  return client.getState().connection;
}

function setConnection(client, connection) {
  return client.getState().connection = connection;
}

function getConnectionState(client) {
  return client.getState().connectionState;
}

function setConnectionState(client, state) {
  return client.getState().connectionState = state;
}

function getSendState(client) {
  return client.getState().sendState;
}

module.exports = {
  start: start,
  close: close,
  
  getServices: getServices,
  addService: addService,
  getTrackerId: getTrackerId,
  setTrackerId: setTrackerId,
  getConnection: getConnection,
  setConnection: setConnection,
  getConnectionState: getConnectionState,
  setConnectionState: setConnectionState,
  getSendState: getSendState
}
