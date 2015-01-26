// file: chrome-plugin.js

var protocols = require('./backend/protocols').protocols,
    util = require('./backend/util'),
    _create_hex_parser = require('./backend/hexparser');

var dbg = util.dbg;

dbg("Looks like we are on chrome.");

// A plugin object implementing the plugin interface.
function Plugin() {
  dbg("Initializing plugin.");
  this.serial = chrome.serial;
  var self = this;

  this.version = null;
  // this.instance_id = window.plugins_initialized++;

  this.bufferSize = 100;

  var self = this;
  // self.serial.onReceiveError.addListener(function (info) {
  //   console.warn("Failed connection: " + info.connectionId +" ( " + info.error + " )");
  //   self.serial.getConnections(function (connections) {
  //     connections.forEach(function (ci) {
  //       if (ci.connectionId == info.connectionId) {
  //         self.serial.disconnect(info.connectionId, function (ok) {
  //           if (!ok) {
  //             console.warn("Failed to disconnect serial from", info);
  //           }
  //         });
  //       }
  //     });
  //   });
  // });
  this.serial.errorHandler = function (message) {

  };
  this.readingInfo = null;

  // Change to false to provide byte arrays for flashing.
  this.binaryMode = true;

  this._rcvError = function (info) {
    if (info.connectionId == self.readingInfo.connectionId) {
      console.warn('Receive error:', info);
      self.disconnect();
    }

    if (self.transaction &&
        self.transaction.connectionId &&
        info.connectionId == self.transaction.connectionId) {
      console.warn('Receive error:', info);
      self.transaction.errCb(1, "An unknown error occured");
    }
  };
}

