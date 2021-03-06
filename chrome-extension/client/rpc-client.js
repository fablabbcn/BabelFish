
/* 
-------------------------------------------- 
  RPC_client.js
  Proudly based in Codebender.cc Babelfish
  
  Author: Codebender - Chris Perivolaropoulos <cperivol@csail.mit.edu>
  Author: Smart Citizen Team

  THIS IS A BETA!

--------------------------------------------  
*/

// File: /chrome-extension/client/rpc-client.js

// XXX: move cleaner/listener management code to common.

if (!window.chrome) {
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
    if (!chrome.runtime) {
      throw err('No extention to provide permissions');
    }
    this.runtime_ = window.runtime_ || chrome.runtime;
    window.runtime_ = this.runtime_;

    // Each port is bound to a callback id
    this.ports = {};

    console.log("Contacting host on id:", this.config.extensionId);
  }

  ClientBus.prototype = {
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
          this.config.extensionId, msg, {}, (function _removeMeFromStack (rsp) {
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

    errorHandler: function (message, callback) {
      if (callback.rpcErrorHandler)
        callback.rpcErrorHandler(message);

      throw err(message);
    },

    msgCallbackFactory: function (callback) {
      if (!callback)
        return callback;

      // STACK TRACE: Chrome overrides the stack trace when an error
      // is raised from within a message listener callback. For this
      // reason we maintain a list of stacktraces at creation time of
      // each callback wrapper (let's call it a thread).
      //
      // When a thread is triggered it's topmost function has an
      // attribute called 'stackList' whose car is the stacktrace at
      // the time of it's creation and cdr is the traces at the time
      // of each of it's parent's creation.
      //
      // In other words you may think of all this like maintaining a
      // stacktrace (l) of threads creating each other let's call it
      // threadTrace. Each element of the thread trace is the stack
      // trace of the parent trhead at the time of the child thread
      // invokation. Concatenating the threadTrace and filtering out
      // the thread management code (in this case this file, the rpc
      // manager). We get a readable stack trace.
      //

      callback.rpcErrorHandler = this.customErrorHandler;
      var self = this,
          stackList = [new Error("Stack tracing error").stack],
          stackItem = this.msgCallbackFactory,
          maxStack = 10,
          ret = function (resp) {
            // Ignore free resoponses
            try {
              if (!resp)
                return true;

              // Raise an error if the server reports one.
              if (resp.error) {
                self.errorHandler("RPC call failed:" + resp.error, callback);
                chrome.runtime.lastError = resp.error;
                callback();
              } else {
                // If there is a callback call it.
                if (callback) {
                  return callback.apply(null, argsDecode(resp.args));
                }
              }
              return true;
            } catch(e) {
              console.warn("REAL STACK:");
              // The stacklist is missing the last stack.
              [e.stack].concat(ret.stackList).forEach(function (s) {
                // Filter out the ones coming from us and the ones
                // coming from chrome internals
                (s || "").split("\n").filter(function (l) {
                  return l && l.indexOf("extensions::") == -1 &&
                    l.indexOf("RPCClient") == -1 &&
                    l.indexOf("_removeMeFromStack") == -1 &&
                    l.indexOf("Stack tracing error") == -1;
                }).forEach(function (l) {
                  console.warn(l);
                });
              });
              throw e;
            }
          };

      // Walk up the stack and find someone who owns a stacklist
      while(stackItem && --maxStack) {
        if (stackItem.stackList) {
          stackList = stackList.concat(stackItem.stackList);
          break;
        }

        stackItem = stackItem.caller;
      }

      // When the thread is spawned it will know the stacks of the
      // parent threads
      ret.stackList = stackList;
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
  window.extentionAvailable = true;
  try {
    Object.getOwnPropertyNames(config.methods).forEach(function (m) {
      console.log("Registering client for chrome.", m);
      chrome[m] = new RPCClient(config, m);
    }
                                                      );
  }
  catch (err) {
    console.error(err.message);
    window.extentionAvailable = false;
  }

  if (window){
    window.ClientBus = ClientBus;
    window.RPCClient = RPCClient;
  }
  module.exports.extentionAvailable = window.extentionAvailable;
})();
