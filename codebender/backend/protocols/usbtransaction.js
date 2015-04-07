var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    chain = require('./../util').chain,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer"),
    ops = require("./memops"),
    Log = require('./../logging').Log,
    log = new Log('USBTransaction');

function USBTransaction(config, finishCallback, errorCallback) {
  Transaction.apply(this, arraify(arguments));

  this.log = log;
  this.usb = chrome.usb;
  this.sck = 10;

  this.log.resetTimeOffset();
}

USBTransaction.prototype = new Transaction();

USBTransaction.prototype.smartOpenDevice = function (device, cb) {
  var self = this;
  self.usb.getDevices(device, function (devs) {
    if (devs.length == 0) {
      self.errCb(1, "No devices found");
      return;
    }

    var dev = devs.pop();

    // Config 0 is invalid generally but due to the strangenes that is
    // windows and mac we need to default somewhere.
    self.usb.openDevice(dev,function (hndl) {
      var _callback = cb.bind(null, hndl);
      chrome.runtime.getPlatformInfo(function (platform) {
        if (typeof self.config.configureDevice === 'undefined') {
          self.config.configureDevice = (platform.os == "mac") + 0;
        }

        if (self.config.configureDevice) {
          return self.usb.setConfiguration(hndl, self.config.deviceConfiguratiuon,
                                           _callback);
        }

        return _callback();
      });
    });
  });
};

USBTransaction.prototype.transferOut = function (op, value, index, data) {
  return {
    recipient: "device",
    direction: "out",
    requestType: "vendor",
    request: op,
    value: value,
    index: index,
    timeout: 5000,
    data: buffer.binToBuf(data || []),
    length: data ? data.length : 0
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
    timeout: 5000,
    length: length || 0
  };
};

// Full fledged write with control
USBTransaction.prototype.write = function (info, cb) {
  var self = this;

  log.log("Performing control transfer", info.direction,
          buffer.hexRep([info.request, info.value, info.index]),
          "len:", info.length);
  if (info.direction == "out") {
    log.log("Data:", buffer.hexRep(buffer.bufToBin(info.data)));
  }

  this.refreshTimeout();

  setTimeout(function (){
    self.usb.controlTransfer(
      self.handler,
      info, function (arg) {
        if (arg.resultCode != 0) {
          self.errCb(1, "Bad resultCode from libusb:", arg.resultCode);
          return;
        }

        arg.data = buffer.bufToBin(arg.data);

        log.log('Response was:', arg);
        cb(arg);
      });
  });
};

// A simple control message with 2 values (index, value that is)
USBTransaction.prototype.control = function (op, v1, v2, cb) {
  this.write(this.transferIn(op, v1, v2), cb);
};

USBTransaction.prototype.localCleanup = function (callback) {
  function doCleanup () {
    log.log("Handler closed");
    self.handler = null;
    callback();
  }

  // Cleanup even if closeDevice fails (eg if it was never opened).
  var emergencyCleanup = setTimeout(doCleanup, 2000);

  if (this.handler) {
    this.usb.closeDevice(this.handler, function () {
      clearTimeout(emergencyCleanup);
      doCleanup();
    });
  }
};

module.exports.USBTransaction = USBTransaction;