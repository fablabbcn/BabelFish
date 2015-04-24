var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    forEachWithCallback = require('./../util').forEachWithCallback,
    MemoryOperations = require('./memops'),
    buffer = require("./../buffer"),
    errno = require("./../errno");

function SerialTransaction (config, finishCallback, errorCallback) {
  Transaction.apply(this, arraify(arguments));
  this.init();
}

SerialTransaction.prototype = new Transaction();

SerialTransaction.prototype.init = function () {
  if (Transaction.prototype.init)
    Transaction.prototype.init.apply(this, arraify(arguments, 2));

  this.buffer = new buffer.Buffer();
  this.serial = chrome.serial;

  this.serial.customErrorHandler = this.errCb.bind(this, 1);
  this.block = false;
};

// Called by the transaction cleanup
SerialTransaction.prototype.localCleanup = function (callback) {
  var self = this;

  self.serial.customErrorHandler = null;
  if (this.listenerHandler) {
    this.serial.onReceive.removeListener(this.listenerHandler);
  }

  this.listenerHandler = null;
  if (this.connectionId) {
    this.serial.disconnect(this.connectionId, function (ok) {
      if (!ok) {
        self.log.warn("Failed to disconnect (id:", self.connectionId,
                      ") during cleanup");
      }

      self.log.log("Disconnected ", self.connectionId);
      self.conenctionId = null;
      self.buffer.cleanup(callback);
    });
    return;
  }

  callback();
};

// Info is:
// - outgoingMsg: byte array
// - besides this passed as a reader config
// callback is what to do with the data
SerialTransaction.prototype.writeThenRead_ = function (info) {
  if (this.previousErrors.length > 0) {
    this.errCb(errno.ZOMBIE_TRANSACTION,
               "Transaction was stopped with errors but continues to run");
    return;
  }

  var self = this;

  self.refreshTimeout();
  if (!self.registeredBufferListener) {
    // Redirect all device output to the buffer.
    self.registeredBufferListener = true;
    this.listenerHandler = this.readToBuffer.bind(this);
    this.serial.onReceive.addListener(this.listenerHandler);
    this.log.log("Listening on buffer...");
  }

  this.justWrite(info.outgoingMsg, function () {
    self.buffer.readAsync(info);
  });
};


SerialTransaction.prototype.justWrite = function (data, cb) {
  this.log.log("Writing: " + buffer.hexRep(data));
  var dataBuf = buffer.binToBuf(data),
      self = this;

  this.serial.send(this.connectionId, dataBuf, function(writeArg) {
    if (!writeArg) self.errCb(errno.CONNECTION_LOST, "Connection lost");

    // XXX: turns out flush means tcflush not fflush, ie discard the
    // buffers, not write any pending writes. This is probably never
    // what we mean.
    if (0 && !self.config.disableFlushing)
      self.serial.flush(self.connectionId, function (ok) {
        if (!ok) {
          self.errCb(errno.FLUSH_FAIL,'Failed to flush');
          return;
        }

        cb();
      });
    else
      cb();
  });
};

SerialTransaction.prototype.readToBuffer = function (readArg) {
  if (this.connectionId != readArg.connectionId) {
    return true;
  }

  this.log.log("Read:", buffer.hexRep(buffer.bufToBin(readArg.data)));
  this.buffer.write(readArg, this.errCb.bind(this, errno.BUFFER_WRITE_FAIL));

  // Note that in BabelFish this does not ensure that the listener
  // stops.
  return false;
};

SerialTransaction.prototype.destroyOtherConnections = function (name, cb) {
  var self = this;
  this.serial.getConnections(function (cnx) {
    if (cnx.length == 0) {
      cb();
    }
    else {
      forEachWithCallback(cnx, function (c, next) {
        if (c.name != name)
          next();
        else {
          self.log.log("Closing connection ", c.connectionId);
          self.serial.flush(c.connectionId, function () {
            self.serial.disconnect(c.connectionId, function (ok) {
              if (!ok) {
                self.errCb(errno.FORCE_DISCONNECT_FAIL, "Failed to close connection ", c.connectionId);
              } else {
                self.log.log('Destroying connection:', c.connectionId);
                self.serial.onReceiveError.forceDispatch(
                  {connectionId: c.connectionId, error: "device_lost"});
                next();
              }
            });
          });
        }
      }, cb);
    }
  });
};

// Retries were introduced because in some boards if signals are set
// too soon after connection, the callback is just not called.
SerialTransaction.prototype.setDtrAndWait = function (timeout, val, cb, _retries) {
  var self = this;

  var waitTooLong = setTimeout(function () {
    if (_retries) {
      self.setDtrAndWait(timeout, val, cb, _retries-1);
      return;
    }

    self.errCb(errno.UNKNOWN_ERROR, "Waited too long to set DTR.");
  }, window.config.dtrTimeout || 500);

  self.log.log("Setting DTR/DTS to", val);
  self.serial.setControlSignals(
    self.connectionId, {dtr: val, rts: val},
    function(ok) {
      clearTimeout(waitTooLong);

      if (!ok) {
        self.errCb(errno.DTR_RTS_FAIL,"Failed to set flags");
        return;
      }
      self.log.log("DTR/RTS set to", val);
      setTimeout(cb, timeout);
    });
};

SerialTransaction.prototype.twiggleDtrMaybe = function (cb, _cbArgs) {
  var args = arraify(arguments, 1),
      self = this,
      before = false,           //AVRDUDE always disables the line
      after = !before;

  if (this.config.avoidTwiggleDTR) {
    setTimeout(cb);
    return;
  }

  // Avrdude code:
  // /* Clear DTR and RTS to unload the RESET capacitor
  //  * (for example in Arduino) */
  // serial_set_dtr_rts(&pgm->fd, 0);
  // usleep(250*1000);
  // /* Set DTR and RTS back to high */
  // serial_set_dtr_rts(&pgm->fd, 1);
  // usleep(50*1000)
  self.setDtrAndWait(this.config.twigleDtrWait, before, function () {
    self.setDtrAndWait(50, after, cb, 3);
  }, 3);
};

SerialTransaction.prototype.cmdChain = function (chain, cb) {
  if (chain.length == 0) {
    cb();
    return;
  }
  this.cmd(chain.shift(), this.cmdChain.bind(this, chain, cb));
};

module.exports = SerialTransaction;
