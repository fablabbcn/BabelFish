// http://www.atmel.com/Images/doc2591.pdf

var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('STK500v2'),
    arraify = require('./../util').arraify,
    zip = require('./../util').zip,
    buffer = require("./../buffer.js");


// The workflow is such (see pinocc.io for details):
//
// - close all connections
// - connect 115200 [serialopen, drain, set/unset getsync: (CMD_SIGN_ON ->, CMD_SIGN_ON CMD_OK chipname[30]), drain]
// - set/unset control signals with 250ms interval
// - enter progmode and configure device
// - write binary data [send address, send byte series]
// - exit bootloader with 0x11, 0x01 0x01 [CMD_LEAVE_PROGMODE_ISP, predelay, postdelay]
// - close connections
//

// And then there is chip erase
// Writing does checksums first
// Reading is also done in packets
function STK500v2Transaction () {
  SerialTransaction.apply(this, arraify(arguments));

  this.STK2 = {
    CMD_SIGN_ON: 0x01,
    CMD_SET_PARAMETER: 0x02,
    CMD_GET_PARAMETER: 0x03,
    CMD_SET_DEVICE_PARAMETERS: 0x04,
    CMD_OSCCAL: 0x05,
    CMD_LOAD_ADDRESS: 0x06,
    CMD_FIRMWARE_UPGRADE: 0x07,
    CMD_CHECK_TARGET_CONNECTION: 0x0D,
    CMD_LOAD_RC_ID_TABLE: 0x0E,
    CMD_LOAD_EC_ID_TABLE: 0x0F,

    CMD_ENTER_PROGMODE_ISP: 0x10,
    CMD_LEAVE_PROGMODE_ISP: 0x11,
    CMD_CHIP_ERASE_ISP: 0x12,
    CMD_PROGRAM_FLASH_ISP: 0x13,
    CMD_READ_FLASH_ISP: 0x14,
    CMD_PROGRAM_EEPROM_ISP: 0x15,
    CMD_READ_EEPROM_ISP: 0x16,
    CMD_PROGRAM_FUSE_ISP: 0x17,
    CMD_READ_FUSE_ISP: 0x18,
    CMD_PROGRAM_LOCK_ISP: 0x19,
    CMD_READ_LOCK_ISP: 0x1A,
    CMD_READ_SIGNATURE_ISP: 0x1B,
    CMD_READ_OSCCAL_ISP: 0x1C,
    CMD_SPI_MULTI: 0x1D,

    CMD_XPROG: 0x50,
    CMD_XPROG_SETMODE: 0x51,

    // Success
    STATUS_CMD_OK: 0x00,

    // Warnings
    STATUS_CMD_TOUT: 0x80,
    STATUS_RDY_BSY_TOUT: 0x81,
    STATUS_SET_PARAM_MISSING: 0x82,

    // Errors
    STATUS_CMD_FAILED: 0xC0,
    STATUS_CKSUM_ERROR: 0xC1,
    STATUS_CMD_UNKNOWN: 0xC9,

    MESSAGE_START: 0x1B,
    TOKEN: 0x0E
  };

  this.pageSize = 128;
  this.log = log;
  this.cmdSeq = 1;
}

STK500v2Transaction.prototype = new SerialTransaction();

// Consume message:
// To retrieve the message first calculate the checksum
// - [MESSAGE_START cmd_seq size1 size2 TOKEN data1 ... datan checksum===0]
// Where checksum=msgBytes.reduce(xor)

// Message may be
// - CMD_XPROG_SETMODE XPROXPRG_ERR_{OK,FAILED,COLLISION,TIMEOUT}
// - CMD_XPROG XPRG_CMD_* XPROXPRG_ERR_{OK,FAILED,COLLISION,TIMEOUT}
//
STK500v2Transaction.prototype.writeThenRead = function (data, cb, retries) {
  var self = this,
      size = buffer.storeAsTwoBytes(data.length),
      message = [self.STK2.MESSAGE_START,
                 self.cmdSeq,
                 size[0], size[1],
                 self.STK2.TOKEN,
                ].concat(data);
  message.push(message.reduce(function (a,b) {
    return a^b;
  }));

  if (retries === undefined) retries = 3;

  function modifyDatabuffer () {
    // The weird binding of the reader.
    var reader = this,
        start = reader.buffer.databuffer
          .indexOf(self.STK2.MESSAGE_START),
        token = reader.buffer.databuffer
          .indexOf(self.STK2.TOKEN);

    if (start < 0) {
      log.log("Didn't find start. Clearing databuffer.");
      reader.buffer.databuffer = [];
      return false;
    }

    var db = reader.buffer.databuffer.slice(start);
    if (db.length < 6) {
      log.log("Not enough bytes even for an emty message (len < 6). Stand by.");
      return false;
    }

    // Doesnt look like a valid message
    if (db[4] != self.STK2.TOKEN) {
      log.log("Expected token but got",db[4]);
      reader.buffer.databuffer = reader.buffer.databuffer.slice(start+1);
      return false;
    }


    db.shift();                 // Throw the start
    if (db.shift() != self.cmdSeq) {
      log.log("Reader out of sync");
      // The header is definitely bad.
      reader.buffer.databuffer =
        reader.buffer.databuffer.slice(token+1);
      return false;
    }

    // Get the message length
    var msgLen = (db.shift() << 8) | db.shift();
    db.shift();                  // Throw token

    // Get the message
    var msg = db.slice(0, msgLen);
    db = db.slice(msgLen);

    // Check that we got the whole message.
    if (msg.length != msgLen) {
      log.log("Waiting for ", msgLen - msg.length + 1, "more bytes");
      return false;
    }

    // There should be a checksum left in there
    if (db.length == 0) {
      log.log("Waiting for checksum byte");
      return false;
    }
    // From the top to get the checksum
    var csum = reader.buffer.databuffer
          .slice(start, msgLen+6)
          .reduce(function (a,b) {return a^b;});

    // If the checksum failed the whole message was bad. Hope we have
    // retries..
    if (csum != 0) {
      log.warn("Message checksum failed, the message is garbage.");
      reader.buffer.databuffer =
        reader.buffer.databuffer.slice(start + msgLen + 6);
      return false;
    }

    reader.buffer.databuffer =
      reader.buffer.databuffer.slice(start + msgLen + 6);

    // Now we are good to continue our messaging
    self.cmdSeq = (self.cmdSeq + 1) & 0xff;
    log.log("Reader success. Databuffer:",
            buffer.hexRep(reader.buffer.databuffer));    // Now msg is good.
    // Don't include the packet head and tail
    setTimeout(reader.callback.bind(null, msg), 0);

    return true;
  }

  log.log("Sending:", message);
  this.writeThenRead_({outgoingMsg: message,
                       modifyDatabuffer: modifyDatabuffer,
                       callback: cb,
                       ttl: 500,
                       timeoutCb: function () {
                         if (retries > 0)
                           self.writeThenRead(data, cb, retries-1);
                         else
                           self.errCb(1, "STKv2 reader timed out");
                       }});
};


