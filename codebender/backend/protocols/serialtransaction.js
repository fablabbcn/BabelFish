var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer.js");

// Callback gets the next iteration as first
function poll (maxRetries, timeout, cb) {
  if (maxRetries < 0)
    throw Error("Retry limit exceeded");

  cb(function () {
    setTimeout(function () {
      poll(cb, maxRetries-1, timeout);
    }, timeout || 50);
  });
}

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
}

SerialTransaction.prototype.errCb = function (message, id) {
  this.cleanup();
  this.log.error("message");
  if (this.errorCallback)
    this.errorCallback(message, id);
};

SerialTransaction.prototype.cleanup = function (callback) {
  var self = this;
  this.serial.onReceive.removeListener(this.listenerHandler);

  if (this.connectionId) {
    this.serial.disconnect(this.connectionId, function (ok) {
      if (!ok) {
        throw Error("Failed to disconnect (id:", self.connectionId,
                    ") during cleanup");
      }

      self.buffer.cleanup(callback);
    });
  }
};

SerialTransaction.prototype.writeThenRead_ = function (outgoingMsg, responsePayloadSize, callback) {
  this.log.log("Writing: " + buffer.hexRep(outgoingMsg));
  var outgoingBinary = buffer.binToBuf(outgoingMsg),
      self = this;

  // schedule a read in 100ms
  this.serial.send(this.connectionId, outgoingBinary, function(writeArg) {
    self.consumeMessage(responsePayloadSize, callback, function (error) {
      self.errCb(error);
      self.serial.disconnect(self.connectionId, function (ok) {
        if (ok) {
          self.connectionId = null;
          self.log.log("Disconnected ok");
        } else
          self.log.error("Could not disconnect from " + this.connectionId);
      });
    });
  });
};

// Simply wayt for byte
SerialTransaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  throw new Error("Not implemented");
};


SerialTransaction.prototype.readToBuffer = function (readArg) {
  if (this.connectionId != readArg.connectionId) {
    return true;
  }

  this.buffer.write(readArg);
  this.log.log("Received:", readArg);

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

module.exports = SerialTransaction;
