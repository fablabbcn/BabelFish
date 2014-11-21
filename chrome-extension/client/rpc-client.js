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

  var method_type = {
    METHOD: false,
    LISTENER: true
  }, bus;

  function ClientBus(id) {
    this.extensionId = id;
    this.runtime_ = chrome.runtime;

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
	dbg("Sending: ", msg);
	this.runtime_.sendMessage (
	  this.extensionId, msg, {}, (function (msg) {
	    dbg("BUS received: ", msg);
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
    if (!bus) bus = new ClientBus(id);
    this.extensionId = id;
    this.obj_name = obj_name;
    if (!config.methods[obj_name])
      err('Tried to connect to unconfigured object: chrome.' + obj_name);

    this.setup_methods(config.methods[obj_name]);

    // XXX: The callback is called very very late.
    // bus.clientMessage(false, {method: 'setup', object: obj_name},
    // 				this.setup_methods.bind(this));
  }

  RPCClient.prototype = {
    setup_methods: function (rcp) {
      (rcp.methods || []).forEach(
	this.register_method.bind(this, method_type.METHOD));
      (rcp.listeners || []).forEach(
	this.register_method.bind(this, method_type.LISTENER));
      this._setup = true;
    },

    register_method: function (isListener, entry) {
      var name = entry.start || entry,
	  names = name.split('.'),
	  method = names.pop(),
	  obj = names.reduce(function (ob, m) {
	    ob[m] = ob[m] || {};
	    return ob[m];
	  }, this) || this;

      dbg("Registering method", method);
      obj[method] = this._rpc.bind(this, isListener, name);

      if (entry.cleanup) {
	this.cleanUps[entry.cleanup] = true;
      }
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
    _message: function (msg, callback, isListener, isCleanup) {
      bus.clientMessage(isListener && msg.object + '.' + msg.method,
			msg, this._msg_callback.bind(this, callback));
    },

    _rpc: function (isListener, fnname, var_args) {
      // TODO: raise error in case of multiple callbacks.
      var args = Array.prototype.slice.call(arguments, 2),
	  rich_args = argsEncode(args),
	  msg = {
	    timestamp: (new Date).getTime(),
	    object: this.obj_name,
	    method: fnname,
	    args: rich_args,
	    error: null
	  };
      dbg("Calling chrome." + this.obj_name + '.' + fnname + "(", args, ")");

      this.listeningMethods[rich_args.callback] = msg.methodId;
      // Send the rpc call. _message will deal with the callback
      // cleanup.
      this._message(msg, rich_args.callback, isListener);
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
