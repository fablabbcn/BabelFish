var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    USBTransaction = require('./usbtransaction').USBTransaction,
    util = require('./../util'),
    arraify = util.arraify,
    ops = require("./memops"),
    buffer = require("./../buffer"),
    Log = require('./../logging').Log,
    log = new Log('USBTiny');

function USBAspTransaction(config, finishCallback, errorCallback) {
  this.UA = {
    ENABLEPROG: 0x0,
    TRANSMIT: 0x0,
    GETCAPABILITIES: 0x0,
    SETLONGADDRESS: 0x0,
    READFLASH: 0x0,
    CAP_TPI: 0x01
  };
  this.cmdFunction = this.UA.TRANSMIT;
  this.entryState = 'checkCapabilities';
};

USBAspTransaction.prototype = new USBTransaction();

USBAspTransaction.prototype.checkCapabilities = function () {
  var info = this.transferIn(this.UA.GETCAPABILITIES, 0, 0, 4);

  this.writeMaybe(info, function (resp) {
    var capabilities = resp.data.reversed().reduce(function (a,b) {
      return (a << 8 | b);
    }, 0);

    if (capabilities & this.UA.CAP_TPI) {
      this.cbErr(1, "Device is tpi. We don't support that.");
      return;
    }

    setTimeout(this.transitionCb('programEnable'), 1000);
  });
};

USBAspTransaction.prototype.programEnable = function () {
  var cb, info = this.transferIn(this.UA.ENABLEPROG, 0, 0, 4);

  // If we are instructed to erse and haven't done so yet.
  if (this.config.chipErase && this.stateHistory.indexOf('chipErase') == -1)
    cb = this.transitionCb('chipErase');
  else
    cb = this.transitionCb('programPage', 0);

  this.writeMaybe(info, cb);
};

USBAspTransaction.prototype.programPage = function (offset, resp, pageCheckers) {
  var self = this,
      func = this.UA.WRITEFLASH,
      pageSize = this.config.avrdude.memory.flash.page_size,
      blockSize = this.UA.WRITEBLOCKSIZE,
      end = offset + blockSize,
      block = this.hexData.slice(offset, blockSize),
      address = offset,
      infoAddr = this.transferIn(this.UA.SETLONGADDRESS,
                                 address & 0xfff,
                                 (address >> 16) & 0xfff,
                                 4),
      flags = blockSize < block.length ? this.UA.BLOCKFLAG_LAST : 0,
      // Good luck: originally
      // cmd[0] = address & 0xFF;
      // cmd[1] = address >> 8;
      // cmd[2] = page_size & 0xFF;
      // cmd[3] = (blockflags & 0x0F) + ((page_size & 0xF00) >> 4); //TP: Mega128 fix
      infoWrite = this.transferOut(func,
                                   address & 0xfff,
                                   ((pageSize << 4) & 0xf000) |
                                   ((flags << 8) & 0xf00) |
                                   (pageSize & 0xff), block),
      infoRead = this.transferIn(func, address & 0xfff, 0, block.length());

  if (this.sckfreq_hz > 0 && this.sckfreq_hz < 10000) {
    blockSize /=  10;
  }

  if (block.empty()) {
    self.transition('checkPages', pageCheckers, self.transitionCb());
  }

  function checkPage (cb) {
    self.writeMaybe(infoAddr, function (resp) {
      self.writeMaybe(infoRead, function (resp) {
        if (!util.arrEqual(resp.data, block)) {
          self.errCb(1, "Failed page check");
          return;
        }

        cb();
      });
    });
  };

  self.writeMaybe(infoAddr, function (resp) {
    self.writeMaybe(infoWrite, function (resp) {
      self.transitionCb("programPage", end, resp, pageCheckers.concat(checkPage));
    });
  });
};


USBAspTransaction.prototype.close = function () {
  var self = this;

  this.setupSpecialBits(self.config.cleanControlBits, function () {
    self.control(self.UA.DISCONNECT, 0, 0, function () {
      self.cleanup(self.finishCallback);
    });
  });
};
