var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('avr109'),
    arraify = require('./../util').arraify,
    poll = require('./../util').poll,
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

  this.timeouts = {
    magicBaudConnected: 2000,
    disconnectPollCount: 30,
    disconnectPoll: 100,
    pollingForDev: 500,
    finishWait: 2000,
    finishTimeout: 2000,
    finishPollForDev: 100,
    magicRetries: 3,
    magicRetryTimeout: 1000
  };
  this.initialDev = null;
  this.log = log;
  this.magicRetries = 0;

  var oldErrCb = this.errCb,
      self = this;

  this.errCb = function (varArgs) {
    // A desperate attempt not to block the device
    if (self.connectionId) {
      log.log("Emergency exiting program mode.");
      self.serial.send(self.connectionId,
                       [self.AVR.LEAVE_PROGRAM_MODE, self.AVR.EXIT_BOOTLOADER],
                       function () {});
    } else {
      log.log("No connectionid, cannot emergency exit program mode.");
    }
    oldErrCb.apply(self, arraify(arguments));
  };
}

AVR109Transaction.prototype = new SerialTransaction();

AVR109Transaction.prototype.writeThenRead = function (data, rcvSize, cb) {
  this.writeThenRead_({outgoingMsg: data,
                       expectedBytes: rcvSize,
                       ttl: 500,
                       callback: cb,
                       timeoutCb: this.errCb.bind(this,
                                                  1, "AVR109 reader failed timeout")});
};


AVR109Transaction.prototype.magicRetry = function (devName, hexData) {
  var self = this;
  log.log("Device", devName, "did not disappear, trying again in",
          this.timeouts.magicRetryTimeout, "ms(" +
          self.magicRetries + "/" + self.timeouts.magicRetries+")");

  if (++self.magicRetries < self.timeouts.magicRetries)
    setTimeout(
      self.transitionCb('magicBaudReset', devName, hexData),
      this.timeouts.magicRetryTimeout);
};


AVR109Transaction.prototype.checkDisappearance = function (devName, connectInfo, iniDevices, next) {
  var self = this;
  this.serial.getDevices(function (disDevices) {
    log.log("To proceed looking for",devName,"not in",
            disDevices.map(function (d) {return d.path;}));

    if (disDevices.some(function (d) {return d.path == devName;})){
      log.log("Leonardo did not disappear after reset. Will poll for it");
      next();
      return;
    }

    self.transition(
      'waitForDeviceAndConnectSensible',
      connectInfo,
      iniDevices,
      disDevices,
      (new Date().getTime()) + 5000,
      (new Date().getTime()) + 10000,
      self.transitionCb('connectDone'));
  });
}


AVR109Transaction.prototype.magicBaudReset = function (devName, hexData) {
  var kMagicBaudRate = 1200,
      oldDevices = [],
      self = this;

  self.hexData = hexData;
  self.serial.getDevices(function(iniDevices) {
    self.refreshTimeout();
    self.serial.connect(devName, { bitrate: kMagicBaudRate, name: devName}, function(connectInfo) {
      log.log("Made sentinel connection: (baud: 1200)", connectInfo,
              "waiting", self.timeouts.magicBaudConnected, "ms");
      if (!connectInfo) {
        self.errCb(1, "Failed to connect with magic baud 1200");
        return;
      }

      self.initialDev = devName;
      setTimeout(function () {
        log.log("Disconnecting from " + devName);
        self.serial.disconnect(connectInfo.connectionId, function(ok) {
          if (ok) {
            log.log("Disconnected from", devName);
            poll(self.timeouts.disconnectPollCount,
                 self.timeouts.disconnectPoll,
                 self.transitionCb("checkDisappearance",
                                   devName, connectInfo, iniDevices),
                 self.transitionCb('magicRetry', devName, hexData));
          } else {
            self.errCb(1, "Failed to disconnect from " + devName);
          }
        });
      }, self.timeouts.magicBaudConnected);
    });
  });
};

AVR109Transaction.prototype.flash = function (devName, hexData, baudrate) {
  this.refreshTimeout();
  this.baudrate = baudrate;
  this.sketchData = hexData;
  this.destroyOtherConnections(
    devName,
    this.transitionCb('magicBaudReset', devName, hexData));
};

