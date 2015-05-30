var lang = require("lively.lang");
var WebSocket = require('ws');
var uuid = require("node-uuid");
var messaging = require("./messaging");

var defaultPort = 10081;

function start(options, thenDo) {
  options = options || {};
  var port = options.port || defaultPort,
      host = options.hostname || "localhost",
      path = options.path || "",
      url = "ws://" + host + ":" + port + "/" + path,
      register = options.hasOwnProperty("register") ? options.register : true,
      ws = new WebSocket(url),
      id = options.id || "nodejs-client-" + uuid.v4(),
      client = lang.events.makeEmitter({
        id: id,
        ws: ws,
        sendString: function(receiver, msgString, thenDo) {
          ws.send(msgString, thenDo);
        }
      });

  ws.on("message", function(msg) { 
    // console.log("[client recv] %s %s", client.id, msg);
    client.emit("message", msg);
  });

  ws.on("close", function() { client.emit("close"); });

  function whenEstablished(err, registerAnswer) {
    thenDo && thenDo(err, client);
  }

  ws.on('open', function() {
    if (!register) whenEstablished();
    else sendRegisterMessage(client, whenEstablished);
  });

  return client;
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

  ws.once("close", function() { if (thenDo) thenDo(null); });

  return;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function sendRegisterMessage(client, thenDo) {
  var msg = messaging.sendAndReceive(client, null, {
    action: "registerClient",
    id: client.id,
    worldURL: require("os").hostname(),
    user: client.name || "no-name",
    timeOfCreation: Date.now(),
    timeOfRegistration: Date.now(),
    lastActivity: Date.now()
  }, function(err, answer) {
    client.trackerId = lang.Path("data.tracker.id").get(answer);
    thenDo && thenDo(err);
  });
}

module.exports = {
  start: start,
  close: close
}
