var lang            = require("lively.lang");
var connection      = require("./ws-connection");
var messaging       = require("../interface/messaging");
var logger          = require("../logger");
var util            = require("../util");
var defaultServices = require("../services/default");
var interfaces      = require("../interface/interfaces");

var defaultPort = 10081;

var CONNECTING = messaging.ConnectionStates.CONNECTING;
var CONNECTED =  messaging.ConnectionStates.CONNECTED;
var CLOSED =     messaging.ConnectionStates.CLOSED;

function createWsConnection(client, options, thenDo) {
  if (!options.name) {
    options.name = options.isFederationConnection ?
      "server-to-server connection for " + client.id :
      "client connection for " + client.id;
  }

  var con = connection.start(options, function(err) {
    if (err) return thenDo(err);

    // setConnectionState(client, CONNECTED);
    if (!options.register) thenDo(null, client);
    else sendRegisterMessage(client, options, function(err) { thenDo(err, client) });
  });

  setConnection(client, con);

  var onMessageBound = onMessage.bind(null, client);

  con.on("message", onMessageBound);

  con.once("close", function() {
    con.removeListener("message", onMessageBound);
    client.emit("close", client);
  });

  con.on("error", function(err) {
    logger.log("client connection error", client, err);
  });

}

function onMessage(client, msg) {
  messaging.receive(client, getConnection(client), msg);
}

function onClose(client) {
  logger.log("client close", client, "disconnected from %s", client.options.url);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function sendRegisterMessage(client, opts, thenDo) {
  var msg = messaging.sendAndReceive(client, getConnection(client), null, {
    bypassQueue: true,
    action: opts.isFederationConnection ? "registerServer" : "registerClient",
    id: client.id,
    worldURL: require("os").hostname(),
    user: client.name || "no-name",
    timeOfCreation: Date.now(),
    timeOfRegistration: Date.now(),
    lastActivity: Date.now()
  },
  function(err, answer) {
    setTrackerId(client, lang.Path("data.tracker.id").get(answer));
    thenDo && thenDo(err);
  });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function start(options, thenDo) {
  // options: port, hostname, path, id, register, autoReconnect, isFederationConnection
  options = options || {};

  var port = options.port || defaultPort,
      host = options.hostname || "localhost",
      path = options.path || "";
  options.url = options.url || "ws://" + host + ":" + port + "/" + path;
  options.register = options.hasOwnProperty("register") ?
    !!options.register : true;
  options.autoReconnect = options.hasOwnProperty("autoReconnect") ?
    !!options.autoReconnect : true;

  var client = interfaces.createMessenger(
    "nodejs-client",
    options,
    {connection: null},
    lang.obj.clone(defaultServices),

    function clientSend(_, msg, thenDo) {
      return getConnection(client).send(msg, thenDo);
    },

    function clientInspect() {
      return lang.string.format(
        "Inspecting client %s\n  state: %s\n connected to: %s\n  send state: %s",
        client.id,
        this.state.connectionState,
        getTrackerId(this),
        messaging.logStateOf(this, getConnection(this)).split("\n").join("\n  "));
    });

  client.trackerId = null;

  client.on("close", onClose);

  createWsConnection(client, options, thenDo);

  return client;

}

function close(client, thenDo) {
  if (!client) {
    if (thenDo) thenDo(new Error("no client to close"));
    return;
  }

  setConnectionState(client, CLOSED);
  messaging.clearCacheFor(client);
  if (getConnection(client)) {
    getConnection(client).close(thenDo);
  } else { thenDo && thenDo(); }
  logger.log("close", client, "");
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function getServices(client) {
  return client.getState().services || (client.getState().services = {});
}

function addService(client, name, handler) {
  getServices(client)[name] = handler;
  return client;
}

function getTrackerId(client) {
  return client.trackerId;
}

function setTrackerId(client, trackerId) {
  getConnection(client).id = trackerId;
  return client.trackerId = trackerId;
}

function getConnection(client) {
  return client.getState().connection;
}

function setConnection(client, connection) {
  return client.getState().connection = connection;
}

function getConnectionState(client) {
  return getConnection(client).status();
}

function setConnectionState(client, state) {
  var con = getConnection(client);
  return con ? con._status = state : state;
}

function getSendState(client) {
  return client.getState().sendState;
}

module.exports = {
  start: start,
  close: close,
  
  getServices: getServices,
  addService: addService,
  getTrackerId: getTrackerId,
  setTrackerId: setTrackerId,
  getConnection: getConnection,
  setConnection: setConnection,
  getConnectionState: getConnectionState,
  setConnectionState: setConnectionState,
  getSendState: getSendState
}
