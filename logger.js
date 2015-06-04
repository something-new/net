var lang = require("lively.lang");

module.exports = {
  log: function(topic, subject /*args ...*/) {
    var printIt = subject && subject.options && !!subject.options.debug;
    if (!printIt) return;

    var args = lang.arr.from(arguments),
        topic = args.shift(),
        subject = args.shift(),
        prefix = lang.string.format("[%s %s] ", topic, subject.id),
        string = prefix + args.shift();
    args.unshift(string);
    console.log.apply(console, args);
  }
}