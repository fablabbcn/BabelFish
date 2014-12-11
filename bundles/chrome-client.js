(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"/Users/drninjabatman/Projects/Codebendercc/BabelFish/chrome-extension/client/rpc-client.js":[function(require,module,exports){
// File: /chrome-extension/client/rpc-client.js

// XXX: move cleaner/listener management code to common.

if (!chrome) {
  throw Error("This doesn't seem to be chrome. No chorme obj.");
}

(function () {
  var config = require('./../common/config'),
      util = require('./../../tools/client-util'),
      rargs = require('./../common/rpc-args'),
      str = util.str,
      argsEncode = rargs.argsEncode,
      argsDecode = rargs.argsDecode;

  if (!window._rpcSender) window._rpcSender = (new Date).getTime();

  // Notably insupported stuff:
  //
  // - Callbacks not to be called at the very end of the rpc
  // - Return values. Most chromecalls use callbacks anyway.
  //
  // RPC is:
  // - timestamp
  // - method: method name, may be a dot path
  // - object: object name
  // - args: argumet list
  // - error
  // Resp:
  // - args: callback arguments
  // - ret: return value (not implemented)
  //
  var dbg = (function () {
    var DEBUG=false;
    if (DEBUG) {
      return function (var_args) {
        console.log.apply(console, ["[Client] "].concat(Array.prototype.slice.call(arguments)));
      };
    } else {
      return function (msg) {};
    }
  })();

  function err(msg) {
    throw new Error("[Client:error] " + msg);
  }

  // Methods bounce off the server once and listeners create a client
  // side port.
  var methodType = {
    METHOD: false,
    CLEANER: true,
    LISTENER: true
  }, bus;

  function ClientBus(config) {
    this.config = config;

    // Keep a clean reference of the real chrome.runtime to be able to
    // send messages.
    this.runtime_ = window.runtime_ || chrome.runtime;
    window.runtime_ = this.runtime_;

    // Each port is bound to a callback id
    this.ports = {};

    console.log("Contacting host on id:", this.config.id);
  }

  ClientBus.prototype = {
    default_cb: function (msg) {
      if (!msg)
        err("Chrome's last error: " + this.runtime_.lastError);

      if (msg.error)
        throw err(msg.error);
    },

    // cb(msg)
    clientMessage: function (persist, msg, callbackWrap) {
      callbackWrap = callbackWrap;
      if (persist) {
        dbg("Connecting to channel", msg.object);
        var port = this.runtime_.connect(this.config.extensionId, {name: msg.object});
        // cb has access only to msg, not to any other arguments the
        // API may provides.
        port.postMessage(msg);
        if (callbackWrap)
          port.onMessage.addListener(callbackWrap);
        else
          dbg("Sent cleaner msg",msg);
      } else {
        dbg("Sending:", msg);
        this.runtime_.sendMessage (
          this.config.extensionId, msg, {}, (function (rsp) {
            dbg("BUS received: ", rsp);
            callbackWrap(rsp);
          }).bind(this));
      }
    },

    // Called by the client.
    busCommand: function (cmd, var_args) {
      var args = Array.prototype.slice.call(arguments, 1);
      this.clientMessage(false, {listener: 'bus', method: cmd, args: args});
    }
  };

  // id: the extension id
  // obj: name of the remote object
  // supported_calls: array of names of calls supported.
  function RPCClient(config, obj_name) {
    console.assert(typeof(config.extensionId) == 'string',
                   "Extension id should be a string");
    console.assert(typeof(obj_name) == 'string',
                   "object name should be a string, not " + typeof(obj_name));

    // do not override an existing object
    if (chrome[obj_name]) {
      var props = Object.getOwnPropertyNames(chrome[obj_name]);
      props.forEach( function (p) {
        var prop = chrome[obj_name][p];
        if (prop instanceof Function) {
          this[p] = prop.bind(chrome[obj_name]);
        } else {
          this[p] = prop;
        }
      }.bind(this));
    }

    // Make sure there is a bus available
    if (!window.bus) window.bus = new ClientBus(config);
    this.obj_name = obj_name;
    if (!config.methods[obj_name])
      err('Tried to connect to unconfigured object: chrome.' + obj_name);

    this.setup_methods(config.methods[obj_name]);
    this.bus = window.bus;

    // XXX: The callback is called very very late.
    // bus.clientMessage(false, {method: 'setup', object: obj_name},
    //                          this.setup_methods.bind(this));
  }

  RPCClient.prototype = {
    setup_methods: function (config) {
      this.availableListeners = [];
      this.availableCleaners = {};

      (config.methods || []).forEach(
        this.registerMethod.bind(this, methodType.METHOD));
      (config.listeners || []).forEach(
        this.registerMethod.bind(this, methodType.LISTENER));
      (Object.getOwnPropertyNames(this.availableCleaners) || []).forEach(
        this.registerMethod.bind(this, methodType.CLEANER));

      this._setup = true;
    },

    registerMethod: function (isListener, entry) {
      var name = entry.starter || entry,
          names = name.split('.'),
          method = names.pop(),
          obj = names.reduce(function (ob, m) {
            ob[m] = ob[m] || {};
            return ob[m];
          }, this) || this;

      if (entry.cleaner)
        this.availableCleaners[entry.cleaner] = entry.starter;

      if (isListener)
        this.availableListeners.push(name);

      dbg("Registering method", method);
      obj[method] = this._rpc.bind(this, name);
    },

    msgCallbackFactory: function (callback) {
      if (!callback)
        return callback;

      var ret = function (resp) {
        // Ignore free resoponses
        if (!resp)
          return true;

        // Raise an error if the server reports one.
        if (resp.error) {
          err(resp.error);
        } else {
          // If there is a callback call it.
          if (callback) {
            return callback.apply(null, argsDecode(resp.args));
          }
        }
        return true;
      };

      ret.callbackId = callback.callbackId;
      return ret;
    },

    // People may need to override this
    callbackIdFactory: function (cb) {
      // Not very likely that two calls are less than a milisecond
      // appart even in parallel.
      if (typeof cb === 'function') {
        var id = cb.callbackId || (new Date).getTime();
        cb.callbackId = id;
        return id;
      } else {
        return null;
      }
    },

    _rpc: function (fnname, var_args) {
      var args = Array.prototype.slice.call(arguments, 1),
          rich_args = argsEncode(args),
          msg = {
            timestamp: (new Date).getTime(),
            object: this.obj_name,
            method: fnname,
            args: rich_args,
            error: null,
            callbackId: this.callbackIdFactory(rich_args.callbackRaw),
            sender: window._rpcSender
          },
          // false if it's a cleaner
          clientCallback = !(this.availableCleaners[fnname]) &&
            rich_args.callbackRaw;
      dbg("Calling chrome." + this.obj_name + '.' + fnname + "(", args, ")");

      // Send the rpc call. _message will deal with the callback
      // cleanup.
      this._message(msg, clientCallback);
    },

    // Send a message potentially opening a connection, running callback
    // on response. In the case of a connection the callback is being on
    // _every_ response on the created port thus creating a listener.
    _message: function (msg, callbackRaw) {
      var isListener = (this.availableListeners.indexOf(msg.method) != -1),
          callbackWrap = this.msgCallbackFactory(callbackRaw);

      this.bus.clientMessage(isListener && msg.object + '.' + msg.method,
                             msg, callbackWrap);
    }
  };

  // Access to the global scope
  Object.getOwnPropertyNames(config.methods).forEach(function (m) {
    chrome[m] = new RPCClient(config, m);
  });

  if (window){
    window.ClientBus = ClientBus;
    window.RPCClient = RPCClient;
  }
})();

},{"./../../tools/client-util":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/tools/client-util.js","./../common/config":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/chrome-extension/common/config.js","./../common/rpc-args":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/chrome-extension/common/rpc-args.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/chrome-extension/common/config.js":[function(require,module,exports){
// File: /chrome-extension/common/config.js

var config = {
  //  extensionId: "adkkcgijolkkeldfhjcabekomonffhck", // windows remote
  // extensionId: "iihpjpedfemglflaabiadnnjanplblia", // mac local
  extensionId: "a-fake-id",
  methods: {
    serial: {
      methods: ['getDevices', 'send', 'connect', 'disconnect', 'setControlSignals', 'getControlSignals', 'getConnections'],
      listeners: [{starter: 'onReceiveError.addListener',
		   cleaner: 'onReceiveError.removeListener'},
                  {starter: 'onReceive.addListener',
		   cleaner: 'onReceive.removeListener'}]
    }
  },
  app: {
    methods: ['window.create'],
    listeners: [{starter: 'runtime.onLaunched.addListener',
                 cleaner: 'runtime.onLaunched.removeListener'}]
  },
  notifications: {
    methods: ['create', 'clear'],
    listeners: [{starter: 'onClicked.addListener',
                 cleaner: 'onClicked.removeListener'}]
  },
  storage: {
    methods: ['local.get', 'local.set'],
    listeners: [{starter: 'onChanged.addListener',
                 cleaner: 'onChanged.removeListener'}]
  },
  syncFileSystem: {
    methods: ['requestFileSystem'],
    listeners: []
  },
  alarms: {
    methods: ['clear', 'create', 'getAll'],
    listeners: [{starter: 'onAlarm.addListener',
                 cleaner: 'onAlarm.removeListener'}]
  },
  runtime: {
    methods: ['getPlatformInfo'],
    listeners: [{starter: 'onLaunched.addListener',
                 cleaner: 'onLaunched.removeListener'}]
  }
}, matchUrls=["http://localhost:8080/*",
              "http://ec2-54-174-134-98.compute-1.amazonaws.com:8080/*"];


if (chrome.runtime.id)
  config.extensionId = chrome.runtime.id;

// Send the extension id to the server to send correct config to the
// client. Kind of async but we have a backup and we will make many
// more requests to the server before useing the extensionId
function updateExtensionId (url, id) {
  var xhr = new XMLHttpRequest(),
      ext = "extensionid";

  // Define it if you are an extension
  if (chrome.runtime.id)
    ext += "?extensionid="+ chrome.runtime.id;

  xhr.onreadystatechange = function () {
    if (xhr.readyState == 4 &&
        xhr.status == 200 &&
        xhr.responseText.length > 0)
      config.extensionId = xhr.responseText;

    console.log("Extension id is:", config.extensionId);
  };

  try {
    xhr.open("GET", url.replace("*", ext), true);
    xhr.send(null);
  } catch (e) {
    ;
  }
}

matchUrls.forEach(function (url) { updateExtensionId(url);});

try {
  module.exports = config;
  if (window)
    window.config = config;

} catch (e) {
  ;
}

},{}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/chrome-extension/common/rpc-args.js":[function(require,module,exports){
// File: /chrome-extension/common/rpc-args.js

function binToHex(bin) {
  var bufferView = new Uint8Array(bin);
  var hexes = [];
  for (var i = 0; i < bufferView.length; ++i) {
    hexes.push(bufferView[i]);
  }
  return hexes;
}

// May be destructive
function argsEncode(args) {
  var ret = {callbackRaw: null};
  ret.args = args.map(function (arg) {
    if (arg instanceof Function) {
      ret.callbackRaw = arg;
    } else if (arg instanceof ArrayBuffer) {
      return {type: 'arraybuffer', val: binToHex(arg)};
    }

    // XXX: extremely ad-hoc
    if (arg.data && arg.data instanceof ArrayBuffer) {
      arg.data = binToHex(arg.data);
      return {type: 'data-arraybuffer', val: arg};
    }

    return {type: typeof(arg), val: arg};
  });

  return ret;
}


function hexToBin(hex) {
  var buffer = new ArrayBuffer(hex.length);
  var bufferView = new Uint8Array(buffer);
  for (var i = 0; i < hex.length; i++) {
    bufferView[i] = hex[i];
  }

  return buffer;
}

function argsDecode(args, cbHandler) {
  return (args.args || []).map( function (arg) {
    switch (arg.type) {
    case 'function':
      return cbHandler;
      break;
    case 'arraybuffer':
      return hexToBin(arg.val);
    case 'data-arraybuffer':
      arg.val.data = hexToBin(arg.val.data);
    default:
      return arg.val;
      break;
    }
  });
}

try {
  module.exports = {
    argsDecode:argsDecode,
    argsEncode:argsEncode
  };

  window.hexToBin = hexToBin;
  window.binToHex = binToHex;
} catch (e) {;}

},{}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/buffer.js":[function(require,module,exports){
var arraify = require('./util').arraify,
    Log = require('./logging').Log,
    log = new Log('Buffer');

function storeAsTwoBytes(n) {
  var lo = (n & 0x00FF);
  var hi = (n & 0xFF00) >> 8;
  return [hi, lo];
}


// Async reading to and from buffer
function binToBuf(hex) {
  if (hex instanceof ArrayBuffer)
    return hex;

  var buffer = new ArrayBuffer(hex.length);
  var bufferView = new Uint8Array(buffer);
  for (var i = 0; i < hex.length; i++) {
    bufferView[i] = hex[i];
  }

  return buffer;
}

function bufToBin(buf) {
  if (!buf instanceof ArrayBuffer)
    return buf;

  var bufferView = new Uint8Array(buf);
  var hexes = [];
  for (var i = 0; i < bufferView.length; ++i) {
    hexes.push(bufferView[i]);
  }

  return hexes;
}

function Buffer () {
}

Buffer.prototype = {
  read: function (maxBytes, callback) {
    if (typeof(this.databuffer) == "undefined") {
      log.log("Creating buffer...");
      this.databuffer = [];
      callback({bytesRead: 0, data: []});
      return;
    }

    var bytes = Math.min(maxBytes, this.databuffer.length);
    log.log("Reading", bytes, " from buffer");

    var accum = this.databuffer.slice(0, bytes);
    this.databuffer = this.databuffer.slice(bytes);
    log.log("readFromBuffer -> " + bufToBin(accum));
    callback({bytesRead: bytes, data: accum});
  },

  write: function (readArg) {
    var hexData = bufToBin(readArg.data);
    log.log("Pushing to buffer:", hexData);
    this.databuffer = this.databuffer.concat(hexData);
    log.log("Buffer now of size ", this.databuffer.length);
  }
};

function hexRep(intArray) {
  var buf = "[";
  var sep = "";
  for (var i = 0; i < intArray.length; ++i) {
    buf += (sep + "0x" + intArray[i].toString(16));
    sep = ",";
  }
  buf += "]";
  return buf;
}

module.exports.Buffer = Buffer;
module.exports.hexRep = hexRep;
module.exports.bufToBin = bufToBin;
module.exports.storeAsTwoBytes = storeAsTwoBytes;
module.exports.binToBuf = binToBuf;

},{"./logging":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/logging.js","./util":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/util.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/hexparser.js":[function(require,module,exports){
// Parse an Intel hex file (http://en.wikipedia.org/wiki/Intel_HEX).
//
// For simplicity: Requires that the hex file specifies a single, contiguous
// block of data, starting at address 0.
//
// input: A string (separated by '\n' newlines) representing the file.
//
// returns: an array of integers (necessarily in the range [0,255]) where the n-th
//   array entry represents the byte at address 'n'.
//
// TODOs:
// - Validate checksum
// - Handle other record types
function ParseHexFile(input) {
  var kStartcodeBytes = 1;
  var kSizeBytes = 2;
  var kAddressBytes = 4;
  var kRecordTypeBytes = 2;
  var kChecksumBytes = 2;

  var inputLines = input.split("\n");

  var out = [];

  var nextAddress = 0;

  for (var i = 0; i < inputLines.length; ++i) {
    var line = inputLines[i];

    //
    // Startcode
    //
    if (line[0] != ":") {
      console.log("Bad line [" + i + "]. Missing startcode: " + line);
      return "FAIL";
    }

    //
    // Data Size
    //
    var ptr = kStartcodeBytes;
    if (line.length < kStartcodeBytes + kSizeBytes) {
      console.log("Bad line [" + i + "]. Missing length bytes: " + line);
      return "FAIL";
    }
    var dataSizeHex = line.substring(ptr, ptr + kSizeBytes);
    ptr += kSizeBytes;
    var dataSize = hexToDecimal(dataSizeHex);

    //
    // Address
    //
    if (line.length < ptr + kAddressBytes) {
      console.log("Bad line [" + i + "]. Missing address bytes: " + line);
      return "FAIL";
    }
    var addressHex = line.substring(ptr, ptr + kAddressBytes);
    ptr += kAddressBytes;
    var address = hexToDecimal(addressHex);

    //
    // Record Type
    //
    if (line.length < ptr + kRecordTypeBytes) {
      console.log("Bad line [" + i + "]. Missing record type bytes: " + line);
      return "FAIL";
    }
    var recordTypeHex = line.substring(ptr, ptr + kRecordTypeBytes);
    ptr += kRecordTypeBytes;

    //
    // Data
    //
    var dataChars = 2 * dataSize;  // Each byte is two chars
    if (line.length < (ptr + dataChars)) {
      console.log("Bad line [" + i + "]. Too short for data: " + line);
      return "FAIL";
    }
    var dataHex = line.substring(ptr, ptr + dataChars);
    ptr += dataChars;

    //
    // Checksum
    //
    if (line.length < (ptr + kChecksumBytes)) {
      console.log("Bad line [" + i + "]. Missing checksum: " + line);
      return "FAIL";
    }
    var checksumHex = line.substring(ptr, ptr + kChecksumBytes);

    //
    // Permit trailing whitespace
    //
    if (line.length > ptr + kChecksumBytes + 1) {
      var leftover = line.substring(ptr, line.length);
      if (!leftover.match("$\w+^")) {
          console.log("Bad line [" + i + "]. leftover data: " + line);
          return "FAIL";
      }
    }

    var kDataRecord = "00";
    var kEndOfFileRecord = "01";

    if (recordTypeHex == kEndOfFileRecord) {
      return out;
    } else if (recordTypeHex == kDataRecord) {
      if (address != nextAddress) {
        console.log("I need contiguous addresses");
        return "FAIL";
      }
      nextAddress = address + dataSize;

      var bytes = hexCharsToByteArray(dataHex);
      if (bytes == -1) {
        console.log("Couldn't parse hex data: " + dataHex);
        return "FAIL";
      }
      out = out.concat(bytes);
    } else {
      console.log("I can't handle records of type: " + recordTypeHex);
      return "FAIL";
    }
  }

  console.log("Never found EOF!");
  return "FAIL";
}

function hexToDecimal(h) {
  if (!h.match("^[0-9A-Fa-f]*$")) {
    console.log("Invalid hex chars: " + h);
    return -1;
  }
  return parseInt(h, 16);
}

function hexCharsToByteArray(hc) {
  if (hc.length % 2 != 0) {
    console.log("Need 2-char hex bytes");
    return -1; // :(
  }

  var bytes = [];
  for (var i = 0; i < hc.length / 2; ++i) {
    var hexChars = hc.substring(i * 2, (i * 2) + 2);
    var byte = hexToDecimal(hexChars);
    if (byte == -1) {
      return -1;
    }
    bytes.push(byte);
  }
  return bytes;
}

window.ParseHexFile = ParseHexFile;
module.exports.ParseHexFile = ParseHexFile;

},{}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/logging.js":[function(require,module,exports){
var arraify = require('./util').arraify;

function Log (name, verbosity) {
  this.verbosity = verbosity || 3;
  this.name = name;
}

Log.prototype = {
  timestampString: function () {
    var now = new Date();
    var pad = function(n) {
      if (n < 10) { return "0" + n; }
      return n;
    };
    return pad(now.getHours()) + ":" + pad(now.getMinutes())
      + ":" + pad(now.getSeconds()) + "." + now.getMilliseconds();
  },

  prefix: function () {
    return "[" + this.timestampString() +  " : " + this.name + "]";
  },

  console_: function (type, args) {
    return console[type]
      .apply(console, args);
  },

  error: function (var_args) {
    if (this.verbosity > 0)
      this.console_('error', arraify(arguments, 0, this.prefix()));
  },
  warning: function (var_args) {
    if (this.verbosity > 1)
      this.console_('warning', arraify(arguments, 0, this.prefix()));
  },
  info: function (var_args) {
    if (this.verbosity > 2)
      this.console_('log', arraify(arguments, 0, this.prefix()));
  },
  log: function (var_args) {
    if (this.verbosity > 2)
      this.console_('log', arraify(arguments, 0, this.prefix()));
  }
};

module.exports.Log = Log;

},{"./util":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/util.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols.js":[function(require,module,exports){
module.exports.protocols = {
  stk: require('./protocols/stk500').STK500Transaction,
  avr109: require('./protocols/butterfly').AVR109Transaction
};

},{"./protocols/butterfly":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/butterfly.js","./protocols/stk500":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/stk500.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/butterfly.js":[function(require,module,exports){
var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('avr109'),
    arraify = require('./../util').arraify,
    buffer = require("./../buffer");

function AVR109Transaction () {
  SerialTransaction.apply(this, arraify(arguments));

  this.AVR = {
    SOFTWARE_VERSION: 0x56,
    ENTER_PROGRAM_MODE: 0x50,
    LEAVE_PROGRAM_MODE: 0x4c,
    SET_ADDRESS: 0x41,
    WRITE: 0x42, // TODO: WRITE_PAGE
    TYPE_FLASH: 0x46,
    EXIT_BOOTLOADER: 0x45,
    CR: 0x0D,
    READ_PAGE: 0x67
  };
  this.log = log;
}
AVR109Transaction.prototype = new SerialTransaction();

AVR109Transaction.prototype.flash = function (devName, hexData) {
  var kMagicBaudRate = 1200,
      oldDevices = [],
      self = this;

  self.hexData = hexData;
  self.serial.getDevices(function(devicesArg) {
    oldDevices = devicesArg;

    self.serial.connect(devName, { bitrate: kMagicBaudRate, name: devName}, function(connectInfo) {
      log.log("Made sentinel connection:", connectInfo, "waiting 2s ...");
      setTimeout(function () {
        self.serial.disconnect(connectInfo.connectionId, function(ok) {
          if (ok) {
            log.log("Disconnected from ", devName);
            setTimeout(function () {
              self.waitForDeviceAndConnect(connectInfo, (new Date().getTime()) + 10000,
                                           self.transitionCb('connectDone'));
            }, 500);
          } else {
            throw Error("Failed to disconnect from " + devName);
          }
        });
      }, 2000);
    });
  });
};

AVR109Transaction.prototype.waitForDeviceAndConnect = function(dev, deadline, cb) {
  log.log("Waiting for new device...");
  if (new Date().getTime() > deadline) {
    log.error("Exceeded deadline");
    return;
  }

  var found = false,
      self = this;
  self.serial.getDevices(function(newDevices) {
    // XXX: Maybe name checking is not the best option
    var appeared = newDevices.filter(function (d) {return d.path == dev.name;});

    if (appeared.length == 0) {
      setTimeout(function() {
        self.waitForDeviceAndConnect(dev, deadline, cb);
      }, 100);
    } else if ((new Date().getTime()) > deadline){
      log.error("Waited too long for " + dev.name);
    } else {
      log.log("Aha! Connecting to: " + dev.name);
      self.serial.connect(dev.name, { bitrate: 57600, name: appeared[0].path }, cb);
    }
  });
};


AVR109Transaction.prototype.connectDone = function (connectArg) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    log.error("(AVR) Bad connectionId / Couldn't connect to board");
    return;
  }

  log.log("Connected to board. ID: " + connectArg.connectionId);

  this.connectionId = connectArg.connectionId;
  this.buffer.read(1024, this.transitionCb('drainedBytes'));
};

AVR109Transaction.prototype.gotVersion = function (version) {
  log.log("Got version: ", version);
  this.transition('prepareToProgramFlash');
};

AVR109Transaction.prototype.programmingDone = function () {
  var self = this;

  log.log("avrProgrammingDone");
  this.writeThenRead_([ this.AVR.LEAVE_PROGRAM_MODE ], 1, function(payload) {
    self.writeThenRead_([ self.AVR.EXIT_BOOTLOADER ], 1, function(payload) {
      self.serial.disconnect(self.connectionId, function (ok) {
        if (ok)
          log.log("ALL DONE");
        else
          throw Error("Did not disconnect correctly from connection ",
                      self.connectionId);
      });
    });
  });
}

AVR109Transaction.prototype.drainedAgain = function (readArg) {
  log.log("drainedAgain(", readArg ,")");
  log.log("DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    this.buffer.read(1024, self.transitionCb('drainedBytes'));
  } else {
    // Start the protocol
    this.writeThenRead_([this.AVR.SOFTWARE_VERSION], 2, this.transitionCb('gotVersion'));
  }
}

AVR109Transaction.prototype.drainedBytes = function (readArg) {
  log.log("DRAINED " + readArg.bytesRead + " BYTES on " + this.connectionId);
  if (readArg.bytesRead == 1024) {
    // keep draining
    this.buffer.read(1024, this.transitionCb('drainedBytes'));
  } else {
    var self = this;
    setTimeout(function() { self.transition('dtrSent', true);}, 1000);
  }
}

AVR109Transaction.prototype.dtrSent = function (ok) {
  if (!ok) {
    log.error("Couldn't send DTR");
    return;
  }
  log.log("DTR sent (low) real good on connection: " + this.connectionId);

  this.buffer.read(1024, this.transitionCb('drainedAgain'));
}

AVR109Transaction.prototype.prepareToProgramFlash = function () {
  var addressBytes = buffer.storeAsTwoBytes(0),
      self = this,
      loadAddressMessage = [
        this.AVR.SET_ADDRESS, addressBytes[1], addressBytes[0]];

  this.writeThenRead_(loadAddressMessage, 1, function(response) {
    self.transition('programFlash', self.hexData, 0, 128);
  });
};

AVR109Transaction.prototype.programFlash = function (data, offset, length) {
  log.log("program flash: data.length: " + data.length + ", offset: " + offset + ", length: " + length);
  var payload;

  if (offset >= data.length) {
    log.log("Done programming flash");
    this.transition('programmingDone');
    return;
  }

  if (offset + length > data.length) {
    log.log("Grabbing bytes " + offset + " to " +
            data.length + " bytes would go past the end.");
    payload = data.slice(offset, data.length);
    var padSize = length - payload.length;
    log.log("Padding " + padSize + " 0 byte at the end");
    for (var i = 0; i < padSize; ++i) {
      payload.push(0);
    }
  } else {
    log.log("Grabbing bytes: " + offset + " until " + (offset + length));
    payload = data.slice(offset, offset + length);
  }

  var sizeBytes = buffer.storeAsTwoBytes(length),
      programMessage = [
        this.AVR.WRITE, sizeBytes[0], sizeBytes[1], this.AVR.TYPE_FLASH ];
  programMessage = programMessage.concat(payload);

  var self = this;
  this.writeThenRead_(programMessage, 1, function(resp) {
    // XXX: check respeonse.
    self.transition('programFlash', data, offset + length, length);
  });
}


// Simply wayt for byte
SerialTransaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  // Hide the strange arguments.
  this.waitForBytes(payloadSize, [], (new Date().getTime()) + 1000, callback);
};

AVR109Transaction.prototype.waitForBytes = function (n, accum, deadline, callback) {
  var self = this;

  if (new Date().getTime() > deadline) {
    log.error("Deadline passed while waiting for " + n + " bytes");
    return;
  }
  log.log("Waiting for", n, "bytes");

  var handler = function(readArg) {
    var hexData = buffer.bufToBin(readArg.data);
    for (var i = 0; i < hexData.length; ++i) {
      accum.push(hexData[i]);
      n--;
    }

    if (n < 0) {
      log.error("Read too many bytes !?");
    } else if (n == 0) {
      log.log("Response (remaining bytes:", n, "):", buffer.hexRep(accum));
      log.log("Callback:", callback);
      callback(accum);
    } else { // still want more data
      setTimeout(function() {
        self.waitForBytes(n, accum, deadline, callback);
      }, 50);
      // TODO: deadline?
    }
  };

  self.buffer.read(n, handler);
};

module.exports.AVR109Transaction = AVR109Transaction;

},{"./../buffer":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/buffer.js","./../logging":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/logging.js","./../util":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/util.js","./serialtransaction":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/serialtransaction.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/serialtransaction.js":[function(require,module,exports){
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
      this.log.log("Disconnecting from", connId);

      self.serial.disconnect(connId, function (ok) {
        if (ok) {
          self.connectionId = null;
          this.log.log("Disconnected ok, You may now use your program!");
        } else
          this.log.error("Could not disconnect from " + this.connectionId);
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

},{"./../../../chrome-extension/client/rpc-client":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/chrome-extension/client/rpc-client.js","./../buffer.js":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/buffer.js","./../transaction":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/transaction.js","./../util":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/util.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/stk500.js":[function(require,module,exports){
var SerialTransaction = require('./serialtransaction'),
    Log = require('./../logging').Log,
    log = new Log('STK500'),
    arraify = require('./../util').arraify,
    buffer = require("./../buffer.js");

function STK500Transaction () {
  SerialTransaction.apply(this, arraify(arguments));

  this.STK = {
    OK: 0x10,
    INSYNC: 0x14,
    CRC_EOP: 0x20,
    GET_SYNC: 0x30,
    GET_PARAMETER: 0x41,
    ENTER_PROGMODE: 0x50,
    LEAVE_PROGMODE: 0x51,
    LOAD_ADDRESS: 0x55,
    PROG_PAGE: 0x64,
    READ_SIGN: 0x75,
    HW_VER: 0x80,
    SW_VER_MINOR: 0x82,
    SW_VER_MAJOR: 0x81
  };
  this.log = log;
}

STK500Transaction.prototype = new SerialTransaction();

STK500Transaction.prototype.flash = function (deviceName, sketchData) {
  this.sketchData = sketchData;
  this.serial.connect(deviceName, {bitrate: 115200, name: deviceName},
                      function (connectArg) {
                        this.transition('connectDone', sketchData, connectArg);
                      });
};

STK500Transaction.prototype.connectDone = function (hexCode, connectArg) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    log.error("Bad connectionId / Couldn't connect to board");
    return;
  }

  this.connectionId = connectArg.connectionId;
  log.log("Connected to board. ID: " + connectArg.connectionId);
  this.buffer.read(this.connectionId, 1024, function(readArg) {
    this.transition('drainedBytes', readArg);
  });
};

STK500Transaction.prototype.dtrSent = function (ok) {
  if (!ok) {
    log.log("Couldn't send DTR");
    return;
  }
  log.log("DTR sent (low) real good");

  this.buffer.read(1024, function(readArg) {
    self.transition('drainedAgain', readArg);
  });

}

STK500Transaction.prototype.drainedAgain = function (readArg) {
  var self = this;
  log.log("DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    self.buffer.read(1024, this.trasitioncb('drainedBytes'));
  } else {
    // Start the protocol
    setTimeout(function() {
      self.writeThenRead([self.STK.GET_SYNC, self.STK.CRC_EOP],
                         0, self.transitionCb('inSyncWithBoard'));
    }, 50);
  }

};

STK500Transaction.prototype.drainedBytes = function (readArg) {
  var self = this;

  log.log("DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    self.buffer.read(1024, function(readArg) {
      this.drainedBytes(readArg);
    });
  } else {
    log.log("About to set DTR low");

    setTimeout(function() {
      self.serial.setControlSignals(self.connectionId, {dtr: false, rts: false}, function(ok) {
        log.log("sent dtr false, done: " + ok);
        setTimeout(function() {
          self.serial.setControlSignals(self.connectionId, {dtr: true, rts: true}, function(ok) {
            log.log("sent dtr true, done: " + ok);
            setTimeout(function() { self.dtrSent(ok); }, 500);
          });
        }, 500);
      });
    }, 500);
  }
}

STK500Transaction.prototype.inSyncWithBoard = function (ok, data) {
  if (!ok) {
    log.error("InSyncWithBoard: NOT OK");
  }
  log.log("InSyncWithBoard: " + ok + " / " + data);
  this.inSync_ = true;
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.HW_VER, this.STK.CRC_EOP], 1,
                     this.transitionCb('readHardwareVersion'));
};

STK500Transaction.prototype.readHardwareVersion = function (ok, data) {
  log.log("HardwareVersion: " + ok + " / " + data);
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.SW_VER_MAJOR, this.STK.CRC_EOP],
                     1, this.transitionCb('readSoftwareMajorVersion'));
};

