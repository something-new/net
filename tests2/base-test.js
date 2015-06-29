/*global process, beforeEach, afterEach, describe, it, expect*/

var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;

var debug = true;

var lang = require("lively.lang");
var server = require("../lib2/messengers/nodejs-tracker");
var client = require("../lib2/messengers/nodejs-client");
var messaging = require("../lib2/messaging");

var port = 10082;

describe('client and server', function() {

  var tracker, client1, client2;

  beforeEach(function(done) {
    console.log("[TESTING] >>> \"%s\"", this.currentTest.title);
    lang.fun.composeAsync(
      n => tracker = server.start({debug: debug, port: port}, n),
      (_, n) => client1 = client.start({debug: debug, port: port}, n)
    )(done);
  });

  afterEach(function(done) {
    console.log("[TESTING DONE] <<< \"%s\"", this.currentTest.title);
    lang.fun.composeAsync(
      n => client1 ? client1.close(n) : n(),
      n => client2 ? client2.close(n) : n(),
      n => tracker.close(n)
    )(done);
  });

  describe("messaging", function() {

    it("msg: c1 => t1", function(done) {
      lang.fun.composeAsync(
        n => {
          var msg = messaging.sendTo(
            client1, client1.getConnection(),
            {id: client1.trackerId},
            "echo", "foo", (err, msg) => err && done(err));
          client1.once("answer-" + msg.messageId, msg => n(null, msg));
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
        n => client2 = client.start({debug: debug, port: port}, n),
        (_, n) => {
          var msg = messaging.sendTo(
            client1, client1.getConnection(), {id: client2.id},
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
            messaging.sendAndReceive(
              client1, client1.getConnection(),
              {id: client1.trackerId},
              {action: "dummyService", data: null}, n);
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
          n => client2 = client.start({debug: debug, port: port}, n),
          (_, n) => {
            client1.on("message", m => receivedBy1.push(m));
            client2.on("message", m => receivedBy2.push(m));
            n();
          },
          n => {
            var msg = messaging.sendTo(
              client1, client1.getConnection(),
              {id: client2.id}, "echo", "foo");
            messaging.send(
              client1, client1.getConnection(),
              {id: client2.id}, msg);
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

  // describe("services", function() {

  //   it("server add a service", function(done) {
  //     server.addService(tracker, "dummyService", (self, sender, msg) => {
  //       messaging.answer(self, sender, sender, msg, "dummyService here");
  //     });

  //     lang.fun.composeAsync(
  //       n => {
  //         messaging.sendAndReceive(
  //           client1, client1.getConnection(),
  //           {id: client1.trackerId},
  //           {action: "dummyService", data: null}, n);
  //       }
  //     )((err, {data}) => {
  //       if (err) return done(err);
  //       expect(data).eq("dummyService here");
  //       done();
  //     });
  //   });

  // });

  describe("reconnection", function() {

    it("client does not reconnect when closed", function(done) {
      lang.fun.composeAsync(
        n => client1.close(n),
        n => tracker.close(n),
        n => setTimeout(n, 200),
        n => tracker = server.start({debug: debug, port: port}, n),
        (_, n) => setTimeout(n, 200),
        n => {
          console.log("TEST NOTE: A WARNING MESSAGE IS EXPECTED");
          messaging.sendAndReceive(
            client1, client1.getConnection(),
            {id: client1.trackerId},
            {action: "echo", data: "foo"}, n);
        }
      )((err, msg) => {
        expect(String(err)).match(/cannot send.*not connected/i);
        done();
      });
    });

    // it("client re-establishes connection when server fails", function(done) {
    //   lang.fun.composeAsync(
    //     n => server.close(tracker, n),
    //     n => setTimeout(n, 200),
    //     n => tracker = server.start({debug: debug, id: tracker.id, port: port}, n),
    //     (_, n) => setTimeout(n, 200),
    //     n => messaging.sendAndReceive(
    //         client1, client1.getConnection(),
    //         {id: client1.trackerId},
    //         {action: "echo", data: "foo"}, n)
    //   )((err, {action, data}) => {
    //     if (err) return done(err);
    //     expect(action).eq("echoResult");
    //     expect(data).eq("foo");
    //     done();
    //   });
    // });

  });

});
