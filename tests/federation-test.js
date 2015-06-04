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

describe("federation", function() {

  var tracker1, tracker2,
      client1, client2;

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
      n => client.close(client1, n),
      n => client.close(client2, n),
      n => server.close(tracker1, n),
      n => server.close(tracker2, n)
    ], done);
  });

  it("client can access all sessions", function(done) {
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

  it("server can access all sessions", function(done) {
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

  it("deals with client close", function(done) {
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

  it("deals with server close", function(done) {
    lang.fun.composeAsync(
      n => client.close(client2, n),
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