STK500Transaction.prototype.readSoftwareMajorVersion = function (ok, data) {
  log.log("Software major version: " + ok + " / " + data);
  this.writeThenRead([this.STK.GET_PARAMETER, this.STK.SW_VER_MINOR, this.STK.CRC_EOP],
                     1, this.transitionCb('readSoftwareMinorVersion'));
};

STK500Transaction.prototype.readSoftwareMinorVersion = function (ok, data) {
  log.log("Software minor version: " + ok + " / " + data);
  this.riteThenRead([this.STK.ENTER_PROGMODE, this.STK.CRC_EOP], 0,
                    this.transitonCb('enteredProgmode'));
}

STK500Transaction.prototype.enteredProgmode = function (ok, data) {
  log.log("Entered progmode: " + ok + " / " + data);
  this.writeThenRead([this.STK.READ_SIGN, this.STK.CRC_EOP], 3,
                     this.transitionCb('readSignature'));
}

STK500Transaction.prototype.readSignature = function (ok, data) {
  log.log("Device signature: " + ok + " / " + data);

  this.transition('programFlash', 0, 128,
                  this.transitionCb('doneProgramming'));
}

STK500Transaction.prototype.doneProgramming = function () {
  this.sketchData_ = null;
  this.transition('writeThenRead', [this.STK.LEAVE_PROGMODE, this.STK.CRC_EOP],
                  0, this.transitionCb('stkLeftProgmode'));
}

