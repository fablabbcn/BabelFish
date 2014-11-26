(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
    var DEBUG=true;
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

  function ClientBus(id) {
    this.extensionId = id;

    // Keep a clean reference of the real chrome.runtime to be able to
    // send messages.
    this.runtime_ = window.runtime_ || chrome.runtime;
    window.runtime_ = this.runtime_;

    // Each port is bound to a callback id
    this.ports = {};

    console.log("Contacting host on id:", id);
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
      callbackWrap = callbackWrap || this.default_cb;
      if (persist) {
	dbg("Connecting to channel", msg.object);
	var port = this.runtime_.connect(this.extensionId, {name: msg.object});
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
	  this.extensionId, msg, {}, (function (rsp) {
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
  function RPCClient(id, obj_name) {
    console.assert(typeof(id) == 'string', "Extension id should be a string");
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
    if (!window.bus) window.bus = new ClientBus(id);
    this.extensionId = id;
    this.obj_name = obj_name;
    if (!config.methods[obj_name])
      err('Tried to connect to unconfigured object: chrome.' + obj_name);

    this.setup_methods(config.methods[obj_name]);
    this.bus = window.bus;

    // XXX: The callback is called very very late.
    // bus.clientMessage(false, {method: 'setup', object: obj_name},
    // 				this.setup_methods.bind(this));
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
      var id = (cb && cb.callbackId) || (new Date).getTime();
      cb.callbackId = id;
      return id;
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
	    callbackId: this.callbackIdFactory(rich_args.callbackRaw)
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
    chrome[m] = new RPCClient(config.extensionId, m);
  });

  if (window){
    window.ClientBus = ClientBus;
    window.RPCClient = RPCClient;
  }
})();

},{"./../../tools/client-util":5,"./../common/config":2,"./../common/rpc-args":4}],2:[function(require,module,exports){
// File: /chrome-extension/common/config.js

var config = {
  extensionId: "iihpjpedfemglflaabiadnnjanplblia",
  methods: {
    serial: {
      methods: ['getDevices', 'send', 'connect', 'disconnect', 'setControlSignals', 'getControlSignals', 'getConnections'],
      listeners: [{starter: 'onReceive.addListener',
		   cleaner: 'onReceive.removeListener'}]
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
  }
};

try {
  module.exports = config;
  if (window)
    window.config = config;

} catch (e) {
  ;
}

},{}],3:[function(require,module,exports){
function FunctionSotrage () {
  this.idPool = 0;
  this.functions_ = {};
}
FunctionSotrage.prototype = {
  getId: function (fn) {
    return Object.getOwnPropertyNames(this.functions_).filter(function (id) {
      return this.functions_[id] === fn;
    })[0];
  },

  getFn: function (id) {
    return this.functions_[id];
  },

  addFn: function (fn) {
    var id = this.idPool++;
    this.functions_[id] = fn;
    return id;
  },

  rmFn: function (fn) {
    delete this.functions_[this.getId(fn)];
  }
};

},{}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
// File: /tools/client-util.js

// Log in a list called id
function log(id, msg) {
	var ele = document.getElementById(id);
	if (!ele) {
		var he = document.createElement('h3');
		he.innerHTML = id;
		ele = document.createElement('ul');
		ele.id = id;
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

},{}]},{},[2,3,4,1]);
