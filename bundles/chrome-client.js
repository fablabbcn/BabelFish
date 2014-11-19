(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// File: /chrome-extension/client/rpc-client.js

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
      return function (msg) {
	console.log("[Client] " + msg);
      };
    } else {
      return function (msg) {};
    }
  })();

  function err(msg) {
    throw new Error("[Client:error] " + msg);
  }

  var method_type = {
    METHOD: false,
    LISTENER: true
  }, bus;

  function ClientBus(id) {
    this.extensionId = id;
    this.pingTimeout = 5000;
    this.runtime_ = chrome.runtime;

    this.clientMessage(false, "ping", function (msg) {
      if (msg == "pong") {
	this.hostExists_ = true;
      }
    });

    setTimeout(function () {
      if (!this.hostExists_)
	err("Host did not respond in " + this.pingTimeout +
		    "ms. Extension id: "+this.extensionId );
    }.bind(this), this.pingTimeout);
  }

  ClientBus.prototype = {
    default_cb: function (msg) {
      if (!msg)
	err("Chrome's last error: " + this.runtime_.lastError);

      if (msg.error)
	throw err(msg.error);
    },

    // cb(msg)
    clientMessage: function (persist, msg, cb) {
      cb = cb  || this.default_cb;
      if (persist) {
	dbg("Connecting: " + str(msg));
	var port = this.runtime_.connect(this.extensionId, {name: msg.object});
	// cb has access only to msg, not to any other arguments the API
	// provides.
	port.postMessage(msg);
	port.onMessage.addListener(function (msg) {cb(msg);});
      } else {
	dbg("Sending: " + str(msg));
	this.runtime_.sendMessage (
	  this.extensionId, msg, {}, (function (msg) {
	    dbg("BUS received: " + str(msg));
	    cb(msg);
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
  function RPCClient(id, obj_name, supported_methods, supported_listeners) {
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
    if (!bus) bus = new ClientBus(id);
    this.extensionId = id;
    this.obj_name = obj_name;
    if (!config.methods[obj_name])
      err('Tried to connect to unconfigured object: chrome.' + obj_name);

    this.setup_methods(config.methods[obj_name]);

    // XXX: The callback is called very very late.
    // bus.clientMessage(false, {method: 'setup', object: obj_name},
    // 									this.setup_methods.bind(this));
  }

  RPCClient.prototype = {
    setup_methods: function (rcp) {
      (rcp.methods || []).forEach(
	this.register_method.bind(this, method_type.METHOD));
      (rcp.listeners || []).forEach(
	this.register_method.bind(this, method_type.LISTENER));
      this._setup = true;
    },

    register_method: function (isListener, name) {
      var names = name.split('.'),
	  method = names.pop(),
	  obj = names.reduce(function (ob, m) {
	    ob[m] = ob[m] || {};
	    return ob[m];
	  }, this) || this;
      obj[method] = this._rpc.bind(this, isListener, name);
    },

    _msg_callback: function (callback, resp) {
      if (resp.error) {
	err(resp.error);
      } else {
	if (callback) {
	  callback.apply(null, argsDecode(resp.args));
	}
      }
    },


    // Send a message potentially opening a connection, running callback
    // on response. In the case of a connection the callback is being on
    // _every_ response on the created port thus creating a listener.
    _message: function (msg, callback, isListener) {
      bus.clientMessage(isListener && msg.object + '.' + msg.method,
			msg, this._msg_callback.bind(this, callback));
    },

    _rpc: function (isListener, fnname, var_args) {
      // TODO: raise error in case of multiple callbacks.
      var args = Array.prototype.slice.call(arguments, 2),
	  rich_args = argsEncode(args);
      dbg("Calling chrome." + this.obj_name + '.' + fnname +
	  "(" + args.map(JSON.stringify) + ")");

      // Send the rpc call.
      this._message({
	timestamp: (new Date).getTime(),
	object: this.obj_name,
	method: fnname,
	args: rich_args,
	error: null
      }, rich_args.callback, isListener);
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

},{"./../../tools/client-util":4,"./../common/config":2,"./../common/rpc-args":3}],2:[function(require,module,exports){
// File: /chrome-extension/common/config.js

var config = {
  extensionId: "iihpjpedfemglflaabiadnnjanplblia",
  methods: {
    serial: {
      methods: ['getDevices', 'send', 'connect', 'disconnect', 'setControlSignals', 'getControlSignals'],
      listeners: ['onReceive.addListener']
    },
    runtime: {
      methods: ['getPlatformInfo'],
      listeners: ['onLaunched.addListener']
    },
    app: {
      methods: ['window.create'],
      listeners: ['runtime.onLaunched.addListener']
    },
    notifications: {
      methods: ['create', 'clear'],
      listeners: ['onClicked.addListener']
    },
    storage: {
      methods: ['local.get', 'local.set'],
      listeners: ['onChanged.addListener']
    },
    syncFileSystem: {
      methods: ['requestFileSystem'],
      listeners: []
    },

    alarms: {
      methods: ['clear', 'create', 'getAll'],
      listeners: ['onAlarm.addListener']
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
  var ret = {callback: null};
  ret.args = args.map(function (arg) {
    if (arg instanceof Function) {
      ret.callback = arg;
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

},{}],4:[function(require,module,exports){
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

},{}]},{},[2,3,1]);