// Cb should have the 'state' format, ie function (ok, data)
STK500v2Transaction.prototype.cmd = function (cmd, cb) {
  // Always get a 4byte answer
  this.writeThenRead(cmd, cb);
};

STK500v2Transaction.prototype.flash = function (deviceName, sketchData, baudrate) {
  this.sketchData = sketchData;
  var self = this;
  self.destroyOtherConnections(
    deviceName,
    function  () {
      self.serial.connect(deviceName,
                          {bitrate: baudrate, name: deviceName},
                          self.transitionCb('connectDone', sketchData));
    });
};

STK500v2Transaction.prototype.connectDone = function (hexCode, connectArg) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    this.errCb(1, "Bad connectionId / Couldn't connect to board");
    return;
  }

  var self = this;
  this.connectionId = connectArg.connectionId;
  log.log("Connected to board. ID: " + connectArg.connectionId);
  this.buffer.drain(function () {
    self.onOffDTR(self.transitionCb('signOn'));
  });
};

STK500v2Transaction.prototype.signOn = function () {
  var self = this;
  self.writeThenRead([self.STK2.CMD_SIGN_ON],
                     self.transitionCb('signedOn'));
};

STK500v2Transaction.prototype.signedOn  = function (data) {
  var expectedData = [
    this.STK2.CMD_SIGN_ON,
    this.STK2.STATUS_CMD_OK,
    // The following 8 bytes are the signature
    8
  ],
      self = this;
  if(zip(expectedData, data.slice(0,3)).some(function (d) {return d[0] != d[1];})){
    this.errCb(1, "Error signing on to device:"+data.slice(0,3)+"!="+expectedData);
    return;
  }

  // Found in avrdude.conf
  var timeout = 200,
      cmdExecDelay = 25,
      syncHLoops = 32,
      byteDelay = 0,
      pollValue = 0x53,
      pollIndex = 3,
      pgmEnable1 = 0xac,
      pgmEnable2 = 0x53;

  self.writeThenRead([self.STK2.CMD_ENTER_PROGMODE_ISP,
                      timeout,
                      cmdExecDelay,
                      syncHLoops,
                      byteDelay,
                      pollValue,
                      pollIndex,
                      pgmEnable1, pgmEnable2,
                      0x00, 0x0c],
                     self.transitionCb("programFlash", 0, 128));
};

STK500v2Transaction.prototype.programFlash = function (offset, pgSize) {
  var data = this.sketchData;
  log.log("program flash: data.length: ", data.length, ", offset: ", offset, ", page size: ", pgSize);

  if (offset >= data.length) {
    log.log("Done programming flash: ", offset, " vs. " + data.length);
    this.transition('doneProgramming', this.connectionId);
    return;
  }

  var self = this,
      payload = this.padOrSlice(data, offset, pgSize),
      addressBytes = buffer.storeAsTwoBytes(offset / 2),
      sizeBytes = buffer.storeAsTwoBytes(pgSize),
      memMode = 0x31,
      delay = 10,
      loadpageLoCmd = 0x40,
      writepageCmd = 0x4c,
      avrOpReadLo = 0x20,
      loadAddressMessage = [
        this.STK2.CMD_LOAD_ADDRESS,
        0x80,
        addressBytes[0],
        addressBytes[1],
        0x00],
      programMessage = [
        this.STK2.CMD_PROGRAM_FLASH_ISP,
        sizeBytes[0],
        sizeBytes[1],
        memMode | 0x80,
        delay,
        loadpageLoCmd,
        writepageCmd,
        0x00, 0x00              // Readback
      ].concat(payload);

  self.writeThenRead(loadAddressMessage, function(reponse) {
    self.writeThenRead(programMessage, function(response) {
      // Program the next section
      if (response[0] != 0x13 || response[1] != 0){
        self.errCb(1, "Error in response while programming");
        return;
      }
      self.transition('programFlash', offset + pgSize, pgSize);
    });
  });
};

STK500v2Transaction.prototype.doneProgramming = function (cid) {
  var self = this;

  self.writeThenRead([0x11, 0x01, 0x01], function (data) {
    setTimeout(function () {
      self.cleanup(self.finishCallback);
    }, 1000);
  });
};

module.exports.STK500v2Transaction = STK500v2Transaction;
