var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('STK500'),
    arraify = require('./../util').arraify,
    buffer = require("./../buffer.js");

function STK500Transaction () {
  SerialTransaction.apply(this, arraify(arguments));

  this.STK = {
    OK: 0x10,
    INSYNC: 0x14,
    CRC_EOP: 0x20,
    GET_SYNC: 0x30,
    GET_PARAMETER: 0x41,
    ENTER_PROGMODE: 0x50,
    LEAVE_PROGMODE: 0x51,
    LOAD_ADDRESS: 0x55,
    UNIVERSAL: 0x56,
    PROG_PAGE: 0x64,
    READ_SIGN: 0x75,
    HW_VER: 0x80,
    SW_VER_MINOR: 0x82,
    SW_VER_MAJOR: 0x81
  };
  this.pageSize = 128;
  this.log = log;
}

STK500Transaction.prototype = new SerialTransaction();

// Cb should have the 'state' format, ie function (ok, data)
STK500Transaction.prototype.cmd = function (cmd, cb) {
  // Always get a 4byte answer
  this.writeThenRead_(cmd, 4, cb);
};

STK500Transaction.prototype.flash = function (deviceName, sketchData) {
  this.sketchData = sketchData;
  var self = this;
  this.serial.connect(deviceName, {bitrate: 115200, name: deviceName},
                      function (connectArg) {
                        self.transition('connectDone', sketchData, connectArg);
                      });
};

STK500Transaction.prototype.eraseThenFlash  = function (deviceName, sketchData, dontFlash) {
  log.log("Erasing chip");
  self.writeThenRead_(this.memOps.CHIP_ERASE_ARR, function  () {
    // XXX: Maybe we should care about the response when asking to
    // erase
    if (!dontFlash)
      this.transition('flash', deviceName, sketchData);
  });
};

STK500Transaction.prototype.connectDone = function (hexCode, connectArg) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    log.error("Bad connectionId / Couldn't connect to board");
    return;
  }

  this.connectionId = connectArg.connectionId;
  log.log("Connected to board. ID: " + connectArg.connectionId);
  this.buffer.read(1024, this.transitionCb('drainedBytes'));

};

STK500Transaction.prototype.dtrSent = function (ok) {
  if (!ok) {
    log.log("Couldn't send DTR");
    return;
  }
  log.log("DTR sent (low) real good");

  this.buffer.read(1024, this.transitionCb('drainedAgain'));

}

STK500Transaction.prototype.drainedAgain = function (readArg) {
  var self = this;
  log.log("DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    self.buffer.read(1024, this.trasitioncb('drainedBytes'));
  } else {
    // Start the protocol
    setTimeout(function() {
      self.writeThenRead_([self.STK.GET_SYNC, self.STK.CRC_EOP],
                         0, self.transitionCb('inSyncWithBoard'));
    }, 50);
  }

};

STK500Transaction.prototype.drainedBytes = function (readArg) {
  var self = this;

  log.log("DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    self.buffer.read(1024, self.transtionCb('drainedBytes'));
  } else {
    log.log("About to set DTR low");

    setTimeout(function() {
      self.serial.setControlSignals(self.connectionId, {dtr: false, rts: false}, function(ok) {
        log.log("sent dtr false, done: " + ok);
        setTimeout(function() {
          self.serial.setControlSignals(self.connectionId, {dtr: true, rts: true}, function(ok) {
            log.log("sent dtr true, done: " + ok);
            setTimeout(function () {self.transition('dtrSent', ok);}, 500);
          });
        }, 500);
      });
    }, 500);
  }
}

STK500Transaction.prototype.inSyncWithBoard = function (ok, data) {
  if (!ok) {
    log.error("InSyncWithBoard: NOT OK");
  }
  log.log("InSyncWithBoard: " + ok + " / " + data);
  this.inSync_ = true;
  this.writeThenRead_([this.STK.GET_PARAMETER, this.STK.HW_VER, this.STK.CRC_EOP], 1,
                     this.transitionCb('readHardwareVersion'));
};

STK500Transaction.prototype.readHardwareVersion = function (ok, data) {
  log.log("HardwareVersion: " + ok + " / " + data);
  this.writeThenRead_([this.STK.GET_PARAMETER, this.STK.SW_VER_MAJOR, this.STK.CRC_EOP],
                     1, this.transitionCb('readSoftwareMajorVersion'));
};

