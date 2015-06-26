var lang       = require("lively.lang");
var connection = require("../interface/connection");
var WebSocket  = require('ws');
var logger  = require('../logger');

var defaultPort = 10081;

var CONNECTING = connection.CONNECTING,
    CONNECTED  = connection.CONNECTED,
    CLOSED     = connection.CLOSED;


function startFunction(options, con, thenDo) {
  var ws = new WebSocket(options.url);
  thenDo && thenDo(null, ws);
}

function closeFunction(options, con, thenDo) {
  if (con._connection)
    con._connection.close();
  thenDo && thenDo();
}

function sendFunction(options, con, msg, thenDo) {
  if (typeof msg == "string") {
    logger.log("MESSAGE ALREADY IS A STRING", con, msg.slice(0,40));
    msgString = msg;
  } else {
    try {
      var msgString = JSON.stringify(msg);
    } catch (e) {
      var errMsg = "Cannot stringify message " + e;
      console.error(errMsg);
      return thenDo && thenDo(new Error(errMsg));
    }
  }

console.log(con.status());
  con._connection.send(msgString, thenDo);
}

function inspectFunction(options, con) {
  return lang.string.format("ws connection to %s [%s]",
    options.url, con.status());
}

function normalizeOptions(options) {
  // options: port, hostname, path, id, register, autoReconnect, isFederationConnection
  options = options || {};

  if (!options.url) {
    var port = options.port || defaultPort,
        host = options.hostname || "localhost",
        path = options.path || "";
    options.url = options.url || "ws://" + host + ":" + port + "/" + path;
  }

  return options;
}

function create(options) {

  options = normalizeOptions(options);

  if (!options.url)
    throw new Error(new Error("no options.url specified!"))

  var con = connection.create(options,
    startFunction, closeFunction, sendFunction);

  return con;
}

function start(options, thenDo) {
  return create(options).start(thenDo);
}

function close(con, thenDo) {
  return con.close(thenDo);
}

module.exports = {
  start: start,
  close: close,

  // getServices: getServices,
  // addService: addService,
  // getTrackerId: getTrackerId,
  // setTrackerId: setTrackerId,
  // getConnection: getConnection,
  // setConnection: setConnection,
  // getConnectionState: getConnectionState,
  // setConnectionState: setConnectionState,
  // getSendState: getSendState
}
