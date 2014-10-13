// Both a client and a host
function MockBus() {
	this.persistent_listeners = [];
	this.burst_listeners = [];
	this.lastError = null;
	this.msg_log = [];
}

MockBus.prototype = {
	listeners: function(persist) {
		if (persist)
			return this.persistent_listeners;
		else
			return this.burst_listeners;
	},

	sendResp: function (ctx, cb, msg) {
		if (!ctx.persist) {
			if (!ctx.called)
				ctx.called = true;
			else
				throw new Error("Attempt to call expired sendResp");
		}

		cb(msg);
	},

	hostListener: function (persist, cb) {
		this.listeners(persist).push(cb);
	},

	clientMessage: function (persist, msg, cb) {
		this.msg_log.push(msg);
		this.listeners(persist).forEach((function (l) {
			var _sendResp = this.sendResp.bind(
				this, {persist: persist, called: false}, cb);
			l(msg, _sendResp);
		}).bind(this));
	}
};

// ATTENTION: A different instance of ChromeBus is maintained on the
// client and host side. It is thus important for a ChromeBus object
// not to depend on internal state.
//
// set host to true on host side bus.
function ChromeBus(extensionId) {
	this._listeners = {};
	this.extensionId = extensionId;

	if (!extensionId) {
		console.log("Host started.");
		this.hostListener(false, this.commandListener.bind(this));
	}
}

// cb(msg, sendResp)
ChromeBus.prototype = {
	clearListeners: function () {
		for (var ev in this._listeners)
			this._listeners[ev].forEach(function (l) {
				chrome.runtime[ev].removeListener(l);
			});
	},

	addRuntimeListener: function (eventName, cb) {
		if (!this._listeners[eventName]) this._listeners[eventName] = [];

		// this._listeners[eventName].push(cb);
	  // chrome.runtime[eventName].addListener(cb);
	},

	hostListener: function (persist, cb) {
		if (persist) {
			this.addRuntimeListener('onConnect', function  (port) {
				// Message comes with port
				cb(port.msg, port.sendMessage.bind(port));
				// Note: the role of a connection is for the host to trigger
				// client callbacks. The client has nothing more to say than
				// the chrome API call.
			});
		} else {
			// The problem:
			// - It doesnt matter if I attach listener directly or with the callback
			// - Removing the call removes the undeined response
			// - Calling the provided sendResp does not change the response
			// - Calling plain sendMessage on the user does not work
			// - Moving it out also doesnt work
			// - Removing the onConnect part didnt work
			// - Disabling all access the bus has to messages and having a separate listener still yielded undefined which went away with the call
			// Removed everything from the extension but the listener and still
			// - Whatever argument to the call gets you an undefined response

			chrome.runtime.onMessageExternal.addListener(
				// this.addRuntimeListener('onMessageExternal',
				function (req, sender, sendResp) {
					cb(req, sendResp);
				});
		}
	},

	// XXX: callbacks get called with no args sometimes. Find out why
	default_cb: function (msg) {
		if (!msg)
			throw new Error("Chrome last error: " + chrome.runtime.lastError);

		if (msg.error)
			throw new Error(msg.error);
	},

	// cb(msg)
	clientMessage: function (persist, msg, cb) {
		cb = cb  || this.default_cb;
		if (persist) {
			var port = chrome.connect({msg: msg});
			// cb has access only to msg, not to any other arguments the API
			// provides.
			port.onMessage(function (msg) {cb(msg);});
		} else {
			console.log("Sending - " + JSON.stringify(msg));
			chrome.runtime.sendMessage(
				this.extensionId, msg, {}, (function (msg) {
					cb(msg || {
						error: chrome.runtime.lastError.message,
						extensionId: this.extensionId
					});
				}).bind(this));
		}
	},

	// Called by the client.
	busCommand: function (cmd, var_args) {
		var args = Array.prototype.slice.call(arguments, 1);
		this.clientMessage(false, {object: 'bus', method: cmd, args: args});
	},

	commandListener: function (msg, sendResp) {
		if (msg.object != 'bus') {
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
	echo_mode: function (sendResp) {
		console.log("Echo mode!");
		this.hostListener(false, function (msg, cb) {
			cb(msg);
		});
	}
};
