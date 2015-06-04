var lang            = require("lively.lang");
var WebSocket       = require('ws');
var uuid            = require("node-uuid");
var messaging       = require("./messaging");
var logger          = require("./logger");
var util            = require("./util");
var defaultServices = require("./services");

var defaultPort = 10081;

var ConnectionStates = messaging.ConnectionStates;
var SendStates = messaging.SendStates;

function createClient(options, thenDo) {
  var client = lang.events.makeEmitter({
    id: options.id,
    services: lang.obj.clone(defaultServices),
    connection: null,

    connectionState: ConnectionStates.CLOSED,
    sendState: SendStates.IDLE,
    receivedMessages: {},

    options: options,

    sendString: function(receiver, msgString, thenDo) {
      return client.connection.send(msgString, thenDo);;
    }
  });

  client._connectionState = client.connectionState;
  client.__defineSetter__("connectionState", function(val) {
      logger.log("client state", client, "%s -> %s",
      util.keyForValue(ConnectionStates, this._connectionState),
      util.keyForValue(ConnectionStates, val));
    return this._connectionState = val;
  });
  client.__defineGetter__("connectionState", function() {
    return this._connectionState;
  });

  client.on("close", onClose);
  client.on("message", function(msg, connection) {
    messaging.receive(client, connection, msg);
  });

  createWsConnection(client, options, thenDo);

  return client;
}

function createWsConnection(client, options, thenDo) {
  var actions = lang.fun.either(
    function(err) { thenDo && thenDo(err, client); },
    function() { thenDo && thenDo(null, client); }),
      onConnectionFailure = actions[0],
      onConnectionSuccess = actions[1];

  function onMessage(msgString) {
    try {
      var msg = JSON.parse(msgString);
    } catch (e) {
      console.error("Client cannot read incoming message %s", msgString);
      return;
    }
    client.emit("message", msg, ws);
  }

  if (client.connectionState === ConnectionStates.CONNECTED)
    console.warn("creating a new websocket for client but an old one exist?");

  if (client.connectionState !== ConnectionStates.CONNECTING)
    client.connectionState = ConnectionStates.CONNECTING;

  var ws = client.connection = new WebSocket(options.url);

  ws.on("message", onMessage);

  ws.once("close", function() {
    ws.removeListener("message", onMessage);
    client.emit("close", client);
  });

  ws.once("error", function(err) {
    logger.log("client ws creation error", client, err);
    onConnectionFailure(err);
  });

  ws.once('open', function() {
    client.connectionState = ConnectionStates.CONNECTED;
    client.emit('open', client);
    if (!options.register) onConnectionSuccess();
    else sendRegisterMessage(client, options, onConnectionSuccess);
  });

}

function onClose(client) {
  if (!client.options.autoReconnect) client.connectionState = ConnectionStates.CLOSED;
  else if (client.connectionState !== ConnectionStates.CLOSED) client.connectionState = ConnectionStates.CONNECTING;

  logger.log("client close", client, "disconnected from %s, reconnecting: %s",
    client.options.url, client.connectionState !== ConnectionStates.CLOSED);
  if (client.connectionState === ConnectionStates.CLOSED) return;

  reconnect(client, 100);

  function reconnect(client, delay) {
    if (client.connectionState === ConnectionStates.CLOSED) return;

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
    client.trackerId = lang.Path("data.tracker.id").get(answer);
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
  options.register = options.hasOwnProperty("register") ? !!options.register : true;
  options.id = options.id || "nodejs-client-" + uuid.v4();
  options.autoReconnect = options.hasOwnProperty("autoReconnect") ? !!options.autoReconnect : true;

  return createClient(options, thenDo);
}

function close(client, thenDo) {
  if (!client) {
    if (thenDo) thenDo(new Error("no client to close"));
    return;
  }

  client.connectionState = ConnectionStates.CLOSED;

  var ws = client.connection;
  ws && ws.close();
  if (!thenDo) return;
  if (!ws || ws.readyState === WebSocket.CLOSED) return thenDo(null);
  ws.once("close", function() { thenDo(null); });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {
  start: start,
  close: close
}