STK500Transaction.prototype.readSoftwareMajorVersion = function (ok, data) {
  log.log("Software major version: " + ok + " / " + data);
  this.writeThenRead_([this.STK.GET_PARAMETER, this.STK.SW_VER_MINOR, this.STK.CRC_EOP],
                     1, this.transitionCb('readSoftwareMinorVersion'));
};

STK500Transaction.prototype.readSoftwareMinorVersion = function (ok, data) {
  log.log("Software minor version: " + ok + " / " + data);
  this.writeThenRead_([this.STK.ENTER_PROGMODE, this.STK.CRC_EOP], 0,
                    this.transitionCb('enteredProgmode'));
}

STK500Transaction.prototype.enteredProgmode = function (ok, data) {
  log.log("Entered progmode: " + ok + " / " + data);
  this.writeThenRead_([this.STK.READ_SIGN, this.STK.CRC_EOP], 3,
                     this.transitionCb('readSignature'));
}

STK500Transaction.prototype.readSignature = function (ok, data) {
  log.log("Device signature: " + ok + " / " + data);

  this.transition('programFlash', 0, this.pageSize,
                  this.transitionCb('doneProgramming'));
}

STK500Transaction.prototype.doneProgramming = function () {
  this.sketchData = null;
  this.writeThenRead_([this.STK.LEAVE_PROGMODE, this.STK.CRC_EOP],
                  0, this.transitionCb('leftProgmode'));
}

STK500Transaction.prototype.isProgramming = function () {
  return this.sketchData == null;
}

STK500Transaction.prototype.leftProgmode = function (ok, data) {
  var self = this;

  log.log("Left progmode: " + ok + " / " + data +
          " Disconnecting " + self.connectionId + "...");
  self.serial.disconnect(self.connectionId, function (ok) {
    if (ok) {
      self.connectionId = null;
      log.log("Disconnected ok, You may now use your program!");
    } else
      log.log("Could not disconnect from " + self.connectionId);
  });
}

STK500Transaction.prototype.programFlash = function (offset, length, doneCallback) {
  var payload,
      data = this.sketchData;
  log.log("program flash: data.length: " + data.length + ", offset: " + offset + ", length: " + length);

  if (offset >= data.length) {
    log.log("Done programming flash: " + offset + " vs. " + data.length);
    doneCallback(this.connectionId);
    return;
  }

  if (offset + length > data.length) {
    log.log("Grabbing " + length + " bytes would go past the end.");
    log.log("Grabbing bytes " + offset + " to " + data.length + " bytes would go past the end.");
    payload = data.slice(offset, data.length);
    var padSize = length - payload.length;
    log.log("Padding " + padSize + " 0 byte at the end");
    for (var i = 0; i < padSize; ++i) {
      payload.push(0);
    }
  } else {
    log.log("Grabbing bytes: " + offset + " until " + (offset + length));
    payload = data.slice(offset, offset + length);
  }

  var addressBytes = buffer.storeAsTwoBytes(offset / 2); // Word address, verify this
  var sizeBytes = buffer.storeAsTwoBytes(length);
  var kFlashMemoryType = 0x46;

  var loadAddressMessage = [
    this.STK.LOAD_ADDRESS, addressBytes[1], addressBytes[0], this.STK.CRC_EOP];
  var programMessage = [
    this.STK.PROG_PAGE, sizeBytes[0], sizeBytes[1], kFlashMemoryType]
        .concat(payload);
  programMessage.push(this.STK.CRC_EOP);

  var self = this;
  self.writeThenRead_(loadAddressMessage, 0, function(ok, reponse) {
    if (!ok) {
      log.error("Error programming the flash (load address)");
      return;
    }
    self.writeThenRead_(programMessage, 0, function(ok, response) {
      if (!ok) {
        log.error("Error programming the flash (send data)");
        return;
      }
      // Program the next section
      self.transition('programFlash', offset + length, length, doneCallback);
    });
  });
};


