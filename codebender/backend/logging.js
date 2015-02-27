var arraify = require('./util').arraify,
    timeOffset = new Date();

function zeroFill( number, width )
{
  width -= number.toString().length;
  if ( width > 0 )
  {
    return new Array( width + (/\./.test( number ) ? 2 : 1) ).join( '0' ) + number;
  }
  return number + ""; // always return a string
}

function Log (name, verbosity) {
  this.verbosity = verbosity || 3;
  this.name = name;
  this.resetTimeOffset();
}

Log.prototype = {
  timestampString: function () {
    var now = new Date(new Date() - timeOffset +
                       timeOffset.getTimezoneOffset() * 60000);
    var pad = function (n) {
      if (n < 10) { return "0" + n; }
      return n;
    };
    return pad(now.getHours()) + ":" + pad(now.getMinutes())
      + ":" + pad(now.getSeconds()) + "." + zeroFill(now.getMilliseconds(), 3);
  },

  resetTimeOffset: function () {
    timeOffset = new Date();
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
  warn: function (var_args) {
    if (this.verbosity > 1)
      this.console_('warn', arraify(arguments, 0, this.prefix()));
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
