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

function sendString(client, receiver, msgString, thenDo) {
  if (client.connectionState === ConnectionStates.CLOSED
   || (!client.ws && client.connectionState !== ConnectionStates.CONNECTING)) {
    if (thenDo) thenDo(new Error("client not connected"));
    return;
  }

  if (client.connectionState === ConnectionStates.CONNECTING
   || client.sendState === SendStates.SENDING
   || client.sendQueue.length) {
    client.sendQueue.push([receiver, msgString, thenDo]);
    return;
  }

  client.sendState = SendStates.SENDING;
  client.ws.send(msgString, function(err) {
    client.sendState = client.sendQueue.length ? SendStates.SENDING : SendStates.IDLE;
    deliverSendQueue(client);
    thenDo && thenDo(err);
  });
}

function createClient(options, thenDo) {
  var client = lang.events.makeEmitter({
    id: options.id,
    services: lang.obj.clone(defaultServices),
    ws: null,

    connectionState: ConnectionStates.CLOSED,
    sendState: SendStates.IDLE,

    options: options,
    sendQueue: [],
    sendString: function(receiver, msgString, thenDo) {
      return sendString(client, receiver, msgString, thenDo);
    }
  });

  client._connectionState = client.connectionState;
  client.__defineSetter__("connectionState", function(val) {
      logger.log("client state", "%s -> %s (%s)",
      util.keyForValue(ConnectionStates, this._connectionState),
      util.keyForValue(ConnectionStates, val),
      client.id);
    return this._connectionState = val;
  });
  client.__defineGetter__("connectionState", function() {
    return this._connectionState;
  });

  client.on("close", onClose);

  createWsConnection(client, options, thenDo);

  return client;
}

function onClose(client) {
  if (!client.options.autoReconnect) client.connectionState = ConnectionStates.CLOSED;
  else if (client.connectionState !== ConnectionStates.CLOSED) client.connectionState = ConnectionStates.CONNECTING;

  logger.log("client close", "client %s disconnected from %s, reconnecting: %s",
    client.id, client.options.url, client.connectionState !== ConnectionStates.CLOSED);
  if (client.connectionState === ConnectionStates.CLOSED) return;

  reconnect(client, 100);

  function reconnect(client, delay) {
    if (client.connectionState === ConnectionStates.CLOSED) return;

    logger.log("client reconnect", "%s to %s", client.id, client.options.url);

    createWsConnection(client, client.options, function(err) {
      if (err) {
        if (delay < 3000) delay = delay + 400;
        setTimeout(reconnect.bind(null, client, delay), delay);
        return;
      }

      deliverSendQueue(client);
    });
  }
}

function createWsConnection(client, options, thenDo) {

  function whenEstablished(err, registerAnswer) {
    if (!err) client.emit('open', client);
    thenDo && thenDo(err, client);
  }

  function onMessage(msgString) {
    try {
      var msg = JSON.parse(msgString);
    } catch (e) {
      console.error("Client cannot read incoming message %s", msgString);
      return;
    }
    receiveMessage(client, ws, msg);
  }

  if (client.connectionState === ConnectionStates.CONNECTED)
    console.warn("creating a new websocket for client but an old one exist?");

  if (client.connectionState !== ConnectionStates.CONNECTING)
    client.connectionState = ConnectionStates.CONNECTING;

  var ws = client.ws = new WebSocket(options.url);

  ws.on("message", onMessage);

  ws.once("close", function() {
    ws.removeListener("message", onMessage);
    client.emit("close", client);
  });

  ws.once("error", function(err) {
    logger.log("client ws creation error", err);
    whenEstablished(err);
  });

  ws.once('open', function() {
    client.connectionState = ConnectionStates.CONNECTED;
    if (!options.register) whenEstablished();
    else sendRegisterMessage(client, options, whenEstablished);
  });

}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function deliverSendQueue(client) {
  if (!client.sendQueue.length) return;
  if (client.connectionState === ConnectionStates.CLOSED) return;

  if (client.connectionState === ConnectionStates.CONNECTING
   || client.sendState === SendStates.SENDING) {
    setTimeout(deliverSendQueue.bind(null, client), 100);
    return;
  }

  var next = client.sendQueue.shift();
  client.sendString.apply(client, next);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function sendRegisterMessage(client, opts, thenDo) {
  var origSend = client.sendString;

  // bypass queue
  client.sendString = function(receiver, msgString, thenDo) {
    client.ws.send(msgString, thenDo);
  }

  try {
    var msg = messaging.sendAndReceive(client, null, {
      action: opts.isFederationConnection ? "registerServer" : "registerClient",
      id: client.id,
      worldURL: require("os").hostname(),
      user: client.name || "no-name",
      timeOfCreation: Date.now(),
      timeOfRegistration: Date.now(),
      lastActivity: Date.now()
    }, function(err, answer) {
      client.trackerId = lang.Path("data.tracker.id").get(answer);
      deliverSendQueue(client);
      thenDo && thenDo(err);
    });
  } finally {
    client.sendString = origSend;
  }
}

function receiveMessage(client, ws, msg) {
  logger.log("client recv", "%s got %s", client.id,
    msg.inResponseTo ?
      "answer for " + msg.action.replace(/Result$/, "") :
      msg.action);

  if (msg.inResponseTo) {
    client.emit("message", msg);
    client.emit("answer-" + msg.inResponseTo, msg);
    return;
  }

  var services = client.services || {},
      sender = lang.events.makeEmitter({id: msg.sender, ws: ws}),
      handler = services[msg.action];

  ws.once("close", function() { sender.emit("close"); });

  if (handler) {
    try {
      handler(client, sender, msg);
    } catch (e) {
      console.error("Error in service handler %s:", msg.action, e);
    }
  } else {
    messaging.answer(
      client, sender, msg,
      {error: "message not understood"});
  }
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

  var ws = client.ws;
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
