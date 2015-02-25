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
    SW_VER_MAJOR: 0x81,
    SET_DEVICE: 0x42,
    SET_DEVICE_EXT: 0x45
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
    ttl: 1000,
    willRetry: true,
    timeoutCb: retryThenErrcb});
};

STK500Transaction.prototype.initializationMsg = function (maj, min) {
  var defmem = {readback: [0xff, 0xff],
                pageSize: 0,
                size: 0},
      flashmem = this.config.avrdude.memory.flash || defmem,
      eepromem = this.config.avrdude.memory.eeprom || defmem,
      extparams = {pagel: this.config.avrdude.pagel || 0xd7,
                   bs2: this.config.avrdude.bs2 || 0xa0,
                   len: ((maj > 1) || ((maj == 1) && (min > 10))) ? 4: 3},
      initMessage =  [
        // 0: SET_DEVICE
        this.STK.SET_DEVICE,
        // 1: config->devcode
        this.config.avrdude.stk500_devcode || 0,
        // 2: 0 // device revision
        0,
        // 3: !(parallel && serial programming)
        (this.config.avrdude.serialProgramMode &&
         this.config.avrdude.parallelProgramMode)? 0 : 1,
        // 4: !(parallel && pseudoparallel)
        //   n_extparams -> 0 if pseudoparallel
        (this.config.avrdude.pseudoparallelProgramMode &&
         this.config.avrdude.parallelProgramMode)? 0 : 1,
        // 5: 1
        1,
        // 6: 1
        1,
        // 7: lock.size || 0
        this.config.avrdude.memory.lock ?
          this.config.avrdude.memory.lock.size : 0,
        // 8: sum(fuse.size)
        [
          this.config.avrdude.memory.fuse,
          this.config.avrdude.memory.hfuse,
          this.config.avrdude.memory.lfuse,
          this.config.avrdude.memory.efuse
        ].reduce(function (res, b) {return (res + (b?b.size:0));}, 0),
        // 9: readback[0] if flash or 0xff
        flashmem.readback[0],
        // 10: readback[1] if flash or 0xff
        flashmem.readback[1],
        // 11: eeprom readback
        eepromem.readback[0],
        // 12: eeprom readback
        eepromem.readback[1],
        // 13: (pageSize >> 8) &0xff
        (flashmem.page_size >> 8) & 0xff,
        // 14: pageSize & 0xff
        flashmem.page_size & 0xff,
        // 15: eeprom equiv
        (eepromem.size >> 8) & 0xff,
        // 16: eeprom equiv
        eepromem.size & 0xff,
        // 17: size >> 24
        (flashmem.size >> 24) & 0xff,
        // 18: size >> 16
        (flashmem.size >> 16) & 0xff,
        // 19: size >> 8
        (flashmem.size >> 8) & 0xff,
        // 20: size
        flashmem.size & 0xff,
        // 21: EOP
        this.STK.CRC_EOP
      ],
      extparamArray = [
        this.STK.SET_DEVICE_EXT,
        extparams.len + 1,
        this.config.avrdude.memory.eeprom ?
          this.config.avrdude.memory.eeprom.page_size : 0,
        extparams.pagel,
        extparams.bs2,
        this.config.avrdude.resetDisposition == "dedicated" ? 0 : 1,
      ].slice(0, extparams.len + 2)
        .concat(this.STK.CRC_EOP);

  return [initMessage, extparamArray];
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
                          {bitrate: self.config.speed || 19200, name: deviceName},
                          self.transitionCb('megaHack', sketchData));
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

// Silence the device with megahack/sync
STK500Transaction.prototype.megaHack = function (hexCode, connectArg) {
  var self = this;
  if (connectArg && connectArg.connectionId) {
    this.connectionId = connectArg.connectionId;
    this.justWrite([self.STK.GET_SYNC, self.STK.CRC_EOP],
                   self.transitionCb('connectDone', hexCode, connectArg));
  } else
    this.errCb(1, "Connection failed");
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
        (self.config.avoidTwiggleDTR ? self.onOffDTR.bind(self) : setTimeout)(function () {
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
  this.writeThenRead([this.STK.GET_PARAMETER,
                      this.STK.HW_VER,
                      this.STK.CRC_EOP],
                     this.transitionCb('readSoftwareMajorVersion'));
};

STK500Transaction.prototype.readSoftwareMajorVersion = function (data) {
  this.writeThenRead([this.STK.GET_PARAMETER,
                      this.STK.HW_VER,
                      this.STK.CRC_EOP],
                     this.transitionCb('readSoftwareMinorVersion'));
};

STK500Transaction.prototype.readSoftwareMinorVersion = function (data) {
  var self = this;
  this.writeThenRead(
    [this.STK.GET_PARAMETER,
     this.STK.SW_VER_MAJOR,
     this.STK.CRC_EOP], function (major) {

       self.writeThenRead(
         [self.STK.GET_PARAMETER,
          self.STK.SW_VER_MINOR,
          self.STK.CRC_EOP], function (minor) {
            var initMsgs = self.initializationMsg(major[0], minor[0]);
            self.writeThenRead(
              initMsgs[0], function (data) {
                self.writeThenRead(initMsgs[1], self.transitionCb('enterProgmode'));
              });
          });
     });
}

STK500Transaction.prototype.enterProgmode = function (data) {
  this.writeThenRead([this.STK.ENTER_PROGMODE, this.STK.CRC_EOP],
                     this.transitionCb('programFlash',
                                       this.config.avrdude.memory.flash.page_size,
                                       null));
};

STK500Transaction.prototype.programFlash = function (pgSize, offset) {
  var data = this.sketchData.data, memOffset = this.config.offset || 0;
  if (offset === null)
    offset = this.sketchData.addr;

  log.log("program flash: data.length: ", data.length,
          ", offset: ", offset,
          ", page size: ", pgSize);

  if (offset >= data.length) {
    log.log("Done programming flash: ", offset, " vs. " + data.length);
    this.transition('doneProgramming', this.connectionId);
    return;
  }

  var payload = this.padOrSlice(data, offset, pgSize),
      addressBytes = buffer.storeAsTwoBytes((memOffset + offset) / 2),
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
    self.writeThenRead(programMessage,
                       // Program the next section
                       self.transitionCb('programFlash', pgSize, offset + pgSize));
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
