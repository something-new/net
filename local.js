var uuid      = require("node-uuid");
var lang      = require("lively.lang");
var messaging = require("./messaging");

var CONNECTING = messaging.ConnectionStates.CONNECTING;
var CONNECTED =  messaging.ConnectionStates.CONNECTED;
var CLOSED =     messaging.ConnectionStates.CLOSED;

var IDLE = messaging.SendStates.IDLE;

function create(options, thenDo) {
  options = options || {};
  var o = lang.events.makeEmitter({
    options: options,
    id: options.id || "local-" + uuid.v4(),
    state: {
      connectionState: CONNECTED,
      sendState: IDLE,
    },

    inspect: function() {
      return lang.string.format(
        "Inspecting local messenger\n  state: %s\n  send state: %s",
        this.state.connectionState,
        messaging.logStateOf(this).split("\n").join("\n  "));
    },

    getState: function() { return this.state; },

    sendString: function(receiver, msgString, thenDo) {
      var con = receiver && (receiver.state ? receiver.state.connection : receiver.connection);
      try {
        receiver.receiveString(this, msgString);
      } catch (e) { return thenDo && thenDo(e); }
      thenDo && thenDo();
    },
    
    receiveString: function(sender, msgString) {
      try {
        var msg = JSON.parse(msgString);
      } catch (e) {
        console.error("Local messenger cannot read incoming message " + msgString);
        return;
      }
      messaging.receive(this, sender, msg);
    }
  });

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