var lang = require("lively.lang");
var uuid = require("node-uuid");
var logger = require("./logger");
var util = require("./util");

var connection = require("./connection");
var CLOSED = connection.CLOSED;
var CONNECTING = connection.CONNECTING;
var CONNECTED = connection.CONNECTED;

var SendStates = {
  SENDING: "SENDING",
  IDLE: "IDLE"
}
var SENDING = SendStates.SENDING;
var IDLE = SendStates.IDLE;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

// maps: messenger -> {timestamps: [message ids]}
var receivedMessages = new Map();
// var receivedMessageCacheTime = 60*1000;
var receivedMessageCacheTime = 1*1000;

function cleanReceivedMessageCache(receivedMessages) {
  receivedMessages.forEach(function(k, v) {
    cleanReceivedMessageCacheForReceiver(receivedMessages, k);    
  });
}

function cleanReceivedMessageCacheForReceiver(receivedMessages, messenger) {
  var cache = receivedMessageCacheForReceiver(receivedMessages, messenger),
      cacheTime = Math.round(Date.now() / receivedMessageCacheTime),
      count = 0;
  for (var time in cache) {
    if (cacheTime - time > 0) delete cache[time];
    else count++;
  }
  if (count === 0) receivedMessages.delete(messenger);
}

function receivedMessageCacheForReceiver(receivedMessages, messenger) {
  var cache  = receivedMessages.get(messenger);
  if (!cache) receivedMessages.set(messenger, cache = {});
  return cache;
}

function registerMessage(messenger, msg) {
  // returns true if the message was already processed by receiver
  cleanReceivedMessageCacheForReceiver(receivedMessages, messenger);
  var cache = receivedMessageCacheForReceiver(receivedMessages, messenger),
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

function scheduleSend(sender, connection, receiver, msg, thenDo) {
  logger.log("queueing send", sender, "%s on %s. position",
    msg.action, getSendQueue(sender).length);
  var q = getSendQueue(sender),
      data = [sender, connection, receiver, msg, thenDo];
  q[msg.bypassQueue ? "unshift" : "push"](data);
  connection.once("open", function() { deliverSendQueue(sender); });
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

function actualSend(sender, connection, receiver, msg, thenDo) {
  if (connection.status() === CLOSED) {
    var errString = "cannot send, " + connection + " of " + sender.id + " not connected";
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
  connection.send(msg, actions[1]);
  return msg;
}

module.exports = {

  ConnectionStates: {
    CLOSED: CLOSED,
    CONNECTING: CONNECTING,
    CONNECTED: CONNECTED,
  },

  SendStates: SendStates,

  clearCacheFor: function(sender) {
    cleanReceivedMessageCacheForReceiver(receivedMessages, sender);
    removeSendQueue(sender);
  },

  logStateOf: function(sender, connection) {
    return lang.string.format("recently received messages: %s\nmessage queue: \n  %s",
      lang.obj.values(receivedMessageCacheForReceiver(receivedMessages, sender)).join(", "),
      getSendQueue(sender)
        .map(function(args) { return args[2].action + "(" + args[2].id + ")" })
        .join("\n  "))
  },

  answer: function(self, connection, sender, origMsg, data, thenDo) {
    return origMsg.noResponse ? null :
      module.exports.send(
        self, connection,
        sender,
        {
          target: origMsg.sender,
          action: origMsg.action + "Result",
          inResponseTo: origMsg.messageId,
          data: data
        }, thenDo);
  },

  sendTo: function(self, connection, receiver, action, data, thenDo) {
    var msg = {action: action, data: data};
    return module.exports.send(self, connection, receiver, msg, thenDo);
  },

  sendAndReceive: function(sender, connection, receiver, msg, thenDo) {
    msg = ensureMessageProperties(sender, receiver, msg);
    thenDo = thenDo && lang.fun.once(thenDo);

    if (msg.noResponse) {
      return module.exports.send(sender, connection, receiver, msg, thenDo);
    }

    var onReceive = function(answer) { thenDo && thenDo(null, answer); },
        onMessageSend = function(err) {
          if (!err) return;
          console.log(err.stack);
          thenDo && thenDo(err);
          sender.removeListener("answer-"+msg.messageId, onReceive);
        }

    sender.once("answer-" + msg.messageId, onReceive);
    return module.exports.send(sender, connection, receiver, msg, onMessageSend);
  },

  send: function(sender, connection, receiver, msg, thenDo) {
    if (!connection) {
      var err = new Error("send with " + sender + " but no connection specified");
      if (thenDo) return thenDo(err);
      else throw err;
    }
    msg = ensureMessageProperties(sender, receiver, msg);

    var status = connection.status();

    if (status === CONNECTING
    // || sender.getState().sendState === SENDING
     || !!getSendQueue(sender).length) {
      scheduleSend(sender, connection, receiver, msg, thenDo);
    } else {
      actualSend(sender, connection, receiver, msg, thenDo);
    }

    return msg;
  },

  receive: function(messenger, connection, msg) {
    if (registerMessage(messenger, msg)) {
      logger.log("message already received", messenger,
        "%s %s\n  from %s / %s\n  proxies",
        msg.action, msg.messageId, msg.sender, connection, msg.proxies);
      return;
    }

    var relay = msg.target && msg.target !== messenger.id && !msg.broadcast,
        action = relay ? "relay" : msg.action;

    logger.log("receive", messenger, "got %s",
      msg.inResponseTo ?
        "answer for " + action.replace(/Result$/, "") : action);

    messenger.emit("message", msg);
    if (!relay && msg.inResponseTo) {
      messenger.emit("answer-" + msg.inResponseTo, msg);
      return;
    }

    var handler = messenger.serviceNamed(action);

    if (relay) {
      if (handler) {
        logger.log("relay", messenger, "relays %s (%s -> %s)",
          msg.action, msg.sender, msg.target);
      } else {
        logger.log("relay failed", messenger, "could not relay %s (%s -> %s)",
          msg.action, msg.sender, msg.target, msg);
        return;
      }
    }

    if (handler) {
      try {
        handler(messenger, connection, msg);
        return;
      } catch (e) {
        console.error("Error in service handler %s:", msg.action, e.stack || e);
      }
    } else {
      module.exports.answer(
        messenger, connection, connection, msg,
        {error: "message not understood"});
      return;
    }

    if (msg.broadcast && services.broadcast) {
      services.broadcast(messenger, connection, msg);
    }
  }
}
