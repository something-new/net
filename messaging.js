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
    console.log(errString);
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

  relay: function(proxy, sender, target, msg, thenDo) {
    logger.log("relay send", "%s %s (to %s)",
      msg.action, msg.id, msg.action, msg.target);

    var relayedMsg = util.assoc(msg, "sender", proxy.id),
        origSender = msg.sender;
    msg.relayedFor = origSender;

    return module.exports.sendAndReceive(
      proxy, target, relayedMsg,
      function(err, answer) {
        if (err) {
          module.exports.answer(proxy, sender, {error: String(err)});
        } else {
          answer = util.assoc(answer, "target", sender.id);
          module.exports.send(proxy, sender, answer);
        }
        thenDo && thenDo(err, answer);
    });
  }
}
