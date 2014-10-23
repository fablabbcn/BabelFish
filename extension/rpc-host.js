// All hosts should share the same global bus

var DEBUG = false, bus;
function log(msg) {
	if (DEBUG) {
		console.log("Server: " + msg);
	}
}

function err(msg) {
	console.error("[Server:ERR] " + msg);
}

function HostBus() {
	console.log("Host bus started.");
	this._listeners = {};
	this.hostListener(false, this.commandListener.bind(this));

	// Echo mode
	this.hostListener(false, (function (msg, cb) {
		if (this.echo_mode_enabled)
			cb(msg);
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

	// If channel is provided listen on that channel
	hostListener: function (channel,  cb) {
		if (channel) {
			console.log("Listening on: " + channel);
			this.addRuntimeListener('onConnectExternal', function  (port) {
				// Message comes with port
				if (channel == port.name) {
					console.log("Connected: " + channel);
					port.onMessage.addListener( function (msg) {
						cb(msg, port.postMessage.bind(port));
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

// if (DEBUG) {
// 	function dbg(msg) {
// 		console.log("[Server] " + msg);
// 	}
// }

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
	this.supported_methods = config.methods[name].methods; // One time methods.
	this.supported_listeners = config.methods[name].listeners; // Use connections for these
	this.obj_name = name;
	this.obj = obj || chrome[name];
	if (config.extensionId != chrome.runtime.id) {
		console.error("The clients think my id is '" + config.extensionId +
									"' (!=" + chrome.runtime.id + ") they wont be able to communicate");
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


// Listener on mesages: get the request, execute it and send the
// formatted result through sendResp.
RPCHost.prototype.listener = function (allowed_methods, request, sendResp) {
	console.log("Host received: " + JSON.stringify(request));
 	// Ignore calls not for you
	if (this.obj_name != request.object ||
			allowed_methods.indexOf(request.method) == -1)
		return false;

	var method = this.path2callable(request.method),
			args = argsDecode(request.args, this.cbHandlerFactory(sendResp));

	method.apply(this.obj, args);
	return true;
};

// Get a callable that when called will package it's arguments and
// pass them to sr
RPCHost.prototype.cbHandlerFactory = function (sr) {
	return (function (sendResp, var_args) {
		var args = Array.prototype.slice.call(arguments, 1),
				msg = {args: argsEncode(args), err: null};
		sendResp(msg);
	}).bind(this, sr);
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
