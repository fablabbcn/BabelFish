function Responder() {
	this.msg = {args: [], err: null};
}

// Passed to the chromecall to fix the response
Responder.prototype._callback = function (_sendResp, var_args) {
	// XXX: sendResp is corrupt at this point if called from the chrome
	// context.
	var  sr = _sendResp, args = Array.prototype.slice.call(arguments, 1);
	if (args.some(function (a) {return typeof(a) == 'function';})) {
		throw new Error("No calbacks in callbacks allowed.");
	}
	this.msg.args = args;
	console.log("Sending response: " + JSON.stringify(this.msg));
	// It is already called?
	sr(this.msg);
};

// Get a callback that knows how to send messages but looks like the
// original callback
Responder.prototype.get_callback = function (sendResp) {
	var ret = this._callback.bind(this, sendResp);
	return ret;
};

Responder.prototype.error = function (err) {
	this.msg.error = err;
};

function err(msg) {
	console.error("[Server:ERR] " + msg);
}

function dbg(msg) {
	console.log("[Server] " + msg);
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
				this.listener(request, sender, sendResp);
			} catch (e) {
				sendResp({error: "Bad request: " + JSON.stringify(request) +
									"\nError: "+ e.message});
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
		// Stuff that works.
		// function _fn (cb) {cb([1,2,3]);}; _fn.apply(this.obj, args);
		// args[0]([1,2,3]);
		method.apply(this.obj, args);
	} else {
		err("sending error -> bad request: " + JSON.stringify(request));
		throw new Error("Bad request: " + JSON.stringify(request) +
										"\nSupported methods: " + this.supported_methods);
	}
};
