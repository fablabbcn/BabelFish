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

var DEBUG = true;

function dbg (msg) {
	DEBUG && console.log("[Client] " + msg);
}

function err (msg) {
	throw new Error("[Client:error] " + msg);
}

// id: the extension id
// obj: name of the remote object
// supported_calls: array of names of calls supported.
function RPCClient(id, obj_name, supported_methods, supported_listeners) {
	console.assert(typeof(id) == 'string', "Extension id should be a string");
	console.assert(typeof(obj_name) == 'object',
								 "object name should be a string");
	this.extensionId = id;
	this.obj_name = obj_name;

	supported_methods.forEach(this.register_fn.bind(this, false));
	supported_listeners.forEach(this.register_fn.bind(this, true));
}

RPCClient.prototype = {
	register_fn: function (name) {
		var names = name.split('.'),
				method = names.pop(),
				obj = names.reduce(function (ob, m) {
					ob[m] = {};
					return ob[m];
				}, this) || this;
		obj[method] = this._rpc.bind(this, method);
		dbg('Registering to client: ' + name);
	},

	_msg_callback: function (callback, resp) {
		dbg("Response was: " + JSON.stringify(resp));
		if (resp.error) {
			err(resp.error);
		} else {
			if (callback)
				callback.apply(null, resp.args);
		}
	},

	// Send a message potentially opening a connection, running callback
	// on response. In the case of a connection the callback is being on
	// _every_ response on the created port thus creating a listener.
	_message: function (obj, callback, connect) {
		var callString = "chrome." + obj.object + '.' + obj.method +
				"(" + obj.args.map(JSON.stringify) + ")",
		unboundCb = this._msg_callback.bind(this, callback);
		if (connect) {
			// Connect setting up the listener
			// run callback on message (XXX: provide no feedback to the host)
			var port = chrome.runtime.connect({msg: obj});
			port.onMessage(unboundCb);
		} else {
			chrome.runtime.sendMessage(
				this.extensionId, obj, unboundCb);
		}
	},

	_rpc: function (connect, fnname, var_args) {
		// TODO: raise error in case of multiple callbacks.
		console.assert(typeof('connect') == connect,
									 "connect=true to use connection");
		var args = Array.prototype.slice.call(arguments, 2);
		dbg("Calling chrome." + this.obj_name + '.' + fnname +
				"(" + args.map(JSON.stringify) + ")");

		// XXX: You are allowed only one callback.
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
			object: this.obj_name,
			method: fnname,
			args: fn_args,
			error: null
		}, callback, connect);
	}
};
