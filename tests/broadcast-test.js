/*global process, beforeEach, afterEach, describe, it, expect*/

var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;
var mochaPlugins = require("./mocha-plugins");
var msgRec = mochaPlugins.messageRecorder;

var lang = require("lively.lang");
var server = require("../lib/nodejs/server");
var client = require("../lib/nodejs/client");
var messaging = require("../lib/interface/messaging");
var federation = require("../lib/nodejs/federation");

var debug = true;
var port = 10082;

describe('broadcast', function() {

  var tracker, client1, client2,
      clients, trackers,
      receivedMessages;

  beforeEach(function(done) {
    console.log("[TESTING] >>> \"%s\"", this.currentTest.title);
    receivedMessages = new Map();
    msgRec.install(receivedMessages);
    lang.fun.composeAsync(
      n => tracker = server.start({debug: debug, port: port}, n),
      (_, n) => client1 = client.start({debug: debug, port: port}, n),
      (_, n) => client2 = client.start({debug: debug, port: port}, n),
      (_, n) => {
        msgRec.add(receivedMessages, tracker, client1, client2);
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
          n      => B = server.start({debug: debug, port: portB}, n),
          (_, n) => C = server.start({debug: debug, port: portC}, n),
          (_, n) => D = server.start({debug: debug, port: portD}, n),
          (_, n) => clientOfD = client.start({debug: debug, port: portD}, n),
          (_, n) => federation.connect(A, {port: portB}, n),
          (_, n) => federation.connect(B, {port: portD}, n),
          (_, n) => federation.connect(A, {port: portC}, n),
          (_, n) => federation.connect(C, {port: portD}, n),
          (_, n) => {
            console.log(`A: ${A.id}\nB: ${B.id}\nC: ${C.id}\nD: ${D.id}\nclient 1 of A: ${client1.id}\nclient 2 of A: ${client2.id}\nclient 1 of D: ${clientOfD.id}`);
            receivedMessages = new Map();
            msgRec.install(receivedMessages);
            msgRec.add(receivedMessages, client1, client2, clientOfD, A,B,C,D);
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
