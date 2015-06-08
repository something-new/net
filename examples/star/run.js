var lang = require("lively.lang");
var helper = require("../helper")

// var client = require("../../client");
// var server = require("../../server");
// var messaging = require("../../messaging");
// var federation = require("../../federation");
// var path = require("path");
// var fs = require("fs");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var trackerPorts = lang.arr.range(10083, 10088);
var clientsPerTracker = 3;
var clients, trackers;

function pickSomeClient(clients) {
  return clients[lang.num.random(0, clients.length-1)];
}

lang.fun.composeAsync(
  // 1. create trackers + clients + connections
  helper.createServers.bind(null, trackerPorts),
  function(_trackers, n) { trackers = _trackers; n(); },
  helper.createClients.bind(null, trackerPorts.slice(1), clientsPerTracker),
  function(_clients, n) { clients = _clients; n(); },
  function(n) {
    helper.connectTrackers(
      trackers.slice(1).map(function(t) {
        return [t, {port: trackerPorts[0]}]; }),
      n);
  }
  
)(function(err) {

  // 2. Generate message traffic: In nBursts intervals send out a bunch of
  // messages randomly between the clients
  var nBursts = 10,
      msgsPerBurst = 20;

  lang.arr.mapAsyncSeries(lang.arr.range(0, nBursts),
    function(i, _, n) {
      // var howManyMessages = lang.num.random(1,msgsPerBurst);
      var howManyMessages = msgsPerBurst;

      lang.arr.range(1, msgsPerBurst).forEach(function(j) {
        var logString = i + "-" + j,
            from = pickSomeClient(clients),
            to = pickSomeClient(clients),
            payload = lang.arr.range(0,2000)
              .map(lang.num.random.bind(null, 65,90))
              .map(function(n) { return String.fromCharCode(n); })
              .join("");
        helper.sendEcho(logString, payload, from, to, n);
      });
    }, function(err) {
      console.log(err || "Done sending");
      // dump("3-messages-send");

      // 3. stop clients and trackers
      helper.closeClientsAndTrackers(clients, trackers, function(err, msgsReceived, msgsSend, messageTimings) {
        helper.showMessageTimings(messageTimings);
        console.log("Median message delivery time: %s ms", lang.num.median(messageTimings));
        console.log("Messages received / send: %s / %s", msgsReceived, msgsSend);
      });

    });
  });
