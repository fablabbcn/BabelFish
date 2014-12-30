// http://www.atmel.com/Images/doc2591.pdf

var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('STK500'),
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
STK500Transaction.prototype.writeThenRead = function (data, cb) {
  var self = this;
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
    if (db.shift() != self.cmdSeq++) {
      self.errCb(1, "Transaction out of sync with dev");
      return false;
    }

    var msgLen = (db.shift() << 8) | db.shift();
    db.shift();                  // Throw token

    var msg = db.slice(0, msgLen),
        csum = reader.buffer.databuffer.slice(start, msgLen+6).reduce(function (a,b) {return a^b;});

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

  this.writeThenRead_({outgoingMsg: data,
                       modifyDatabuffer: modifyDatabuffer,
                       callback: cb,
                       ttl: 500,
                       timeoutCb: this.errCb.bind(this, 1, "STK failed timeout")});
};


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
  var self = this;
  log.log("Erasing chip");
  self.writeThenRead_(this.memOps.CHIP_ERASE_ARR, function  () {
    // XXX: Maybe we should care about the response when asking to
    // erase
    if (!dontFlash)
      self.transition('flash', deviceName, sketchData);
  });
};


module.exports.STK500v2Transaction = STK500v2Transaction;
