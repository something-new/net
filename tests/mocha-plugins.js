var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;

function capture(receivedMessages, receiver, msg) {
  var recorded = receivedMessages.get(receiver) || [];
  recorded.push(msg);
  receivedMessages.set(receiver, recorded);
  return msg;
}

var messageRecorder = {

  add: function(receivedMessages, ...receivers) {
    receivers.forEach(function(ea) {
      ea.on("message", m => capture(receivedMessages, ea, m));
    });
  },
  
  install: function(receivedMessages) {
    chai.use(function (_chai, utils) {
      utils.addMethod(chai.Assertion.prototype, 'received', function(messageSubsets) {
        var receiver = utils.flag(this, 'object');
        if (!messageSubsets) {
          new chai.Assertion(receivedMessages.get(receiver)).to.equal(messageSubsets);
        } else {
          this.assert(receivedMessages.get(receiver), "no received messages for " + receiver.id);
          new chai.Assertion(receivedMessages.get(receiver))
            .lengthOf(
              messageSubsets.length,
              "message count does  not match");
          new chai.Assertion(receivedMessages.get(receiver))
            .containSubset(
              messageSubsets,
              "expected message props donot match");
        }
      });
    });
  }
}


module.exports = {
  messageRecorder: messageRecorder
}
