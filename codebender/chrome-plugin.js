// file: chrome-plugin.js
var protocols = require('./backend/protocols').protocols,
    util = require('./backend/util'),
    hexutil = require('./backend/hexparser'),
    avrdudeconf = require('./backend/avrdudeconf'),
    errno = require('./backend/errno'),
    dbg = util.dbg,
    SerialMonitor = require('./serialmonitor').SerialMonitor;

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

  this.serialMonitor = new SerialMonitor();
  this.serial.errorHandler = function (message) {
  };
  this.readingInfo = null;

  // Change to false to provide byte arrays for flashing.
  this.binaryMode = true;
}

Plugin.prototype = {
  errorCallback:  function(from, msg, status) {
    console.error("["+ from + "] ", msg, "(status: " + status + ")");
  },

  // Async methods
  serialRead: function (port, baudrate, cb, retCb) {
    this.serialMonitor.connect(port, baudrate, cb, retCb);
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


  flashWithProgrammer: function (device, code, maxsize, protocol,
                                 communication, speed, force, delay,
                                 mcu, cb, _extraConfig) {
    var extraConfig = util.merge(_extraConfig || {},
                                 {avoidTwiggleDTR: true, confirmPages: true,
                                  readSwVersion: true,
                                  chipErase: true,
                                  dryRun: window.dryRun});

    // XXX: maybe fail if this is not a programmer.
    this.flash(device, code, maxsize, protocol, false, speed, mcu, cb,
               extraConfig);
  },

  // General purpose flashing. User facing for serial flash. The
  // _extraConfig property is for internal use
  flash: function (device, code, maxsize, protocol, disable_flushing,
                   speed, mcu, cb, _extraConfig) {

    // If maxsize is not provided god with us.
    if (maxsize && code.length > maxsize) {
      dbg("Program too large (" + code.length + ">"+ maxsize + ")");
      cb(null, errno.PROGRAM_TOO_LARGE);
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

  probeUSB: function (cb) {
    this.availablePorts(cb);
  },

  getFlashResult: function (cb) {
    // XXX: Change: this.flashResult with actual flashResult
    this.flashResult = '';
    cb(this.flashResult);
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
    this.serialMonitor.write(strData, cb);
  },

  setCallback: function (cb) {
    // Compilerflasher uses this callback to disconnect from serial monitor
    this.serialMonitor.postDisconnectHook = cb;
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
    this.serialMonitor.disconnect();

    if (self.transaction)
      self.transaction.cleanup();
  },

  // Internals
  serialMonitorSetStatus: function () {
    this.serialMonitor.disconnect();
  },

  saveToHex: function (hexString) {
    // Parse hex into a byte array and flash should be smart enough to
    // recognize a byte array.
    this.savedBlob = hexutil.ParseHexFile(hexString);
  }
};

CodebenderPlugin = Plugin;

module.exports = CodebenderPlugin;