// Poll for the device to reconnect.
AVR109Transaction.prototype.waitForDeviceAndConnectSensible =
  function(dev, iniDevices, disDevices, earlyDeadline, finalDeadline, cb) {
    var found = false,
        self = this;


    if ((new Date().getTime()) > finalDeadline) {
      log.error("Waited too long for something like", dev.name);
      return;
    }


    self.serial.getDevices(function (newDevices) {
      var newNames = newDevices.map(function (d) {return d.path;}).sort(),
          oldNames = disDevices.map(function (d) {return d.path;}).sort(),
          iniNames = iniDevices.map(function (d) {return d.path;}).sort();

      // Wait for anything you have never seen before which on well
      // functioning systems (not Windows) comes from disDevices
      log.log("Waiting for reapearance");
      log.log("New devs:", newNames);
      log.log("After disconnect:", oldNames);
      log.log("Initial:", iniNames);

      function newName (ar1, ar2) {
        for (var i=0; i < ar1.length; i++) {
          if (ar2.indexOf(ar1[i]) == -1) {
            return ar1[i];
          }
        }
        return null;
      };

      var newDev = newName(newNames, oldNames) || newName(newNames, iniNames);
      if (newDev) {
        log.log("Aha! new device", newDev, "connecting (baud 57600)");
        self.refreshTimeout();
        self.serial.connect(newDev, {bitrate: self.baudrate,
                                     name: newDev}, cb);
        return;
      }

      setTimeout(function() {
        self.transition("waitForDeviceAndConnectSensible",
                        dev, iniDevices, disDevices,
                        earlyDeadline, finalDeadline, cb);
      }, self.timeouts.pollingForDev);
    });
  };

// Poll for the device to reconnect.
AVR109Transaction.prototype.waitForDeviceAndConnectArduinoIDE =
  function (dev, iniDevices, disDevices, earlyDeadline, finalDeadline, cb) {
    if (new Date().getTime() > finalDeadline) {
      log.error("Waited too long for for a port to appear");
      return;
    }

    var found = false,
        self = this,
        success = function (dev) {
          self.refreshTimeout();
          self.serial.connect(dev, {bitrate: self.baudrate,
                                    name: dev}, cb);
        };
    self.serial.getDevices(function(newDevices) {
      var newNames = newDevices.map(function (d) {return dev.name;}).sort(),
          oldNames = disDevices.map(function (d) {return dev.name;}).sort();
      log.log("Waiting for new device:", oldNames, newNames);
      // XXX: arduino ide actually does it like this but it really
      // makes absolutely no sense:
      // oldNames = iniDevices.map(function (d) {return dev.name;}).sort();

      // Python style zip
      function zip(arrays) {
        return arrays[0].map(function(_,i) {
          return arrays.map(function(array){return array[i];});
        });
      }

      var newDev = zip([newNames, oldNames]).filter(function (pair) {
        return pair[0] != pair[1];
      })[0];

      if (newDev) {
        log.log("Aha! new device", newDev[0], "connecting (baud 57600)");
        success(newDev[0]);
        return;
      }

      if ((new Date().getTime()) > earlyDeadline &&
          newNames.indexOf(dev.name) != -1) {
        log.log("Early deadline success: found original device");
        success(dev.name);
        return;
      }

      setTimeout(function() {
        self.transition("waitForDeviceAndConnectArduinoIDE",
                        dev, iniDevices, disDevices,
                        earlyDeadline, finalDeadline, cb);
      }, self.timeouts.pollingForDev);
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
  this.writeThenRead([ this.AVR.LEAVE_PROGRAM_MODE ], 1, function(payload) {
    self.writeThenRead([ self.AVR.EXIT_BOOTLOADER ], 1, function(payload) {
      self.cleanup(function () {
        setTimeout(function () {
          self.pollForInitialDevice(
            (new Date().getTime()) +
              self.timeouts.finishTimeout,
            function () {
              self.initialDev = null;
              self.finishCallback("Done programming");
            });
        }, self.timeouts.finishWait);
      });
    });
  });
};

AVR109Transaction.prototype.pollForInitialDevice = function (deadline, cb) {
  var self = this;
  if ((new Date().getTime()) > deadline) {
    self.errCb(1, "Waited too long for device ", self.initialDev, " after flashing");
    return;
  }

  self.serial.getDevices(function (devs) {
    if (!devs.some(function (d) {return d.path == self.initialDev;})) {
      log.log(self.initialDev, " not in ", devs.map(function (d) {return d.path;}));
      setTimeout (self.pollForInitialDevice.bind(self, deadline, cb),
                  self.timeouts.finishPollForDev);
    } else
      cb();
  });
};

AVR109Transaction.prototype.drainBytes = function (readArg) {
  var self = this;
  this.buffer.drain(function () {
    // Start the protocol
    self.writeThenRead([self.AVR.SOFTWARE_VERSION], 2, self.transitionCb('prepareToProgramFlash'));
  });
};

// Program to byte 0;
AVR109Transaction.prototype.prepareToProgramFlash = function () {
  var addressBytes = buffer.storeAsTwoBytes(0),
      self = this,
      loadAddressMessage = [
        this.AVR.SET_ADDRESS, addressBytes[1], addressBytes[0]];

  this.writeThenRead(loadAddressMessage, 1, function(response) {
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

  this.writeThenRead(programMessage, 1, function(resp) {
    // XXX: check respeonse.
    self.transition('programFlash', offset + length, length);
  });
};

module.exports.AVR109Transaction = AVR109Transaction;
