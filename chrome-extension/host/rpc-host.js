// All hosts should share the same global bus
var bus, log = (function () {
  var DEBUG = true, bus;
  return function (msg) {
    if (DEBUG) {
      console.log.apply(console, Array.prototype.slice.apply(arguments));
    }
  };
})();

function err(msg) {
  console.error("[Server:ERR] " + msg);
}

function HostBus() {
  log("Host bus started.");
  this._listeners = {};
  this.hostListener(false, this.commandListener.bind(this));

  // Echo mode
  this.hostListener(false, (function (msg, cb) {
    if (msg == "ping") {
      log("Client connected...");
      cb("pong");
      return true;
    }

    if (this.echo_mode_enabled)
      cb(msg);

    return true;
  }).bind(this));
}

HostBus.prototype = {
  clearListeners: function () {
    for (var ev in this._listeners)
      this._listeners[ev].forEach(function (l) {
	chrome.runtime[ev].removeListener(l);
      });
  },

  // chrome.runtime.*.addListener and some extras.
  addRuntimeListener: function (eventName, cb) {
    if (!this._listeners[eventName]) this._listeners[eventName] = [];

    this._listeners[eventName].push(cb);
    chrome.runtime[eventName].addListener(cb);
  },

  // If channel is provided listen on that channel otherwise it's a
  // message listener.
  hostListener: function (channel,  cb) {
    if (channel) {
      var callback = cb, cleanup = function () {
	console.warn("No cleanup function defined.");
      };
      if (typeof cb.start !== 'undefined') {
	callback = cb.start;
	cleanup = cb.cleanup;
      }

      console.log("RPCBus Listening on: " + channel);
      this.addRuntimeListener('onConnectExternal', function  (port) {
	// Message comes with port
	if (channel == port.name) {
	  log("Connected: " + channel);

	  var msgHandler = function (msg) {
	    log("RPCBus reveived connection message: ", msg);
	    return callback(msg, port.postMessage.bind(port));
	  };

	  port.onMessage.addListener(msgHandler);
	  port.onDisconnect.addListener( function () {
	    console.log("Disconnecting a port...");
	    cleanup(msgHandler);
	  });
	}
      });
    } else {
      this.addRuntimeListener('onMessageExternal', function (req, sender, sendResp) {
	return cb(req, sendResp);
      });
    }
  },

  commandListener: function (msg, sendResp) {
    if (msg.listener != 'bus') {
      return true; // Disable sendResp and close port
    }

    if (msg.method && this[msg.method]) {

      this[msg.method].
	bind(this, sendResp).
	apply(this, msg.args || []); // => this.method(sendResp, *msg.args)
      return false;	 // Always synchronous.
    } else {
      return true;
    }
  },

  // BUS COMMANDS
  // Set echo mode
  echo_mode: function (sendResp, disable) {
    console.log("Echo mode!");
    this.echo_mode_enabled = !disable;
  }
};

// RPC call message is:
// - timestamp
// - method: method name
// - object: object name
// - args: argumet list
// - error
// RPC response message is:
// - args: callback arguments
// - error
//
// You can provide a host with supported methods and listeners. They
// are the names of the callables. Persistent connections are fired
// for listeners while one-time messages are used for methods.
//
function RPCHost (name, obj) {
  // One time methods.
  this.supported_methods = config.methods[name].methods;
  // Use connections for these
  this.supported_listeners = config.methods[name].listeners;

  this.obj_name = name;
  this.obj = obj || chrome[name];
  if (config.extensionId != chrome.runtime.id) {
    console.error("The clients think my id is '" + config.extensionId +
		  "' (!=" + chrome.runtime.id +
		  ") they wont be able to communicate");
  }

  if (!this.obj) {
    throw new Error("No such object chrome." + this.obj_name);
  }

  this.supported_methods.forEach((function (m) {
    if (typeof(this.path2callable(m)) != 'function')
      throw new Error("Not callable " + m);
  }).bind(this));

  if (!bus) bus = new HostBus();

  var method_listener = this.listener.bind(this, this.supported_methods),
      listener_listener = this.listener.bind(this, this.supported_listeners);
  bus.hostListener(false, method_listener);
  bus.hostListener(this.obj_name, listener_listener);
}

RPCHost.prototype.listenerPaths = function (listeners) {
  return listeners.map(function (l) {
    if (typeof l === 'string') {
      return l;
    } else {
      return l.start;
    }
  });
};

// Listener on mesages: get the request, execute it and send the
// formatted result through sendResp.
RPCHost.prototype.listener = function (allowed_methods, request, sendResp) {
  // Ignore calls not for you
  if (this.obj_name != request.object ||
      this.listenerPaths(allowed_methods).indexOf(request.method) == -1)
    return false;

  var method = this.path2callable(request.method),
      // Replace the 'function' argument with the callback handler and
      // unbox arguments.
      args = argsDecode(request.args, this.cbHandlerFactory(sendResp));

  log("RPCHost applying: " + request.method,  args);
  try {
    method.apply(this.obj, args);
  } catch (e) {
    this.sendError(e, sendResp);
  } finally {
    // Retain the ability to call sendResp
    return true;
  }
};

RPCHost.prototype.sendError = function (error, sendResp) {
  sendResp({args: argsEncode([]), error: error.message});
  throw error;
};

// XXX: Maybe this should block until the callback is done. If this
// becomes a problem consider opening an adhoc connection for callback
// finishing. Using a completely different channel for this will
// reduce the noize in the operational channel and

// Get a callable that when called will package it's arguments and
// pass them to sendResp
RPCHost.prototype.cbHandlerFactory = function (sendResp) {
  return (function (var_args) {
    var args = Array.prototype.slice.call(arguments),
	msg = {args: argsEncode(args), error: null};

    log("RPCHost requesting callback with args:", args);
    try {
      sendResp(msg);
    } catch (e) {
      console.warn("Tried to send to a closed connection. FIXME");
    }
  }).bind(this);
};

// Get a callable member of this.obj given the name. Dot paths are
// supported.
RPCHost.prototype.path2callable = function (name) {
  var names =  name.split('.'),
      method = names.pop(),
      obj = (names.reduce(function (ob, meth) {return ob[meth];}, this.obj)
	     || this.obj);

  if (!obj[method])
    throw new Error('Bad object chrome.'+ this.obj_name +'.'+name);

  return obj[method].bind(obj);
};
