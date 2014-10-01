function Responder() {
	this.msg = {args: [], err: null};
}

// Passed to the chromecall to fix the response
Responder.prototype._callback = function (sendResp, var_args) {
	if (arguments.some(function (a) {return typeof(a) == 'function';})) {
		this.error("Passing callbacks to a callback not supported by RPC");
	}
	this.msg.args = arguments;
	sendResp(this.msg);
};

// Get a callback that knows how to send messages
Responder.prototype.get_callback = function (sendResp) {
	return this._callback.bind(this, sendResp);
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
function RPCHost (obj, supported_methods) {
	this.supported_methods = supported_methods;
	this.obj = obj;

	chrome.runtime.onMessageExternal.addListener(
		function(request, sender, sendResp) {
			if (request.method &&
					this.supported_methods.indexOf(request.method) != -1) {
				var method = this.obj[request.method];
				var responder = new Responder();
				var args = (this.args || []).map(function (a) {
					return a == "<function>" && responder.get_callback(sendResp) || a;
				});
				method.apply(this.obj, args);
			}
		});
}

RPCHost.prototype = {
	// If it's not marked as a function return it,
  //
	// if it is return a responder that sends
	//
	_wrap_callback: function (responder, arg) {
		if (arg == '<function>')
			responder.callback;

		return arg;
	}
};
