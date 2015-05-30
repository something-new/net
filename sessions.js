var messaging = require("./messaging");


module.exports = {
  knownBy: function(participant, thenDo) {
    messaging.sendAndReceive(participant, {id: participant.trackerId},
      {action: "knownSessions", data: {ignoredTrackers: [participant.trackerId]}}, function(err, answer) {
        // [{id: participant.id}]
        thenDo(err, answer.data);
      });
  }
}