var lang = require("lively.lang");
var WebSocketServer = require('ws').Server;
var uuid = require("node-uuid");

var defaultPort = 10081;

function start(options, thenDo) {
  options = options || {};
  if (!options.server && !options.port) {
    options.port = defaultPort;
  }
  options.clientTracking = true;
  var server = new WebSocketServer(options);
  var tracker = lang.events.makeEmitter({
    id: uuid.v4(),
    server: server
  });

  server.on("connection", function(ws) {
    ws.on('message', function(msgString) {
      try {
        var msg = JSON.parse(msgString);
      } catch (e) {
        console.error("Tracker cannot read incoming message %s", msgString);
        return;
      }
      receiveMessage(tracker, ws, msg);
    });
  });

  if (thenDo) thenDo(null, tracker);

  return tracker;
}

function close(tracker, thenDo) {
  if (!tracker || !tracker.server) {
    if (thenDo) thenDo(new Error("no tracker for close"));
    return;
  }
  tracker.server.close();
  tracker.emit("close");
  if (thenDo) thenDo(null);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function receiveMessage(tracker, ws, msg) {
  // tracker.emit("message", msg);
  switch (msg.action) {
    case 'registerClient':
      answer(tracker, {id: msg.sender, ws: ws}, msg, {
        success: true,
        tracker: {id: tracker.id}
      });
      return;
    case 'echo':
      answer(tracker, {id: msg.sender, ws: ws}, msg, msg.data);
      return;
    default:
      console.warn("tracker has unhandled message", msg);
  }
}

function answer(tracker, client, origMsg, data) {
  return send(tracker, client, {
    action: origMsg.action + "Result",
    inResponseTo: origMsg.messageId,
    data: data
  });  
}

function sendTo(tracker, client, action, messageId, data, thenDo) {
  var msg = {
    action: action,
    data: data
  };
  return send(tracker, client, msg, thenDo);
}

function send(tracker, client, msg, thenDo) {
  if (!client.ws) return thenDo && thenDo(new Error("No websocket"));
  if (!msg.sender) msg.sender = tracker.id;
  if (!msg.messageId) msg.messageId = uuid.v4();
  if (!msg.target) msg.target = client.id;
  var msgString = JSON.stringify(msg);
  client.ws.send(msgString, function(err) {
    if (thenDo) {
      if (err) thenDo(err, msg);
      // else registerMessageCallback(client, msg, thenDo);
    }
  });
  return msg;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {
  start: start,
  close: close
}