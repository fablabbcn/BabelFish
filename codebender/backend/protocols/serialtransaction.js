var _create_chrome_client = require('./../../../chrome-extension/client/rpc-client'),
    Transaction = require('./../transaction').Transaction,
    arraify = require('./../util').arraify,
    buffer = require("./../buffer.js");

function SerialTransaction () {
  Transaction.apply(this, arraify(arguments));

  this.buffer = new buffer.Buffer();
  this.serial = chrome.serial;
  this.log = console;

  // XXX: Remove me at the end. Maybe this could be in the buffer.
  this.listenerHandler = this.readToBuffer.bind(this);
  this.log.log("Listening on buffer");
  this.serial.onReceive.addListener(this.listenerHandler);
}
SerialTransaction.prototype = new Transaction();

SerialTransaction.prototype.writeThenRead_ = function (outgoingMsg, responsePayloadSize, callback) {
  this.log.log("Writing: " + buffer.hexRep(outgoingMsg));
  var outgoingBinary = buffer.binToBuf(outgoingMsg),
      self = this;

  // schedule a read in 100ms
  this.serial.send(this.connectionId, outgoingBinary, function(writeArg) {
    self.consumeMessage(responsePayloadSize, callback, function (connId) {
      self.log.log("Disconnecting from", connId);

      self.serial.disconnect(connId, function (ok) {
        if (ok) {
          self.connectionId = null;
          self.log.log("Disconnected ok, You may now use your program!");
        } else
          self.log.error("Could not disconnect from " + this.connectionId);
      });
    });
  });
};

// Simply wayt for byte
SerialTransaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  throw Error("Not implemented");
};


SerialTransaction.prototype.readToBuffer = function (readArg) {
  if (this.connectionId != readArg.connectionId) {
    return true;
  }

  this.buffer.write(readArg);
  this.log.log("Received", readArg, "buffer is now", this.buffer);

  // Note that in BabelFish this does not ensure that the listener
  // stops.
  return false;
};


module.exports = SerialTransaction;
