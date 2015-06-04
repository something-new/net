var lang = require("lively.lang");
var uuid = require("node-uuid");
var logger = require("./logger");
var util = require("./util");

var counter = 1;

var ConnectionStates = {
  CLOSED: 1,
  CONNECTING: 2,
  CONNECTED: 3
}

var SendStates = {
  SENDING: 1,
  IDLE: 2
}

var sendQueues = new Map();

function getSendQueue(sender) {
  return sendQueues[sender] || (sendQueues[sender] = []);
}

function scheduleSend(sender, receiver, msg, thenDo) {
  logger.log("queueing send", "%s %s", sender.id, msg.action);
  var q = getSendQueue(sender),
      data = [sender, receiver, msg, thenDo];
  q[msg.bypassQueue ? "unshift" : "push"](data);
  sender.once("open", function() { deliverSendQueue(sender); });
}

function deliverSendQueue(sender) {
  var q = getSendQueue(sender);
  if (!q.length) return;

  if (sender.connectionState === ConnectionStates.CLOSED) return;

  if (sender.connectionState === ConnectionStates.CONNECTING
   || sender.sendState === SendStates.SENDING) {
    setTimeout(deliverSendQueue.bind(null, sender), 100);
    return;
  }

  actualSend.apply(null, q.shift());
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function ensureMessageProperties(sender, receiver, msg) {
  if (!msg.sender) msg.sender = sender.id;
  if (!msg.messageId) msg.messageId = "msg-" + uuid.v4();
  if (!msg.target && receiver) msg.target = receiver.id;
  return msg;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function actualSend(sender, receiver, msg, thenDo) {
  if (sender.connectionState === ConnectionStates.CLOSED) {
    var errString = "cannot send, " + sender.id + " not connected";
    console.error(errString);
    if (thenDo) thenDo(new Error(errString));
    return;
  }

  logger.log("send", "%s, %s (%s) -> %s",
    msg.action,
    msg.sender, util.keyForValue(ConnectionStates, sender.connectionState),
    msg.target);

  try {
    var msgString = JSON.stringify(msg);
  } catch (e) {
    var errMsg = "Cannot stringify message " + e;
    console.error(errMsg);
    thenDo && thenDo(new Error(errMsg));
  }

  var actions = lang.fun.either(
    function() {
      // client.sendState = client.sendQueue.length ? SendStates.SENDING : SendStates.IDLE;
      // sender.sendState = SendStates.IDLE;
      thenDo && thenDo(new Error('timeout!'));
    },
    function(err) {
      // sender.sendState = SendStates.IDLE;
      thenDo && thenDo(err);
    });

  setTimeout(actions[0], 2000);

  // sender.sendState = SendStates.SENDING;
  sender.sendString(receiver, msgString, actions[1]);
  return msg;
}

module.exports = {

  ConnectionStates: ConnectionStates,
  SendStates: SendStates,

  answer: function(self, sender, origMsg, data, thenDo) {
    return module.exports.send(self, sender, {
      action: origMsg.action + "Result",
      inResponseTo: origMsg.messageId,
      data: data
    }, thenDo);
  },

  sendTo: function(self, receiver, action, data, thenDo) {
    var msg = {action: action, data: data};
    return module.exports.send(self, receiver, msg, thenDo);
  },

  sendAndReceive: function(sender, receiver, msg, thenDo) {
    msg = ensureMessageProperties(sender, receiver, msg);
    thenDo = thenDo && lang.fun.once(thenDo);

    var onReceive = function(answer) { thenDo && thenDo(null, answer); }
    var onMessageSend = function(err) {
      if (!err) return;
      thenDo && thenDo(err);
      sender.removeListener("answer-"+msg.messageId, onReceive);
    }
    sender.once("answer-" + msg.messageId, onReceive);

    return module.exports.send(sender, receiver, msg, onMessageSend);
  },

  send: function(sender, receiver, msg, thenDo) {
    msg = ensureMessageProperties(sender, receiver, msg);

    if (sender.connectionState === ConnectionStates.CONNECTING
     || sender.sendState === SendStates.SENDING
     || !!getSendQueue(sender).length) {
      scheduleSend(sender, receiver, msg, thenDo);
    } else {
      actualSend(sender, receiver, msg, thenDo);
    }

    return msg;
  },

  receive: function(receiver, connection, msg) {
    if (receiver.receivedMessages[msg.messageId]) {
      logger.log("message already received",
        "%s got message already received %s %s",
        receiver.id, msg.action, msg.messageId);
      return;
    }
    receiver.receivedMessages[msg.messageId] = Date.now();

    var relay = msg.target && msg.target !== receiver.id,
        action = relay ? "relay" : msg.action;

    logger.log("receive", "%s got %s", receiver.id,
      msg.inResponseTo ?
        "answer for " + action.replace(/Result$/, "") : action);

    if (!relay && msg.inResponseTo) {
      receiver.emit("answer-" + msg.inResponseTo, msg);
      return;
    }

    var services = receiver.services || {},
        sender = {id: msg.sender, connection: connection},
        handler = services[action];

    if (relay) {
      if (handler) {
        logger.log("relay", "%s relays %s (%s -> %s)",
          receiver.id, msg.action, msg.sender, msg.target);
      } else {
        logger.log("relay failed", "%s could not relay %s (%s -> %s)",
          receiver.id, msg.action, msg.sender, msg.target, msg);
        return;
      }
    }

      // FIXME
    sender = lang.events.makeEmitter(sender);
    connection.once("close", function() { sender.emit("close"); });

    if (handler) {
      try {
        handler(receiver, sender, msg);
      } catch (e) {
        console.error("Error in service handler %s:", msg.action, e);
      }
    } else {
      module.exports.answer(
        receiver, sender, msg,
        {error: "message not understood"});
    }
  }

}
