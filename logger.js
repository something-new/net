var lang = require("lively.lang");

module.exports = {
  log: function(topic /*args ...*/) {
    var args = lang.arr.from(arguments);
    var topic = args.shift();
    var string = "[" + topic + "] " + args.shift();
    args.unshift(string);
    console.log.apply(console, args);
  }
}