STK500Transaction.prototype.isProgramming = function () {
  return this.sketchData_ == null;
}

STK500Transaction.prototype.leftProgmode = function (ok, data) {
  var self = this;

  log.log("Left progmode: " + ok + " / " + data +
          " Disconnecting " + self.connectionId + "...");
  self.serial.disconnect(self.connectionId, function (ok) {
    if (ok) {
      self.connectionId = null;
      log.log("Disconnected ok, You may now use your program!");
    } else
      log.log("Could not disconnect from " + self.connectionId);
  });
}

STK500Transaction.prototype.programFlash = function (data, offset, length, doneCallback) {
  var payload;
  log.log("program flash: data.length: " + data.length + ", offset: " + offset + ", length: " + length);

  if (offset >= data.length) {
    log.log("Done programming flash: " + offset + " vs. " + data.length);
    doneCallback(this.connectionId);
    return;
  }

  if (offset + length > data.length) {
    log.log("Grabbing " + length + " bytes would go past the end.");
    log.log("Grabbing bytes " + offset + " to " + data.length + " bytes would go past the end.");
    payload = data.slice(offset, data.length);
    var padSize = length - payload.length;
    log.log("Padding " + padSize + " 0 byte at the end");
    for (var i = 0; i < padSize; ++i) {
      payload.push(0);
    }
  } else {
    log.log("Grabbing bytes: " + offset + " until " + (offset + length));
    payload = data.slice(offset, offset + length);
  }

  var addressBytes = buffer.storeAsTwoBytes(offset / 2); // Word address, verify this
  var sizeBytes = buffer.storeAsTwoBytes(length);
  var kFlashMemoryType = 0x46;

  var loadAddressMessage = [
    this.STK.LOAD_ADDRESS, addressBytes[1], addressBytes[0], this.STK.CRC_EOP];
  var programMessage = [
    this.STK.PROG_PAGE, sizeBytes[0], sizeBytes[1], kFlashMemoryType];
  programMessage = programMessage.concat(payload);
  programMessage.push(this.STK.CRC_EOP);

  var self = this;
  self.writeThenRead(loadAddressMessage, 0, function(ok, reponse) {
    if (!ok) {
      log.error("Error programming the flash (load address)");
      return;
    }
    self.writeThenRead(programMessage, 0, function(ok, response) {
      if (!ok) {
        log.error("Error programming the flash (send data)");
        return;
      }
      // Program the next section
      self.transition('programFlash', data, offset + length, length, doneCallback);
    });
  });
};


