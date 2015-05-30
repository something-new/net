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

  beforeEach(done => {
    lang.fun.waitForAll([
      n => tracker1 = server.start({port: port1}, n),
      n => tracker2 = server.start({port: port2}, n),
      n => federation.connect(tracker1, {port: port2}, n),
      n => client1 = client.start({port: port1}, n),
      n => client2 = client.start({port: port2}, n)
    ], done);
  });
  
  afterEach(done => {
    lang.fun.waitForAll([
      n => server.close(tracker1, n),
      n => server.close(tracker2, n)
    ], done);
  });

  it("establishes server-to-server connection", function(done) {
    lang.fun.composeAsync(
      n => sessions.knownBy(client1, n)
    )((err, sessions) => {
      if (err) return done(err);
// console.log(sessions);
// console.log([client1.id, client2.id, tracker1.id, tracker2.id]);
      expect(sessions).containSubset([
        {id: client1.id},
        {id: client2.id},
        {id: tracker1.id},
        {id: tracker2.id},
      ]);
      done();
    });

  //   lang.fun.composeAsync(
  //     n => {
  //       var msg = messaging.sendTo(client1, {id: client1.trackerId},
  //         "echo", null, "foo",
  //         (err, msg) => err && done(err));
  //       client1.once("answer-"+msg.messageId, msg => n(null, msg));
  //     }
  //   )((err, msg) => {
  //     if (err) return done(err);
  //     expect(msg.action).eq("echoResult");
  //     expect(msg.data).eq("foo");
  //     done();
  //   });
  });

});
