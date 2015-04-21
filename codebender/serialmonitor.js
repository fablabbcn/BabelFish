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
}

// - connect to open a serial monitor that behaves well with
// regard to spamming devices
// - disconnect to gracefully disconnect
// - write to send data to the device.

SerialMonitor.prototype = {
  // === API ===
  connect: function (port, baudrate, readCb, closeCb, connectedCb) {
    dbg("SerialRead connecting to port:", port);
    var self = this, closed = false;
    if (typeof baudrate !== "number") baudrate = Number(baudrate);

    function _closeCb (val) {
      // Explicitly set that for this transaction we handled the
      // closing of the device.
      closed = true;

      dbg("Serial monitor return value:", val);
      closeCb("monitor", String(val));

      self.disconnect();
    }

    this.disconnect(function () {
      self.doConnect(port, baudrate, readCb, _closeCb, connectedCb);
    });
  },

  disconnect: function (cb) {
    var self = this, callback = (cb || self.postDisconnectHook);

    if (self.readingInfo) {
      self.serial.onReceive.removeListener(self.readingInfo.handler);
      self.serial.onReceiveError.removeListener(self.readingInfo.closeHandler);

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
          callback(null, 'disconnect');
        }
      });

      // Cleanup syncrhronously
      dbg('Clearing readingInfo:', self.readingInfo.connectionId);
      self.readingInfo = null;
      return;
    }

    callback(null, 'disconnect');
  },

  reconnect: function (cb) {
    log.log("Reconnecting...");
    if (!this.readingInfo) {
      throw Error("Tried to reconnect a not-connected serial monitor.");
    }

    var self = this, connArgs = self.readingInfo.connectArgs;
    this.disconnect(function () {
      self.connect.apply(self, connArgs);
    });
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
  readingHandlerFactory: function (connectionId, readCb, closeCb) {
    var self = this,
        srh = this.singleResponseHanlder.bind(this, connectionId, readCb, closeCb);

    dbg("Reading Info:", this.readingInfo);
    if (readCb !== this.readingInfo.callbackUsedInHandler) {
      this.readingInfo.callbackUsedInHandler = readCb;
      if (this.noBurstingListener) {
        this.readingInfo.handler = srh; // For non burst mode
      } else {
        this.readingInfo.handler = function (burst) {
          if (burst instanceof Array) {
            burst.forEach(function (args) {
              srh.apply(null, args);
            });

            return;
          }

          if (typeof burst === "undefined") {
            log.warn("Old chrome app. Please update for speed.");
            self.noBurstingListener = true;
            self.reconnect();
            return;
          }

          srh(burst);
        };
      }
    }

    return this.readingInfo.handler;
  },

  spamGuard: function (closeCb) {
    // NOTE: to test this you can:
    //
    // socat PTY,link=$HOME/cu.fake PTY,link=$HOME/COM
    // sudo ln -s $HOME/cu.fake /dev/cu.fake
    // <open serial monitor>
    // i=0; sdate=$(date +%s); freq=0.1; while true; do i=$(($i+1)); if [[ $(date +%s) -ne $sdate ]]; then sdate=$(date +%s); echo "Requests/sec: $i"; fi;  echo "Hello $i" > COM2; sleep $freq; done & pid=$!; sleep 10; kill $pid
    //
    // Change the freq var to send at other frequencies.
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
      closeCb(errno.SPAMMING_DEVICE);
      return true;
    }

    return false;
  },

  _getBufferSize: function (buffer_) {
    return buffer_.reduce(function (a, b) {
      return a.length + b.length;
    });
  },


  // closeCb does the right thing (cleaning up) and baudrate is a
  // number and we are not connected at this point. Use `connect` to
  // not care about the internal state of SerialMonitor.
  doConnect: function (port, baudrate, readCb, closeCb, connectedCb) {
    var self = this, closed = false;

    // Close the monitor if the API blocks for too long.
    setTimeout(function () {
      if (!self.readingInfo && !closed) {
        closeCb(errno.UNKNOWN_MONITOR_ERROR);
      }
    }, 2000);

    // Fail if you find an open connection to our port.
    this.serial.getConnections(function (cnxs){
      if (cnxs.some(function (c) {return c.name == port;})) {
        console.error("Serial monitor connection already open.");
        closeCb(errno.RESOURCE_BUSY);
        return;
      }

      self.serial.connect(port, {bitrate: baudrate, name: port}, function (info) {
        if (!info) {
          console.error("Failed to connect serial:", {bitrate: baudrate, name: port});
          closeCb(errno.RESOURCE_BUSY);
          return;
        }

        dbg("Serial connected to: ", info);
        self.readingInfo = info;
        self.readingInfo.connectArgs = [port, baudrate, readCb, closeCb];
        var args = [self.readingHandlerFactory(self.readingInfo.connectionId,
                                               readCb, closeCb)];
        if (!self.noBurstingListener) {
          // The burst interval
          args.push(200);
        }

        self.readingInfo.closeHandler = function (err) {
          log.error("Read error:", err);
          closeCb(errno.UNKNOWN_MONITOR_ERROR);
        };

        self.serial.onReceive.addListener.apply(self.serial.onReceive, args);
        self.serial.onReceiveError.addListener(self.readingInfo.closeHandler);
        if (connectedCb) {
          connectedCb();
        }
      });
    });
  },

  bufferedSend: function (chars, cb) {
    // FIXME: if the last line does not end in a newline it should
    // be buffered
    // There are three possible issues (solutions):
    // - Output not readable if it is not delimited by new lines (new line split)
    // - Large lines creates large buffers (timeout/buffersize)
    // - Large lines are buffered for ever (timeout)
    var msgs = String.fromCharCode.apply(null, chars).split("\n"),
        buffer_head = this.readingInfo.buffer_,
        buffer_tail = this.readingInfo.buffer_.pop() || '',
        msgs_head = msgs.shift() || '',
        tail_msgs = msgs,
        self = this;


    this.readingInfo.buffer_ = buffer_head.concat([buffer_tail + msgs_head])
      .concat(tail_msgs);

    function __flushBuffer() {
      var ret = self.readingInfo.buffer_.join("\n");
      self.readingInfo.buffer_ = [];
      dbg("Flushing to serial monitor bytes: ", ret.length);
      cb("chrome-serial", ret);
    }

    if (this._getBufferSize(self.readingInfo.buffer_) > self.bufferSize) {
      console.log("SerialMonitor buffer overflow, info:", self.readingInfo);
      __flushBuffer();
      return;
    }

    setTimeout(function () {
      if (self.readingInfo && self.readingInfo.buffer_.length > 0) {
        self.readingInfo.overflowCount = 0;
        __flushBuffer();
      }
    });
  },

  singleResponseHanlder: function  (connectionId, readCb, closeCb, readArg) {
    // A message for a different connection. Ignore
    if (readArg.connectionId != connectionId) {
      return;
    }

    if (!readArg) {
      console.warn("Bad readArg from serial monitor.");
      return;
    }

    if (!this.readingInfo) {
      console.warn("Connection closed but callback not yet unregistered");
      return;
    }

    // If we use the BabelFish overloaded versions of addListener
    // we will receive an array instead of ArrayBuffer.
    var chars = readArg.data;
    if (readArg.data instanceof ArrayBuffer) {
      // If we use the raw chrome api calls we should check for a
      // spamming device.
      if (this.spamGuard(closeCb)) {
        console.warn("Spamguard blocks communication.");
        this.disconnect();
        return;
      }

      var bufferView = new Uint8Array(readArg.data);
      chars = [].slice.call(bufferView);
    }

    if (!this.readingInfo.buffer_) {
      this.readingInfo.buffer_ = [];
    }

    this.bufferedSend(chars, readCb);
  }
};

exports.SerialMonitor = SerialMonitor;
