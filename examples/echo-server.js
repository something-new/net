var server = require("../server");
var tracker = server.start({port: 10083}, function(err, tracker) {
  console.log("Tracker %s started", tracker.id);
  setTimeout(function() { server.close(tracker); }, 2*1000);
});
