var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('avr109'),
    arraify = require('./../util').arraify,
    buffer = require("./../buffer");

function AVR109Transaction () {
  SerialTransaction.apply(this, arraify(arguments));

  this.AVR = {
    SOFTWARE_VERSION: 0x56,
    ENTER_PROGRAM_MODE: 0x50,
    LEAVE_PROGRAM_MODE: 0x4c,
    SET_ADDRESS: 0x41,
    WRITE: 0x42, // TODO: WRITE_PAGE
    TYPE_FLASH: 0x46,
    EXIT_BOOTLOADER: 0x45,
    CR: 0x0D,
    READ_PAGE: 0x67
  };
  this.log = log;
}

AVR109Transaction.prototype = new SerialTransaction();

AVR109Transaction.prototype.magicBaudReset = function (devName, hexData) {
  var kMagicBaudRate = 1200,
      oldDevices = [],
      self = this;

  self.hexData = hexData;
  self.serial.getDevices(function(devicesArg) {
    oldDevices = devicesArg;

    self.serial.connect(devName, { bitrate: kMagicBaudRate, name: devName}, function(connectInfo) {
      log.log("Made sentinel connection:", connectInfo, "waiting 2s ...");
      setTimeout(function () {
        self.serial.disconnect(connectInfo.connectionId, function(ok) {
          if (ok) {
            log.log("Disconnected from ", devName);
            setTimeout(function () {
              self.waitForDeviceAndConnect(connectInfo, (new Date().getTime()) + 10000,
                                           self.transitionCb('connectDone'));
            }, 500);
          } else {
            self.errCb("Failed to disconnect from " + devName);
          }
        });
      }, 2000);
    });
  });
};

AVR109Transaction.prototype.flash = function (devName, hexData) {
  this.destroyOtherConnections(devName, this.transitionCb('magicBaudReset', devName, hexData));
};

// Poll for the device to reconnect.
AVR109Transaction.prototype.waitForDeviceAndConnect = function(dev, deadline, cb) {
  log.log("Waiting for new device...");
  if (new Date().getTime() > deadline) {
    log.error("Exceeded deadline");
    return;
  }

  var found = false,
      self = this;
  self.serial.getDevices(function(newDevices) {
    // XXX: Maybe name checking is not the best option
    var appeared = newDevices.filter(function (d) {return d.path == dev.name;});

    if (appeared.length == 0) {
      setTimeout(function() {
        self.waitForDeviceAndConnect(dev, deadline, cb);
      }, 100);
    } else if ((new Date().getTime()) > deadline){
      log.error("Waited too long for " + dev.name);
    } else {
      log.log("Aha! Connecting to: " + dev.name);
      self.serial.connect(dev.name, { bitrate: 57600, name: appeared[0].path }, cb);
    }
  });
};


AVR109Transaction.prototype.connectDone = function (connectArg) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    log.error("(AVR) Bad connectionId / Couldn't connect to board");
    return;
  }

  log.log("Connected to board. ID: " + connectArg.connectionId);
  this.connectionId = connectArg.connectionId;
  this.buffer.drain(this.transitionCb('drainBytes'));
};

AVR109Transaction.prototype.programmingDone = function () {
  var self = this;
  this.writeThenRead_([ this.AVR.LEAVE_PROGRAM_MODE ], 1, function(payload) {
    self.writeThenRead_([ self.AVR.EXIT_BOOTLOADER ], 1, function(payload) {
      self.serial.disconnect(self.connectionId, function (ok) {
        if (ok)
          self.finishCallback("ALL DONE");
        else
          self.errCb("Did not disconnect correctly from connection ",
                     self.connectionId);
      });
    });
  });
};

AVR109Transaction.prototype.drainBytes = function (readArg) {
  this.buffer.drain(function () {

    // Start the protocol
    this.writeThenRead_([this.AVR.SOFTWARE_VERSION], 2, this.transitionCb('prepareToProgramFlash'));
  });
};

// Program to byte 0;
AVR109Transaction.prototype.prepareToProgramFlash = function () {
  var addressBytes = buffer.storeAsTwoBytes(0),
      self = this,
      loadAddressMessage = [
        this.AVR.SET_ADDRESS, addressBytes[1], addressBytes[0]];

  this.writeThenRead_(loadAddressMessage, 1, function(response) {
    self.transition('programFlash', 0, 128);
  });
};

AVR109Transaction.prototype.programFlash = function (offset, length) {

  // Butterfly does not send addresses, just the chuncs in sequence.
  var data = this.sketchData,
      self = this;
  log.log("program flash: data.length: " + data.length + ", offset: " + offset + ", length: " + length);

  if (offset >= data.length) {
    this.transition('programmingDone');
    return;
  }

  var payload = this.padOrSlice(data, offset, length),
      sizeBytes = buffer.storeAsTwoBytes(length),
      programMessage = [
        this.AVR.WRITE, sizeBytes[0], sizeBytes[1], this.AVR.TYPE_FLASH ]
        .concat(payload);

  this.writeThenRead_(programMessage, 1, function(resp) {
    // XXX: check respeonse.
    self.transition('programFlash', data, offset + length, length);
  });
};

module.exports.AVR109Transaction = AVR109Transaction;
