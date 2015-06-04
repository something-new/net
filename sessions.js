var lang = require("lively.lang");
var messaging = require("./messaging");
var util = require("./util");

function trackerSessionsLocal(tracker, thenDo) {
  var ownSession = util.merge(util.selectKeys(tracker, ["id"]), {type: "tracker"}),
      localSessions = [ownSession]
        .concat(lang.obj.values(tracker.clientSessions)
          .map(function(ea) {
            return util.merge(util.selectKeys(ea, ["id"]), {type: "client"});
          }));
  thenDo(null, localSessions);
}

function trackerSessionsRemote(tracker, ignored, thenDo) {
  ignored = lang.obj.clone(ignored || []);
  var otherTrackers = [];

  var serverSessions = lang.obj.merge(
    tracker.ownedServerSessions,
    tracker.acceptedServerSessions);

  for (var id in serverSessions) {
    var otherServer = serverSessions[id];
    if (ignored.indexOf(id) > -1) continue;
    otherTrackers.push(otherServer);
    ignored.push(id);
  }

  if (ignored.indexOf(tracker.id) === -1) ignored.push(tracker.id);

  lang.arr.mapAsyncSeries(otherTrackers,
    function(trackerCon, _, n) {
      messaging.sendAndReceive(tracker,
        {connection: trackerCon.connection, id: trackerCon.trackerId},
        {action: "knownSessions",data: {ignoredTrackers: ignored}},
        function(err, answer) { n(err, answer ? answer.data : []); });
    },
    function(err, nestedSessions) {
      var remoteSessions = nestedSessions
        && lang.arr.compact(lang.arr.flatten(nestedSessions));
      thenDo(err, remoteSessions);
    });
}

function trackerSessions(tracker, ignored, thenDo) {
  lang.fun.composeAsync(
    function(n) { trackerSessionsLocal(tracker, n); },
    function(localSessions, n) {
      trackerSessionsRemote(
        tracker, ignored,
        function(err, remoteSessions) {
          n(err, (localSessions || []).concat(remoteSessions || []));
        });
    })(thenDo);
}

module.exports = {

  knownBy: function(participant, ignored, thenDo) {
    if (typeof ignored === "function") {
      thenDo = ignored; ignored = null;
    }
    if (!ignored) ignored = [];

    if (participant.isTracker) {
      trackerSessions(participant, ignored, thenDo);      
    } else {
      messaging.sendAndReceive(
        participant, {id: participant.trackerId}, {
          action: "knownSessions",
          data: {ignoredTrackers: ignored.concat([participant.trackerId])}
        },
        function(err, answer) {
          err && console.log(err.stack);
          thenDo(err, answer ? answer.data : []);
        });
    }

  }

}