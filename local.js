var interfaces      = require("./interfaces");
var lang      = require("lively.lang");
var messaging = require("./messaging");

var CONNECTING = messaging.ConnectionStates.CONNECTING;
var CONNECTED =  messaging.ConnectionStates.CONNECTED;
var CLOSED =     messaging.ConnectionStates.CLOSED;

function create(options, thenDo) {
  options = options || {};

  var o = interfaces.createMessenger(
    "local-js-obj",
    options,
    {connectionState: CONNECTED},
    {},
    // lang.obj.clone(defaultServices),

    function localSend(receiver, msgString, thenDo) {
      var con = receiver && (receiver.state ? receiver.state.connection : receiver.connection);
      try {
        receiver.receiveString(this, msgString);
      } catch (e) { return thenDo && thenDo(e); }
      thenDo && thenDo();
    },
    
    function localInspect() {
      return lang.string.format(
        "Inspecting local messenger\n  state: %s\n  send state: %s",
        this.state.connectionState,
        messaging.logStateOf(this).split("\n").join("\n  "));
    })

  o.receiveString = function(sender, msgString) {
    try {
      var msg = JSON.parse(msgString);
    } catch (e) {
      console.error("Local messenger cannot read incoming message " + msgString);
      return;
    }
    messaging.receive(this, sender, msg);
  }

  thenDo && thenDo(null, o);
  return o;
}

function close(obj, thenDo) {
  thenDo && thenDo();
}

function createEnv(thenDo) {
  var env = {};
  thenDo && thenDo(null, env);
  return env;
}


module.exports = {
  create: create,
  close: close,
  createEnv: createEnv
}