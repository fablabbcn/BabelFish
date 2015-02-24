var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    chain = require('./../util').chain,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer"),
    ops = require("./memops"),
    Log = require('./../logging').Log,
    log = new Log('USBTiny');

function USBTransaction(config, finishCallback, errorCallback) {
  Transaction.apply(this, arraify(arguments));
  // Default product and vendor IDs
  this.usb = chrome.usb;
  this.sck = 10;
}

USBTransaction.prototype = new Transaction();

USBTransaction.prototype.transferOut = function (op, value, index, data) {
  return {
    recipient: "device",
    direction: "out",
    requestType: "vendor",
    request: op,
    value: value,
    index: index,
    data: buffer.binToBuf(data || [])
  };
};

USBTransaction.prototype.transferIn = function (op, value, index, length) {
  return {
    recipient: "device",
    direction: "in",
    requestType: "vendor",
    request: op,
    index: index,
    value: value,
    length: length || 0
  };
};

// Full fledged write with control
USBTransaction.prototype.write = function (info, cb) {
  this.usb.controlTransfer(
    this.handler,
    info, function (arg) {
      arg.data = buffer.bufToBin(arg.data);

      log.log('sent:', buffer.hexRep([info.request, info.value, info.index]));
      cb(arg);
    });
};

// A simple control message with 2 values (index, value that is)
USBTransaction.prototype.control = function (op, v1, v2, cb) {
  this.write(this.transferIn(op, v1, v2), cb);
};

USBTransaction.prototype.localCleanup = function (callback) {

  if (this.handler) {
    this.usb.closeDevice(this.handler, function () {
      log.log("Handler closed");
      self.handler = null;
      callback();
    });
  }
};

module.exports.USBTransaction = USBTransaction;
