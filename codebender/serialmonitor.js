// file: chrome-plugin.js
var util = require('./backend/util'),
    errno = require('./backend/errno'),
    Log = require('./backend/logging').Log,
    log = new Log("Serial Monitor"),
    dbg = log.log.bind(log);

// Set noBurstingListener to use the vanilla chrome api whithout the
// babelfish anti-spam wrapper.
function SerialMonitor (noBurstingListener) {
  this.readingInfo = null;
  this.serial = chrome.serial;
  this.noBurstingListener = noBurstingListener;
  // Use this for post-disconnect hook
  this.postDisconnectHook = function () {};
  this._rcvError = function (info) {
    console.warn('Receive error:', info);
    if (info.connectionId == self.readingInfo.connectionId) {
      self.disconnect();
    }

    if (self.transaction &&
        self.transaction.connectionId &&
        info.connectionId == self.transaction.connectionId) {
      self.transaction.errCb(1, "An unknown error occured");
    }
  };
}

// - connect to open a serial monitor that behaves well with
// regard to spamming devices
// - disconnect to gracefully disconnect
// - write to send data to the device.

SerialMonitor.prototype = {
  // === API ===
  connect: function (port, baudrate, cb, retCb) {
    dbg("SerialRead connecting to port:", port);
    var self = this, closed = false;
    if (typeof baudrate !== "number") baudrate = Number(baudrate);

    function returnCb (val) {
      // Explicitly set that for this transaction we handled the
      // closing of the device.
      closed = true;

      dbg("Serial monitor return value:", val);
      retCb("monitor", String(val));

      self.disconnect();
    }

    setTimeout(function () {
      // Close the monitor if we couldn't open it and didn't close it
      if (!self.readingInfo && !closed) {
        returnCb(errno.UNKNOWN_MONITOR_ERROR);
      }
    }, 2000);

    this.serial.getConnections(function (cnxs){
      if (cnxs.some(function (c) {return c.name == port;})) {
        console.error("Serial monitor connection already open.");
        returnCb(errno.RESOURCE_BUSY);
        return;
      }

      self.serial.connect(port, {bitrate: baudrate, name: port}, function (info) {
        if (!info) {
          console.error("Failed to connect serial:", {bitrate: baudrate, name: port});
          returnCb(errno.RESOURCE_BUSY);
          return;
        }

        dbg("Serial connected to: ", info);
        self.readingInfo = info;
        var args = [self.readingHandlerFactory(self.readingInfo.connectionId, cb, returnCb)];
        if (!self.noBurstingListener) {
          // The burst interval
          args.push(200);
        }

        self.serial.onReceive.addListener.apply(self.serial.onReceive, args);
        self.serial.onReceiveError.addListener(self._rcvError.bind(self));
      });
    });
  },

  disconnect: function () {
    var self = this;

    if (self.readingInfo) {
      self.serial.onReceive.removeListener(self.readingInfo.handler);
      self.serial.onReceiveError.removeListener(self._rcvError.bind(self));

      var connectionId = self.readingInfo.connectionId;

      // This HAS to be synchronous. There may be no tab when this
      // ends to run the callbacks.
      self.serial.disconnect(connectionId, function (ok) {
        // Probably wont reach here anyway.
        if (!ok) {
          console.warn("Failed to disconnect: ", connectionId);
          // XXX: Maybe try again
        } else {
          dbg("Disconnected ok:", connectionId);
        }
      });

      // Cleanup syncrhronously
      dbg('Clearing readingInfo:', self.readingInfo.connectionId);
      self.readingInfo = null;
    }
    self.postDisconnectHook(null, 'disconnect');
  },

  write: function (strData, cb) {
    var self = this;

    if (this.readingInfo){
      var data = new ArrayBuffer(strData.length);
      var bufferView = new Uint8Array(data);
      for (var i = 0; i < strData.length; i++) {
        bufferView[i] = strData.charCodeAt(i);
      }

      dbg("Sending data:", bufferView, "from string:", strData);
      this.serial.send(self.readingInfo.connectionId, data, function (sendInfo){
        if (!sendInfo) {
          console.error("No connection to serial monitor");
        } else if(sendInfo.error) {
          console.error("Failed to send through",
                        self.readingInfo,":", sendInfo.error);
        }

        dbg("Sent bytes:", sendInfo.bytesSent, "connid: ");
        if (cb) cb(sendInfo.bytesSent);
      });
    }
  },


  // === Helpers ===
  readingHandlerFactory: function (connectionId, cb, returnCb) {
    var self = this;

    dbg("Reading Info:",this.readingInfo);
    if (cb !== this.readingInfo.callbackUsedInHandler) {
      // This will fail if:
      // - More than 3 of this are running simultaneously
      // - More than 10 sonsecutive buffer overflows occur
      function singleResponseHanlder (readArg) {
        if (!readArg) {
          console.warn("Bad readArg from serial monitor.");
          return;
        }

        if (!self.readingInfo) {
          console.warn("Recovering from a spamming device.");
          return;
        }

        if (readArg.connectionId != connectionId) {
          return;
        }

        // If we use the BabelFish overloaded versions of addListener
        // we will receive an array instead of ArrayBuffer.
        var chars = readArg.data;
        if (readArg.data instanceof ArrayBuffer) {
          // If we use the raw chrome api calls we should check for a
          // spamming device.
          if (self.spamGuard(returnCb)) {
            console.warn("Spamguard blocks communication.");
            return;
          }

          var bufferView = new Uint8Array(readArg.data);
          chars = [].slice.call(bufferView);
        }

        if (!self.readingInfo.buffer_) {
          self.readingInfo.buffer_ = [];
        }

        // FIXME: if the last line does not end in a newline it should
        // be buffered
        var msgs = String.fromCharCode.apply(null, chars).split("\n");
        // return cb("chrome-serial", rcv);
        // There are three possible issues (solutions):
        // - Output not readable if it is not delimited by new lines (new line split)
        // - Large lines creates large buffers (timeout/buffersize)
        // - Large lines are buffered for ever (timeout)

        // self.readingInfo.buffer_ = self.readingInfo.buffer_.concat(msgs);
        var buffer_head = self.readingInfo.buffer_;
        var buffer_tail = self.readingInfo.buffer_.pop() || '';
        var msgs_head = msgs.shift() || '';
        var tail_msgs = msgs;
        self.readingInfo.buffer_ = buffer_head.concat([buffer_tail + msgs_head])
          .concat(tail_msgs);

        function __flushBuffer() {
          var ret = self.readingInfo.buffer_.join("\n");
          self.readingInfo.buffer_ = [];
          dbg("Flushing to serial monitor bytes: ", ret.length);
          cb("chrome-serial", ret);
        }

        if (self._getBufferSize(self.readingInfo.buffer_) > self.bufferSize) {
          console.log("SerialMonitor buffer overflow, info:", self.readingInfo);
          __flushBuffer();
          return;
        }

        setTimeout(function () {
          if (self.readingInfo && self.readingInfo.buffer_.length > 0) {
            self.readingInfo.overflowCount = 0;
            __flushBuffer();
          }
        }, 50);
      };

      this.readingInfo.callbackUsedInHandler = cb;
      if (this.noBurstingListener) {
        this.readingInfo.handler = singleResponseHanlder; // For non burst mode
      } else {
        this.readingInfo.handler = function (burst) {
          burst.forEach(function (args) {
            singleResponseHanlder.apply(null, args);
          });
        };
      }
    }

    return this.readingInfo.handler;
  },

  // Deprecated: Return true if this method is spammed.
  spamGuard: function (returnCb) {

    // NOTE: to test this you can:
    //
    // socat PTY,link=$HOME/cu.fake PTY,link=$HOME/COM
    // sudo ln -s $HOME/cu.fake /dev/cu.fake
    // <open serial monitor>
    // for i in {0..1000}; do echo $i > COM; sleep 0.01; done
    //
    // Watch the serial monitro go bananas
    //
    if (!Number.isInteger(this.readingInfo.samultaneousRequests)) {
      this.readingInfo.samultaneousRequests = 0;
    }

    var self = this;
    setTimeout(function () {
      if (self.readingInfo) {
        self.readingInfo.samultaneousRequests--;
      }
    }, 1000);

    if (++this.readingInfo.samultaneousRequests > 500) { //This is the requests/sec
      console.log("Too many requests, reading info:",this.readingInfo);
      // The speed of your device is too high for this serial,
      // may I suggest minicom or something. This happens if we
      // have more than 3 x 10 rps
      this.disconnect();
      returnCb(errno.SPAMMING_DEVICE);
      return true;
    }

    return false;
  },

  _getBufferSize: function (buffer_) {
    return buffer_.reduce(function (a, b) {
      return a.length + b.length;
    });
  }
};

exports.SerialMonitor = SerialMonitor;
