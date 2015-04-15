// Corresponding avrdude commands for leonardo:

// # generate some data
// $ for i in {0..511}; do echo $(($i % 256)); done | (while read i; do printf "\\x$(printf '%02x' $i)"; done) > /tmp/file.bin
// # Throw it in with avrdude
// $ avrdude -Cavrdude.conf -vvvv -patmega32u4 -cusbtiny -Uflash:w:"/tmp/file.bin":r
//
// The arduino wont do anything after this obviously but the pages
// should be.

// For bootloader:
//
// $ avrdude -Cavrdude.conf -vvvv -patmega32u4 -cusbtiny -e -Ulock:w:0x3F:m -Uefuse:w:0xcb:m -Uhfuse:w:0xd8:m -Ulfuse:w:0xff:m
//
// That means perform chip erase (Although I couldn't get it to work
// without it anyway)
//

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
  this.entryState = 'powerUp';
  this.cmdFunction = this.UT.SPI;
  this.device = {productId: 0xc9f, vendorId: 0x1781};
  this.log = log;
  this.log.resetTimeOffset();
}

USBTinyTransaction.prototype = new USBTransaction();


// === Initial superstate ===
// flash -> [programEnable -> chipErase ->]
//           programEnable -> <program>

USBTinyTransaction.prototype.programEnable = function () {
  var cb, self = this;

  // If we are instructed to erse and haven't done so yet.
  if (this.config.chipErase && this.stateHistory.indexOf('chipErase') == -1)
    cb = this.transitionCb('chipErase', self.transitionCb('programEnable'));
  else
    cb = this.transitionCb('programPage', 0);

  this.control(this.UT.POWERUP, this.sck, this.UT.RESET_LOW, function () {
    log.log("Powered up. Enabling...");
    self.operation("PGM_ENABLE", cb);
  });
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
                               offset, pageBin.length);

    _retries = typeof _retries === 'undefined' ?  3 : _retries;
    self.write(info, function (data) {
      log.log("Checking page [attempt:", 3 - _retries, "/", 3, "]:");
      if (!util.arrEqual(data.data, pageBin)) {
        if (_retries > 0){
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

  this.writeMaybe(info, this.transitionCb('flushPage', offset, end,
                                          (pageCheckers || []).concat([checkPage])));
};

USBTinyTransaction.prototype.flushPage = function (offset, end, pageCheckers,
                                                   ctrlArg) {
  var writePageArr = this.config.avrdude.memory.flash.memops.WRITEPAGE,
      cmd = ops.opToBin(writePageArr, {ADDRESS: offset / 2}),
      self = this;

  this.cmd(cmd, function (res) {
    if (end > self.hexData.length) {
      self.transition('checkPages', pageCheckers, self.transitionCb("powerDown"));
      return;
    }

    log.log("Progress:", end, "/", self.hexData.length);
    self.transition('programPage', end, res, pageCheckers);
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
