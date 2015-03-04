var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer"),
    errno = require("./../errno");

function SerialTransaction (config, finishCallback, errorCallback) {
  Transaction.apply(this, arraify(arguments, 2));

  this.config = config;
  this.init(finishCallback, errorCallback);
}

SerialTransaction.prototype = new Transaction();

SerialTransaction.prototype.init = function (finishCallback, errorCallback) {
  this.previousErrors = [];
  if (Transaction.prototype.init)
    Transaction.prototype.init.apply(this, arraify(arguments, 2));

  this.finishCallback = finishCallback;
  this.errorCallback = errorCallback;

  this.buffer = new buffer.Buffer();
  this.serial = chrome.serial;
  this.log = console;

  // XXX: Remove me at the end. Maybe this could be in the buffer.
  this.memOps = new MemoryOperations();
  this.memOps.CHIP_ERASE_ARR = [0xAC, 0x80, 0x00, 0x00];

  this.serial.customErrorHandler = this.errCb.bind(this, 1);
  this.block = false;
};


SerialTransaction.prototype.refreshTimeout = function () {
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
};

SerialTransaction.prototype.errCb = function (id, var_message) {
  this.log.error("Oops:", this.errorCallback ? "Will call" : "Wont call");
  var errCb = (this.errorCallback || function () {}).bind(this);
  this.errorCallback = null;

  this.log.error.apply(this.log, arraify(arguments, 1, "[FINAL ERROR]"));
  this.block = true;
  if (this.previousErrors.length > 0)
    this.log.warn("Previous errors", this.previousErrors);

  var logargs = arraify(arguments, 1, "state: ", this.state, " - ");
  this.previousErrors.push(logargs);
  this.cleanup();
  this.log.error.apply(this.log.error, logargs);
  errCb(id, logargs.join(''));
};

// Should spawn api calls synchronously, that is not in callbacks.
SerialTransaction.prototype.cleanup = function (callback) {
  var self = this;

  if (this.timeout){
    this.log.log("Stopping timeout");
    clearTimeout(this.timeout);
  }
  this.timeout = null;

  self.serial.customErrorHandler = null;
  if (this.listenerHandler)
    this.serial.onReceive.removeListener(this.listenerHandler);

  this.listenerHandler = null;
  if (this.connectionId) {
    this.serial.disconnect(this.connectionId, function (ok) {
      if (!ok) {
        self.log.warn("Failed to disconnect (id:", self.connectionId,
                      ") during cleanup");
      }

      self.log.log("Disconnected ", self.connectionId);
      self.conenctionId = null;
      self.buffer.cleanup(callback);
    });
  }
};

// Info is:
// - outgoingMsg: byte array
// - besides this passed as a reader config
// callback is what to do with the data
SerialTransaction.prototype.writeThenRead_ = function (info) {
  if (this.previousErrors.length > 0) {
    this.errCb(errno.ZOMBIE_TRANSACTION,
               "Transaction was stopped with errors but continues to run");
    return;
  }

  var self = this;

  self.refreshTimeout();
  if (!self.registeredBufferListener){
    self.registeredBufferListener = true;
    this.log.log("Listening on buffer");
    this.listenerHandler = this.readToBuffer.bind(this);
    this.serial.onReceive.addListener(this.listenerHandler);
  }

  this.log.log("Writing: " + buffer.hexRep(info.outgoingMsg));
  this.justWrite(info.outgoingMsg, function () {
    self.buffer.readAsync(info);
  });
};


SerialTransaction.prototype.justWrite = function (data, cb) {
  var dataBuf = buffer.binToBuf(data),
      self = this;

  this.serial.send(this.connectionId, dataBuf, function(writeArg) {
    if (!writeArg) self.errCb(errno.CONNECTION_LOST, "Connection lost");

    // XXX: turns out flush means tcflush not fflush, ie discard the
    // buffers, not write any pending writes. This is probably never
    // what we mean.
    if (0 && !self.config.disableFlushing)
      self.serial.flush(self.connectionId, function (ok) {
        if (!ok) {
          self.errCb(errno.FLUSH_FAIL,'Failed to flush');
          return;
        }

        cb();
      });
    else
      cb();
  });
};

SerialTransaction.prototype.readToBuffer = function (readArg) {
  if (this.connectionId != readArg.connectionId) {
    return true;
  }

  this.buffer.write(readArg, this.errCb.bind(this, errno.BUFFER_WRITE_FAIL));

  // Note that in BabelFish this does not ensure that the listener
  // stops.
  return false;
};

