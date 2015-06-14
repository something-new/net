var lang            = require("lively.lang");
var uuid            = require("node-uuid");
var messaging       = require("./messaging");
var logger          = require("./logger");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var CONNECTING = messaging.ConnectionStates.CONNECTING;
var CONNECTED =  messaging.ConnectionStates.CONNECTED;
var CLOSED =     messaging.ConnectionStates.CLOSED;

var IDLE = messaging.SendStates.IDLE;

function createMessenger(type, options, initialState, services, sendFunction, inspectFunction) {

  var messenger = lang.events.makeEmitter({
    options: options,
    id: options.id || (type + "-" + uuid.v4()),

    state: lang.obj.merge({
      services: services || {},
      connectionState: CONNECTING,
      sendState: IDLE,
    }, initialState || {}),
  
    inspect: inspectFunction,
    sendString: sendFunction,
  
    getState: function() { return this.state; }
  });

  if (options.debug) {
    messenger.state._connectionState = messenger.state.connectionState;
    messenger.state.__defineGetter__("connectionState", function() {
      return this._connectionState;
    });
    messenger.state.__defineSetter__("connectionState", function(val) {
      logger.log("tracker state", messenger, "%s -> %s", this._connectionState, val);
      return this._connectionState = val;
    });
  }

  return messenger;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {

  createMessenger: createMessenger,

}