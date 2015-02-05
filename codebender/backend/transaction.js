var utilModule = require("./util"),
    arraify = utilModule.arraify,
    deepCopy = utilModule.deepCopy,
    errno = require("./errno");

function Transaction (config, finishCallback, errorCallback) {
  this.hooks_ = {};
  this.state = null;
  this.transitions = [];
  this.block = false;
  this.context = {};

  this.config = config;
  this.finishCallback = finishCallback;
  this.errorCallback = errorCallback;
  this.previousErrors = [];
}

Transaction.prototype = {
  refreshTimeout: function () {
    var self = this;

    if (this.timeout) {
      this.log.log("Clearing old timeout");
      clearTimeout(this.timeout);
      this.timeout = null;
    } else {
      this.timeoutSecs = 20;
    }

    this.timeout = setTimeout(function () {
      self.errCb(errno.IDLE_HOST, "No communication with device for over ", self.timeoutSecs, "s");
    }, this.timeoutSecs * 1000);
  },

  errCb: function (id, var_message) {
    var self = this;
    this.log.error.apply(this.log, arraify(arguments, 1, "[FINAL ERROR]"));
    this.block = true;
    if (this.previousErrors.length > 0)
      this.log.warn("Previous errors", this.previousErrors);

    var logargs = arraify(arguments, 1, "state: ", this.state, " - ");
    this.previousErrors.push(logargs);
    this.cleanup(function () {
      self.log.error.apply(this.log.error, logargs);
      if (self.errorCallback)
        self.errorCallback(id, logargs.join(''));
    });
  },

  cleanup: function (callback) {
    if (this.timeout){
      this.log.log("Stopping timeout");
      clearTimeout(this.timeout);
    }
    this.timeout = null;

    if (this.localCleanup)
      this.localCleanup(callback);
    else if (callback)
      callback();
  },

  getHook: function (hookIdArray) {
    var key = hookIdArray.sort().join('_');
    return this.hooks_[key];
  },

  triggerHook: function (hookIdArray, varArgs) {
    var key = hookIdArray.sort().join('_'), args = arraify(arguments, 1);
    if (this.hooks_.hasOwnProperty(key))
      this.hooks_[key].forEach(function (fn) { fn.apply(null, args); });
  },

  transition: function(state, varArgs) {
    var oldState = this.state, args = arraify(arguments, 1);

    // this.triggerHook(['leave', oldState], this.context);
    this.state = state;
    // this.triggerHook(['enter', this.state], this.context);
    // this.transitions.push([state, oldState, deepCopy(this.context)]);

    if (this.block) {
      console.log("Jumping to state\'", state, "' arguments:", args,"BLOCKED");
      return;
    }

    console.log("Jumping to state\'", state, "' arguments:", args);
    this[state].apply(this, args);
  },

  transitionCb: function (state, varArgs) {
    var self = this;
    return arraify(arguments).reduce(function (cb, a) {
      return cb.bind(self, a);
    }, this.transition.bind(this));
  },

  padOrSlice: function (data, offset, length) {
    var payload;

    if (offset + length > data.length) {
      payload = data.slice(offset, data.length);
      var padSize = length - payload.length;
      for (var i = 0; i < padSize; ++i) {
        payload.push(0);
      }
    } else {
      payload = data.slice(offset, offset + length);
    }

    return payload;
  },

  assert: function (bool, varMsg) {
    var args = arraify(arguments, 1, 2, 'AssertionError');

    if (!bool) {
      this.cbErr.apply(this, args);
    }
  }
};

module.exports.Transaction = Transaction;
