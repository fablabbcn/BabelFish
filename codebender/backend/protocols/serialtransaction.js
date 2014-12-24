var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer.js");

function SerialTransaction (finishCallback, errorCallback) {
  Transaction.apply(this, arraify(arguments, 2));

  this.init(finishCallback, errorCallback);
}

SerialTransaction.prototype = new Transaction();

SerialTransaction.prototype.init = function (finishCallback, errorCallback) {
  if (Transaction.prototype.init)
    Transaction.prototype.init.apply(this, arraify(arguments, 2));

  this.finishCallback = finishCallback;
  this.errorCallback = errorCallback;

  this.buffer = new buffer.Buffer();
  this.serial = chrome.serial;
  this.log = console;

  // XXX: Remove me at the end. Maybe this could be in the buffer.
  this.listenerHandler = this.readToBuffer.bind(this);
  this.log.log("Listening on buffer");
  this.serial.onReceive.addListener(this.listenerHandler);

  this.memOps = new MemoryOperations();
  this.memOps.CHIP_ERASE_ARR = [0xAC, 0x80, 0x00, 0x00];
};

SerialTransaction.prototype.errCb = function (id, var_message) {
  var logargs = arraify(arguments, 1, "state: ", this.state, " - ");
  this.cleanup();
  this.log.error.apply(this.log.error, logargs);
  if (this.errorCallback)
    this.errorCallback(id, logargs.join(''));
};

SerialTransaction.prototype.cleanup = function (callback) {
  var self = this;
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

SerialTransaction.prototype.writeThenRead_ = function (outgoingMsg, responsePayloadSize, callback) {
  this.log.log("Writing: " + buffer.hexRep(outgoingMsg));
  var outgoingBinary = buffer.binToBuf(outgoingMsg),
      self = this;

  this.serial.send(this.connectionId, outgoingBinary, function(writeArg) {
    self.serial.flush(self.connectionId, function (ok) {
      if (!ok) {
        self.errCb(1,'Failed to flush');
        return;
      }
    });
    self.consumeMessage(responsePayloadSize, callback, self.errCb.bind(self));
  });
}


// Simply wayt for bytes
SerialTransaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  var self = this;
  setTimeout(function () {
    // Hide the strange arguments.
    self.buffer.readAsync(payloadSize, callback, 500, errorCb);
  }, 100);
};

SerialTransaction.prototype.readToBuffer = function (readArg) {
  if (this.connectionId != readArg.connectionId) {
    return true;
  }

  this.buffer.write(readArg);

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
    if (maxRetries < 0)
      throw Error("Retry limit exceeded");

    cb(function () {
      setTimeout(function () {
        poll(maxRetries-1, timeout, cb);
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
    cnx.forEach(function (c) {
      if (c.name == name) {
        self.log.log("Closing connection ", c.connectionId);
        self.serial.disconnect(c.connectionId, function (ok) {
          if (!ok) {
            self.errCb("Failed to close connection ", c.connectionId);
          }
        });
      }
    });

    cb();
  });
};

module.exports = SerialTransaction;
