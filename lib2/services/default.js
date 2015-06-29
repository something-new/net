var lang = require("lively.lang");
var messaging = require("../messaging");

module.exports = {

  echo: function(self, sender, msg) {
    messaging.answer(self, sender, sender, msg, msg.data);
  },

  reportServices: function(self, sender, msg) {
    var s = self.getState().services;
    messaging.answer(self, sender, sender, msg, {
      services: s ? lang.properties.all(s) : []
    });
  },

  heartbeat: function(self, sender, msg) {
    messaging.answer(self, sender, sender, msg, {time: Date.now()});
  },

  close: function(self, sender, msg) {
    if (!msg.noResponse) {
      messaging.answer(self, sender, sender, msg, {status: "OK"});
      setTimeout(function() {
        require("../nodejs/client").close(self);
      }, 20);
    } else {
      require("../nodejs/client").close(self);
    }
  }
}
