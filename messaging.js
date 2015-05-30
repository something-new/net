var lang = require("lively.lang");
var uuid = require("node-uuid");
var logger = require("./logger");

module.exports = {

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

  sendAndReceive: function(self, receiver, msg, thenDo) {
    thenDo = lang.fun.once(thenDo);

    function onReceive(answer) { thenDo(null, answer); }

    var msg = module.exports.send(self, receiver, msg, function(err) {
      if (!err) return;
      thenDo(err);
      self.removeListener("answer-"+msg.messageId, onReceive);
    });

    self.once("answer-" + msg.messageId, onReceive);
    return msg;
  },
  
  send: function(self, receiver, msg, thenDo) {
    if (!msg.sender) msg.sender = self.id;
    if (!msg.messageId) msg.messageId = "msg-" + uuid.v4();
    if (!msg.target && receiver) msg.target = receiver.id;
    var msgString = JSON.stringify(msg);
    logger.log("msg send", "%s %s -> %s", msg.action, msg.sender, msg.target);
    self.sendString(receiver, msgString, thenDo);
    return msg;
  }

}
