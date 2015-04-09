// file: chrome-plugin.js

var protocols = require('./backend/protocols').protocols,
    util = require('./backend/util'),
    hexutil = require('./backend/hexparser'),
    avrdudeconf = require('./backend/avrdudeconf'),
    errno = require('./backend/errno');

var dbg = util.dbg;

dbg("Looks like we are on chrome.");

// A plugin object implementing the plugin interface.
function Plugin() {
  dbg("Initializing plugin.");
  window.debugBabelfish = false;
  this.serial = chrome.serial;
  var self = this;

  // Inclusive range of return values that are logged as wanrings.
  this.warningReturnValueRange = [20500, 21000];
  this.version = null;
  // this.instance_id = window.plugins_initialized++;

  this.bufferSize = 100;

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
        if (!self.readingInfo) {
          console.warn("Recovering from a spamming device.");
          return;
        }

        if (!readArg) {
          console.warn("Bad readArg from serial monitor.");
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
          return;
        }

        setTimeout(function () {
          if (self.readingInfo && self.readingInfo.buffer_.length > 0) {
            self.readingInfo.overflowCount = 0;
            __flushBuffer();
          }
        }, 50);
      }.bind(this);
    }

    return this.readingInfo.handler;
  },

  spamGuard: function (returnCb) {
    if (!Number.isInteger(this.readingInfo.samultaneousRequests))
      this.readingInfo.samultaneousRequests = 0;

    if (++this.readingInfo.samultaneousRequests > 50) {
      console.log("Too many requests, reading info:",this.readingInfo);
      // The speed of your device is too high for this serial,
      // may I suggest minicom or something. This happens if we
      // have more than 3 x 10 rps
      this.disconnect();
      returnCb(errno.SPAMMING_DEVICE);
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
        self.serial.onReceive.addListener(
          self.readingHandlerFactory(self.readingInfo.connectionId, cb, returnCb)
        );
        self.serial.onReceiveError.addListener(self._rcvError);
      });
    });
  },

  flashWithProgrammer: function (device, code, maxsize, protocol,
                                 communication, speed, force, delay,
                                 mcu, cb, _extraConfig) {
    var extraConfig = util.merge(_extraConfig || {},
                                 {avoidTwiggleDTR: true, confirmPages: true,
                                  chipErase: true,
                                  dryRun: window.dryRun});

    // XXX: maybe fail if this is not a programmer.
    this.flash(device, code, maxsize, protocol, false, speed, mcu, cb,
               extraConfig);
  },

  flashBootloader: function (device, protocol, communication, speed, force,
                             delay, high_fuses, low_fuses,
                             extended_fuses, unlock_bits, lock_bits, mcu,
                             cb, _extraConfig) {
    // Validate the data
    // Async run doFlashWithProgrammer

    function toint(hex) {
      return hex ? Number.parseInt(hex.substring(2), 16) : null;
    }

    // controlBits are the state of the control bits during th
    // bootloader flashing and the clearControlBits are the state of
    // the control bits after the flash.
    var _ = null,          //Dont care values
        controlBits = {
          lfuse: toint(low_fuses),
          efuse: toint(extended_fuses),
          lock: toint(unlock_bits),
          hfuse: toint(high_fuses)
        },
        extraConfig = util.merge(_extraConfig || {},
                                 {controlBits: controlBits,
                                  cleanControlBits: {lock: toint(lock_bits)},
                                  chipErase: true,
                                  offset: this.savedBlob.addr});

    this.flashWithProgrammer(device, this.savedBlob.data, _, protocol,
                             communication, speed, force, delay, mcu,
                             cb, extraConfig);
  },

  // General purpose flashing. User facing for serial flash. The
  // _extraConfig property is for internal use
  flash: function (device, code, maxsize, protocol, disable_flushing,
                   speed, mcu, cb, _extraConfig) {

    // If maxsize is not provided god with us.
    if (maxsize && code.length > maxsize) {
      cb(1, "Program too large (" + code.length + ">"+ maxsize + ")");
      return;
    }

    var from = null,
        self = this,
        config = {
          maxsize: Number(maxsize),
          protocol: protocol,
          disableFlushing: disable_flushing && disable_flushing != "false",
          speed: Number(speed),
          mcu: mcu,
          avrdude: avrdudeconf.getMCUConf(mcu)
        },
        finishCallback = function () {
          var pluginReturnValue = 0;
          cb(from, pluginReturnValue);
          self.transaction = null;
        },

        errorCallback = function (id, msg) {
          setTimeout(function () {
            self.transaction = null;
            // Error callback accepts (from, message, status (0->error, 1->warning))
            // Make this always be an error
            var warnOrError = (id >= self.warningReturnValueRange[0] &&
                               id <= self.warningReturnValueRange[1]) ? 1: 0;

            self.errorCallback("extension-client", msg, warnOrError);
          });
          cb(from, id);
          self.transaction = null;
        };

    // Override or add properties.
    Object.getOwnPropertyNames(_extraConfig || {}).forEach(function (key) {
      config[key] = _extraConfig[key];
    });
    config.confirmPages = true;

    // XXX: Wait for it to finish?
    if(self.transaction)
      self.transaction.cleanup();

    self.transaction = new protocols[protocol](config, finishCallback,
                                               errorCallback);

    self.transaction.destroyOtherConnections(
      device,
      function () {
        dbg("Code length", code.length || code.data.length, typeof code,
            "Protocol:", protocols,
            "Device:", device);

        // Binary string to byte array if it is actually base64
        if (self.binaryMode && typeof code === 'string') {
          var _code = Base64Binary.decode(code);
          code = {data: Array.prototype.slice.call(_code), addr: 0};
        }

        self.transaction.flash(device, code);
      });
  },


  // Return a string of the port list
  // XXX: this is abused by compilerflasher
  cachingGetDevices: function (cb) {
    var self = this;
    // ULTRAHACK: If we are spammed with requests for ports
    // provide a cached version of reality updating every
    // second. This is temporaray code.
    if (!self._cachedPorts) {
      this.serial.getDevices(function (devs) {
        var devUniquify = {};

        devs.forEach(function (d) {
          // On macs we have duplicate devs with s/cu/tty/.
          var trueDevName = d.path.replace("/dev/tty.", "/dev/cu.");
          if (!devUniquify[trueDevName] ||
              d.path == trueDevName)
            devUniquify[trueDevName] = d;
        });

        self._cachedPorts = Object
          .getOwnPropertyNames(devUniquify)
          .map(function (k) {
            return devUniquify[k];
          });
        cb(self._cachedPorts);

        // Clean cache in a sec
        setTimeout(function () {self._cachedPorts = null;}, 1000);
      });

      return;
    }

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
    this.availablePorts(cb);
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

  getVersion: function (cb) {
    var self = this;
    chrome.runtime.getManifestAsync(function (manifest) {
      self.version = manifest.version;
      cb(self.version);
    });
  },

  init: function (cb) {
    cb();
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
    return true;
  },

  setErrorCallback: function (cb) {
    this.errorCallback = cb;
    return true;
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
  },

  saveToHex: function (hexString) {
    // Parse hex into a byte array and flash should be smart enough to
    // recognize a byte array.
    this.savedBlob = hexutil.ParseHexFile(hexString);
  }
};

CodebenderPlugin = Plugin;

module.exports = CodebenderPlugin;
