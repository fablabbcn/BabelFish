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
  this.maxMessageRetries = 4;
}

STK500Transaction.prototype = new SerialTransaction();

STK500Transaction.prototype.writeThenRead = function (data, rcvSize, cb, _retryCnt) {
  var self = this;
  if (!Number.isInteger(_retryCnt))
    _retryCnt = this.maxMessageRetries;

  function modifyDatabuffer () {
    // The weird binding of the reader.
    var reader = this,
        start = reader.buffer.databuffer
          .indexOf(self.STK.INSYNC);

    if (start < 0) return false;

    var db = reader.buffer.databuffer.slice(start),
        end = db.indexOf(self.STK.OK);

    if (end < 0) return false;

    if (end-1 != rcvSize)
      console.error("Requested", rcvSize, "from databuffer",
                    reader.buffer.databuffer, "but found", end-1,
                    "size package");

    reader.buffer.databuffer = db.slice(end);
    // Don't include the packet head and tail
    setTimeout(this.callback.bind(this, true, db.slice(1,end-1)), 0);

    return true;
  }

  function retryThenErrcb () {
    // When we fail retry
    if (_retryCnt == 0) {
      self.errCb(1, "STK read timed out");
    }

    self.buffer.drain(function () {
      log.log("Retrying read/write:", data, rcvSize);
      self.writeThenRead(data, rcvSize, cb, _retryCnt - 1);
    });
  }

  this.writeThenRead_({outgoingMsg: data,
                       modifyDatabuffer: modifyDatabuffer,
                       callback: cb,
                       ttl: 500,
                       timeoutCb: retryThenErrcb});
};

// Cb should have the 'state' format, ie function (ok, data)
STK500Transaction.prototype.cmd = function (cmd, cb) {
  // Always get a 4byte answer
  this.writeThenRead(cmd, 4, cb);
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
  var self = this;
  log.log("Erasing chip");
  self.writeThenRead(this.memOps.CHIP_ERASE_ARR, function  () {
    // XXX: Maybe we should care about the response when asking to
    // erase
    if (!dontFlash)
      self.transition('flash', deviceName, sketchData);
  });
};

STK500Transaction.prototype.connectDone = function (hexCode, connectArg) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    this.errCb(1, "Bad connectionId / Couldn't connect to board");
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
        self.errCb(1, "Couldn't send DTR");
        return;
      }
      setTimeout(function() {
        self.serial.setControlSignals(self.connectionId, {dtr: true, rts: true}, function(ok) {
          log.log("Raised DTR/RTS, done: ", ok);
          setTimeout(self.transitionCb('dtrSent', ok), 500);
        });
      }, 250);
    });
  }, 0);
};

STK500Transaction.prototype.dtrSent = function (ok) {
  var self = this;
  if (!ok) {
    this.errCb(1, "Couldn't send DTR");
    return;
  }
  log.log("DTR sent (low) real good");

  this.buffer.drain(function () {
    self.writeThenRead([self.STK2.CMD_SIGN_ON],
                       self.transitionCb('inSyncWithBoard'));
  });
};

STK500Transaction.prototype.inSyncWithBoard = function (ok, data) {
  if (!ok) {
    this.errCb(1, "InSyncWithBoard: NOT OK");
    return;
  }
  this.inSync_ = true;
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.HW_VER, this.STK.CRC_EOP], 1,
                     this.transitionCb('readHardwareVersion'));
};

STK500Transaction.prototype.readHardwareVersion = function (ok, data) {
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.SW_VER_MAJOR, this.STK.CRC_EOP],
                     1, this.transitionCb('readSoftwareMajorVersion'));
};

STK500Transaction.prototype.readSoftwareMajorVersion = function (ok, data) {
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.SW_VER_MINOR, this.STK.CRC_EOP],
                     1, this.transitionCb('readSoftwareMinorVersion'));
};

STK500Transaction.prototype.readSoftwareMinorVersion = function (ok, data) {
  this.writeThenRead([this.STK.ENTER_PROGMODE, this.STK.CRC_EOP], 0,
                     this.transitionCb('enteredProgmode'));
};

STK500Transaction.prototype.enteredProgmode = function (ok, data) {
  this.writeThenRead([this.STK.READ_SIGN, this.STK.CRC_EOP], 3,
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
  self.writeThenRead(loadAddressMessage, 0, function(ok, reponse) {
    console.log('Finished with block');
    if (!ok) {
      self.errCb(1, "Error programming the flash (load address)");
      return;
    }
    self.writeThenRead(programMessage, 0, function(ok, response) {
      if (!ok) {
        self.errCb(1, "Error programming the flash (send data)");
        return;
      }
      // Program the next section
      self.transition('programFlash', offset + length, length);
    });
  });
};

STK500Transaction.prototype.doneProgramming = function () {
  this.sketchData = null;
  this.writeThenRead([this.STK.LEAVE_PROGMODE, this.STK.CRC_EOP],
                     0, this.transitionCb('leftProgmode'));
};

STK500Transaction.prototype.leftProgmode = function (ok, data) {
  var self = this;
  this.cleanup(this.finishCallback);
};

module.exports.STK500Transaction = STK500Transaction;
