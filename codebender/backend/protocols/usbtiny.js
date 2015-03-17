// Corresponding avrdude commands for leonardo:

// $ avrdude -Cavrdude.conf -v -v -v -v -patmega32u4 -cusbtiny -Uflash:w:"/home/fakedrake/.mozilla/firefox/c9s245o7.default/extensions/codebender@codebender.cc/plugins/file.bin":r

var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    USBTransaction = require('./usbtransaction').USBTransaction,
    util = require('./../util'),
    arraify = util.arraify,
    ops = require("./memops"),
    buffer = require("./../buffer"),
    Log = require('./../logging').Log,
    log = new Log('USBTiny');

function USBTinyTransaction(config, finishCallback, errorCallback) {
  USBTransaction.apply(this, arraify(arguments));
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
  this.log = log;
  this.log.resetTimeOffset();
}

USBTinyTransaction.prototype = new USBTransaction();

USBTinyTransaction.prototype.cmd = function (cmd, cb) {

  var info = this.transferIn(this.UT.SPI,
                             (cmd[1] << 8) | cmd[0],
                             (cmd[3] << 8) | cmd[2],
                             4);

  this.write(info, function (resp) {
    log.log("CMD:", buffer.hexRep(cmd), buffer.hexRep(resp.data));
    cb(resp);
  });
};

// === Initial superstate ===
// flash -> [powerUp -> programEnable -> chipErase -> setFuses ->]
//          powerUp -> programEnable -> <program>

// First argument is ignored for compatibility with serial flashes tha
// accept the device name.
USBTinyTransaction.prototype.flash = function (_, hexData) {
  var self = this;
  this.hexData = hexData.data || hexData;

  self.usb.getDevices(self.device, function (devs) {
    if (devs.length == 0) {
      self.errCb(1, "No devices found");
      return;
    }

    var dev = devs.pop();

    // Config 0 is invalid generally but due to the strangenes that is
    // windows and mac we need to default somewhere.
    self.usb.openDevice(dev,function (hndl) {
      self.usb.setConfiguration(hndl, 1, function () {
        self.handler = hndl;
        self.transition('powerUp');
      });
    });
  });
};

// The callback to use to program(it may be chipErase)
USBTinyTransaction.prototype.powerUp = function () {
  log.log("Powering up:", this.handler);
  this.control(this.UT.POWERUP, this.sck, this.UT.RESET_LOW,
               this.transitionCb('programEnable'));
};

USBTinyTransaction.prototype.programEnable = function () {
  var cb;

  // If we are instructed to erse and haven't done so yet.
  if (this.config.chipErase && this.stateHistory.indexOf('chipErase') == -1)
    cb = this.transitionCb('chipErase');
  else
    cb = this.transitionCb('programPage', 0);

  this.operation("PGM_ENABLE", cb);
};

USBTinyTransaction.prototype.setFuses = function () {
  this.setupSpecialBits(this.config.controlBits,
                        this.transitionCb('powerUp'));
};

// Chip erase destroys the flash, the lock bits and maybe the eeprom
// (depending on the value of the fuses). The fuses themselves are
// untouched.
USBTinyTransaction.prototype.chipErase = function () {
  var self = this;

  setTimeout(function () {
    self.operation("CHIP_ERASE", self.transitionCb('setFuses'));
  }, self.config.avrdude.chipEraseDelay / 1000);
};

// === Programming superstate ===
USBTinyTransaction.prototype.programPage = function (offset, resp, pageCheckers) {
  var self = this,
      page = this.config.avrdude.memory.flash.page_size,
      end = offset + page,
      pageBin = this.hexData.slice(offset, end),
      info = this.transferOut(this.UT.FLASH_WRITE, 0,
                              offset, pageBin);

  function checkPage (cb, _retries) {
    var info = self.transferIn(self.UT.FLASH_READ, 0,
                               offset, page);

    _retries = _retries || 3;
    self.write(info, function (data) {
      log.log("Comparing:", data.data, pageBin);
      if (!util.arrEqual(data.data, pageBin)) {
        if (_retries > 1){
          checkPage(cb, _retries - 1);
          return;
        } else{
          // Should we try to rewrite it?
          self.errCb(1, "Page check at", offset, "failed");
          return;
        }
      }

      cb();
    });
  }

  this.write(info, this.transitionCb('flushPage', offset, end,
                                     (pageCheckers || []).concat([checkPage])));
};

USBTinyTransaction.prototype.flushPage = function (offset, end, pageCheckers,
                                                   ctrlArg) {
  var writePageArr = this.config.avrdude.memory.flash.memops.WRITEPAGE,
      cmd = ops.opToBin(writePageArr, {ADDRESS: offset / 2}),
      self = this;

  this.cmd(cmd, function (res) {
    if (end > self.hexData.length) {
      self.transition('checkPages', pageCheckers);
      return;
    }

    log.log("Progress:", end, "/", self.hexData.length);
    self.transition('programPage', end, res, pageCheckers);
  });
};

// Just chain the checkers. As a thought experiment we could have them
// run in parallel and have a barrier function as a callback to call
// the checkPages. This way we could be comparing
USBTinyTransaction.prototype.checkPages = function (checkers) {
  if (checkers.length == 0) {
    this.transition("powerDown");
    return;
  }

  var car = checkers[0],
      cdr = checkers.slice(1),
      self = this;

  car(function () {
    self.transition("checkPages", cdr);
  });

};

// === Final superstate

USBTinyTransaction.prototype.powerDown = function () {
  var self = this;

  this.setupSpecialBits(self.config.cleanControlBits, function () {
    self.control(self.UT.POWERDOWN, 0, 0,
                 self.transitionCb('endTransaction'));
  });
};

USBTinyTransaction.prototype.endTransaction = function (ctrlArg) {
  var self = this;
  this.cleanup(this.finishCallback);
};

module.exports.USBTinyTransaction = USBTinyTransaction;