// Arguments like writheThenRead
SerialTransaction.prototype.readByte = function (addr, cb) {
  // XXX: We do not support TPI. See avrdude if you need it.

  var readOp;
  if (this.memOps.readLow) {
    if (addr & 1)
      readOp = this.memoryOps.readLow(addr/2);
    else
      readOp = this.memoryOps.readHigh(addr/2);
  } else {
    readOp = this.memoryOps.read(addr);
  }

  var safeCmd = this.cmd.bind(this, readOp, cb);

  if (this.memOps.loadExtAddr)
    this.cmd(this.memOps.loadExtAddr(addr), function (data) {
      self.log.log("Ignoring extended addr read.");
      safeCmd();
    });
  else
    safeCmd();
};

SerialTransaction.prototype.writeByte = function (data, addr, cb) {
  // XXX: avrdude first reads to avoid writing if not necessary.
  var writeOp, self = this;

  if (this.memOps.writeLow) {
    if (addr & 1)
      writeOp = this.memoryOps.writeLow(addr/2, data);
    else
      writeOp = this.memoryOps.writeHigh(addr/2, data);
  } else {
    writeOp = this.memoryOps.write(addr);
  }

  // Callback gets the next iteration as first
  function poll (maxRetries, timeout, cb) {
    var self = this;
    if (maxRetries < 0)
      throw Error("(writeByte) Retry limit exceeded");

    cb(function () {
      setTimeout(function () {
        self.poll(maxRetries-1, timeout, cb);
      }, timeout);
    });
  }

  self.cmd(writeOp, function (data) {
    // Check if we wrote the correct byte
    poll(5, 250, function (tryAgain) {
      self.readByte(addr, function (readData) {
        if (readData & 0xff != data & 0xff) {
          tryAgain();
        }
      });
    });
  });
};

SerialTransaction.prototype.destroyOtherConnections = function (name, cb) {
  var self = this;
  this.serial.getConnections(function (cnx) {
    if (cnx.length == 0) {
      cb();
    }
    else {
      forEachWithCallback(cnx, function (c, next) {
        if (c.name != name)
          next();
        else {
          self.log.log("Closing connection ", c.connectionId);
          self.serial.flush(c.connectionId, function () {
            self.serial.disconnect(c.connectionId, function (ok) {
              if (!ok) {
                self.errCb(errno.FORCE_DISCONNECT_FAIL, "Failed to close connection ", c.connectionId);
              } else {
                self.log.log('Destroying connection:', c.connectionId);
                self.serial.onReceiveError.forceDispatch(
                  {connectionId: c.connectionId, error: "device_lost"});
                next();
              }
            });
          });
        }
      }, cb);
    }
  });
};

SerialTransaction.prototype.onOffDTR = function (cb, _cbArgs) {
  var args = arraify(arguments, 1),
      self = this,
      before = true,            //Default to high
      set = !before,
      after = before;

  // Make sure we are on the correct voltage
  self.serial.setControlSignals(
    self.connectionId, {dtr: before, rts: before}, function (ok) {
      if (!ok) {
        self.errCb(errno.DTR_RTS_FAIL,
                   "Couldn't set rs232 signals on before stage");
        return;
      }

      // Wait a while
      var beforeTimeout = 10000;
      setTimeout(function() {
        // Set the signals to reset
        self.serial.setControlSignals(
          self.connectionId, {dtr: set, rts: set}, function (ok) {
            if (!ok) {
              self.errCb(errno.DTR_RTS_FAIL,
                         "Couldn't set rs232 signals to reset device");
              return;
            }

            // Give it some time to reset
            var devResetTimeout = 10000;
            setTimeout(function() {

              // Revert signals to initial state
              self.serial.setControlSignals(
                self.connectionId, {dtr: after, rts: after}, function(ok) {
                  self.log.log("Raised DTR/RTS, done: ", ok);
                  if (!ok) {
                    self.errCb(errno.DTR_RTS_FAIL,
                               "Couldn't revert rs232 signals from reset device");
                    return;
                  }

                  // Give it a bit more time
                  setTimeout(function () {
                    self.buffer.drain(function () {
                      cb.apply(null, args);
                    });
                  }, 50);
                });
            }, setTimeout);
          });
      }, beforeTimeout);
    });
}

SerialTransaction.prototype.cmdChain = function (chain, cb) {
  if (chain.length == 0) {
    cb();
    return;
  }
  this.cmd(chain.shift(), this.cmdChain.bind(this, chain, cb));
};

module.exports = SerialTransaction;