STK500Transaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  var self = this;
  self.log.log("consumeMessage (conn=", self.connectionId,
               ", payload_size=", payloadSize, " ...)");
  var ReadState = {
    READY_FOR_IN_SYNC: 0,
    READY_FOR_PAYLOAD: 1,
    READY_FOR_OK: 2,
    DONE: 3,
    ERROR: 4
  };

  var accum = [];
  var state = ReadState.READY_FOR_IN_SYNC;
  var kMaxReads = 100;
  var reads = 0;
  var payloadBytesConsumed = 0;
  var totalConsumed = 0;
  var totalSize = payloadSize + 2;

  // The gist of this is: expect arg.data to be [INSYNC, <data>, OK]
  // If not, fail gracefully.
  var handleRead = function(arg) {
    if (reads++ >= kMaxReads) {
      errorCb("Too many reads. Bailing.");
      return;
    }

    var hexData = buffer.bufToBin(arg.data);
    log.log('Ready to receive: ', payloadSize, ' bytes, Already read:', payloadBytesConsumed, 'state:', state);
    if (arg.bytesRead > 0) {
      log.log("Read:" + hexData);
    } else {
      log.log("No data read.");
    }

    for (var i = 0; i < hexData.length; ++i) {
      log.log("Byte " + i + " of " + hexData.length + ": " + hexData[i]);
      if (state == ReadState.READY_FOR_IN_SYNC) {
        if (hexData[i] == self.STK.INSYNC) {
          if (payloadSize == 0) {
            log.log("Got IN_SYNC, no payload, now READY_FOR_OK");
            state = ReadState.READY_FOR_OK;
          } else {
            log.log("Got IN_SYNC, now READY_FOR_PAYLOAD");
            state = ReadState.READY_FOR_PAYLOAD;
          }
        } else {
          log.log("Expected self.STK.INSYNC (", self.STK.INSYNC,
                  "). Got: " + hexData[i] + ". Ignoring.");
          // state = ReadState.ERROR;
        }
      } else if (state == ReadState.READY_FOR_PAYLOAD) {
        accum.push(hexData[i]);
        payloadBytesConsumed++;
        log.log('Got payload byte: [', payloadBytesConsumed, '/', payloadSize, ']', hexData[i]);
        if (payloadBytesConsumed == payloadSize) {
          log.log("Got full payload, now READY_FOR_OK");
          state = ReadState.READY_FOR_OK;
        } else if (payloadBytesConsumed > payloadSize) {
          log.log("Got too many payload bytes, now ERROR");
          state = ReadState.ERROR;
          log.error("Read too many payload bytes!");
        }
      } else if (state == ReadState.READY_FOR_OK) {
        if (hexData[i] == self.STK.OK) {
          log.log("Got OK now DONE");
          state = ReadState.DONE;
        } else {
          log.error("Expected STK_OK. Got: " + hexData[i]);
          state = ReadState.ERROR;
        }
      } else if (state == ReadState.DONE) {
        log.error("Out of sync (ignoring data)");
        state = ReadState.ERROR;
      } else if (state == ReadState.ERROR) {
        log.error("In error state. Draining byte: " + hexData[i]);
        // Remains in state ERROR
      } else {
        log.error("Unknown state: " + state);
        state = ReadState.ERROR;
      }
    }

    totalConsumed += hexData.length;

    if (state == ReadState.ERROR || state == ReadState.DONE) {
      log.log("Finished in state: " + state);
      callback(state == ReadState.DONE, accum);
    } else if (totalConsumed > totalSize) {
      console.error('Not reached: got more bytes than requested: ', totalConsumed, '>', totalSize);
    } else {
      log.log("Paused in state: " + state + ". Reading again.");

      if (!self.inSync_ && (reads % 3) == 0) {
        // Mega hack (temporary)
        // In case we are expecting an empty packet, and we did not get it
        // force Arduino to send an empty packet
        // FIX: read bytes from buffer 1 by 1
        log.log("Mega Hack: Writing: " + buffer.hexRep([self.STK.GET_SYNC, self.STK.CRC_EOP]));
        self.serial.send(self.connectionId, buffer.binToBuf([self.STK.GET_SYNC, self.STK.CRC_EOP]), function() {
          self.buffer.read(totalSize - totalConsumed, handleRead);
        });
      } else {
        // Don't tight-loop waiting for the message.
        setTimeout(function() {
          self.buffer.read(totalSize - totalConsumed, handleRead);
        }, 500);
      }
    }
  };

  log.log("Scheduling a read in .1s");
  setTimeout(function() { self.buffer.read(totalSize - totalConsumed, handleRead); }, 10);
};


module.exports.STK500Transaction = STK500Transaction;
