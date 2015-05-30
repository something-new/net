var lang = require("lively.lang");
var WebSocket = require('ws');
var uuid = require("node-uuid");
var messaging = require("./messaging");
var logger = require("./logger");
var util = require("./util");
var defaultServices = require("./services");

var defaultPort = 10081;

function createWsConnection(client, options, thenDo) {

  function whenEstablished(err, registerAnswer) {
    thenDo && thenDo(err, client);
  }

  function onMessage(msgString) {
    // logger.log("client recv", "%s %s", client.id, msgString);
    try {
      var msg = JSON.parse(msgString);
    } catch (e) {
      console.error("Client cannot read incoming message %s", msgString);
      return;
    }
    receiveMessage(client, ws, msg);
  }

  var ws = client.ws = new WebSocket(options.url);

  ws.on("message", onMessage);
  ws.once("close", function() {
    ws.removeListener("message", onMessage);
    client.emit("close");
  });
  ws.once("error", function(err) { whenEstablished(err); })
  ws.once('open', function() {
    if (!options.register) whenEstablished();
    else sendRegisterMessage(client, options, whenEstablished);
  });

}

function start(options, thenDo) {
  // options: port, hostname, path, id, register, autoReconnect, isFederationConnection
  options = options || {};

  var port = options.port || defaultPort,
      host = options.hostname || "localhost",
      path = options.path || "",
      id = options.id || "nodejs-client-" + uuid.v4(),
      autoReconnect = options.hasOwnProperty("autoReconnect") ? !!options.autoReconnect : true,
      client = lang.events.makeEmitter({
        id: id,
        services: lang.obj.clone(defaultServices),
        ws: null,
        isReconnecting: false,
        isSending: false,
        autoReconnect: autoReconnect,
        isClosed: false,
        sendQueue: [],
        sendString: function sendString(receiver, msgString, thenDo) {
          if (client.isClosed || (!client.ws && !client.isReconnecting)) {
            if (thenDo) thenDo(new Error("client not connected"));            
            return;
          }

          if (client.isReconnecting || client.isSending || client.sendQueue.length) {
            client.sendQueue.push([receiver, msgString, thenDo]);
            return;
          }

          client.isSending = true;
          client.ws.send(msgString, function(err) {
            client.isSending = false;
            deliverSendQueue(client);
            thenDo && thenDo(err);
          });
        }
      });

  options.register = options.hasOwnProperty("register") ? !!options.register : true;
  options.url = options.url || "ws://" + host + ":" + port + "/" + path;

  client.on("close", function() {
    if (!client.autoReconnect) client.isClosed = true;

    logger.log("client close", "client %s disconnected from %s, reconnecting: %s",
      client.id, options.url, !client.isClosed);
    if (client.isClosed || client.isReconnecting) return;
    reconnect(client, options, 100);
  });

  createWsConnection(client, options, thenDo);

  return client;
}

function close(client, thenDo) {
  if (!client) {
    if (thenDo) thenDo(new Error("no client to close"));
    return;
  }

  client.isClosed = true;

  var ws = client.ws;
  ws && ws.close();
  if (!thenDo) return;
  if (!ws || ws.readyState === WebSocket.CLOSED) return thenDo(null);
  ws.once("close", function() { thenDo(null); });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function reconnect(client, options, delay) {
  if (client.isClosed) {
    client.isReconnecting = false;
    return;
  }

  logger.log("client reconnect", "%s to %s", client.id, options.url);

  client.isReconnecting = true;
  createWsConnection(client, options, function(err) {
    if (err) {
      if (delay < 3000) delay = delay + 400;
      setTimeout(reconnect.bind(null, client, options, delay), delay);
      return;
    }
    client.isReconnecting = false;
    client.isClosed = false;
    deliverSendQueue(client);
  });
}

function deliverSendQueue(client) {
  if (!client.sendQueue.length) return;
  if (client.isClosed || client.isReconnecting) return;
  if (client.isSending) {
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
  client.sendString = function sendString(receiver, msgString, thenDo) {
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
  var services = client.services || {},
      sender = lang.events.makeEmitter({id: msg.sender, ws: ws}),
      handler = services[msg.action];

  ws.once("close", function() { sender.emit("close"); });

  logger.log("client recv", "%s got %s", client.id, msg.inResponseTo ? "answer for " + msg.action : msg.action);

  if (msg.inResponseTo) {
    client.emit("message", msg);
    client.emit("answer-" + msg.inResponseTo, msg);
  } else if (handler) {
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

module.exports = {
  start: start,
  close: close
}
