var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('STK500'),
    arraify = require('./../util').arraify,
    buffer = require("./../buffer.js"),
    errno = require("./../errno");

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
  this.pageSize = 256;
  this.log = log;
  this.maxMessageRetries = 4;
}

STK500Transaction.prototype = new SerialTransaction();

STK500Transaction.prototype.writeThenRead = function (data, cb, _retryCnt) {
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

    end++;
    reader.buffer.databuffer = db.slice(end);
    // Don't include the packet head and tail
    setTimeout(function () {
      cb(db.slice(1,end - 1));
    }, 0);

    return true;
  }

  function retryThenErrcb () {
    // When we fail retry
    if (_retryCnt == 0) {
      self.errCb(errno.READER_TIMEOUT, "STK read timed out");
      return;
    }

    self.buffer.drain(function () {
      log.log("Retrying read/write:", data);
      self.writeThenRead(data, cb, _retryCnt - 1);
    });
  }

  this.writeThenRead_({
    outgoingMsg: data,
    modifyDatabuffer: modifyDatabuffer,
    callback: cb,
    ttl: 500,
    willRetry: true,
    timeoutCb: retryThenErrcb});
};

// Cb should have the 'state' format, ie function (data)
STK500Transaction.prototype.cmd = function (cmd, cb) {
  // Always get a 4byte answer
  this.writeThenRead(cmd, cb);
};

STK500Transaction.prototype.flash = function (deviceName, sketchData) {
  this.refreshTimeout();
  this.sketchData = sketchData;
  log.log("Flashing. Config is:", this.config);
  var self = this;
  self.destroyOtherConnections(
    deviceName,
    function () {
      self.serial.connect(deviceName,
                          {bitrate: self.config.speed, name: deviceName},
                          function (connArg) {
                            self.setDtr(0, false, function() {
                              self.transition('connectDone',
                                              sketchData, connArg);
                            });
                          }, 3);
    });
};

STK500Transaction.prototype.eraseThenFlash  = function (deviceName, sketchData, dontFlash) {
  var self = this;
  log.log("Erasing chip");
  self.writeThenRead(this.memOps.CHIP_ERASE_ARR, 2, function  () {
    // XXX: Maybe we should care about the response when asking to
    // erase
    if (!dontFlash)
      self.transition('flash', deviceName, sketchData);
  });
};

STK500Transaction.prototype.connectDone = function (hexCode, connectArg) {
  var self = this;

  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    this.errCb(errno.CONNECTION_FAIL, "Bad connectionId / Couldn't connect to board");
    return;
  }

  this.connectionId = connectArg.connectionId;
  log.log("Connected to board:", connectArg);
  if (connectArg.connectionId)
    // Mega hack
    this.justWrite([this.STK.GET_SYNC, this.STK.CRC_EOP], function () {
      self.buffer.drain(function () {
        self.twiggleDtr(function () {
          self.writeThenRead([self.STK.GET_SYNC, self.STK.CRC_EOP],
                             self.transitionCb('inSyncWithBoard'));
        });
      });
    });
};
STK500Transaction.prototype.inSyncWithBoard = function (data) {
  this.inSync_ = true;
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.HW_VER, this.STK.CRC_EOP],
                     this.transitionCb('readHardwareVersion'));
};

STK500Transaction.prototype.readHardwareVersion = function (data) {
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.SW_VER_MAJOR, this.STK.CRC_EOP],
                     this.transitionCb('readSoftwareMajorVersion'));
};

STK500Transaction.prototype.readSoftwareMajorVersion = function (data) {
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.SW_VER_MINOR, this.STK.CRC_EOP],
                     this.transitionCb('readSoftwareMinorVersion'));
};

STK500Transaction.prototype.readSoftwareMinorVersion = function (data) {
  this.writeThenRead([this.STK.ENTER_PROGMODE, this.STK.CRC_EOP],
                     this.transitionCb('enteredProgmode'));
};

STK500Transaction.prototype.enteredProgmode = function (data) {
  this.writeThenRead([this.STK.READ_SIGN, this.STK.CRC_EOP],
                     this.transitionCb('readSignature'));
};

STK500Transaction.prototype.readSignature = function (data) {
  log.log("Signature:", buffer.hexRep(data));
  var offset = 0;
  this.transition('programFlash', offset,
                  this.config.avrdude.memory.flash.page_size,
                  this.transitionCb('doneProgramming'));
};

STK500Transaction.prototype.programFlash = function (offset, pgSize) {
  var data = this.sketchData;
  log.log("program flash: data.length: ", data.length, ", offset: ", offset, ", page size: ", pgSize);

  if (offset >= data.length) {
    log.log("Done programming flash: ", offset, " vs. " + data.length);
    this.transition('doneProgramming', this.connectionId);
    return;
  }

  var payload = this.padOrSlice(data, offset, pgSize),
      addressBytes = buffer.storeAsTwoBytes(offset / 2),
      sizeBytes = buffer.storeAsTwoBytes(pgSize),
      kFlashMemoryType = 0x46;

  var loadAddressMessage = [
    this.STK.LOAD_ADDRESS, addressBytes[1], addressBytes[0], this.STK.CRC_EOP];
  var programMessage = [
    this.STK.PROG_PAGE, sizeBytes[0], sizeBytes[1], kFlashMemoryType]
        .concat(payload);
  programMessage.push(this.STK.CRC_EOP);

  var self = this;
  self.writeThenRead(loadAddressMessage, function(reponse) {
    self.writeThenRead(programMessage, function(response) {
      // Program the next section
      self.transition('programFlash', offset + pgSize, pgSize);
    });
  });
};

STK500Transaction.prototype.doneProgramming = function () {
  this.sketchData = null;
  this.writeThenRead([this.STK.LEAVE_PROGMODE, this.STK.CRC_EOP],
                     this.transitionCb('leftProgmode'));
};

STK500Transaction.prototype.leftProgmode = function (data) {
  var self = this;
  this.cleanup(this.finishCallback);
};

module.exports.STK500Transaction = STK500Transaction;
