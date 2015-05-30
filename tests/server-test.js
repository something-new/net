/*global process, beforeEach, afterEach, describe, it, expect*/

var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;

var lang = require("lively.lang");
var server = require("../server.js");
var client = require("../client.js");

var port = 10082;

describe('server', function() {

  var tracker, serverGotMessages;
  beforeEach((done) => {
    serverGotMessages = [];
    tracker = server.start({port: port}, done);
    // tracker.on('message', msg => serverGotMessages.push(msg));
  });
  
  afterEach((done) => {
    server.close(tracker, done);
  });

  it("send and receive", function(done) {
    lang.fun.composeAsync(
      n => client.start({port: port}, n),
      (c, n) => {
        var msg = client.sendTo(c, c.trackerId,
          "echo", null, "foo",
          (err, msg) => err && done(err));
        c.once("answer-"+msg.messageId, msg => n(null, msg));
      }
    )((err, msg) => {
      if (err) return done(err);
      expect(msg.action).eq("echoResult");
      expect(msg.data).eq("foo");
      done();
    });
  });

});
