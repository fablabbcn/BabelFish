var arraify = require('./util').arraify;

function Log (name, verbosity) {
  this.verbosity = verbosity || 3;
  this.name = name;
}

Log.prototype = {
  timestampString: function () {
    var now = new Date();
    var pad = function(n) {
      if (n < 10) { return "0" + n; }
      return n;
    };
    return pad(now.getHours()) + ":" + pad(now.getMinutes())
      + ":" + pad(now.getSeconds()) + "." + now.getMilliseconds();
  },

  prefix: function () {
    return "[" + this.timestampString() +  " : " + this.name + "]";
  },

  console_: function (type, args) {
    return console[type]
      .apply(console, args);
  },

  error: function (var_args) {
    if (this.verbosity > 0)
      this.console_('error', arraify(arguments, 0, this.prefix()));
  },
  warning: function (var_args) {
    if (this.verbosity > 1)
      this.console_('warning', arraify(arguments, 0, this.prefix()));
  },
  info: function (var_args) {
    if (this.verbosity > 2)
      this.console_('log', arraify(arguments, 0, this.prefix()));
  },
  log: function (var_args) {
    if (this.verbosity > 2)
      this.console_('log', arraify(arguments, 0, this.prefix()));
  }
};

module.exports.Log = Log;
