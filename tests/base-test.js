/*global process, beforeEach, afterEach, describe, it, expect*/

var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;

var lang = require("lively.lang");
var server = require("../server.js");
var client = require("../client.js");
var messaging = require("../messaging");

var port = 10082;

describe('client and server', function() {

  var tracker, client1, client2;
  beforeEach(function(done) {
    console.log("[TESTING] >>> \"%s\"", this.currentTest.title);
    lang.fun.composeAsync(
      n => tracker = server.start({port: port}, n),
      (_, n) => client1 = client.start({port: port}, n),
      (_, n) => n()
    )(done);
  });
  
  afterEach(function(done) {
    console.log("[TESTING DONE] <<< \"%s\"", this.currentTest.title);
    lang.fun.waitForAll([
      n => client1 ? client.close(client1, n) : n(),
      n => client2 ? client.close(client2, n) : n(),
      n => server.close(tracker, n)
    ], done);
  });

  describe("messaging", function() {
    
    it("msg: c1 => t1", function(done) {
      lang.fun.composeAsync(
        n => {
          var msg = messaging.sendTo(
            client1, {id: client1.trackerId},
            "echo", "foo", (err, msg) => err && done(err));
          client1.once("answer-"+msg.messageId, msg => n(null, msg));
        }
      )((err, {action, data, sender}) => {
        if (err) return done(err);
        expect(sender).eq(tracker.id);
        expect(action).eq("echoResult");
        expect(data).eq("foo");
        done();
      });
    });

    it("msg: c1 => t1 => c2", function(done) {
      lang.fun.composeAsync(
        n => client2 = client.start({port: port}, n),
        (_, n) => {
          var msg = messaging.sendTo(
            client1, {id: client2.id},
            "echo", "foo", (err, msg) => err && done(err));
          client1.once("answer-"+msg.messageId, msg => n(null, msg));
        }
      )((err, {action, data, sender}) => {
        if (err) return done(err);
        expect(sender).eq(client2.id);
        expect(action).eq("echoResult");
        expect(data).eq("foo");
        done();
      });
    });


    describe("message not understood", function() {
      
      it("returns mnu answer", function(done) {
        lang.fun.composeAsync(
          n => {
            messaging.sendAndReceive(client1, {id: client1.trackerId}, {
              action: "dummyService",
              data: null
            }, n);
          }
        )((err, {action, data}) => {
          if (err) return done(err);
          expect(action).eq("dummyServiceResult");
          expect(data).deep.eq({error: "message not understood"});
          done();
        });
      });
  
    });

    describe("duplicated messages", function() {
      it("are send only once", function(done) {
        var receivedBy1 = [],
            receivedBy2 = [];
        lang.fun.composeAsync(
          n => client2 = client.start({port: port}, n),
          (_, n) => {
            client1.on("message", m => receivedBy1.push(m));
            client2.on("message", m => receivedBy2.push(m));
            n();
          },
          n => {
            var msg = messaging.sendTo(client1, {id: client2.id}, "echo", "foo");
            messaging.send(client1, {id: client2.id}, msg);
            setTimeout(n, 200);
          }
        )(err => {
          if (err) return done(err);
          expect(receivedBy1).to.have.length(1);
          expect(receivedBy2).to.have.length(1);
          done();
        });
      });
    });

  });

  describe("services", function() {
    
    it("server add a service", function(done) {
      server.addService(tracker, "dummyService", (self, sender, msg) => {
        messaging.answer(self, sender, msg, "dummyService here");
      });
    
      lang.fun.composeAsync(
        n => {
          messaging.sendAndReceive(client1, {id: client1.trackerId}, {
            action: "dummyService",
            data: null
          }, n);
        }
      )((err, {data}) => {
        if (err) return done(err);
        expect(data).eq("dummyService here");
        done();
      });
    });

  });

  describe("reconnection", function() {

    it("client does not reconnect when closed", function(done) {
      lang.fun.composeAsync(
        n => client.close(client1, n),
        n => server.close(tracker, n),
        n => setTimeout(n, 200),
        n => tracker = server.start({port: port}, n),
        (_, n) => setTimeout(n, 200),
        n => {
          console.log("TEST NOTE: A WARNING MESSAGE IS EXPECTED");
          messaging.sendAndReceive(
            client1, {id: client1.trackerId},
            {action: "echo", data: "foo"}, n);
        }
      )((err, msg) => {
        expect(String(err)).match(/cannot send.*not connected/i);
        done();
      });
    });

    it("client re-establishes connection when server fails", function(done) {
      lang.fun.composeAsync(
        n => server.close(tracker, n),
        n => setTimeout(n, 200),
        n => tracker = server.start({id: tracker.id, port: port}, n),
        (_, n) => setTimeout(n, 200),
        n => messaging.sendAndReceive(
            client1, {id: client1.trackerId},
            {action: "echo", data: "foo"}, n)
      )((err, {action, data}) => {
        if (err) return done(err);
        expect(action).eq("echoResult");
        expect(data).eq("foo");
        done();
      });
    });
    
  });
});
