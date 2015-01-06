var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer.js");

function SerialTransaction (finishCallback, errorCallback) {
  Transaction.apply(this, arraify(arguments, 2));

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
  this.listenerHandler = this.readToBuffer.bind(this);
  this.memOps = new MemoryOperations();
  this.memOps.CHIP_ERASE_ARR = [0xAC, 0x80, 0x00, 0x00];

  this.serial.customErrorHandler = this.errCb.bind(this, 1);
};


SerialTransaction.prototype.refreshTimeout = function () {
  var self = this;

  if (this.timeout) {
    this.log.log("Clearing old timeout");
    clearTimeout(this.timeout);
    this.timeout = null;
  } else {
    this.timeoutSecs = 5;
  }

  this.timeout = setTimeout(function () {
    self.errCb(1, "Waited too long for something to happen.");
  }, this.timeoutSecs * 1000);
};

SerialTransaction.prototype.errCb = function (id, var_message) {
  if (this.previousErrors.length > 0)
    this.log.warn("Previous errors", this.previousErrors);

  var logargs = arraify(arguments, 1, "state: ", this.state, " - ");
  this.previousErrors.push(logargs);
  this.cleanup();
  this.log.error.apply(this.log.error, logargs);
  if (this.errorCallback)
    this.errorCallback(id, logargs.join(''));
};

SerialTransaction.prototype.cleanup = function (callback) {
  var self = this;

  if (this.timeout){
    this.log.log("Stopping timeout");
    clearTimeout(this.timeout);
  }
  this.timeout = null;

  self.serial.customErrorHandler = null;
  this.serial.onReceive.removeListener(this.listenerHandler);

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
    this.errCb(1, "Transaction was stopped with errors but continues to run");
    return;
  }

  this.log.log("Writing: " + buffer.hexRep(info.outgoingMsg));
  var outgoingBinary = buffer.binToBuf(info.outgoingMsg),
      self = this;

  self.refreshTimeout();
  if (!self.registeredBufferListener){
    self.registeredBufferListener = true;
    this.log.log("Listening on buffer");
    this.serial.onReceive.addListener(this.listenerHandler);
  }
  this.serial.send(this.connectionId, outgoingBinary, function(writeArg) {
    if (!writeArg) self.errCb(1, "Connection lost");

    self.serial.flush(self.connectionId, function (ok) {
      if (!ok) {
        self.errCb(1,'Failed to flush');
        return;
      }
    });
    self.buffer.readAsync(info);
  });
};

SerialTransaction.prototype.readToBuffer = function (readArg) {
  if (this.connectionId != readArg.connectionId) {
    return true;
  }

  this.buffer.write(readArg, this.errCb.bind(this, 1));

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

  var safeCmd = this.cmd.bind(this, readOp, function (ok, data) {
    if (!ok) {
      throw Error("Failed to send operation", readOp);
    }

    cb(ok, data);
  });

  if (this.memOps.loadExtAddr)
    this.cmd(this.memOps.loadExtAddr(addr), function (ok, data) {
      self.log.log("Ignoring extended addr read.");
      if (ok) {
        self.log.log("ExtAddr opcode success.");
        safeCmd();
      } else {
        self.log.error("ExtAddr opcode failed. data: ", data);
      }
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
      throw Error("Retry limit exceeded");

    cb(function () {
      setTimeout(function () {
        self.poll(maxRetries-1, timeout, cb);
      }, timeout);
    });
  }

  self.cmd(writeOp, function (ok, data) {
    if (!ok)
      throw Error("Failed to send operation", writeOp);

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
          self.serial.disconnect(c.connectionId, function (ok) {
            if (!ok) {
              self.errCb("Failed to close connection ", c.connectionId);
            } else {
              self.log.log('Destroying connection:', c.connectionId);
              self.serial.onReceiveError.forceDispatch(
                {connectionId: c.connectionId, error: "device_lost"});
              next();
            }
          });
        }
      }, cb);
    }
  });
};

SerialTransaction.prototype.onOffDTR = function (cb) {
  var args = arraify(arguments, 1),
      self = this;

  setTimeout(function() {
    self.serial.setControlSignals(
      self.connectionId, {dtr: false, rts: false},
      function (ok) {
        if (!ok) {
          self.errCb(1, "Couldn't send DTR");
          return;
        }
        setTimeout(function() {
          self.serial.setControlSignals(
            self.connectionId, {dtr: true, rts: true},
            function(ok) {
              self.log.log("Raised DTR/RTS, done: ", ok);
              if (!ok) {
                self.errCb(1,"Failed to set flags");
                return;
              }

              setTimeout(function () {
                self.buffer.drain(function () {
                  cb.apply(null, args);
                });
              }, 500);
            });
        }, 250);
      });
  }, 0);
};

module.exports = SerialTransaction;
