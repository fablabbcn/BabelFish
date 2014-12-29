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
  };
  this.pageSize = 128;
  this.log = log;
  this.cmdSeq = 0;
}

STK500v2Transaction.prototype = new SerialTransaction();

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

// Consume message:
// To retrieve the message first calculate the checksum
// - [MESSAGE_START cmd_seq size1 size2 TOKEN data1 ... datan checksum===0]
// Where checksum=msgBytes.reduce(xor)

//// XXX: Make a namespace with the reader related functions. Package
//// those into a callback for buffer reader.
// - Get head
// - Get body
// - calculate checksum
// - Validate body
// - Return the useful part of the body.


// Get the useful message length
STK500Transaction.prototype.messageLength = function (data) {
  var self = this,
      start = data.indexOf(self.STK2.MESSAGE_START);

  if (start < 0)
    return -1;

  var head = data.slice(start, 5);

  if (head.length < 5) return -2;
  if (head.shift() != self.STK2.MESSAGE_START) return -3;
  if (head.shift() != self.cmdSeq) return -4; // Increment this on successful package
  var msgLen = (head.shift() << 8) | head.shift();
  if (head.shift() != self.STK2.TOKEN) return -5;

  return msgLen;
};

// Message may be
// - CMD_XPROG_SETMODE XPROXPRG_ERR_{OK,FAILED,COLLISION,TIMEOUT}
// - CMD_XPROG XPRG_CMD_* XPROXPRG_ERR_{OK,FAILED,COLLISION,TIMEOUT}
//
STK500Transaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  var self = this;
  self.buffer.readAsync(function  (arg) {

  });
};

module.exports.STK500v2Transaction = STK500v2Transaction;
