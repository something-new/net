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

  var tracker, client1;
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
      n => client.close(client1, n),
      n => server.close(tracker, n)
    ], done);
  });

  describe("messaging", function() {
    
    it("inits client and echos", function(done) {
      lang.fun.composeAsync(
        n => {
          var msg = messaging.sendTo(
            client1, {id: client1.trackerId},
            "echo", "foo", (err, msg) => err && done(err));
          client1.once("answer-"+msg.messageId, msg => n(null, msg));
        }
      )((err, msg) => {
        if (err) return done(err);
        expect(msg.action).eq("echoResult");
        expect(msg.data).eq("foo");
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
        )((err, answer) => {
          if (err) return done(err);
          expect(answer.action).eq("dummyServiceResult");
          expect(answer.data).deep.eq({error: "message not understood"});
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
      )((err, answer) => {
        if (err) return done(err);
        expect(answer.data).eq("dummyService here");
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
        n => messaging.sendAndReceive(
            client1, {id: client1.trackerId},
            {action: "echo", data: "foo"}, n)
      )((err, msg) => {
        expect(String(err)).eq("Error: client not connected");
        done();
      });
    });

    it("client re-establishes connection when server fails", function(done) {
      lang.fun.composeAsync(
        n => server.close(tracker, n),
        n => setTimeout(n, 200),
        n => tracker = server.start({port: port}, n),
        (_, n) => setTimeout(n, 200),
        n => messaging.sendAndReceive(
            client1, {id: client1.trackerId},
            {action: "echo", data: "foo"}, n)
      )((err, msg) => {
        if (err) return done(err);
        expect(msg.action).eq("echoResult");
        expect(msg.data).eq("foo");
        done();
      });
    });
    
  });
});
