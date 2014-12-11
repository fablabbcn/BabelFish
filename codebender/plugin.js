var protocols = require('./backend/protocols').protocols,
    _create_chrome_client = require('./../chrome-extension/client/rpc-client'),
    _create_hex_parser = require('./backend/hexparser');

var dbg = (function  () {
  var DEBUG = false;
  if (DEBUG)
    return function (var_args) {
      console.log.apply(console, Array.prototype.slice.call(arguments));
    };
  else
    return function () {};
})();

// XXX: Use lawnchair for this.
window.plugins_initialized = 0;

if (!chrome.serial) {
  dbg("Not on chrome");
  function PluginPropertyDescriptor(pluginElement, prop) {
    var desc = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(pluginElement), prop);

    // Be careful not to evaluate any pluginproperties. Some may have
    // side effects
    if (desc)
      Object.getOwnPropertyNames(desc).forEach(function (pp) {
        if (pp != "value" && true) {
          console.log(prop + '[' + pp + ']');
          this[pp] = pluginElement[pp];
        }
      });
    else
      throw Error("Could not determine property descruptor of plugin property '"
                  + prop);

    this.get = function () {return pluginElement[prop];};
    this.set = function (val) {pluginElement[prop] = val;};
  }

  function prototypeProperties(obj) {
    return Object.getOwnPropertyNames(Object.getPrototypeOf(obj));
  }

  // Copy the plugin interfacez
  function Plugin() {
    // Note that this has typeof 'function' on firefox because it
    // implements [[Call]]
    this.element_ = document.createElement("object");
    this.element_.setAttribute("type", "application/x-codebendercc");
    this.element_.setAttribute("width", "0");
    this.element_.setAttribute("height", "0");
    this.element_.setAttribute("xmlns", "http://www.w3.org/1999/html");

    document.body.appendChild(this.element_);
    this.element_.setAttribute("id", this.element_.instanceId);

    prototypeProperties(this.element_).forEach( function (attr) {
      if (typeof this.element_[attr] == 'function') {
        this[attr] = function () {
          var args = Array.prototype.slice.call(arguments);
          return this.element_[attr].apply(this.element_, args);
        }.bind(this);
      } else {
        var descr = new PluginPropertyDescriptor(this.element_, attr);
        Object.defineProperty(this, attr, descr);
      }
    }.bind(this) );

    if (this.init)
      this.init();
    else
      throw Error("Codebendercc plugin not available");
  }
} else {
  dbg("Looks like we are on chrome.");

  // A plugin object implementing the plugin interface.
  function Plugin() {
    dbg("Initializing plugin.");
    this.serial = chrome.serial;
    this.version = "1.6.0.8";
    this.instance_id = window.plugins_initialized++;

    this.bufferSize = 100;

    var self = this;
    self.serial.onReceiveError.addListener(function (info) {
      console.error("Failed connection: " + info.connectionId +" ( " + info.error + " )");
      self.serial.getConnections(function (connections) {
        connections.forEach(function (ci) {
          if (ci.connectionId == info.connectionId) {
            self.serial.disconnect(info.connectionId, function (ok) {
              if (!ok) {
                console.error("Failed to disconnect serial from", info);
              }
            });
          }
        });
      });
    });
    this.errorCallback = function () {};
    this.readingInfo = null;
  }
  Plugin.prototype = {
    errorCallback:  function(from, msg, status) {
      console.error("["+ from + "] ", msg, "(status: " + status + ")");
    },

    readingHandlerFactory: function (connectionId, cb) {
      dbg("Reading Info:",this.readingInfo);
      if (cb !== this.readingInfo.callbackUsedInHandler) {
        this.readingInfo.callbackUsedInHandler = cb;
        this.readingInfo.handler = function (readArg) {
          if (readArg.connectionId != connectionId)
            return;

          var bufferView = new Uint8Array(readArg.data),
              chars = [];

          for (var i = 0; i < bufferView.length; ++i) {
            chars.push(bufferView[i]);
          }

          // FIXME: if the last line does not end in a newline it should
          // be buffered
          var msgs = String.fromCharCode.apply(null, chars).split("\n");
          console.log("Bytes received:", readArg.data.length);
          // return cb("chrome-serial", rcv);
          // XXX: This is a bit hacky but it should work.
          // If we have complete messages or if the message so far is too large
          this.readingInfo.buffer_ = this.readingInfo.buffer_ || "";
          if (msgs.length > 1 ||
              (this.readingInfo.buffer_ + msgs[0]).length > this.bufferSize) {
            msgs[0] = this.readingInfo.buffer_ + msgs[0];
            this.readingInfo.buffer_ = "";
            cb("chrome-serial", msgs.join("\n"));
          } else {
            this.readingInfo.buffer_ += msgs[0];
            setTimeout(function () {
              cb("chrome-serial", this.readingInfo.buffer_);
              this.readingInfo.buffer_ = "";
            }.bind(this), 200);
          }
        }.bind(this);
      }

      return this.readingInfo.handler;
    },

    // Async methods
    serialRead: function (port, baudrate, cb, valCb) {
      console.log("SerialRead connecting to port:", port);
      var self = this;
      if (typeof baudrate !== "number") baudrate = Number(baudrate);

      this.serial.connect(port, {bitrate: baudrate, name: port}, function (info) {
        if (info) {
          console.log("Serial connected to: ", info);
          self.readingInfo = info;
          self.serial.onReceive.addListener(
            self.readingHandlerFactory(self.readingInfo.connectionId, cb));
        } else {
          throw Error("Failed to connect serial:", {bitrate: baudrate, name: port});
        }
      });
    },

    // Disconnect all chrome's connections.
    disconnectAll: function () {
      this.serial.getConnections(function (cons) {
        this.serial.disconnect(cons[0].connectionID, this.disconnectAll.bind(this));
      });
    },


    doflashWithProgrammer: function (device, code, maxsize, string,
                                     programmerData, mcu, flash_callback) {

    },

    doFlashbootloader: function (device, protocol, speed, force,
                                 delay, high_fuses, low_fuses,
                                 extended_fuses, unlock_bits, mcu,
                                 cb) {
      // Validate the data
      // Async run doFlashWithProgrammer
    },

    flash: function (device,
                     code,
                     maxsize,
                     protocol,
                     disable_flushing,
                     speed,
                     mcu,
                     cb) {

      var transaction = new protocols[protocol]();
      setTimeout(function () {
        console.log("Code length", code.length, typeof code,
                    "Protocol:", protocols,
                    "Device:", device);

        // STK500v1
        transaction.flash(device, code);
      }, 0);
    },

    // Wrongly sync methods

    // Return a string of the port list
    availablePorts: function (cb) {
      this.serial.getDevices(function (devs) {
        cb(this.pluginDevsFormat_(devs).map(function (d) {return d.port;}).join(','));
      }.bind(this));
    },

    // Return json files with the prots
    getPorts: function (cb) {
      this.serial.getDevices(function (devs) {
        cb(this.pluginDevsFormat_(devs));
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

    // Inherently sync or void methods. Force is if we don't know we
    // will still be there to hear the callback.
    disconnect: function (force) {
      if (this.readingInfo) {
        var self = this;

        function unsafeCleanReadingInfo () {
          self.serial.onReceive.removeListener(self.readingInfo.handler);
          self.serial.disconnect(self.readingInfo.connectionId, function (ok) {
            if (!ok) {
              throw Error("Failed to disconnect from ", self.readingInfo);
              // XXX: Maybe try again
            } else {
              dbg("Diconnected ok:", self.readingInfo);
            }
          });

          // Cleanup syncrhronously
          self.readingInfo = null;
        }

        if (force)
          unsafeCleanReadingInfo();
        else
          self.serial.getConnections(function (cnxs) {
            cnxs.forEach(function (cnx) {
              if (cnx.connectionId != self.readingInfo.connectionId)
                return;

              unsafeCleanReadingInfo();
            });
          });
      }
    },

    init: function () {
      // Constructor did everything.
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

        console.log("Sending data:", data[0], "from string:", strData);
        this.serial.send(this.readingInfo.connectionId, data, function (sendInfo){
          if (sendInfo.error) {
            throw Error("Failed to send through",
                        self.readingInfo,":", sendInfo.error);
          }

          console.log("Sent bytes:", sendInfo.bytesSent, "connid: ");
          if (cb) cb(sendInfo.bytesSent);
        });
      }
    },

    setCallback: function (cb) {
      this.callback = cb;
    },

    setErrorCallback: function (cb) {
      this.errorCallback = cb;
    },

    // Dummies for plugin garbage collection.
    deleteMap: function () {},
    closeTab: function () {
      // Tab may close before the callback so do it unsafe.
      this.disconnect(true);
    },

    // Internals
    serialMonitorSetStatus: function () {
      this.disconnect();
    }
  };
  window.CodebenderPlugin = Plugin;
}

function ReadHandler () {
  this.readers = {};
}

ReadHandler.prototype = {
  reader: function (dev, cb) {
  },

  stopAllReaders: function () {}
};
