var DEBUG = false;

function err(msg) {
	console.error("[Server:ERR] " + msg);
}

function dbg(msg) {
	DEBUG && console.log("[Server] " + msg);
}


function Responder() {
	this.msg = {args: [], err: null};
}

// Get a callback that knows how to send messages but looks like the
// original callback
Responder.prototype.get_callback = function (sr) {
	return function (sendResp, var_args) {
		this.msg.args = Array.prototype.slice.call(arguments, 1);
		dbg("Sending: " +  this.msg.args);
		sendResp(this.msg);
		if (chrome.runtime.lastError) {
			throw chrome.runtime.lastError;
		}
	}.bind(this, sr);
};

Responder.prototype.error = function (err) {
	this.msg.error = err;
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
// The responder takes care of sending back
//
function RPCHost (name, supported_methods, obj) {
	this.supported_methods = supported_methods;
	this.obj_name = name;
	this.obj = chrome[name];
	if (!this.obj) {
		throw new Error("No such object " + this.obj_name);
	}

	supported_methods.forEach(function (m) {
		if (!(m in this.obj))
			throw new Error("Object " + this.obj_name +
											" does not support method "+ m +
											" supported methods: " +
											Object.getOwnPropertyNames(this.obj));
	}.bind(this));

	dbg("Listening on chrome." + name + ".{" + supported_methods + "}");
	chrome.runtime.onMessageExternal.addListener(
		(function(request, sender, sendResp) {
			try {
				// Must return true to call sendResp after listener finishes
				return this.listener(request, sender, sendResp);
			} catch (e) {
				sendResp({error: "Bad request: " + JSON.stringify(request) +
									"\nError: "+ e.message});
				return false;
			}
		}).bind(this));
}

// Listener on mesages
RPCHost.prototype.listener = function (request, sender, sendResp) {
	if (!this.obj) {
		throw new Error("No permission to chrome."+ this.obj_name +
										"\nAvailable: " + Object.getOwnPropertyNames(chrome));
	}

	if (this.obj_name == request.object && request.method &&
			this.supported_methods.indexOf(request.method) != -1) {
		var method = this.obj[request.method].bind(this.obj),
				responder = new Responder(),
				args = (request.args || []).map(function (a) {
					var ret = ((a == "<function>") &&
										 (responder.get_callback(sendResp)) || a);
					return ret;
				});
		method.apply(this.obj, args);
		return true;
	} else {
		err("sending error -> bad request: " + JSON.stringify(request));
		throw new Error("Bad request: " + JSON.stringify(request) +
										"\nSupported methods: " + this.supported_methods);
		return false;
	}
};
