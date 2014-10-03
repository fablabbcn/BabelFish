var DEBUG = false;

function err(msg) {
	console.error("[Server:ERR] " + msg);
}

function dbg(msg) {
	DEBUG && console.log("[Server] " + msg);
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
function RPCHost (name, supported_methods, supported_listeners, obj) {
	this.supported_methods = supported_methods; // One time methods.
	this.supported_listeners = supported_listeners; // Use connections for these
	this.obj_name = name;
	this.obj = chrome[name];

	if (!this.obj) {
		throw new Error("No such object " + this.obj_name);
	}

	supported_methods.forEach((function (m) {
		if (typeof(this.callable(m)) != 'function')
			throw new Error("Not callable " + m);
	}).bind(this));

	dbg("Listening on chrome." + name + ".{" +
			supported_methods + ", " + supported_listeners + "}");
	chrome.runtime.onMessageExternal.addListener(
		(function(request, sender, sendResp) {
			try {
				if (this.obj_name == request.object && request.method &&
						this.supported_methods.indexOf(request.method) != -1)
					throw new Error("Bad request: " + JSON.stringify(request) +
													"\n" + this.obj_name + " methods: " + this.supported_methods);

				// Must return true to call sendResp after listener finishes
				return this.listener(request, sender, sendResp);
			} catch (e) {
				sendResp({error: "Bad request on method: " + JSON.stringify(request) +
									"\nError: "+ e.message});
				return false;
			}
		}).bind(this));

	if (this.supported_listeners) {
		// port -> {o
		//   name: 'serial'
		// }
		// message -> {args: [..], error: ..}
		chrome.runtime.onConnect.addListener(
			function (port) {
				try {
					if (port.msg.object == this.obj_name) {
						port.onMessage.addListener(function (msg) {
							if (this.supported_listeners.indexOf(msg.method) != -1)
								this.listener(msg, port.postMessage.bind(port));
						});
					}
				} catch (e) {
					port.postMessage({error: "Bad request on listener: " +
														JSON.stringify(request) +
										"\nError: "+ e.message});
				}
			});
	}
}

// Get a callable that when called will package it's arguments and
// pass them to sr
RPCHost.prototype.get_callback = function (sr) {
	return function (sendResp, var_args) {
		var msg = {args: Array.prototype.slice.call(arguments, 1), err: null};
		dbg("Sending: " +  this.msg.args);
		sendResp(msg);
		if (chrome.runtime.lastError) {
			throw chrome.runtime.lastError;
		}
	}.bind(this, sr);
};

// Get a callable member of this.obj given the name. Dot paths are
// supported.
RPCHost.prototype.callable = function (name) {
	var names =  name.split('.'),
			method = names.pop(),
			obj = names.reduce(function (ob, meth) {return ob[meth];}, self.obj)
				|| this.obj;

	return obj[method].bind(obj);
};

// Listener on mesages: get the request, execute it and send the
// formatted result through sendResp.
RPCHost.prototype.listener = function (request, sendResp) {
	if (!this.obj) {
		throw new Error("No permission to chrome."+ this.obj_name +
										"\nAvailable: " + Object.getOwnPropertyNames(chrome));
	}

	// Make sure they are talking to us.

	var method = this.callable(request.method),
			args = (request.args || []).map(function (a) {
				var ret = ((a == "<function>") &&
									 (this.get_callback(sendResp)) || a);
				return ret;
			});

	method.apply(this.obj, args);
	return true;
};
