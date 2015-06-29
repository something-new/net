var lang      = require("lively.lang");
var util      = require("../util");
var messaging = require("../messaging");
var sessions  = require("../sessions");
var logger    = require("../logger");
// var server    = require("../nodejs/server");

function addProxy(proxy, msg) {
  return util.assoc(msg, "proxies",
    (msg.proxies || []).concat({time: Date.now(), id: proxy.id}));
}

module.exports = {

  registerClient: function(self, sender, msg) {
    var id = msg.sender;
    sender.id = id;
    self.addConnection(id, sender);
    sender.on("close", function() {
      self.removeConnection(sender);
    });
    messaging.answer(self, sender, sender, msg, {
      success: true,
      tracker: {id: self.id}
    });
  },

  unregisterClient: function(self, sender, msg) {
    messaging.answer(self, sender, sender, msg, {success: true});
  },

  registerServer: function(self, sender, msg) {
    var id = sender.id;

    server.getAcceptedServerSessions(self)[id] = sender;
    sender.on("close", function() {
      logger.log("accepted federation connection closed", self, "%s", id);
      delete server.getAcceptedServerSessions(self)[id];
    });
    messaging.answer(self, sender, sender, msg, {
      success: true,
      tracker: {id: self.id}
    });
  },

  knownSessions: function(self, sender, msg) {
    sessions.knownBy(self, msg.data.ignoredTrackers,
      function(err, sessions) {
        if (err) {
          console.error(err.stack || err);
          sessions = {error: String(err.stack||err)};
        }
        messaging.answer(self, sender, sender, msg, sessions);
      });
  },

  relay: function(receiver, sender, msg) {
    var relayedMsg = addProxy(receiver, msg),
        target = server.getClientSessions(receiver)[msg.target];

    if (target) {
      messaging.send(receiver, target, target, relayedMsg);
    } else {
      var trackers = lang.obj.merge(
            server.getOwnedServerSessions(receiver),
            server.getAcceptedServerSessions(receiver)),
          proxyIds = lang.arr.pluck(relayedMsg.proxies, "id");
      for (var id in trackers) {
        if (proxyIds.indexOf(id) !== -1) continue;
        var con = trackers[id];
        if (con.state && con.state.connection) con = con.state.connection;
        messaging.send(receiver, con, con, relayedMsg);
      }
    }
  },

  broadcast: function(receiver, sender, msg) {
    var opts        = lang.obj.isObject(msg.broadcast) ? msg.broadcast : {},
        ignored     = opts.ignored = [sender.id].concat(opts.ignored || []),
        msgToSend   = addProxy(receiver, util.assoc(msg, "broadcast", opts)),
        connections = server.allConnections(receiver, ignored);
    opts.ignored = util.uniq(opts.ignored
      .concat([receiver.id])
      .concat(lang.arr.pluck(connections, "id")));
    connections.forEach(function(con) {
      if (con.state && con.state.connection) con = con.state.connection;
      messaging.send(receiver, con, con, msgToSend);
    });
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
