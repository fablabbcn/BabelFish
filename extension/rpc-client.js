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

config = {
	extensionId: "ljmndkpjladbggcilngmpldikabkodpa"
};

function dbg(msg) {
	console.log(msg);
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
	_message: function (obj, callback) {
		chrome.runtime.sendMessage(
			this.extensionId,
			obj,
			function (resp) {
				dbg(resp);
				// The caller should take care of setting a this beforeand.
				if (callback)
					callback.apply(null, resp.args);
			});
	},

	_rpc: function (fnname, args) {
		console.log("calling "+ fnname);
		// TODO: raise error in case of multiple callbacks.
		var fn_args = [];
		var callback;
		for (var ar = 1; ar < arguments.length; ar++) {
			var a = arguments[ar];
			if (typeof(a) == 'function') {
				callback = a;
				fn_args.push('<function>');
			} else {
				fn_args.push(a);
			}
		}

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
