var lang = require("lively.lang");
var uuid = require("node-uuid");
var logger = require("./logger");
var util = require("./util");

var counter = 1;

var ConnectionStates = {
  CLOSED: "CLOSED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED"
}

var CLOSED = ConnectionStates.CLOSED;
var CONNECTING = ConnectionStates.CONNECTING;
var CONNECTED = ConnectionStates.CONNECTED;

var SendStates = {
  SENDING: "SENDING",
  IDLE: "IDLE"
}

var SENDING = SendStates.SENDING;
var IDLE = SendStates.IDLE;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

// maps: receiver (server | client) -> {timestamps: [message ids]}
var receivedMessages = new Map();
// var receivedMessageCacheTime = 60*1000;
var receivedMessageCacheTime = 1*1000;

function cleanReceivedMessageCache(receivedMessages) {
  receivedMessages.forEach(function(k, v) {
    cleanReceivedMessageCacheForReceiver(receivedMessages, k);    
  });
}

function cleanReceivedMessageCacheForReceiver(receivedMessages, receiver) {
  var cache = receivedMessageCacheForReceiver(receivedMessages, receiver),
      cacheTime = Math.round(Date.now() / receivedMessageCacheTime),
      count = 0;
  for (var time in cache) {
    if (cacheTime - time > 0) delete cache[time];
    else count++;
  }
  if (count === 0) receivedMessages.delete(receiver);
}

function receivedMessageCacheForReceiver(receivedMessages, receiver) {
  var cache  = receivedMessages.get(receiver);
  if (!cache) receivedMessages.set(receiver, cache = {});
  return cache;
}

