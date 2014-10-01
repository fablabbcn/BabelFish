// Mock chrome

// Bus for messages between extension nd the client. It supports:
// receive function
// send calls -> receive function arguments
// sendResp callback passed to receive function
//
// Basic use: [] means user provided
// :: addListener: [addedListener]
// :: sendMessage -> [addedListener] -> sendResp -> [send Message callback]
//
// Note that nothing is really asychronous when using this bus.
// Also note that only sendMessageCallback is called on the client.
//
function Bus () {
	this.msg_log = [];
}

Bus.prototype = {
	sendMessage: function (id, msg, cb) {
		var sender = id;
		this.msg_log.push({from:'sendMessage', msg: msg, id: id});
		this.sendMessageCb = function (msg) {
			this.msg_log.push({from: 'sendMessageCb', msg: msg});
			cb(msg);
		};
		this._listener(msg, sender, this.sendResp.bind(this));
	},

	addListener: function (cb) {
		this._listener = function (msg, sender, sendResp) {
			this.msg_log.push({from: '_listener', msg: msg});
			cb(msg, sender, sendResp);
		};
	},

	sendResp: function (msg) {
		this.msg_log.push({from:'sendResp', msg: msg});
		this.sendMessageCb(msg);
	},

	_listener: function (_) {
		throw new Error("Listener not attached");
	}

};


function MockRuntime() {
	this._bus = new Bus();
	this.onMessageExternal = {addListener: this._addListener.bind(this)};
}
MockRuntime.prototype = {
	sendMessage: function (id, msg, cb) {
		this._bus.sendMessage(id, msg, cb);
	},

	_addListener: function  (callback) {
		this._bus.addListener(callback);
	}
}

function MockSerial() {
	this._journal = [];
}
MockSerial.prototype = {
	// Data is a string here for simplicity
	send: function (connId, data, cb) {
		var sendInfo = {
			bytesSent: data.length
		};
		this._journal.push(data);
		this._raw_data += data;
		cb(sendInfo);
	}
};


// A thin wrapper of the bus. Just make the object paths correct.
function MockChrome() {
	this.runtime = new MockRuntime();
	this.serial = new MockSerial();

	this._bus = this.runtime._bus;
}
var chrome = new MockChrome();