STK500Transaction.prototype.consumeMessage = function (payloadSize, callback, errorCb) {
  var self = this;
  self.log.log("stkConsumeMessage(conn=", self.connectionId,
               ", payload_size=", payloadSize, " ...)");
  var ReadState = {
    READY_FOR_IN_SYNC: 0,
    READY_FOR_PAYLOAD: 1,
    READY_FOR_OK: 2,
    DONE: 3,
    ERROR: 4
  };

  var accum = [];
  var state = ReadState.READY_FOR_IN_SYNC;
  var kMaxReads = 100;
  var reads = 0;
  var payloadBytesConsumed = 0;

  var handleRead = function(arg) {
    if (reads++ >= kMaxReads) {
      log.error("Too many reads. Bailing.");
      errorCb(self.connectionId);
      return;
    }

    var hexData = buffer.bufToBin(arg.data);
    if (arg.bytesRead > 0) {
      log.log("Read:" + hexData);
    } else {
      log.log("No data read.");
    }

    for (var i = 0; i < hexData.length; ++i) {
      log.log("Byte " + i + " of " + hexData.length + ": " + hexData[i]);
      if (state == ReadState.READY_FOR_IN_SYNC) {
        if (hexData[i] == self.STK.INSYNC) {
          if (payloadSize == 0) {
            log.log("Got IN_SYNC, no payload, now READY_FOR_OK");
            state = ReadState.READY_FOR_OK;
          } else {
            log.log("Got IN_SYNC, now READY_FOR_PAYLOAD");
            state = ReadState.READY_FOR_PAYLOAD;
          }
        } else {
          log.log("Expected self.STK.INSYNC (" + self.STK.INSYNC + "). Got: " + hexData[i] + ". Ignoring.");
          //          state = ReadState.ERROR;
        }
      } else if (state == ReadState.READY_FOR_PAYLOAD) {
        accum.push(hexData[i]);
        payloadBytesConsumed++;
        if (payloadBytesConsumed == payloadSize) {
          log.log("Got full payload, now READY_FOR_OK");
          state = ReadState.READY_FOR_OK;
        } else if (payloadBytesConsumed > payloadSize) {
          log.log("Got too many payload bytes, now ERROR");
          state = ReadState.ERROR;
          log.error("Read too many payload bytes!");
        }
      } else if (state == ReadState.READY_FOR_OK) {
        if (hexData[i] == self.STK.OK) {
          log.log("Got OK now DONE");
          state = ReadState.DONE;
        } else {
          log.error("Expected STK_OK. Got: " + hexData[i]);
          state = ReadState.ERROR;
        }
      } else if (state == ReadState.DONE) {
        log.error("Out of sync (ignoring data)");
        state = ReadState.ERROR;
      } else if (state == ReadState.ERROR) {
        log.error("In error state. Draining byte: " + hexData[i]);
        // Remains in state ERROR
      } else {
        log.error("Unknown state: " + state);
        state = ReadState.ERROR;
      }
    }

    if (state == ReadState.ERROR || state == ReadState.DONE) {
      log.log("Finished in state: " + state);
      callback(self.connectionId, state == ReadState.DONE, accum);
    } else {
      log.log("Paused in state: " + state + ". Reading again.");

      if (!self.inSync_ && (reads % 3) == 0) {
        // Mega hack (temporary)
        log.log("Mega Hack: Writing: " + buffer.hexRep([self.STK.GET_SYNC, self.STK.CRC_EOP]));
        self.serial.send(self.connectionId, buffer.hexToBin([self.STK.GET_SYNC, self.STK.CRC_EOP]), function() {
          self.buffer.read(1024, handleRead);
        });
      } else {
        // Don't tight-loop waiting for the message.
        setTimeout(function() {
          self.buffer.read(1024, handleRead);
        }, 10);
      }

    }
  };

  log.log("Scheduling a read in .1s");
  setTimeout(function() { self.buffer.read(1024, handleRead); }, 10);
};


