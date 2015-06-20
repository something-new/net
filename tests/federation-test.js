/*global process, beforeEach, afterEach, describe, it, expect*/

var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;

var lang       = require("lively.lang"),
    server     = require("../lib/nodejs/server"),
    client     = require("../lib/nodejs/client"),
    federation = require("../lib/nodejs/federation"),
    messaging  = require("../lib/interface/messaging"),
    sessions   = require("../lib/sessions");

var port1 = 10082,
    port2 = 10083,
    port3 = 10084,
    port4 = 10085;

describe("federation", function() {

  var tracker1, tracker2, tracker3,
      client1, client2, client3,
      clients, trackers;

  beforeEach(function(done) {
    console.log("[TESTING] >>> \"%s\"", this.currentTest.title);
    lang.fun.waitForAll([
      n => tracker1 = server.start({debug: true, port: port1}, n),
      n => tracker2 = server.start({debug: true, port: port2}, n),
      n => client1 = client.start({debug: true, port: port1}, n),
      n => client2 = client.start({debug: true, port: port2}, n),
      n => federation.connect(tracker1, {port: port2}, n),
    ], function(err, results) {
      err && console.error(err.stack || err);
      results = lang.arr.flatten(results);
      trackers = results.slice(0,2);
      clients = results.slice(2,4);
      done(err);
    });
  });

  afterEach(function(done) {
    console.log("[TESTING DONE] <<< \"%s\"", this.currentTest.title);
    lang.fun.composeAsync(
      n      => clients ? lang.fun.waitForAll(clients.map(c => n => client.close(c, n)), n) : n(null,null),
      (_, n) => trackers ? lang.fun.waitForAll(trackers.map(t => n => server.close(t, n)), n) : n(null,null)
    )(done);
  });

  describe("get sessions", function() {

    it("from client", function(done) {
      lang.fun.composeAsync(
        n => sessions.knownBy(client1, n)
      )((err, sessions) => {
        if (err) return done(err);
        expect(sessions).to.have.length(4);
        expect(sessions).containSubset([
          {id: client1.id},
          {id: client2.id},
          {id: tracker1.id},
          {id: tracker2.id},
        ]);
        done();
      });
    });

    it("from server", function(done) {
      lang.fun.composeAsync(
        n => sessions.knownBy(tracker1, n)
      )((err, sessions) => {
        if (err) return done(err);
        expect(sessions).to.have.length(4);
        expect(sessions).containSubset([
          {id: client1.id},
          {id: client2.id},
          {id: tracker1.id},
          {id: tracker2.id},
        ]);
        done();
      });
    });

  });

  describe("messaging", function() {

    it("msg send: c1 => t1 => t2 => t3 => c3", function(done) {
      lang.fun.composeAsync(
        n => tracker3 = server.start({debug: true, port: port3}, n),
        (_, n) => client3 = client.start({debug: true, port: port3}, n),
        (_, n) => federation.connect(tracker2, {port: port3}, n),
        (_, n) => {
          clients.push(client3);
          trackers.push(tracker3);
          console.log("t1: %s\nt2: %s\nt3: %s", tracker1.id,tracker2.id,tracker3.id);
          n();
        },
        n => messaging.sendAndReceive(
          client1, {id: client3.id},
          {action: "echo", data: "foo"}, n)
      )((err, {action, data, sender}) => {
        if (err) return done(err);
        expect(sender).eq(client3.id);
        expect(action).eq("echoResult");
        expect(data).eq("foo");
        done();
      });
    });

    it("msg send: t1 => t2", function(done) {
      lang.fun.composeAsync(
        n => messaging.sendAndReceive(
          tracker1, {id: tracker2.id},
          {action: "echo", data: "foo"}, n)
      )((err, {action, data, sender}) => {
        if (err) return done(err);
        expect(sender).eq(tracker2.id);
        expect(action).eq("echoResult");
        expect(data).eq("foo");
        done();
      });
    });

    it(`msg send: finds some way
     +-+      
 +-->+B+----+ 
+-+  +-+   +v+
|A|        |D|
+-+  +-+   +^+
 +-->+C+----+ 
     +-+      
`, function(done) {
      var A = tracker1, B = tracker2, C,D, clientD,
          portA = port1, portB = port2, portC = port3, portD = port4,
          messagesD = [];
      lang.fun.composeAsync(
        n      => trackers.push(C = server.start({debug: true, port: portC}, n)),
        (_, n) => trackers.push(D = server.start({debug: true, port: portD}, n)),
        (_, n) => clients.push(clientD = client.start({debug: true, port: portD}, n)),
        (_, n) => federation.connect(A, {port: portC}, n),
        (_, n) => federation.connect(B, {port: portD}, n),
        (_, n) => federation.connect(C, {port: portD}, n),
        (_, n) => {
          clientD.on("message", m => messagesD.push(m));
          n();
        },
        n      => messaging.sendAndReceive(
          client1, {id: clientD.id},
          {action: "echo", data: "foo"}, n)
      )((err, answer) => {
        if (err) return done(err);
        expect(answer).containSubset({
          sender: clientD.id,
          action: "echoResult",
          data: "foo"
        });

        let [msg, ...rest]  = messagesD;
        expect(rest).to.have.length(0);
        expect(msg).containSubset({
          sender: client1.id,
          action: "echo",
          data: "foo"
        });
        
        var proxies = lang.arr.pluck(msg.proxies, "id");
        expect(proxies).to.satisfy(
          proxies => lang.obj.equals([A.id, B.id, D.id], proxies)
                  || lang.obj.equals([A.id, C.id, D.id], proxies));
        
        if (lang.obj.equals([A.id, B.id, D.id], proxies))
          console.log("path A -> B -> D taken");
        else if (lang.obj.equals([A.id, C.id, D.id], proxies))
          console.log("path A -> C -> D taken");
        else
          console.log("INVALID proxying!");
        done();
      });
    });

  });

  describe("failure", function() {
    it("client", function(done) {
      lang.fun.composeAsync(
        n => client.close(client2, n),
        n => sessions.knownBy(tracker1, n)
      )((err, sessions) => {
        if (err) return done(err);
        expect(sessions).to.have.length(3);
        expect(sessions).containSubset([
          {id: client1.id},
          {id: tracker1.id},
          {id: tracker2.id},
        ]);
        done();
      });
    });

    it("server", function(done) {
      lang.fun.composeAsync(
        n => server.close(tracker2, n),
        n => sessions.knownBy(tracker1, n)
      )((err, sessions) => {
        if (err) return done(err);
        expect(sessions).to.have.length(2);
        expect(sessions).containSubset([
          {id: client1.id},
          {id: tracker1.id},
        ]);
        done();
      });
    });
  });

});
