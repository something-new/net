var lang = require("lively.lang");
var util = require("./util");
var messaging = require("./messaging");
var sessions = require("./sessions");
var logger = require("./logger");

module.exports = {

  registerClient: function(self, sender, msg) {
    self.clientSessions[sender.id] = sender;
    sender.on("close", function() { delete self.clientSessions[sender.id]; });
    messaging.answer(self, sender, msg, {
      success: true,
      tracker: {id: self.id}
    });
  },

  unregisterClient: function(self, sender, msg) {
    messaging.answer(self, sender, msg, {success: true});
  },

  registerServer: function(self, sender, msg) {
    var id = sender.id;
    self.acceptedServerSessions[id] = sender;
    sender.on("close", function() { delete self.acceptedServerSessions[id]; });
    messaging.answer(self, sender, msg, {
      success: true,
      tracker: {id: self.id}
    });
  },

  knownSessions: function(self, sender, msg) {
    sessions.knownBy(self, msg.data.ignoredTrackers,
      function(err, sessions) {
        messaging.answer(self, sender, msg, err ? {error: String(err)} : sessions);
      });
  },

  relay: function(receiver, sender, msg) {
    var relayedMsg = lang.obj.merge(msg, {
      proxies: (msg.proxies || []).concat([receiver.id])
    });

    var target = receiver.clientSessions[msg.target];
    if (target) {
      messaging.send(receiver, target, relayedMsg);
    } else {
      var trackers = lang.obj.merge(
        receiver.ownedServerSessions,
        receiver.acceptedServerSessions);
      for (var id in trackers) {
        if (relayedMsg.proxies.indexOf(id) !== -1) continue;
        messaging.send(receiver, trackers[id], relayedMsg);
      }
    }
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