module.exports.STK500Transaction = STK500Transaction;

},{"./../buffer.js":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/buffer.js","./../logging":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/logging.js","./../util":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/util.js","./serialtransaction":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/serialtransaction.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/transaction.js":[function(require,module,exports){
var utilModule = require("./util"),
    arraify = utilModule.arraify,
    deepCopy = utilModule.deepCopy;

// An FSM
function Transaction () {
  this.hooks_ = {};
  this.state = null;
  this.transitions = [];
  this.context = {};
}
Transaction.prototype = {
  getHook: function (hookIdArray) {
    var key = hookIdArray.sort().join('_');
    return this.hooks_[key];
  },

  triggerHook: function (hookIdArray, varArgs) {
    var key = hookIdArray.sort().join('_'), args = arraify(arguments, 1);
    if (this.hooks_.hasOwnProperty(key))
      this.hooks_[key].forEach(function (fn) { fn.apply(null, args); });
  },

  // Will trigger 'leave' and 'enter' hooks and possibly call a
  // callback when done.
  transition: function(state, varArgs) {
    var oldState = this.state, args = arraify(arguments, 1);

    // this.triggerHook(['leave', oldState], this.context);
    this.state = state;
    // this.triggerHook(['enter', this.state], this.context);
    // this.transitions.push([state, oldState, deepCopy(this.context)]);

    console.log("Jumping to state\'", state, "' arguments:", args);
    this[state].apply(this, args);
  },

  transitionCb: function (state) {
    return this.transition.bind(this, state);
  }
};

module.exports.Transaction = Transaction;

},{"./util":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/util.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/util.js":[function(require,module,exports){
function arraify(arrayLike, offset, prefixVarArgs) {
  var ret = Array.prototype.slice.call(arrayLike, offset),
      prefix = Array.prototype.slice.call(arguments, 2);

  return prefix.concat(ret);
}

function deepCopy(obj) {
  switch (typeof obj) {
  case 'array':
    return obj.map(deepCopy);
    break;
  case 'object':
    var ret = {};
    Object.ownPropertyNames(obj).forEach(function (k) {
      ret[k] = deepCopy(obj[k]);
    });
    return ret;
    break;
  default:
    return obj;
  }
}

module.exports.arraify = arraify;
module.exports.deepCopy = deepCopy;

},{}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/plugin.js":[function(require,module,exports){
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

},{"./../chrome-extension/client/rpc-client":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/chrome-extension/client/rpc-client.js","./backend/hexparser":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/hexparser.js","./backend/protocols":"/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols.js"}],"/Users/drninjabatman/Projects/Codebendercc/BabelFish/tools/client-util.js":[function(require,module,exports){
// File: /tools/client-util.js

// Log in a list called id
function log(id, msg) {
  var ele = document.getElementById(id);
  if (!ele) {
    var he = document.createElement('h3');
    he.innerHTML = id;
    ele = document.createElement('ul');
    ele.id = id;
    ele.className = "loglist";
    document.body.appendChild(he);
    document.body.appendChild(ele);
  }

  console.log("[" + id + "] " + msg );
  ele.innerHTML += '<li>' + msg + '</li>';
}

function str(obj) {
  return JSON.stringify(obj);
}

try {
  module.exports = {str: str, log: log};
} catch (e) {
  ;
}

window.log = log;
window.str = str;

},{}]},{},["/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/buffer.js","/Users/drninjabatman/Projects/Codebendercc/BabelFish/chrome-extension/common/config.js","/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/transaction.js","/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/logging.js","/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/butterfly.js","/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/serialtransaction.js","/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/backend/protocols/stk500.js","/Users/drninjabatman/Projects/Codebendercc/BabelFish/codebender/plugin.js"]);
