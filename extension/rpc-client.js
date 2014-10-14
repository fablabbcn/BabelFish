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

var DEBUG=false;
if (DEBUG) {
	function dbg (msg) {
		console.log("[Client] " + msg);
	}
} else {
	function dbg (msg) {}
}

function err (msg) {
	throw new Error("[Client:error] " + msg);
}

var method_type = {
	METHOD: false,
	LISTENER: true
}, bus;


function ClientBus(id) {
	this.extensionId = id;
}
ClientBus.prototype = {
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
			console.log("Connectiong to: " + msg.object);
			var port = chrome.runtime.connect(this.extensionId, {name: msg.object});
			// cb has access only to msg, not to any other arguments the API
			// provides.
			port.postMessage(msg);
			port.onMessage.addListener(function (msg) {cb(msg);});
		} else {
			console.log("Sending: " + str(msg));
			chrome.runtime.sendMessage(
				this.extensionId, msg, {}, (function (msg) {
					console.log("RPC received: " + msg);
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
		this.clientMessage(false, {listener: 'bus', method: cmd, args: args});
	}
};

// id: the extension id
// obj: name of the remote object
// supported_calls: array of names of calls supported.
function RPCClient(id, obj_name, supported_methods, supported_listeners) {
	console.assert(typeof(id) == 'string', "Extension id should be a string");
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
	if (!bus) bus = new ClientBus(id);
	this.extensionId = id;
	this.obj_name = obj_name;
	if (!config.methods[obj_name])
		throw Error('Tried to connect to unconfigured object: chrome.' + obj_name);

	this.setup_methods(config.methods[obj_name]);

	// XXX: The callback is called very very late.
	// bus.clientMessage(false, {method: 'setup', object: obj_name},
	// 									this.setup_methods.bind(this));
}

RPCClient.prototype = {
	setup_methods: function (rcp) {
		(rcp.methods || []).forEach(
			this.register_method.bind(this, method_type.METHOD));
		(rcp.listeners || []).forEach(
			this.register_method.bind(this, method_type.LISTENER));
		this._setup = true;
	},

	register_method: function (isListener, name) {
		var names = name.split('.'),
				method = names.pop(),
				obj = names.reduce(function (ob, m) {
					ob[m] = ob[m] || {};
					return ob[m];
				}, this) || this;
		obj[method] = this._rpc.bind(this, isListener, name);
	},

	_msg_callback: function (callback, resp) {
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
	_message: function (msg, callback, isListener) {
		bus.clientMessage(isListener && msg.object + '.' + msg.method,
											msg, this._msg_callback.bind(this, callback));
	},

	_rpc: function (isListener, fnname, var_args) {
		// TODO: raise error in case of multiple callbacks.
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
		}, callback, isListener);
	}
};

Object.getOwnPropertyNames(config.methods).forEach(function (m) {
	chrome[m] = new RPCClient(config.extensionId, m);
});
