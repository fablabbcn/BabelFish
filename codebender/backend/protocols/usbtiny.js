var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer.js"),
    Log = require('./../logging').Log,
    log = new Log('USBTiny');

function USBTinyTransaction() {
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

USBTinyTransaction.prototype.transferIn = function (op, v1, v2, length) {
  return {
    recipient: "device",
    direction: "in",
    requestType: "vendor",
    request: op,
    value: v1,
    index: v2,
    length: length || 0
  };
};

USBTinyTransaction.prototype.control = function (op, v1, v2, cb) {
  var self = this, transferInfo = self.transferIn(op, v1, v2);

  self.usb.controlTransfer(
    self.handler,
    transferInfo, function (arg) {
      arg.data = buffer.bufToBin(arg.data);
      cb(arg);
    });
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

USBTinyTransaction.prototype.powerUp = function () {
  var self = this;

  log.log(self.handler);
  self.control(self.UT.POWERUP, self.sck, self.UT.RESET_LOW,
               self.transitionCb('powerDown'));
};

USBTinyTransaction.prototype.powerDown = function (ctrlArg) {
  var self = this;

  log.log(self.handler);
  self.control(self.UT.POWERDOWN, 0, 0,
               self.transitionCb('endTransaction'));
};

USBTinyTransaction.prototype.endTransaction = function (ctrlArg) {
  var self = this;

  if (this.handler) {
    self.usb.closeDevice(this.handler, function () {
      log.log("Handler closed");
      self.handler = null;
    });
  }
};

module.exports.USBTinyTransaction = USBTinyTransaction;
