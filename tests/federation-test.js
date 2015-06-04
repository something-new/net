/*global process, beforeEach, afterEach, describe, it, expect*/

var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;

var lang = require("lively.lang");
var server = require("../server.js");
var client = require("../client.js");
var federation = require("../federation.js");
var messaging = require("../messaging");
var sessions = require("../sessions");

var port1 = 10082;
var port2 = 10083;
var port3 = 10084;

describe("federation", function() {

  var tracker1, tracker2, tracker3,
      client1, client2, client3;

  beforeEach(function(done) {
    console.log("[TESTING] >>> \"%s\"", this.currentTest.title);
    lang.fun.waitForAll([
      n => tracker1 = server.start({port: port1}, n),
      n => tracker2 = server.start({port: port2}, n),
      n => federation.connect(tracker1, {port: port2}, n),
      n => client1 = client.start({port: port1}, n),
      n => client2 = client.start({port: port2}, n)
    ], done);
  });
  
  afterEach(function(done) {
    console.log("[TESTING DONE] <<< \"%s\"", this.currentTest.title);
    lang.fun.waitForAll([
      n => client1 ? client.close(client1, n) : n(),
      n => client2 ? client.close(client2, n) : n(),
      n => client3 ? client.close(client3, n) : n(),
      n => tracker1 ? server.close(tracker1, n) : n(),
      n => tracker2 ? server.close(tracker2, n) : n(),
      n => tracker3 ? server.close(tracker3, n) : n()
    ], done);
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
        n => tracker3 = server.start({port: port3}, n),
        (_, n) => client3 = client.start({port: port3}, n),
        (_, n) => federation.connect(tracker2, {port: port3}, n),
        (_, n) => {
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
