var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer"),
    ops = require("./memops"),
    Log = require('./../logging').Log,
    log = new Log('USBTiny');

function USBTinyTransaction(config, finishCallback, errorCallback) {
  Transaction.apply(this, arraify(arguments));
  this.UT = {
    // Generic requests to the USBtiny
    ECHO: 0,              // echo test
    READ: 1,              // read byte (wIndex:address)
    WRITE: 2,             // write byte (wIndex:address, wValue:value)
    CLR: 3,               // clear bit (wIndex:address, wValue:bitno)
    SET: 4,               // set bit (wIndex:address, wValue:bitno)

    // Programming requests
    POWERUP: 5,     // apply power (wValue:SCK-period, wIndex:RESET)
    POWERDOWN: 6,   // remove power from chip
    SPI: 7,         // issue SPI command (wValue:c1c0, wIndex:c3c2)
    POLL_BYTES:   8,  // set poll bytes for write (wValue:p1p2)
    FLASH_READ:   9,  // read flash (wIndex:address)
    FLASH_WRITE:  10, // write flash (wIndex:address, wValue:timeout)
    EEPROM_READ:  11, // read eeprom (wIndex:address)
    EEPROM_WRITE: 12,  // write eeprom (wIndex:address, wValue:timeout)

    RESET_LOW: 0,
    RESET_HIGH: 1
  };

  // Default product and vendor IDs
  this.device = {productId: 0xc9f, vendorId: 0x1781};
  this.usb = chrome.usb;
  this.log = log;
  this.sck = 10;
}

USBTinyTransaction.prototype = new Transaction();

USBTinyTransaction.prototype.transferOut = function (op, v1, v2, data) {
  return {
    recipient: "device",
    direction: "out",
    requestType: "vendor",
    request: op,
    value: v1,
    index: v2,
    data: buffer.binToBuf(data || [])
  };
};

USBTinyTransaction.prototype.transferIn = function (op, val, ind, length) {
  return {
    recipient: "device",
    direction: "in",
    requestType: "vendor",
    request: op,
    value: val,
    index: ind,
    length: length || 0
  };
};

// Full fledged write with control
USBTinyTransaction.prototype.write = function (info, cb) {
  this.usb.controlTransfer(
    this.handler,
    info, function (arg) {
      arg.data = buffer.bufToBin(arg.data);

      log.log(arg);
      cb(arg);
    });
};

// A simple control message with 2 values (index, value that is)
USBTinyTransaction.prototype.control = function (op, v1, v2, cb) {
  this.write(self.transferIn(op, v1, v2), cb);
};

USBTinyTransaction.prototype.cmd = function (cmd, cb) {
  log.log("Sending command:", buffer.hexRep(cmd));

  var info = this.transferIn(this.UT.SPI,
                             (cmd[1] << 8) | cmd[0],
                             (cmd[3] << 8) | cmd[2],
                             4);

  this.write(info, cb);
};

USBTinyTransaction.prototype.operation = function (op, cb) {
  log.log("Running operation:", op);
  return this.cmd(ops.opToBin(this.config.avrdude.ops[op]), cb);
};

// First argument is ignored for compatibility with serial flashes tha
// accept the device name.
USBTinyTransaction.prototype.flash = function (_, hexData) {
  var self = this;
  self.hexData = hexData;

  self.usb.findDevices(self.device, function (hndls) {
    if (hndls.length == 0) {
      self.errCb(1, "No devices found");
      return;
    }

    self.handler = hndls.pop();
    self.transition('powerUp');
  });
};

USBTinyTransaction.prototype.powerUp = function (cb) {
  log.log(this.handler);
  this.control(this.UT.POWERUP, this.sck, this.UT.RESET_LOW,
               cb || this.transitionCb('programEnable'));
};

USBTinyTransaction.prototype.programEnable = function () {
  this.operation("PGM_ENABLE", this.transitionCb('programPage', 0));
};

USBTinyTransaction.prototype.programPage = function (offset) {
  var page = this.config.avrdude.memory.flash.page_size,
      end = offset + page,
      info = this.transferOut(this.UT.FLASH_READ, 0, offset,
                              this.hexData.slice(offset, end));

  if (end > this.hexData.length)
    this.write(info, this.transitionCb("powerDown"));
  else
    this.transition('programPage', end);
};

USBTinyTransaction.prototype.powerDown = function (ctrlArg) {
  log.log(this.handler);
  this.control(this.UT.POWERDOWN, 0, 0,
               this.transitionCb('endTransaction'));
};

USBTinyTransaction.prototype.endTransaction = function (ctrlArg) {
  var self = this;

  if (this.handler) {
    this.usb.closeDevice(this.handler, function () {
      log.log("Handler closed");
      self.handler = null;
    });
  }
};

module.exports.USBTinyTransaction = USBTinyTransaction;