function registerMessage(receiver, msg) {
  // returns true if the message was already processed by receiver
  cleanReceivedMessageCacheForReceiver(receivedMessages, receiver);
  var cache = receivedMessageCacheForReceiver(receivedMessages, receiver),
      seen = lang.obj.values(cache).some(function(msgIds) {
        return msgIds.indexOf(msg.messageId) > -1; }),
      cacheTime = Math.round(Date.now() / receivedMessageCacheTime);
  cache[cacheTime] = (cache[cacheTime] || []).concat([msg.messageId]);
  return seen;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var sendQueues = new Map();

function getSendQueue(sender) {
  var q = sendQueues.get(sender);
  if (q) return q;
  var q = [];
  sendQueues.set(sender, q);
  return q;
}

function removeSendQueue(sender) {
  var q = sendQueues.get(sender);
  if (q) sendQueues.delete(sender);
}

function scheduleSend(sender, receiver, msg, thenDo) {
  logger.log("queueing send", sender, "%s on %s. position",
    msg.action, getSendQueue(sender).length);
  var q = getSendQueue(sender),
      data = [sender, receiver, msg, thenDo];
  q[msg.bypassQueue ? "unshift" : "push"](data);
  sender.once("open", function() { deliverSendQueue(sender); });
}

function deliverSendQueue(sender) {
  var q = getSendQueue(sender);
  if (!q.length) { removeSendQueue(sender); return; }

  if (sender.connectionState === CLOSED) return;

  if (sender.connectionState === CONNECTING
   || sender.sendState === SENDING) {
    setTimeout(deliverSendQueue.bind(null, sender), 100);
    return;
  }

  var args = q.shift();
  if (!q.length) removeSendQueue(sender);
  actualSend.apply(null, args);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function ensureMessageProperties(sender, receiver, msg) {
  if (!msg.sender) msg.sender = sender.id;
  if (!msg.messageId) msg.messageId = "msg-" + uuid.v4();
  if (!msg.target && receiver) msg.target = receiver.id;
  if (!msg.sentTime) msg.sentTime = Date.now();
  return msg;
}

function actualSend(sender, receiver, msg, thenDo) {
  if (sender.getState().connectionState === CLOSED) {
    var errString = "cannot send, " + sender.id + " not connected";
    console.error(errString);
    if (thenDo) thenDo(new Error(errString));
    return;
  }
  var broadcast = !!msg.broadcast;
  if (broadcast) {
    logger.log("broadcasting", sender, "%s -> %s", msg.action, receiver.id);
  } else {
    logger.log("send", sender, "%s -> %s", msg.action, msg.target);
  }

  try {
    var msgString = JSON.stringify(msg);
  } catch (e) {
    var errMsg = "Cannot stringify message " + e;
    console.error(errMsg);
    thenDo && thenDo(new Error(errMsg));
  }

  var actions = lang.fun.either(
    function() {
      // client.sendState = client.sendQueue.length ? SENDING : IDLE;
      // sender.sendState = IDLE;
      thenDo && thenDo(new Error('timeout!'));
    },
    function(err) {
      // sender.sendState = IDLE;
      thenDo && thenDo(err);
    });

  setTimeout(actions[0], 2000);

  // sender.sendState = SENDING;
  sender.sendString(receiver, msgString, actions[1]);
  return msg;
}

module.exports = {

  ConnectionStates: ConnectionStates,
  SendStates: SendStates,

  _cleanReceivedMessageCache: function() {
    cleanReceivedMessageCache(receivedMessages);
  },

  clearCacheFor: function(sender) {
    cleanReceivedMessageCacheForReceiver(receivedMessages, sender);
    removeSendQueue(sender);
  },

  logStateOf: function(sender) {
    return lang.string.format("recently received messages: %s\nmessage queue: \n  %s",
      lang.obj.values(receivedMessageCacheForReceiver(receivedMessages, sender)).join(", "),
      getSendQueue(sender)
        .map(function(args) { return args[2].action + "(" + args[2].id + ")" })
        .join("\n  "))
  },

  answer: function(self, sender, origMsg, data, thenDo) {
    return origMsg.noResponse ? null :
      module.exports.send(self, sender, {
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

    if (msg.noResponse) {
      return module.exports.send(sender, receiver, msg, thenDo);
    }

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
console.log(receiver);
    msg = ensureMessageProperties(sender, receiver, msg);
    if (sender.getState().connectionState === CONNECTING
     || sender.getState().sendState === SENDING
     || !!getSendQueue(sender).length) {
      scheduleSend(sender, receiver, msg, thenDo);
    } else {
      actualSend(sender, receiver, msg, thenDo);
    }

    return msg;
  },

  receive: function(receiver, connection, msg) {
    if (registerMessage(receiver, msg)) {
      logger.log("message already received", receiver,
        "%s %s\n  from %s / %s\n  proxies",
        msg.action, msg.messageId, msg.sender, connection.id || "", msg.proxies);
      return;
    }

    var relay = msg.target && msg.target !== receiver.id && !msg.broadcast,
        action = relay ? "relay" : msg.action;

    logger.log("receive", receiver, "got %s",
      msg.inResponseTo ?
        "answer for " + action.replace(/Result$/, "") : action);

    receiver.emit("message", msg);
    if (!relay && msg.inResponseTo) {
      receiver.emit("answer-" + msg.inResponseTo, msg);
      return;
    }

    var services = receiver.getState().services || {},
        sender = {id: msg.sender, connection: connection},
        handler = services[action];

    if (relay) {
      if (handler) {
        logger.log("relay", receiver, "relays %s (%s -> %s)",
          msg.action, msg.sender, msg.target);
      } else {
        logger.log("relay failed", receiver, "could not relay %s (%s -> %s)",
          msg.action, msg.sender, msg.target, msg);
        return;
      }
    }

    if (handler) {
      try {
        handler(receiver, sender, msg);
      } catch (e) {
        console.error("Error in service handler %s:", msg.action, e.stack || e);
      }
    } else {
      module.exports.answer(
        receiver, sender, msg,
        {error: "message not understood"});
    }

    if (msg.broadcast && services.broadcast) {
      services.broadcast(receiver, sender, msg);
    }
  }
}
