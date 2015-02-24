var utilModule = require("./util"),
    arraify = utilModule.arraify,
    deepCopy = utilModule.deepCopy,
    chain = utilModule.chain,
    ops = require("./protocols/memops"),
    buffer = require("./buffer"),
    errno = require("./errno");

function Transaction (config, finishCallback, errorCallback) {
  this.hooks_ = {};
  this.state = null;
  this.stateHistory = [];
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
    this.stateHistory.push(state);

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
  },

  // mem is the memory type. It can be 'lfuse' or 'lock' or 'flash' etc
  // (see avrdude.conf)
  writeMemory: function (mem, addr, val, cb) {
    var writeByteArr = this.config.avrdude.memory[mem].memops.WRITE,
        cmd = ops.opToBin(writeByteArr, {ADDRESS: addr, OUTPUT: val});

    this.cmd(cmd, cb);
  },

  // mem is the memory type. It can be 'lfuse' or 'lock' or 'flash' etc
  // (see avrdude.conf). Cb receives a byte array.
  readMemory: function (mem, addr, cb) {
    var readByteArr = this.config.avrdude.memory[mem].memops.READ,
        cmd = ops.opToBin(readByteArr, {ADDRESS: addr});

    this.cmd(cmd, function (resp) {
      cb(ops.extractOpData('OUTPUT', readByteArr, resp.data));
    });
  },

  // Setup the special bits that configuration has values for
  setupSpecialBits: function (controlBits, cb) {
    var self = this,
        knownBits = Object.getOwnPropertyNames(controlBits || {});

    this.log.log("Will write control bits:", controlBits);
    chain(knownBits.map(function (memName) {
      var addr = 0;

      return function (nextCallback) {
        if (controlBits[memName] !== null) {
          self.log.log("Writing ", buffer.hexRep([controlBits[memName]]),
                       "->", memName);

          function verifyMem (cb) {
            self.readMemory(memName, addr, function (resp) {
              console.log("Read memory", memName, ":", buffer.hexRep(resp));
              if (resp[0] == controlBits[memName]) {
                nextCallback();
              } else {
                self.errCb(1, "Memory verification after write failed for",
                           memName);
                return;
              }
            });
          }
          self.writeMemory(memName, addr, controlBits[memName],
                           verifyMem);
        } else {
          nextCallback();
        }
      };
    }), cb);
  },

  // Memory operation based on an array of operation bits
  operation: function (op, cb) {
    this.log.log("Running operation:", op);
    return this.cmd(ops.opToBin(this.config.avrdude.ops[op]), cb);
  }
};

module.exports.Transaction = Transaction;
