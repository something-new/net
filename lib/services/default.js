var lang = require("lively.lang");
var messaging = require("../interface/messaging");

module.exports = {

  echo: function(self, sender, msg) {
    messaging.answer(self, sender, msg, msg.data);
  },

  reportServices: function(self, sender, msg) {
    var s = self.getState().services;
    messaging.answer(self, sender, msg, {
      services: s ? lang.properties.all(s) : []
    });
  },

  heartbeat: function(self, sender, msg) {
    messaging.answer(self, sender, msg, {time: Date.now()});
  },

  close: function(self, sender, msg) {
    messaging.answer(self, sender, msg, {status: "OK"});
    setTimeout(function() {
      require("../nodejs/client").close(self);
    }, 20);
  }
}
