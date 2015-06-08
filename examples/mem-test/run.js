var lang = require("lively.lang");
var client = require("../../client");
var server = require("../../server");
var messaging = require("../../messaging");
var federation = require("../../federation");
var path = require("path");
var fs = require("fs");

var trackerPorts = lang.arr.range(10083, 10087);
var clientsPerTracker = 3;

var debug = false;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var msgsReceived = 0;
var msgsSend = 0;
var messageTimings = [];

function showMessageTimings() {
  var chart = require('ascii-chart');
  // var clear = require('clear');
  console.log(chart(messageTimings, {width: 200, height: 35}));
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

var clients, trackers;

function createServers(thenDo) {
  lang.arr.mapAsyncSeries(trackerPorts,
    function(port, _, n) { server.start({debug: debug, port: port}, n); },
    function(err, _trackers) { trackers = _trackers; thenDo(err); });
}

function createClients(thenDo) {
  lang.chain(trackerPorts)
    .flatmap(lang.arr.withN.bind(null,clientsPerTracker))
    .mapAsyncSeries(function(port, _, n) {
      client.start({debug: debug, port: port}, n);
    }, function(err, _clients) { clients = _clients; thenDo(err); });
}

function pickSomeClient(clients) {
  return clients[lang.num.random(0, clients.length-1)];
}

function connectTrackers(thenDo) {
  var pairs = lang.arr.zip(trackers, lang.arr.rotate(trackers, 1));
  pairs.pop();
  lang.arr.mapAsyncSeries(pairs, function(fromTo, _, n) {
    federation.connect(fromTo[0], fromTo[1].options, n)
  }, function(err) { thenDo(err); });
}

lang.fun.composeAsync(
  function(n) { dump("1-before"); n(); },
  // 1. create trackers + clients + connections
  createServers,
  createClients,
  connectTrackers
)(function(err) {

  dump("2-connections-created");

  // 2. Generate message traffic: In nBursts intervals send out a bunch of
  // messages randomly between the clients
  var nBursts = 20,
      msgsPerBurst = 23;

  lang.arr.mapAsyncSeries(lang.arr.range(0, nBursts),
    function(i, _, n) {
      // var howManyMessages = lang.num.random(1,msgsPerBurst);
      var howManyMessages = msgsPerBurst;

      lang.arr.range(1,howManyMessages).forEach(function(j) {
        msgsSend++;
        var t = Date.now(),
            from = pickSomeClient(clients),
            to = pickSomeClient(clients),
            payload = lang.arr.range(0,2000)
              .map(lang.num.random.bind(null, 65,90))
              .map(function(n) { return String.fromCharCode(n); })
              .join("")

        console.log("%s-%s: Sending echo", i,j);
        var msg = messaging.sendAndReceive(
          from, {id: to.id}, {
            action: "echo",
            data: payload
          }, function(err, answer) {
            console.log("%s-%s: %s -> %s in %s ms",
              i,j, from.options.url, to.options.url,
              Date.now()-t);
            if (!err && answer) msgsReceived++;
            messageTimings.push(Date.now()-t);
          });
      });

      setTimeout(n, lang.num.random(0,200));
    }, function(err) {
      console.log(err || "Done sending");
      dump("3-messages-send");

      // 3. stop clients and trackers
      lang.fun.composeAsync(
        function wait(n) {
          lang.fun.waitFor(10*1000,
            function() { return msgsSend === msgsReceived },
            function(err) { n(); })
        },
        function(n) {
          lang.arr.mapAsyncSeries(clients,
            function(c, _, n) { client.close(c, n); }, n);
        },
        function(_, n) {
          lang.arr.mapAsyncSeries(trackers,
            function(t, _, n) { server.close(t, n); }, n);
        },
        function wait(_, n) { setTimeout(n, 300); }
      )(function(err) {
        console.log(err || "Done closing connections");  

        dump("4-connections-closed");
        checkMem();

        showMessageTimings();
        console.log("Median message delivery time: %s ms", lang.num.median(messageTimings));
        console.log("Messages received / send: %s / %s", msgsReceived, msgsSend);
      });
    });
  });