Plugin.prototype = {
  errorCallback:  function(from, msg, status) {
    console.error("["+ from + "] ", msg, "(status: " + status + ")");
  },

  readingHandlerFactory: function (connectionId, cb, returnCb) {
    var self = this;

    dbg("Reading Info:",this.readingInfo);
    if (cb !== this.readingInfo.callbackUsedInHandler) {
      this.readingInfo.callbackUsedInHandler = cb;

      // This will fail if:
      // - More than 3 of this are running simultaneously
      // - More than 10 sonsecutive buffer overflows occur
      this.readingInfo.handler = function (readArg) {
        if (!self.readingInfo || !readArg) {
          console.warn("Bad reading info or read arg. Tends to correct itself.");
          return;
        }
        if (readArg.connectionId != connectionId)
          return;

        var bufferView = new Uint8Array(readArg.data),
            chars = [];

        for (var i = 0; i < bufferView.length; ++i)
          chars.push(bufferView[i]);

        if (!self.readingInfo.buffer_)
          self.readingInfo.buffer_ = [];

        if (self.spamGuard(returnCb))
          return;

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
          cb("chrome-serial", ret);
        }

        if (self._getBufferSize(self.readingInfo.buffer_) > self.bufferSize) {
          console.log("Buffer overflow, info:", self.readingInfo);
          __flushBuffer();
        } else {
          setTimeout(function () {
            if (self.readingInfo && self.readingInfo.buffer_.length > 0) {
              self.readingInfo.overflowCount = 0;
              __flushBuffer();
            }
          }, 50);
        }
      }.bind(this);
    }

    return this.readingInfo.handler;
  },

  spamGuard: function (returnCb) {
    if (!Number.isInteger(this.readingInfo.samultaneousRequests))
      this.readingInfo.samultaneousRequests = 0;

    if (++this.readingInfo.samultaneousRequests > 500) {
      console.log("Too many requests, reading info:",this.readingInfo);
      // The speed of your device is too high for this serial,
      // may I suggest minicom or something. This happens if we
      // have more than 3 x 10 rps
      returnCb(3005);
      this.disconnect();
      return true;
    }

    var self = this;
    setTimeout(function () {
      if (self.readingInfo)
        self.readingInfo.samultaneousRequests--;
    }, 1000);

    return false;
  },

  _getBufferSize: function (buffer_) {
    return buffer_.reduce(function (a, b) {
      return a.length + b.length;
    });
  },

  // Async methods
  serialRead: function (port, baudrate, cb, retCb) {
    dbg("SerialRead connecting to port:", port);
    var self = this;
    if (typeof baudrate !== "number") baudrate = Number(baudrate);

    function returnCb (val) {
      retCb("monitor", String(val));
      self.disconnect();
    }

    this.serial.getConnections(function (cnxs){

      if (cnxs.some(function (c) {return c.name == port;})) {
        returnCb(-22);
        return;
      }

      self.serial.connect(port, {bitrate: baudrate, name: port}, function (info) {
        if (info) {
          dbg("Serial connected to: ", info);
          self.readingInfo = info;
          self.serial.onReceive.addListener(
            self.readingHandlerFactory(self.readingInfo.connectionId, cb, returnCb)
          );
          self.serial.onReceiveError.addListener(self._rcvError);
        } else {
          console.error("Failed to connect serial:", {bitrate: baudrate, name: port});
        }
      });
    });
  },

  doflashWithProgrammer: function (device, code, maxsize, string,
                                   programmerData, mcu, flash_callback) {
    throw Error("Not implemented");
  },

  doFlashbootloader: function (device, protocol, speed, force,
                               delay, high_fuses, low_fuses,
                               extended_fuses, unlock_bits, mcu,
                               cb) {
    // Validate the data
    // Async run doFlashWithProgrammer
    throw Error("Not implemeted");
  },

  flash: function (device,
                   code,
                   maxsize,
                   protocol,
                   disable_flushing,
                   speed,
                   mcu,
                   cb) {

    if (code.length > maxsize) {
      cb(1, "Program too large");
      return;
    }

    var from = null,
        self = this,
        config = {
          maxsize: Number(maxsize),
          protocol: protocol,
          disableFlushing: disable_flushing && disable_flushing != "false",
          speed: Number(speed),
          mcu: mcu
        },
        finishCallback = function () {
          var pluginReturnValue = 0;
          cb(from, pluginReturnValue);
          self.transaction = null;
        },
        errorCallback = function (id, msg) {
          cb(from, id);
          self.transaction = null;
        };

    // XXX: Wait for it to finish
    if(self.transaction)
      self.transaction.errCb(1, "Trying to restart flashing");

    self.transaction = new protocols[protocol](config, finishCallback, errorCallback),
    setTimeout(function () {
      dbg("Code length", code.length, typeof code,
          "Protocol:", protocols,
          "Device:", device);

      // Binary string to byte array
      if (self.binaryMode) {
        code = Base64Binary.decode(code);
        code = Array.prototype.slice.call(code);
      }

      self.transaction.flash(device, code);
    }, 0);
  },

  flashWithProgrammer: function (selectedPort,
                                 binary,
                                 maximum_size,
                                 protocol,
                                 communication,
                                 speed,
                                 force,
                                 delay,
                                 mcu,
                                 cb) {
    // XXX: first argument is from (no used)
    //      second argument is progress, currently 1 (change with actual progress)
    cb(null, 1);
  },

  // Wrongly sync methods

  // Return a string of the port list
  // XXX: this is abused by compilerflasher
  cachingGetDevices: function (cb) {
    var self = this;

    if (!self._cachedPorts) {
      this.serial.getDevices(function (devs) {
        // ULTRAHACK: If we are spammed with requests for ports
        // provide a cached version of reality updating every
        // second. This is temporaray code.
        self._cachedPorts = devs;
        cb(self._cachedPorts);

        // Clean cache in a sec
        setTimeout(function () {self._cachedPorts = null;}, 1000);
      });
    } else
      cb(self._cachedPorts);
  },

  availablePorts: function (cb) {
    this.cachingGetDevices(function (devs) {
      cb(this.pluginDevsFormat_(devs)
         .map(function (d) {return d.port;}).join(','));
    }.bind(this));
  },

  // Return json files with the prots
  getPorts: function (cb) {
    this.cachingGetDevices(function (devs) {
      cb(JSON.stringify(this.pluginDevsFormat_(devs)));
    }.bind(this));
  },

  pluginDevsFormat_: function (devs) {
    var set_ = {};
    devs.forEach(function (d) {set_[d.path] = true;});

    return Object.getOwnPropertyNames(set_).map(function (dev) {
      return {port: dev};
    });
  },

  probeUSB: function () {
    // Not used
  },

  getFlashResult: function (cb) {
    // XXX: Change: this.flashResult with actual flashResult
    this.flashResult = '';
    cb(this.flashResult);
  },

  // Inherently sync or void methods. Force is if we don't know we
  // will still be there to hear the callback.
  disconnect: function () {
    var self = this;

    if (self.readingInfo) {
      self.serial.onReceive.removeListener(self.readingInfo.handler);
      self.serial.onReceiveError.removeListener(self._rcvError);

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
    self.disconnectCallback(null, 'disconnect');
  },

  init: function (cb) {
    // Constructor did everything.
    chrome.runtime.getManifestAsync(function (manifest) {
      self.version = manifest.version;
      cb();
    });
  },

  saveToHex: function (strData) {
    console.error("Not implemented");
  },

  serialWrite: function (strData, cb) {
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

  setCallback: function (cb) {
    // Compilerflasher uses this callback to disconnect from serial monitor
    this.disconnectCallback = cb;
  },

  setErrorCallback: function (cb) {
    this.errorCallback = cb;
  },

  // Dummies for plugin garbage collection.
  deleteMap: function () {
    this.closeTab();
  },

  closeTab: function () {
    // Tab may close before the callback so do it unsafe.
    this.disconnect();

    if (self.transaction)
      self.transaction.cleanup();
  },

  // Internals
  serialMonitorSetStatus: function () {
    this.disconnect();
  }
};

CodebenderPlugin = Plugin;

module.exports = CodebenderPlugin;
