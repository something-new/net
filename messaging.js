var lang = require("lively.lang");
var uuid = require("node-uuid");
var logger = require("./logger");
var util = require("./util");


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

function queueSend(sender, receiver, msg, thenDo) {
  logger.log("QUEUEING SEND", "%s %s", sender.id, msg.action);
  var q = getSendQueue(sender);
  q.push([sender, receiver, msg, thenDo]);
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

  module.exports.immediateSend.apply(null, q.shift());
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function ensureMessageProperties(sender, receiver, msg) {
  if (!msg.sender) msg.sender = sender.id;
  if (!msg.messageId) msg.messageId = "msg-" + uuid.v4();
  if (!msg.target && receiver) msg.target = receiver.id;
  return msg;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

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
    // if (typeof immediate === "function") {
    //   thenDo === immediate; immediate = false;
    // } else if (typeof immediate === "undefined") {
    //   immediate = false; thenDo = null;
    // }

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

  send: function(self, receiver, msg, thenDo) {
    ensureMessageProperties(self, receiver, msg);

    logger.log("SEND", "%s (%s) %s", self.id, util.keyForValue(ConnectionStates, self.connectionState), msg.action);

    // if (self.connectionState === ConnectionStates.CLOSED) {
    //   console.log("cannot send, " + self.id + " not connected ");
    //   if (thenDo) thenDo(new Error("cannot send, " + self.id + " not connected "));
    //   return;
    // }

    // if (self.connectionState === ConnectionStates.CONNECTING
    // || self.sendState === SendStates.SENDING) {
    //   queueSend(self, receiver, msg, thenDo);
    // } else {
    //   return module.exports.immediateSend(self, receiver, msg, thenDo);
    // }

      return module.exports.immediateSend(self, receiver, msg, thenDo);
    return msg;
  },

  immediateSend: function(sender, receiver, msg, thenDo) {
    var msgString = JSON.stringify(msg);
    logger.log("IMMEDIATESEND", "%s %s -> %s", msg.action, msg.sender, msg.target);
    sender.sendString(receiver, msgString, thenDo);
    return msg;
  }

}
