var lang = require("lively.lang");
var client = require("../client");
var server = require("../server");
var messaging = require("../messaging");
var federation = require("../federation");

var trackerPorts = lang.arr.range(10083, 10087);
var clientsPerTracker = 3;

var debug = false;

var heapdump = require('heapdump')

heapdump.writeSnapshot();

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
  createServers,
  createClients,
  connectTrackers
)(function(err) {

  global.gc();
  heapdump.writeSnapshot();

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
      setTimeout(function() {
        messaging._receivedMessages.forEach(function(receiver, ids) {
          console.log(receiver);
          console.log("%s -> %s", receiver.id, ids.length);
        });
        messaging._sendQueues.forEach(function(sender, msgs) {
          console.log(sender);
          console.log("%s -> %s", sender.id, msgs.length);
        });

        global.gc();
        heapdump.writeSnapshot();
        console.log("Really done!");
      }, 3*1000);
    });
  });

// client.start({port: port}, function(err, con) {
//   console.log("Client %s started and registered", con.id);
//   var msg = messaging.sendAndReceive(
//     con, {id: con.trackerId}, {
//       action: "echo",
//       data: "Hello server!"
//     }, function(err, answer) {
//       console.log("Got answer for echo message", answer);
//       client.close(con);
//     });
// });