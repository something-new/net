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

var heapdump = require('heapdump');
var dumpLocation = __dirname;

function dump(name) {
  global.gc();
  heapdump.writeSnapshot(path.join(dumpLocation, name + ".heapsnapshot"));
}

function checkMem() {
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
  createServers,
  createClients,
  connectTrackers
)(function(err) {

  dump("2-connections-created");

  lang.arr.mapAsyncSeries(lang.arr.range(0, 20),
    function(i, _, n) {
      var t = Date.now(),
          howManyMessages = lang.num.random(1,20);

      lang.arr.range(1,howManyMessages).forEach(function(j) {
        var from = pickSomeClient(clients),
            to = pickSomeClient(clients);
        console.log("%s-%s: Sending echo", i,j);
        var msg = messaging.sendAndReceive(
          from, {id: to.id}, {
            action: "echo",
            data: "Hello " + to.id
          }, function(err, answer) {
            console.log("%s-%s: %s -> %s in %s ms",
              i,j, from.options.url, to.options.url,
              Date.now()-t);
          });
      });

      setTimeout(n, lang.num.random(0,200));
    }, function(err) {
      console.log(err || "Done sending");
      dump("3-messages-send");

      lang.fun.composeAsync(
        function(n) {
          lang.arr.mapAsyncSeries(clients,
            function(c, _, n) { client.close(c, n); }, n);
        },
        function(_, n) {
          lang.arr.mapAsyncSeries(trackers,
            function(t, _, n) { server.close(t, n); }, n);
        },
        function(_, n) { setTimeout(n, 1000); }
      )(function(err) {
        console.log(err || "Done closing connections");  

        Object.keys(require.cache).forEach(function(k) { delete require.cache[k]; });
        dump("4-connections-closed");
        checkMem();
        console.log("Really done!");
      });
    });
  });
