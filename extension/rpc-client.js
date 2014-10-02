// Notably insupported stuff:
//
// - Callbacks not to be called at the very end of the rpc
// - Return values. Most chromecalls use callbacks anyway.
//
// RPC is:
// - timestamp
// - method: method> name
// - object: object name
// - args: argumet list
// - error
// Resp:
// - args: callback arguments
// - ret: return value (not implemented)
//

function dbg (msg) {
	console.log("[Client] " + msg);
}

function err (msg) {
	throw new Error("[Client:error] " + msg);
}

// id: the extension id
// obj: name of the remote object
// supported_calls: array of names of calls supported.
function RPCClient(id, obj, supported_calls) {
	this.extensionId = id;
	this.obj = obj;
	for (var i in supported_calls) {
		var method = supported_calls[i];
		this[method] = this._rpc.bind(this, method);
	}
}

RPCClient.prototype = {
	_msg_callback: function (callback, resp) {
		dbg("Response was: " + JSON.stringify(resp));
		if (resp.error) {
			err(resp.error);
		} else {
			if (callback)
				callback.apply(null, resp.args);
		}
	},

	_message: function (obj, callback) {
		dbg("Messaging for chrome." + obj.object + '.' + obj.method + "(" + obj.args.map(JSON.stringify) + ")");
		chrome.runtime.sendMessage(
			this.extensionId, obj, this._msg_callback.bind(this, callback));
	},

	_rpc: function (fnname, var_args) {
		// TODO: raise error in case of multiple callbacks.
		var args = Array.prototype.slice.call(arguments, 1);
		dbg("Calling chrome." + this.obj + '.' + fnname + "(" + args.map(JSON.stringify) + ")");

		var callback, fn_args = args.map(function (a) {
			if (typeof(a) == 'function') {
				callback = a;
				return '<function>';
			} else {
				return a;
			}
		});

		// Send the rpc call.
		this._message({
			timestamp: (new Date).getTime(),
			object: this.obj,
			method: fnname,
			args: fn_args,
			error: null
		}, callback);
	}
};
