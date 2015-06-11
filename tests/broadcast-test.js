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
  console.log("...... recording %s for %s", msg.action, receiver.id);
  var recorded = receivedMessages.get(receiver) || [];
  recorded.push(msg);
  receivedMessages.set(receiver, recorded);
  return msg;
}

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
          client1, {id: client1.trackerId},
          {broadcast: true, noResponse: true, action: "echo", data: "foo"},
          (err, msg) => err && done(err));
        setTimeout(n, 100);
      }
    )((err) => {
      if (err) return done(err);

      expect(receivedMessages.get(client1)).eq(undefined);
      expect(receivedMessages.get(client2)).length(1);
      expect(receivedMessages.get(client2)).containSubset([{action: "echo"}]);
      expect(receivedMessages.get(tracker)).length(1);
      expect(receivedMessages.get(tracker)).containSubset([{action: "echo"}]);
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
console.log("A -- %s", A.id);
console.log("B -- %s", B.id);
console.log("C -- %s", C.id);
console.log("D -- %s", D.id);
            n();
          },
          
          // 2. broadcast
          n => {
            var msg = messaging.send(
              client1, {id: client1.trackerId},
              {broadcast: true, noResponse: true, action: "echo", data: "foo"},
              (err, msg) => err && done(err));
            setTimeout(n, 100);
          })(err => {
            if (err) return done(err);

            expect(receivedMessages.get(client1)).eq(undefined);

            expect(receivedMessages.get(A)).length(1);
            expect(receivedMessages.get(A)).containSubset([{action: "echo"}]);

            expect(receivedMessages.get(B)).length(1);
            expect(receivedMessages.get(B)).containSubset([{action: "echo"}]);

console.log(require("util").inspect(receivedMessages.get(C), {depth: 3}));
            expect(receivedMessages.get(C)).length(1);
            expect(receivedMessages.get(C)).containSubset([{action: "echo"}]);

            // expect(receivedMessages.get(D)).length(1);
            // expect(receivedMessages.get(D)).containSubset([{action: "echo"}]);
            // expect(receivedMessages.get(clientOfD)).length(1);
            // expect(receivedMessages.get(clientOfD)).containSubset([{action: "echo"}]);
            done();
          });
      });

});
