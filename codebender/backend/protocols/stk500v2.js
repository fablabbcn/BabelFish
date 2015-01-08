// http://www.atmel.com/Images/doc2591.pdf

var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('STK500v2'),
    arraify = require('./../util').arraify,
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

    CMD_XPROG: 0x50,
    CMD_XPROG_SETMODE: 0x51,

    MESSAGE_START: 0x1B,
    TOKEN: 0x0E
  };

  this.pageSize = 128;
  this.log = log;
  this.cmdSeq = 0;
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
      size = buffer.storeAsTwoBytes(data.length + 6),
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

    if (start < 0 || token < 0 || token - start != 4)
      return false;

    var db = reader.buffer.databuffer.slice(start);

    db.shift();                 // Throw the start
    if (db.shift() != self.cmdSeq) {
      self.errCb(1, "Transaction out of sync with dev");
      return false;
    }

    self.cmdSeq = (self.cmdSeq + 1) & 0xff;
    var msgLen = (db.shift() << 8) | db.shift();
    db.shift();                  // Throw token

    var msg = db.slice(0, msgLen),
        csum = reader.buffer.databuffer
          .slice(start, msgLen+6)
          .reduce(function (a,b) {return a^b;});

    if (csum != 0) {
      self.errCb(1, "Message checksum failed");
      return false;
    }

    // Now msg is usefull
    reader.buffer.databuffer = reader.buffer.databuffer.slice(start + msgLen + 6);
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

STK500v2Transaction.prototype.flash = function (deviceName, sketchData) {
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
  ];
  if(data.slice(0,3) != expectedData){
    this.errCb(1, "Error signing on to device");
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
                     self.transitionCb("programDevice", 0, 128));
};

STK500v2Transaction.prototype.programDevice = function (offset, pgSize) {
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
        addressBytes[1],
        addressBytes[0],
        0x00],
      programMessage = [
        this.STK2.CMD_PROGRAM_FLASH_ISP,
        sizeBytes[1],
        sizeBytes[0],
        memMode | 0x80,
        delay,
        loadpageLoCmd,
        writepageCmd,
        0x00, 0x00              // Readback
      ].concat(payload);

  self.writeThenRead(loadAddressMessage, function(reponse) {
    self.writeThenRead(programMessage, function(response) {
      // Program the next section
      self.transition('programFlash', offset + pgSize, pgSize);
    });
  });
};

STK500v2Transaction.prototype.doneProgramming = function (cid) {
  var self = this;

  self.writeThenRead([0x11, 0x01, 0x01], function (data) {
    setTimeout(self.finishCallback, 1000);
  });
};

module.exports.STK500v2Transaction = STK500v2Transaction;
