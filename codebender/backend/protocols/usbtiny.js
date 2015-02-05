var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer.js"),
    log = new (require('./../logging').Log)('USBTiny');

function USBTinyTransaction() {
  this.usb = chrome.usb;
  this.log = log;
}

USBTinyTransaction.prototype = new Transaction();

USBTinyTransaction.prototype.flash = function (devName, hexData) {
  var self = this,
      opts = {vendorId: 6017, productId: 3231};

  this.usb.findDevices(opts, function (hndls) {
    if (hndls.length == 0) {
      self.errCb(1, "No devices found");
      return;
    }

    self.handler = hndls.pop();
    self.transtion('connectDone', hexData);
  });
};

USBTinyTransaction.prototype.connectDone = function (hexCode) {
  var self = this;

  log(self.handler);
  self.transition('endTransaction');
};

USBTinyTransaction.prototype.connectDone = function () {
  var self = this;

  if (this.handler) {
    self.usb.closeDevice(this.handler, function () {
      log("Handler closed");
      self.handler = null;
    });
  }
};

module.exports.USBTinyTransaction = USBTinyTransaction;
