var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer.js");

function USBTinyTransaction() {}

USBTinyTransaction.prototype = new Transaction();

USBTinyTransaction.prototype.init = function (finishCallback, errorCallback) {

};

USBTinyTransaction.prototype.flash = function (devName, hexData) {
  var self = this;

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

  console.log(self.handler);
};
