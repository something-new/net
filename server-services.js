var lang = require("lively.lang");
var messaging = require("./messaging");

function selectKeys(obj, keys) {
  var result = {};
  keys.forEach(function(k) { result[k] = obj[k]; });
  return result;
}

function dissoc(obj, key) {
  var result = lang.obj.clone(obj);
  delete result[key];
  return result;
}

function assoc(obj, key, value) {
  var result = lang.obj.clone(obj);
  result[key] = value;
  return result;
}

function uniq(array, sorted) {
    return array.reduce(function(a, value, index) {
      if (0 === index || (sorted ? a.slice(-1)[0] != value : a.indexOf(value) === -1))
        a.push(value);
      return a;
    }, []);
  }

var merge = lang.obj.merge;

module.exports = {

  registerClient: function(self, sender, msg) {
    self.clientSessions[sender.id] = sender;
    sender.on("close", function() { delete self.clientSessions[sender.id]; });
    messaging.answer(self, sender, msg, {
      success: true,
      tracker: {id: self.id}
    });
  },

  knownSessions: function(self, sender, msg) {
    var ownSession = merge(selectKeys(self, ["id"]), {type: "tracker"}),
        localSessions = [ownSession]
        .concat(lang.obj.values(self.clientSessions)
            .map(function(ea) { return merge(selectKeys(ea, ["id"]), {type: "client"}); }));

    var ignored = lang.obj.clone(msg.data.ignoredTrackers || []),
        otherTrackers = lang.obj.values(self.serverSessions)
          .filter(function(ea) { return ignored.indexOf(ea.id) === -1; }),
        ignored = uniq(ignored
          .concat(lang.arr.pluck(otherTrackers, "id"))
          .concat([self.id]));

    if (!otherTrackers.length) {
      messaging.answer(self, sender, msg, localSessions);
      return;
    }

    lang.arr.mapAsyncSeries(otherTrackers,
      function(trackerCon, _, n) {
        messaging.sendAndReceive(trackerCon, trackerCon, {
          action: "knownSessions",
          data: {ignoredTrackers: ignored}
        }, function(err, answer) { n(err, answer ? answer.data : []); });
      },
      function(err, nestedSessions) {
        var sessions = localSessions.concat(lang.arr.flatten(nestedSessions));
        messaging.answer(self, sender, msg, sessions);
      });
  },

  unregisterClient: function(self, sender, msg) {
    messaging.answer(self, sender, msg, {success: true});
  },

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // federation

  registerServer2Server: function(self, sender, msg) {
    
  },

//   initServerToServerConnect: function(self, sender, msg) {
//     var url = msg.data.url;
//     events.add('[sender %s][initServerToServerConnect] url: %s', msg.sender, url);
//     sessionServer.serverToServerConnect(url, function(err, remoteClient) {
//       if (err) console.error(err);
//       connection.send({action: 'initServerToServerConnectResult', inResponseTo: msg.messageId, data: {success: !err}});
//     });
//   },

//   initServerToServerDisconnect: function(self, sender, msg) {
//     var remoteURLs = Object.keys(sessionServer.serverToServerConnections);
//     sessionServer.removeServerToServerConnections();
//     events.add('[sender %s][initServerToServerDisconnect]', msg.sender);
//     connection.send({action: msg.action + 'Result', inResponseTo: msg.messageId, data: {success: true, message: 'Connections to ' + remoteURLs.join(', ') + ' closed'}});
//   },

//   getSessions: function(self, sender, msg) {
//     // send the sessions accessible from this tracker. includes local sessions,
//     // reported sessions
//     events.add('[sender %s][getSessions]', msg.sender);
//     sessionServer.getSessionList(msg.data.options, function(sessions) {
//       connection.send({
//         action: msg.action,
//         inResponseTo: msg.messageId,
//         data: sessions
//       });
//     })
//   },

//   reportSessions: function(self, sender, msg) {
//     // another tracker is reporting its sessions to sessionServer.
//     // sessionServer is acting as a "lively2lively central"
//     if (!msg.data || !msg.data.trackerId) {
//       console.error('%s got reportSession request without id: ', sessionServer, msg);
//       return;
//     }

//     var id = connection.id;
//     if (!id) {
//       id = connection.id = msg.data.trackerId;
//       connection.on('close', function() {
//         if (!sessionServer.inactiveSessionRemovalTime) return;
//         setTimeout(function() {
//           var newConnection = sessionServer.websocketServer.getConnection(msg.sender);
//           if (!newConnection) {
//             log(2, '%s removes reported session of %s', sessionServer, id);
//             delete sessionServer.trackerData[id];
//             events.add('[connection to %s] remove trackerData', msg.sender);
//           }
//         }, sessionServer.inactiveSessionRemovalTime);
//       });
//     }

//     events.add('[sender %s][reportSession]', msg.sender);

//     sessionServer.trackerData[id] = {sessions: msg.data[id]};
//     connection.send({
//       action: msg.action + 'Result',
//       inResponseTo: msg.messageId,
//       data: {success: true, message: 'Sessions added to ' + sessionServer}
//     });
//   },

//   reportActivity: function(self, sender, msg) {
//     // lively session sends infos about last user activity from time to time
//      var sessions = sessionServer.getLocalSessions()[sessionServer.id()],
//       session = sessions[msg.sender] = sessions[msg.sender] || {};
//     session.lastActivity = msg.data.lastActivity;

//     events.add('[sender %s][reportActivity]', msg.sender);

//     connection.send({action: msg.action + 'Result', inResponseTo: msg.messageId, data: {success: true}});
//   },

//   getEventLog: function(self, sender, msg) {
//     var log = events.log.slice()
//     if (msg.data.limit) log = log.slice(-1 * msg.data.limit);
//     connection.send({
//       action: msg.action + 'Result',
//       inResponseTo: msg.messageId,
//       data: {log: log}
//     });
//   },


//   whoAreYou: function(self, sender, msg) {
//     async.waterfall([

//       function initData(next) {
//         var data = {
//           id: sessionServer.id(),
//           route: sessionServer.route,
//           type: 'tracker',
//           ip: null
//         };
//         next(null, data);
//       },

//       function getIp(data, next) {
//         sessionServer.getOwnIPAddress(function(err, ip) {
//           data.ip = ip; next(null, data);
//         });
//       }

//     ], function(err, data) {
//       connection.send({
//         action: msg.action + 'Result',
//         inResponseTo: msg.messageId,
//         data: err ? {error: String(err)} : data
//       });
//     });

//   },

//   openEditor: function(self, sender, msg) {
//     var sess = sessionServer.getLastActiveLocalSession();
//     if (!sess) {
//       connection.send({
//         action: msg.action + 'Result',
//         inResponseTo: msg.messageId,
//         data: {error: "'No last active session!'"}
//       });
//     } else {
//       msg.target = sess.id;
//       sessionServer.routeMessage(msg, connection);
//     }
//   },

//   askFor: function(self, sender, msg) {
//     var user = msg.data.requiredUser;
//     var filter = user ? function(s) { return s.user === user; } : function() { return true; };
//     var sess = sessionServer.getLastActiveLocalSession(filter);
//     if (!sess) {
//       connection.send({
//         action: msg.action + 'Result',
//         inResponseTo: msg.messageId,
//     		data: {error: "'No last active session!'"}
//       });
//     } else {
//       msg.target = sess.id;
//       sessionServer.routeMessage(msg, connection);
//     }
//   },

//   remoteEvalRequest: function(self, sender, msg) {
//     try {
//       var result = eval(msg.data.expr);
//     } catch (e) { result = String(e); }
//     console.log("remote eval result ", result);
//     connection.send({
//       action: msg.action + 'Result',
//       inResponseTo: msg.messageId,
//       data: {result: result}
//     });
//   }

}
