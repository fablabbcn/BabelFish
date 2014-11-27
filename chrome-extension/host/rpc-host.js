// All hosts should share the same global bus
var bus, dbg = (function () {
  var DEBUG = true;
  return function (msg) {
    if (DEBUG) {
      console.log.apply(console, Array.prototype.slice.apply(arguments));
    }
  };
})();

function err(msg) {
  console.error("[Server:ERR] " + msg);
}

// Get a callable member of this.obj given the name. Dot paths are
// supported.
function path2callable (object, name) {
  var names =  name.split('.'),
      method = names.pop(),
      obj = (names.reduce(function (ob, meth) {return ob[meth];}, object)
	     || object);

  if (!obj[method])
    throw new Error('Bad object chrome.*.'+name);

  return obj[method].bind(obj);
};

function HostBus() {
  dbg("Host bus started.");
  this._listeners = {};
  this.hostListener(false, this.commandListener.bind(this));

  // Echo mode
  this.hostListener(false, (function (msg, cb) {
    if (msg == "ping") {
      dbg("Client connected...");
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
  hostListener: function (channel,  cb, cleanCb) {
    if (channel) {
      var callback = cb, cleanup = function () {
        if(cleanCb)
          cleanCb(channel);
        else
	  console.warn("No cleanup function defined.");
      };
      if (typeof cb.starter !== 'undefined') {
	callback = cb.starter;
      }

      console.log("RPCBus Listening on: " + channel);
      this.addRuntimeListener('onConnectExternal', function  (port) {
	// Message comes with port
	if (channel == port.name) {
	  dbg("Connected: " + channel);

	  var msgHandler = function (msg) {
	    dbg("RPCBus reveived connection message: ", msg);
	    return callback(msg, port.postMessage.bind(port));
	  };

	  port.onMessage.addListener(msgHandler);
	  port.onDisconnect.addListener( function () {
	    console.log("Disconnecting listener port for", channel);
	    cleanup(msgHandler);
	  });
	}
      });
    } else {
      this.addRuntimeListener('onMessageExternal', function (req, sender, sendResp){
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
  dbg("Host bus started.");
  this._listeners = {};
  this.hostListener(false, this.commandListener.bind(this));

  // Echo mode
  this.hostListener(false, (function (msg, cb) {
    if (msg == "ping") {
      dbg("Client connected...");
      cb("pong");
      return true;
    }

    if (this.echo_mode_enabled)
      cb(msg);

    return true;
  }).bind(this));
}

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
  this.supportedMethods = config.methods[name].methods;
  // Connection based methods
  this.supportedListeners = config.methods[name].listeners;
  this.listenerCallbacks = {};
  this.methodPaths(this.supportedListeners).forEach(function (p) {
    this.listenerCallbacks[p] = [];
  }.bind(this));

  // Create the object
  this.objName = name;
  this.obj = obj || chrome[name];
  if (config.extensionId != chrome.runtime.id) {
    console.error("The clients think my id is '" + config.extensionId +
		  "' (!=" + chrome.runtime.id +
		  ") they wont be able to communicate");
  }

  // Check the object
  if (!this.obj) {
    throw new Error("No such object chrome." + this.objName);
  }

  // Check the methods
  this.supportedMethods.forEach((function (m) {
    if (typeof(path2callable(this.obj, m)) != 'function')
      throw new Error("Not callable " + m);
  }).bind(this));

  if (!bus) bus = new HostBus();

  var listenerForMethods = this.listenerForStuff.bind(this, this.supportedMethods,
                                                      false),
      listenerForListeners = this.listenerForStuff.bind(this, this.supportedListeners,
                                                        false);
  bus.hostListener(false, listenerForMethods);
  bus.hostListener(this.objName, listenerForListeners, this.cleanAllCallbacks.bind(this));
}

RPCHost.prototype = {

  methodIsListenerOrCleaner: function (methodNameOrObj) {
    var strIsListener = function (m) {
      return typeof this.listenerCallbacks[m] !== "undefined";
    }.bind(this);

    return strIsListener(methodNameOrObj) ||
      strIsListener(methodNameOrObj.starter);
  },

  // Get *all* the available method paths
  methodPaths: function (listenerObjectsOrStrings) {
    return listenerObjectsOrStrings.reduce(function (ls, obj) {
      return ls.concat(obj.starter ? [obj.starter, obj.cleaner] : obj);
    }, []);
  },

  // Listener on mesages: get the request, execute it and send the
  // formatted result through sendResp.
  listenerForStuff: function (allowedMethods, garbageCollect, request, sendResp) {
    // Ignore calls not for you
    if (this.objName != request.object ||
        this.methodPaths(allowedMethods).indexOf(request.method) == -1)
      return true;

    var method = path2callable(this.obj, request.method),
        // Replace the 'function' argument with the callback handler,
        // assign the callbackId and unbox arguments.
        cbHandler = this.cbHandlerFactory(sendResp, request.callbackId, request.method),
        args = argsDecode(request.args, cbHandler);

    dbg("RPCHost applying: " + request.method,  args);
    try {
      method.apply(this.obj, args);
    } catch (e) {
      this.sendError(e, sendResp);
    } finally {
      if (garbageCollect)
        this.garbageCollectCallbacks();

      // Retain the ability to call sendResp
      return false;
    }
  },

  sendError: function (error, sendResp) {
    sendResp({args: argsEncode([]), error: error.message});
    throw error;
  },

  // XXX: Maybe this should block until the callback is done. If this
  // becomes a problem consider opening an adhoc connection for callback
  // finishing. Using a completely different channel for this will
  // reduce the noize in the operational channel and

  // Get a callable that when called will package it's arguments and
  // pass them to sendResp
  cbHandlerFactory: function (sendResp, callbackId, methodPath) {
    var registered = [],
        ret = function (var_args) {
          var args = Array.prototype.slice.call(arguments),
              msg = {args: argsEncode(args), error: null};

          dbg("RPCHost requesting callback", callbackId, " with args:", args);
          try {
            sendResp(msg);
	  } catch (e) {
	    console.warn("Tried to send to a closed connection. FIXME. msg:", msg);
	  }
	};

    if (this.methodIsListenerOrCleaner(methodPath)) {
      dbg("Handling listener:", methodPath);
      dbg("Found callbacks:", this.getListenerCallbacks(methodPath));
      registered = this.getListenerCallbacks(methodPath).filter(function (m) {
        return m.callbackId == callbackId;
      });

      // If we have seen this id before it's the one the client meant
      if (registered.length > 0)
        ret = registered[0];

      // Populate the listenerCallbacks
      if (this.listenerCallbacks[methodPath].indexOf(ret) == -1){
        dbg("Adding callback to", methodPath,":", callbackId);
        this.listenerCallbacks[methodPath].push(ret);
      }
    }

    ret.callbackId = callbackId;
    return ret;
  },

  // Get all stored callbacks related to listenerMethodName that may
  // be a cleaner or a listener.
  getListenerCallbacks: function (listenerMethodName) {
    // Listeners that match the start or the cleaner
    var listenerObjects = this.supportedListeners.filter(function (l) {
      return (l.cleaner == listenerMethodName ||
	       l.starter == listenerMethodName);
    }),
	// Concat the listeners that match starts, cleaners and the methodname
	ret = listenerObjects.reduce(function (lst, lo) {
	  return lst.concat(this.listenerCallbacks[lo.starter]).
	    concat(this.listenerCallbacks[lo.cleaner]);
	}.bind(this), []).concat(this.listenerCallbacks[listenerMethodName]);

    return ret;
  },

  // Remove the cleaned from the lsitener stacks
  garbageCollectCallbacks: function () {
    dbg("Collecting garbage callbacks from stacks...");

    var self = this;
    self.supportedListeners.forEach(function (ls) {
      if (ls.cleaner) {
	self.listenerCallbacks[ls.cleaner].forEach(function (cleanedCb) {

	  // Remove the cleaned listeners
	  self.listenerCallbacks[ls.starter].reduce(function (lst, callback) {
	    if (callback === cleanedCb) {
              dbg("Garbage collecting callback:", callback.callbackId);
	      return lst;
            }
	    return lst.concat([callback]);
	  }, []);
	});
      }
    });
  },

  cleanAllCallbacks: function () {
    var self = this;
    this.garbageCollectCallbacks();

    self.supportedListeners.forEach(function (ls) {
      if (ls.cleaner) {
        dbg("Cleaning running callbacks for", ls.starter);
        self.listenerCallbacks[ls.starter].forEach(function (cbToClean) {
          dbg("Cleaning callback:", cbToClean.callbackId);
          path2callable(self.obj, ls.cleaner)(cbToClean);
        });
      } else {
        console.warn("Dont know how to clean callbacks of:", ls);
      }
    });
  }
};
