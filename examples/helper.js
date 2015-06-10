var lang = require("lively.lang");
var client = require("../client");
var server = require("../server");
var messaging = require("../messaging");
var federation = require("../federation");
var path = require("path");
var fs = require("fs");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var debug = false;

var msgsReceived = 0;
var msgsSend = 0;
var messageTimings = [];

function log(/*args*/) {
  return console.log.apply(console, arguments);
}

function createServers(trackerPorts, thenDo) {
  lang.arr.mapAsyncSeries(trackerPorts,
    function(port, _, n) { server.start({debug: debug, port: port}, n); },
    thenDo);
}

function createClients(trackerPorts, clientsPerTracker, thenDo) {
  // clients for all trackers except the central one
  lang.chain(trackerPorts)
    .flatmap(lang.arr.withN.bind(null,clientsPerTracker))
    .mapAsyncSeries(function(port, _, n) {
      client.start({debug: debug, port: port}, n);
    }, thenDo);
}

function connectTrackers(fromTos, thenDo) {
  lang.arr.mapAsyncSeries(fromTos, function(fromTo, _, n) {
    federation.connect(fromTo[0], fromTo[1], n);
  }, function(err) { thenDo(err); });
}

function sendEcho(logString, payload, from, to, thenDo) {
  log("%s: Sending echo", logString);
  msgsSend++;
  var t = Date.now(), err;
  var msg = messaging.sendAndReceive(
    from, {id: to.id}, {action: "echo", data: payload},
    function(err, answer) {
      if (!err && answer) msgsReceived++;
      log("%s: %s -> %s in %s ms",
        logString, from.options.url, to.options.url,
        Date.now()-t);
      messageTimings.push(Date.now()-t);
      thenDo();
    });
  
  // from.on("answer-" + msg.messageId, function(answer) {
  //   if (!err && answer) msgsReceived++;
  //   log("%s: %s -> %s in %s ms",
  //     logString, from.options.url, to.options.url,
  //     Date.now()-t);
  //   messageTimings.push(Date.now()-t);
  // });
}

function closeClientsAndTrackers(clients, trackers, thenDo) {
  lang.fun.composeAsync(
    function wait(n) {
      lang.fun.waitFor(10*1000,
        function() { return msgsSend === msgsReceived },
        function(err) { n(); })
    },
    function(n) {
      lang.arr.mapAsyncSeries(clients,
        function(c, _, n) {
          log("closing client %s", c.options.url);
          client.close(c, n);
        }, n);
    },
    function(_, n) {
      lang.arr.mapAsyncSeries(trackers,
        function(t, _, n) {
          log("closing tracker %s", t.options.port);
          server.close(t, n);
        }, n);
    },
    function wait(_, n) { setTimeout(n, 300); }
  )(function(err) {
    log(err || "Done closing connections");  
    thenDo(err, msgsReceived, msgsSend, messageTimings);
  });
}

function showMessageTimings(messageTimings) {
  var chart = require('ascii-chart');
  // var clear = require('clear');
  console.log(chart(messageTimings, {width: 200, height: 35}));
}

module.exports = {
    createServers: createServers,
    createClients: createClients,
    connectTrackers: connectTrackers,
    sendEcho: sendEcho,
    closeClientsAndTrackers: closeClientsAndTrackers,
    showMessageTimings: showMessageTimings
}