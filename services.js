var lang = require("lively.lang");
var messaging = require("./messaging");
var client = require("./client");

module.exports = {

  echo: function(self, sender, msg) {
    messaging.answer(self, sender, msg, msg.data);
  },

  reportServices: function(self, sender, msg) {
    var s = self.services;
    messaging.answer(self, sender, msg, {
      services: s ? lang.properties.all(s) : []
    });
  },

  heartbeat: function(self, sender, msg) {
    messaging.answer(self, sender, msg, {time: Date.now()});
  }
}
