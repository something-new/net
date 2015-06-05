var server = require("../server");
var port = Number(process.argv[1]);
port = port && !isNaN(port) ? port : 10083;

var tracker = server.start({port: port}, function(err, tracker) {
  console.log("Tracker %s started", tracker.id);
  setTimeout(function() { server.close(tracker); }, 2*1000);
});
