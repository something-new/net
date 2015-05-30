var lang = require("lively.lang");
var WebSocket = require('ws');
var uuid = require("node-uuid");

var defaultPort = 10081;

function start(options, thenDo) {
  options = options || {};
  var port = options.port || defaultPort,
      host = options.hostname || "localhost",
      path = options.path || "",
      url = "ws://" + host + ":" + port + "/" + path,
      register = options.hasOwnProperty("register") ? options.register : true,
      ws = new WebSocket(url);

  var client = lang.events.makeEmitter({
    id: uuid.v4(),
    ws: ws
  });

  ws.on('open', function() {
    if (!register) whenEstablished();
    else sendRegisterMessage(client, whenEstablished);
  });

  ws.on('message', function(msg) {
    // console.log("client %s got message", client.id, msg);
  });

  // ws.on('message', function(data, flags) {
  //   console.log(data);
  //   console.log(flags);
  // });
  
  // ws.send("foo")

  return client;

  function whenEstablished(err, registerAnswer) { thenDo && thenDo(err, client); }
}

function close(client, thenDo) {
  if (!client || !client.ws) {
    if (thenDo) thenDo(new Error("no client to close"));
    return;
  }

  var ws = client.ws;
  ws.close();
  if (ws.readyState === WebSocket.CLOSED) {
    if (thenDo) thenDo(null);
    return;
  }

  ws.once("close", function() {
    if (thenDo) thenDo(null);
  });

  return;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function answer(client, origMsg, data) {
  return send(client, {
    action: origMsg.action + "Result",
    inResponseTo: origMsg.messageId,
    data: data
  });  
}

function sendTo(client, receiverId, action, messageId, data, thenDo) {
  var msg = {
    sender: client.id,
    messageId: messageId || uuid.v4(),
    action: action,
    data: data
  };
  if (receiverId) msg.target = receiverId;
  return send(client, msg, thenDo)
}

function send(client, msg, thenDo) {
  if (!client.ws) return thenDo && thenDo(new Error("No websocket"));
  if (!msg.sender) msg.sender = client.id;
  if (!msg.messageId) msg.messageId = uuid.v4();
  var msgString = JSON.stringify(msg);
  client.ws.send(msgString, function(err) {
    registerMessageEmitter(client, msg);
    if (thenDo) { thenDo(err, msg); }
  });
  return msg;
}

function registerMessageEmitter(client, origMsg) {
  var msgId = origMsg.messageId;
  client.ws.on("message", onMessage);

  function onMessage(msgString) {
    try {
      var msg = JSON.parse(msgString);
    } catch (e) {
      console.error("Error receiving/reading message: %s", msgString);
      return;
    }

    if (msg.inResponseTo === msgId) {
      try {
        client.emit("answer-"+msgId, msg);
      } catch (e) {
        console.error("Error in message receive callback: %s", e.stack || e);
      }
    }
    if (!msg.expectMoreResponses) client.ws.removeListener('message', onMessage);
  }
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function sendRegisterMessage(client, thenDo) {
  var msg = sendTo(client, null, "registerClient", uuid.v4(), {
    id: client.id,
    worldURL: require("os").hostname(),
    user: client.name || "no-name",
    timeOfCreation: Date.now(),
    timeOfRegistration: Date.now(),
    lastActivity: Date.now()
  }, function(err) { err && thenDo(err); });
  client.once("answer-"+msg.messageId, function(msg) { thenDo(null, msg); });
}

module.exports = {
  start: start,
  close: close,
  send: send,
  answer: answer,
  sendTo: sendTo
}
