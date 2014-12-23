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
  self.destroyOtherConnections(
    deviceName,
    function  () {
      self.serial.connect(deviceName,
                          {bitrate: 115200, name: deviceName},
                          self.transitionCb('connectDone', sketchData));
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
    this.errCb("Bad connectionId / Couldn't connect to board");
    return;
  }

  this.connectionId = connectArg.connectionId;
  log.log("Connected to board. ID: " + connectArg.connectionId);
  this.buffer.drain(this.transitionCb('drainedBytes'));

};

STK500Transaction.prototype.drainedBytes = function (readArg) {
  var self = this;
  log.log("DRAINED ", readArg.bytesRead, " BYTES, setting DTR/RTS to low");
  setTimeout(function() {
    self.serial.setControlSignals(self.connectionId, {dtr: false, rts: false}, function(ok) {
      if (!ok) {
        self.errCb("Couldn't send DTR");
        return;
      }
      setTimeout(function() {
        self.serial.setControlSignals(self.connectionId, {dtr: true, rts: true}, function(ok) {
          log.log("Raised DTR/RTS, done: ", ok);
          setTimeout(self.transitionCb('dtrSent', ok), 500);
        });
      }, 500);
    });
  }, 500);
};

STK500Transaction.prototype.dtrSent = function (ok) {
  var self = this;
  if (!ok) {
    this.errCb("Couldn't send DTR");
    return;
  }
  log.log("DTR sent (low) real good");

  this.buffer.drain(function () {
    self.writeThenRead_([self.STK.GET_SYNC, self.STK.CRC_EOP],
                        0, self.transitionCb('inSyncWithBoard'));
  });
};

STK500Transaction.prototype.inSyncWithBoard = function (ok, data) {
  if (!ok) {
    this.errCb("InSyncWithBoard: NOT OK");
  }
  this.inSync_ = true;
  this.writeThenRead_([this.STK.GET_PARAMETER, this.STK.HW_VER, this.STK.CRC_EOP], 1,
                      this.transitionCb('readHardwareVersion'));
};

STK500Transaction.prototype.readHardwareVersion = function (ok, data) {
  this.writeThenRead_([this.STK.GET_PARAMETER, this.STK.SW_VER_MAJOR, this.STK.CRC_EOP],
                      1, this.transitionCb('readSoftwareMajorVersion'));
};

STK500Transaction.prototype.readSoftwareMajorVersion = function (ok, data) {
  this.writeThenRead_([this.STK.GET_PARAMETER, this.STK.SW_VER_MINOR, this.STK.CRC_EOP],
                      1, this.transitionCb('readSoftwareMinorVersion'));
};

STK500Transaction.prototype.readSoftwareMinorVersion = function (ok, data) {
  this.writeThenRead_([this.STK.ENTER_PROGMODE, this.STK.CRC_EOP], 0,
                      this.transitionCb('enteredProgmode'));
};

STK500Transaction.prototype.enteredProgmode = function (ok, data) {
  this.writeThenRead_([this.STK.READ_SIGN, this.STK.CRC_EOP], 3,
                      this.transitionCb('readSignature'));
};

STK500Transaction.prototype.readSignature = function (ok, data) {
  log.log("Signature:", buffer.hexRep(data));
  this.transition('programFlash', 0, this.pageSize,
                  this.transitionCb('doneProgramming'));
};

STK500Transaction.prototype.programFlash = function (offset, length) {
  var data = this.sketchData;
  log.log("program flash: data.length: ", data.length, ", offset: ", offset, ", length: ", length);

  if (offset >= data.length) {
    log.log("Done programming flash: ", offset, " vs. " + data.length);
    this.transition('doneProgramming', this.connectionId);
    return;
  }

  var payload = this.padOrSlice(data, offset, length),
      addressBytes = buffer.storeAsTwoBytes(offset / 2),
      sizeBytes = buffer.storeAsTwoBytes(length),
      kFlashMemoryType = 0x46;

  var loadAddressMessage = [
    this.STK.LOAD_ADDRESS, addressBytes[1], addressBytes[0], this.STK.CRC_EOP];
  var programMessage = [
    this.STK.PROG_PAGE, sizeBytes[0], sizeBytes[1], kFlashMemoryType]
        .concat(payload);
  programMessage.push(this.STK.CRC_EOP);

  var self = this;
  self.writeThenRead_(loadAddressMessage, 0, function(ok, reponse) {
    if (!ok) {
      self.errCb("Error programming the flash (load address)");
      return;
    }
    self.writeThenRead_(programMessage, 0, function(ok, response) {
      if (!ok) {
        self.errCb("Error programming the flash (send data)");
        return;
      }
      // Program the next section
      self.transition('programFlash', offset + length, length);
    });
  });
};


STK500Transaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  var self = this;
  log.log("Will now read");
  self.buffer.readAsync(payloadSize + 2, function  (arg) {
    // XXX: Maybe we shouldn't destroy arg but probably noone will
    // care.
    if (arg.data.shift() != self.STK.INSYNC)
      errorCb("Expected STK_INSYNC (" + buffer.hexRep(self.STK.INSYNC) +
              ") at the beginning of received message" +
              buffer.hexRep(arg.data));

    if (arg.data.pop() != self.STK.OK)
      errorCb("Expected STK_INSYNC (" + buffer.hexRep(self.STK.OK) +
              ") at the end of received message" +
              buffer.hexRep(arg.data));

    callback(true, arg);

  }, 2000, this.errCb.bind(this, "STK failed timeout"));
};

STK500Transaction.prototype.doneProgramming = function () {
  this.sketchData = null;
  this.writeThenRead_([this.STK.LEAVE_PROGMODE, this.STK.CRC_EOP],
                      0, this.transitionCb('leftProgmode'));
};

STK500Transaction.prototype.leftProgmode = function (ok, data) {
  var self = this;
  this.cleanup(this.finishCallback);
};

module.exports.STK500Transaction = STK500Transaction;
