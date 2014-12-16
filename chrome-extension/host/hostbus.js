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
      // if (typeof cb.starter !== 'undefined') {
      //   callback = cb.starter;
      // }

      // Channel: serial, storage, etc
      console.log("RPCBus Listening on: " + channel);
      this.addRuntimeListener('onConnectExternal', function  (port) {
        // Message comes with port
        if (channel == port.name) {
          dbg("Connected: " + channel);

          var msgHandler = function (msg) {
            dbg("RPCBus reveived connection message: ", msg, "from", msg.sender);
            return cb(msg, port.postMessage.bind(port));
          };
          var cleanup = function () {
            if(cleanCb)
              cleanCb(port.sender);
            else
              console.warn("No cleanup function defined.");
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
      return false;      // Always synchronous.
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
