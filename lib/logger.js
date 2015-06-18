var lang = require("lively.lang");

module.exports = {

  log: function(topic, subject /*args ...*/) {
    var opts = typeof subject.options === "function" ? subject.options() : subject.options,
        printIt = !opts || !!opts.debug,
        saveIt = opts && !!opts.retainLog;

    if (!printIt && !saveIt) return;

    var args = lang.arr.from(arguments),
        topic = args.shift(),
        subject = args.shift(),
        prefix = lang.string.format("[%s %s (%s)] ",
          topic, subject.id || "?",
          subject.status ? subject.status() : subject.getState().connectionState),
        string = prefix + args.shift();
    args.unshift(string);

    if (printIt) console.log.apply(console, args);

    if (saveIt) {
      var logged = string.format.apply(lang.string, args);
      if (!subject.log) subject.log = [];
      subject.log.push({
        time: Date.now(),
        topic: topic,
        string: logged
      });
    }
  },

  logSince: function(time, subject) {
    if (!subject || !subject.log) return [];
    if (!time) time = 0;
    var index = subject.log.length;
    subject.log.detect(function(log, i) {
      if (log.time >= time) {
        index = i; return true;
      } else return false;
    });
    return subject.log.slice(index);
  },

  purgeLog: function(time, subject) {
    return subject.log = module.exports.logSince(time, subject);
  },

  logStateOf: function(subject) {
    var string = subject.inspect ? subject.inspect() : "cannot log " + subject;
    module.exports.log("inspect", subject, string);
  },
}