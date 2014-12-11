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

AVR109Transaction.prototype.flash = function (devName, hexData) {
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
            throw Error("Failed to disconnect from " + devName);
          }
        });
      }, 2000);
    });
  });
};

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
  this.buffer.read(1024, this.transitionCb('drainedBytes'));
};

AVR109Transaction.prototype.gotVersion = function (version) {
  log.log("Got version: ", version);
  this.transition('prepareToProgramFlash');
};

AVR109Transaction.prototype.programmingDone = function () {
  var self = this;

  log.log("avrProgrammingDone");
  this.writeThenRead_([ this.AVR.LEAVE_PROGRAM_MODE ], 1, function(payload) {
    self.writeThenRead_([ self.AVR.EXIT_BOOTLOADER ], 1, function(payload) {
      self.serial.disconnect(self.connectionId, function (ok) {
        if (ok)
          log.log("ALL DONE");
        else
          throw Error("Did not disconnect correctly from connection ",
                      self.connectionId);
      });
    });
  });
}

AVR109Transaction.prototype.drainedAgain = function (readArg) {
  log.log("drainedAgain(", readArg ,")");
  log.log("DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    this.buffer.read(1024, self.transitionCb('drainedBytes'));
  } else {
    // Start the protocol
    this.writeThenRead_([this.AVR.SOFTWARE_VERSION], 2, this.transitionCb('gotVersion'));
  }
}

AVR109Transaction.prototype.drainedBytes = function (readArg) {
  log.log("DRAINED " + readArg.bytesRead + " BYTES on " + this.connectionId);
  if (readArg.bytesRead == 1024) {
    // keep draining
    this.buffer.read(1024, this.transitionCb('drainedBytes'));
  } else {
    var self = this;
    setTimeout(function() { self.transition('dtrSent', true);}, 1000);
  }
}

AVR109Transaction.prototype.dtrSent = function (ok) {
  if (!ok) {
    log.error("Couldn't send DTR");
    return;
  }
  log.log("DTR sent (low) real good on connection: " + this.connectionId);

  this.buffer.read(1024, this.transitionCb('drainedAgain'));
}

AVR109Transaction.prototype.prepareToProgramFlash = function () {
  var addressBytes = buffer.storeAsTwoBytes(0),
      self = this,
      loadAddressMessage = [
        this.AVR.SET_ADDRESS, addressBytes[1], addressBytes[0]];

  this.writeThenRead_(loadAddressMessage, 1, function(response) {
    self.transition('programFlash', self.hexData, 0, 128);
  });
};

AVR109Transaction.prototype.programFlash = function (data, offset, length) {
  log.log("program flash: data.length: " + data.length + ", offset: " + offset + ", length: " + length);
  var payload;

  if (offset >= data.length) {
    log.log("Done programming flash");
    this.transition('programmingDone');
    return;
  }

  if (offset + length > data.length) {
    log.log("Grabbing bytes " + offset + " to " +
            data.length + " bytes would go past the end.");
    payload = data.slice(offset, data.length);
    var padSize = length - payload.length;
    log.log("Padding " + padSize + " 0 byte at the end");
    for (var i = 0; i < padSize; ++i) {
      payload.push(0);
    }
  } else {
    log.log("Grabbing bytes: " + offset + " until " + (offset + length));
    payload = data.slice(offset, offset + length);
  }

  var sizeBytes = buffer.storeAsTwoBytes(length),
      programMessage = [
        this.AVR.WRITE, sizeBytes[0], sizeBytes[1], this.AVR.TYPE_FLASH ];
  programMessage = programMessage.concat(payload);

  var self = this;
  this.writeThenRead_(programMessage, 1, function(resp) {
    // XXX: check respeonse.
    self.transition('programFlash', data, offset + length, length);
  });
}


// Simply wayt for byte
SerialTransaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  // Hide the strange arguments.
  this.waitForBytes(payloadSize, [], (new Date().getTime()) + 1000, callback);
};

AVR109Transaction.prototype.waitForBytes = function (n, accum, deadline, callback) {
  var self = this;

  if (new Date().getTime() > deadline) {
    log.error("Deadline passed while waiting for " + n + " bytes");
    return;
  }
  log.log("Waiting for", n, "bytes");

  var handler = function(readArg) {
    var hexData = buffer.bufToBin(readArg.data);
    for (var i = 0; i < hexData.length; ++i) {
      accum.push(hexData[i]);
      n--;
    }

    if (n < 0) {
      log.error("Read too many bytes !?");
    } else if (n == 0) {
      log.log("Response (remaining bytes:", n, "):", buffer.hexRep(accum));
      log.log("Callback:", callback);
      callback(accum);
    } else { // still want more data
      setTimeout(function() {
        self.waitForBytes(n, accum, deadline, callback);
      }, 50);
      // TODO: deadline?
    }
  };

  self.buffer.read(n, handler);
};

module.exports.AVR109Transaction = AVR109Transaction;
