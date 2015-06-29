/*global process, beforeEach, afterEach, describe, it, expect*/

var chai = module.require('chai');
chai.use(require('chai-subset'));
var expect = chai.expect;
var mochaPlugins = require("./mocha-plugins");
var msgRec = mochaPlugins.messageRecorder;

var lang = require("lively.lang");
var local = require("../lib/local.js");
var messaging = require("../lib/interface/messaging");

var debug = true;

describe('local', function() {

  var env,
      o1, o2, o3,
      messengers = [],
      receivedMessages;

  beforeEach(function() {
    console.log("[TESTING] >>> \"%s\"", this.currentTest.title);
    env = local.createEnv();
    o1 = local.create({debug: debug});
    o2 = local.create({debug: debug});
    messengers = [o1,o2];
  });

  afterEach(function(done) {
    console.log("[TESTING DONE] <<< \"%s\"", this.currentTest.title);
    lang.fun.composeAsync(
      n      => lang.fun.waitForAll(messengers.map(c => n => local.close(c, n)), n)
    )(done);
  });

  describe("messaging", function() {
    
    it("send / receive in same env", function(done) {
      lang.fun.composeAsync(
        n => {
          messaging.sendAndReceive(o1, o2, o2, {action: "echo", data: "foo"}, n);
        }
      )((err, {action, sender}) => {
        if (err) return done(err);
        expect(action).to.equal("echoResult");
        expect(sender).to.equal(o2.id);
        done();
      });
    });

  });

});
