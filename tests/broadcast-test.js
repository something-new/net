/*global process, beforeEach, afterEach, describe, it, expect*/

var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;

var lang = require("lively.lang");
var server = require("../server.js");
var client = require("../client.js");
var messaging = require("../messaging");
var federation = require("../federation");

var port = 10082;

var receivedMessages;
function recordMessage(receiver, msg) {
  var recorded = receivedMessages.get(receiver) || [];
  recorded.push(msg);
  receivedMessages.set(receiver, recorded);
  return msg;
}

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

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

describe('broadcast', function() {

  var tracker, client1, client2,
      clients, trackers;

  beforeEach(function(done) {
    console.log("[TESTING] >>> \"%s\"", this.currentTest.title);
    receivedMessages = new Map();
    lang.fun.composeAsync(
      n => tracker = server.start({debug: true, port: port}, n),
      (_, n) => client1 = client.start({debug: true, port: port}, n),
      (_, n) => client2 = client.start({debug: true, port: port}, n),
      (_, n) => {
        client1.on("message", m => recordMessage(client1, m));
        client2.on("message", m => recordMessage(client2, m));
        tracker.on("message", m => recordMessage(tracker, m));
        clients = [client1, client2];
        trackers = [tracker];
        n();
      }
    )(done);
  });

  afterEach(function(done) {
    console.log("[TESTING DONE] <<< \"%s\"", this.currentTest.title);
    lang.fun.composeAsync(
      n      => lang.fun.waitForAll(clients.map(c => n => client.close(c, n)), n),
      (_, n) => lang.fun.waitForAll(trackers.map(t => n => server.close(t, n)), n)
    )(done);
  });

  it("everyone gets it", function(done) {
    lang.fun.composeAsync(
      n => {
        var msg = messaging.send(
          client1, {id: client.getTrackerId(client1)},
          {broadcast: true, noResponse: true, action: "echo", data: "foo"},
          (err, msg) => err && done(err));
        setTimeout(n, 100);
      }
    )((err) => {
      if (err) return done(err);
      expect(client1).to.have.received(undefined);
      expect(client2).to.have.received([{action: "echo"}]);
      expect(tracker).to.have.received([{action: "echo"}]);
      done();
    });
  });

  it(`D only broadcasts once
  +-+        +-+
  |A+------->+B|
  +++        +++
   |          |
   |          \\/
   |  +-+    +++
   +->+C+--->+D|
      +-+    +-+`, function(done) {
        var A = tracker, B, C, D,
            clientOfD,
            portB = 10083, portC = 10084, portD = 10085

        // 1. connect it up
        lang.fun.composeAsync(
          n      => B = server.start({debug: true, port: portB}, n),
          (_, n) => C = server.start({debug: true, port: portC}, n),
          (_, n) => D = server.start({debug: true, port: portD}, n),
          (_, n) => clientOfD = client.start({debug: true, port: portD}, n),
          (_, n) => federation.connect(A, {port: portB}, n),
          (_, n) => federation.connect(B, {port: portD}, n),
          (_, n) => federation.connect(A, {port: portC}, n),
          (_, n) => federation.connect(C, {port: portD}, n),
          (_, n) => {
            receivedMessages = new Map();
            clientOfD.on("message", m => recordMessage(clientOfD, m));
            B.on("message", m => recordMessage(B, m));
            C.on("message", m => recordMessage(C, m));
            D.on("message", m => recordMessage(D, m));
            clients = clients.concat([clientOfD]);
            trackers = trackers.concat([B, C, D]);
            n();
          },
          
          // 2. broadcast
          n => {
            var msg = messaging.send(
              client1, {id: client.getTrackerId(client1)},
              {broadcast: true, noResponse: true, action: "echo", data: "foo"},
              (err, msg) => err && done(err));
            setTimeout(n, 100);
          })(err => {
            if (err) return done(err);
            expect(client1).to.have.received(undefined);
            expect(A).to.have.received([{action: "echo"}]);
            expect(B).to.have.received([{action: "echo"}]);
            expect(C).to.have.received([{action: "echo"}]);
            expect(D).to.have.received([{action: "echo"}]);
            expect(clientOfD).to.have.received([{action: "echo"}]);
            done();
          });
      });

});
