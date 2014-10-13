function setupMock(obj, dotPath, callBuf) {
	if (typeof(obj) != 'object')
		return null;

	if (typeof(callBuf) == 'undefined') {
		obj.callLog = [];
		callBuf = obj.callLog;
		obj.report = function () {
			console.log("Reporting call history:\n"+
									JSON.stringify(this.callLog, undefined, 2));
		};
		obj.logReset = function () {obj.callLog = []};
	}

	// DFS search mocking the functions.
	for (var p in obj) {
		if (typeof(dotPath) == 'undefined')
			dotPath = [];

		dotPath.push(p);
		switch(typeof(obj[p])) {
		case 'object':
			setupMock(obj[p], dotPath, callBuf);
			break;
		case 'function':
			// Decorate fuction to log it's path to to callBuf
			obj[p] = (function (_p, _path, _raw_method, _) {
				var args = (Array.prototype.slice.call(arguments, 3)),
						log = {call: _path,
									 args: args.map(function (a) {
										 if (typeof(a) == 'function')
											 return a.toString();
										 else
											 return a;
									 })};
				callBuf.push(log);
				return _raw_method.apply(this, args);
			}).bind(obj, p, dotPath.slice(0), obj[p]);
			break;
		}
		dotPath.pop();
	}

	return null;
}

function MockSerial() {
	this._journal = [];
	this.raw_data = "";
	this.receive_lines = ["Everything is awesome",
												"when ur part of",
												"the team."];
	this.onReceive = {
		addListener: (
			function (cb) {
				this.receive_lines.forEach(function (l) {
					cb(l);
				});
			}).bind(this)
	};
}

MockSerial.prototype = {
	send: function (connId, data, cb) {
		var sendInfo = {
			bytesSent: data.length
		};
		this._journal.push(data);
		this._raw_data += data;
		cb(sendInfo);
	},

  getDevices: function (_) {}
};

// A thin wrapper of the bus. Just make the object paths correct.
function MockChrome() {
	this.serial = new MockSerial(this.calls);

	this.call_log = [];
	setupMock(this);
}
var chrome = new MockChrome();
