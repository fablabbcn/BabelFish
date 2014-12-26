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
  this.supportedMethods = config.methods[name].methods || [];
  // Connection based methods
  this.supportedListeners = config.methods[name].listeners || [];
  this.listenerCallbacks = {};
  this.methodPaths(this.supportedListeners).forEach(function (p) {
    this.listenerCallbacks[p] = [];
  }.bind(this));

  // Create the object
  this.objName = name;
  this.obj = obj || chrome[name];
  if (config.extensionId != chrome.runtime.id) {
    console.error("The clients may think my id is '" + config.extensionId +
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

  var listenerForMethods =
        this.listenerForStuff.bind(this, this.supportedMethods, false),
      listenerForListeners =
        this.listenerForStuff.bind(this, this.supportedListeners, false);
  bus.hostListener(false, listenerForMethods);
  bus.hostListener(this.objName, listenerForListeners,
                   this.cleanAllCallbacks.bind(this));
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
        cbHandler = this.cbHandlerFactory(sendResp, request.callbackId,
                                          request.method, request.sender),
        args = argsDecode(request.args, cbHandler);

    dbg("RPCHost applying: ", request.method,  args);
    try {
      method.apply(this.obj, args);
      if (chrome.runtime.lastError)
        throw chrome.runtime.lastError;

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
  cbHandlerFactory: function (sendResp, callbackId, methodPath, sender) {
    var registered = [],
        self = this,
        ret = function (var_args) {
          if (chrome.runtime.lastError) {
            self.sendError(chrome.runtime.lastError, sendResp);
            return false;
          }
          var args = Array.prototype.slice.call(arguments),
              msg = {args: argsEncode(args), error: null};

          dbg("RPCHost requesting callback", callbackId, " with args:", args);
          try {
            sendResp(msg);
          } catch (e) {
            console.warn("Tried to send to a closed connection. Considering the tab closed.",
                         {
                           msg: msg,
                           error: e,
                           sender: sender}
                        );
            // This is probably the only way to be sure the tab closed.
            self.cleanAllCallbacks(sender);
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
      if (this.listenerCallbacks[methodPath].indexOf(ret) == -1) {
        dbg("Adding callback to", methodPath,":", callbackId);
        this.listenerCallbacks[methodPath].push(ret);
      }

      this.garbageCollectCallbacks(this.getListenerObject(methodPath));
    }

    ret.sender = sender;
    ret.callbackId = callbackId;
    return ret;
  },

  // Given a starter or a cleaner or an object, get the object
  getListenerObject: function (listenerMethodName) {
    var filter;

    if (typeof listenerMethodName === "string")
      filter = function (l) {
        return (l.cleaner == listenerMethodName ||
                l.starter == listenerMethodName);
      };
    else
      filter = function (l) {
        return (l.cleaner == listenerMethodName.cleaner &&
                l.starter == listenerMethodName.starter);
      };

    return this.supportedListeners.filter(filter);

  },

  // Get all stored callbacks related to listenerMethodName that may
  // be a cleaner or a listener.
  getListenerCallbacks: function (listenerMethodName) {
    // Listeners that match the start or the cleaner
    var listenerObjects = this.supportedListeners.filter(function (l) {
      return (l.cleaner == listenerMethodName ||
              l.starter == listenerMethodName);
    }),
        self = this,
        // Concat the listeners that match starts, cleaners and the methodname
        ret = listenerObjects.reduce(function (lst, lo) {
          return lst.concat(self.listenerCallbacks[lo.starter])
            .concat(self.listenerCallbacks[lo.cleaner]);
        }, [])
          .concat(this.listenerCallbacks[listenerMethodName] || []);

    return ret;
  },

  // Remove the cleaned from the lsitener stacks
  garbageCollectCallbacks: function () {
    var self = this;
    dbg("Garbage collection");
    function gcListener(ls) {
      if (ls.cleaner) {
        self.listenerCallbacks[ls.cleaner].forEach(function (cleanCb) {
          // Remove the cleaned listeners
          dbg("[GC:", ls.cleaner,"] Callbacks cleaned:",
              self.listenerCallbacks[ls.cleaner]);
          dbg("[GC", ls.starter,"] Callbacks started:",
              self.listenerCallbacks[ls.starter]);
          self.listenerCallbacks[ls.starter] =
            self.listenerCallbacks[ls.starter].filter(
              function (callback) {
                return callback.callbackId != cleanCb.callbackId;
              });
        });
        self.listenerCallbacks[ls.cleaner] = [];
      }
    }

    self.supportedListeners.forEach(gcListener);
  },

  cleanAllCallbacks: function (sender) {
    var self = this;
    this.garbageCollectCallbacks();

    self.supportedListeners.forEach(function (ls) {
      if (ls.cleaner) {
        dbg("Cleaning running callbacks for", ls.starter);
        self.listenerCallbacks[ls.starter].forEach(function (cbToClean) {
          if (cbToClean.sender == sender) {
            dbg("Cleaning callback:", cbToClean.callbackId);
            // Clean with api
            path2callable(self.obj, ls.cleaner)(cbToClean);

            // Clean from data structure
            self.listenerCallbacks[ls.cleaner].push(cbToClean);
          }
        });
      } else {
        console.warn("Dont know how to clean callbacks of:", ls);
      }
    });
   this.garbageCollectCallbacks();
  }
};
