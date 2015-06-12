var lang = require("lively.lang");
var helper = require("../helper");
var path = require("path");
var fs = require("fs");

var trackerPorts = lang.arr.range(10083, 10087);
var clientsPerTracker = 3;
var clients, trackers;

function pickSomeClient(clients, ignore) {
  if (ignore) clients = lang.arr.withoutAll(clients, ignore);
  return clients[lang.num.random(0, clients.length-1)];
}

var heapdump = require('heapdump');
var dumpLocation = __dirname;

function dump(name) {
  // record new dumo
  global.gc();
  heapdump.writeSnapshot(path.join(dumpLocation, name + ".heapsnapshot"));
}

function checkMem() {
  // compare recorded dumps
  var files = ['1-before.heapsnapshot',
               '2-connections-created.heapsnapshot',
               '3-messages-send.heapsnapshot',
               '4-connections-closed.heapsnapshot']
        .map(function(fn) { return path.join(dumpLocation, fn); }),
      beforeAfter = fs.statSync(files[3]).size - fs.statSync(files[0]).size,
      beforeAfterMessageSends = fs.statSync(files[2]).size - fs.statSync(files[1]).size;

  console.log("Retained memory after sending messages: %s",
    lang.num.humanReadableByteSize(beforeAfterMessageSends));
  console.log("Retained memory after closing connections: %s",
    lang.num.humanReadableByteSize(beforeAfter));

  if (beforeAfterMessageSends > 2e6) console.warn("Memory leak after sending messages?");
  if (beforeAfter > 2e6) console.warn("Memory leak after closing connections?");
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

lang.fun.composeAsync(
  function(n) { dump("1-before"); n(); },
  // 1. create trackers + clients + connections
  helper.createServers.bind(null, trackerPorts),
  function(_trackers, n) { trackers = _trackers; n(); },
  helper.createClients.bind(null, trackerPorts, clientsPerTracker),
  function(_clients, n) { clients = _clients; n(); },
  function(n) {
    var pairs = lang.arr.zip(trackers, lang.arr.rotate(trackers, 1));
    pairs.pop();
    helper.connectTrackers(pairs, n);
  }

)(function(err) {

  dump("2-connections-created");

  // 2. Generate message traffic: In nBursts intervals send out a bunch of
  // messages randomly between the clients
  var nBursts = 20,
      msgsPerBurst = 23;

  lang.arr.mapAsyncSeries(lang.arr.range(0, nBursts),
    function(i, _, nextMapAsync) {
      // var howManyMessages = lang.num.random(1,msgsPerBurst);
      var howManyMessages = msgsPerBurst;

      lang.fun.waitForAll(
        lang.arr.range(1, howManyMessages).map(function(j) {
          var logString = i + "-" + j,
              from = pickSomeClient(clients),
              to = pickSomeClient(clients, [from]),
              payload = lang.arr.range(0,2000)
                .map(lang.num.random.bind(null, 65,90))
                .map(function(c) { return String.fromCharCode(c); })
                .join("");
          return function(nextWaitForAll) {
            helper.sendEcho(logString, payload, from, to, function() { nextWaitForAll(); });
          }
        }), function(err) { nextMapAsync(); });

    }, function(err) {
      console.log(err || "Done sending");
      dump("3-messages-send");

      // 3. stop clients and trackers
      helper.closeClientsAndTrackers(clients, trackers,
        function(err, msgsReceived, msgsSend, messageTimings) {
          dump("4-connections-closed");
          checkMem();
  
          helper.showMessageTimings(messageTimings);
          console.log("Median message delivery time: %s ms", lang.num.median(messageTimings));
          console.log("Messages received / send: %s / %s", msgsReceived, msgsSend);
  
    // trackers.forEach(require("../../logger").logStateOf);
    // clients.forEach(require("../../logger").logStateOf);
  
        });

    });
});
