var lang      = require("lively.lang");
var messaging = require("./messaging");
var server    = require("./server");
var client    = require("./client");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function connect(tracker, opts, thenDo) {
  opts = opts || {};
  opts.register = true;
  lang.fun.composeAsync(
    function(n) { client.start(opts, n); },
    function(client, n) {
      client.id = client.trackerId;
      tracker.serverSessions[client.id] = client;
      client.on("close", function() { delete tracker.serverSessions[client.id]; });
      n(null, client);
    }
    // function(client, n) {
      
    // }
  )(thenDo);
//   {port: port2}
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {
  connect: connect
}
