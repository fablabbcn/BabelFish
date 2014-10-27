function insp(name, obj) {
	log('inspect', "[ " + name +" ]");
	log('inspect', "Type: " + typeof obj);
	log('inspect', "JSON: " + JSON.stringify(obj));
	log('inspect', "RAW: " + obj);
}

function setImmediate(cb) {
	setTimeout(cb, 0);
}

function prototypeProperties(obj) {
	return Object.getOwnPropertyNames(Object.getPrototypeOf(obj));
}

function PluginPropertyDescriptor(pluginElement, prop) {
	var desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(pluginElement), prop);
	Object.getOwnPropertyNames(desc).forEach(function (pp) {
		this[pp] = pluginElement[pp];
	});

	this.get = function () {return pluginElement[prop];};
	this.set = function (val) {pluginElement[prop] = val;};
}

function PortInfo(pluginDev) {
	this.path = pluginDev.port;
	var vidpid = pluginDev.hardware.split("=")[1].split(" ")[0];
	this.vendorId = vidpid.split(":")[0],
	this.productId = vidpid.split(":")[1];
	this.displayName = this.path.split('/').pop();
}

function ConnectionInfo(plugin) {
	// The id of the serial port connection.
	this.connectionId = plugin.instance_id;

	// Flag indicating whether the connection is blocked from firing
	// onReceive events.
	this.paused = false;

	// Always false. It's here for compatibility
	this.persistent = false;

	// An application-defined string to associate with the connection.
	this.name = "connection-" + plugin.instance_id;	// Option

	// The requested bitrate of the connection to be opened. For
	// compatibility with the widest range of hardware, this number should
	// match one of commonly-available bitrates, such as 110, 300, 1200,
	// 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200. There is no
	// guarantee, of course, that the device connected to the serial port
	// will support the requested bitrate, even if the port itself
	// supports that bitrate. 9600 will be passed by default.
	this.bitrate = plugin.baudrate;

	// The size of the buffer used to receive data. The default value is
	// 4096. Plugin has this hardcoded to 100
	this.bufferSize = 100;

	// The maximum amount of time (in milliseconds) to wait for new data
	// before raising an onReceiveError event with a "timeout" error. If
	// zero, receive timeout errors will not be raised for the
	// connection. Defaults to 0.
	this.receiveTimeout = 0;

	// The maximum amount of time (in milliseconds) to wait for a send
	// operation to complete before calling the callback with a
	// "timeout" error. If zero, send timeout errors will not be
	// triggered. Defaults to 0.
	this.sendTimeout = 0;      // XXX: Look into C++

	// "eight" will be passed by default. {"seven", or "eight"}
	this.dataBits = "eight";

	// "no" will be passed by default. {"no", "odd", or "even"}
	this.parityBit = "no";

	// "one" will be passed by default. {"one", or "two"}
	this.stopBits = "one";

	// Flag indicating whether or not to enable RTS/CTS hardware flow
	// control. Defaults to false.
	this.ctsFlowControl = false;
}

function Serial () {
	this.plugin = new Plugin();
	this.connections = [this.plugin];

	this.onReceive = new SerialEvent();
	this.onReceiveError = new SerialEvent();
}

Serial.prototype = {
	// Call contents asynchronously.
	imm_: function (cb) {
		return setImmediate(cb.bind(this));
	},

	// Methods
	getDevices: function (callback) {
		this.imm_(function () {
			var ports = JSON.parse(this.plugin.getPorts());
			callback(ports.map(function (d) {
				return new PortInfo(d);
			}));
		}.bind(this));
	},

	// Return self if I fail
	connect: function (path, options, callback) {
		this.imm_(function () {
			var plugin;
			for (var i=0; i < this.connections.length; i++) {
				if (!this.connections[i]) {
					// Removed plugin
					plugin = new Plugin();
					this.connections[i] = plugin;
					break;
				} else if (typeof this.connections[i].connedtedPort == 'undefined') {
					// Unconnected plugin
					plugin = this.connections[i];
				} else if (this.connections[i].connedtedPort == path) {
					// Already connected, stop looking.
					callback(new ConnectionInfo(this.connections[i]));
					return;
				}
			}

			if (!plugin) {
				// The list is clean add one more
				plugin = new Plugin();
				this.connections.push(plugin);
			}

			if (typeof options.bitrate == "number")
				plugin.openPort(path, options.bitrate, true, "[JS] connect: ");
			else
				throw Error("Invalid bitrate: " +  options.birate);

			callback(new ConnectionInfo(plugin));
		});
	},

	// XXX: for now you can only set the baudrate with options.bitrate
	// Update the option settings on an open serial port connection.
	update: function ( connectionId, options, callback) {
		this.imm_(function () {
			var plugin = this.connections[connectionId];
			if (!plugin) {
				callback(false);
			}

			if (options.bitrate)
				plugin.baudrate = options.bitrate;
		});
	},

	// Disconnects from a serial port.
	disconnect: function ( connectionId, callback) {
		this.imm_(function () {
			var plugin = this.connections[connectionId];
			if (!plugin) {
				callback(false);
			}
			callback((plugin.disconnect() == 1));
		});
	},

	// Compatibility with chrome
	setPaused: function ( connectionId, paused, callback) {
		console.warn("Compatibility, this does nothing");
	},

	// Retrieves the state of a given connection.
	getInfo: function (connectionId, callback) {
		this.imm_(function () {
			callback(this.connections[connectionId]);
		});
	},

	//  Retrieves the list of currently opened serial port
	//  connections. Callbacks gets infos
	getConnections: function (callback) {
		this.imm_(function () {
			callback(this.connections.map(function (p) {new ConnectionInfo(p);}));
		});
	},

	// Writes data to the given connection.
	// callback(sendInfo {bytesSent: int, ["disconnected", "pending", "timeout", or "system_error"]})
	//
	// disconnected
	//     The connection was disconnected.
	// pending - TODO
	//     A send was already pending.
	// timeout - TODO
	//     The send timed out.
	// system_error - TODO
	//     A system error occurred and the connection may be unrecoverable.
	send: function (connectionId, data, callback) {
		this.imm_(function () {
			var plugin = this.connections[connectionId];
			if (!plugin) {
				callback({bytesSent: 0, error: "disconnectied"});
			}

			var msg = data;
			if (data instanceof ArrayBuffer) {
				msg = String.fromCharCode.apply(null, new Uint16Array(buf));
			}

			// else if (typeof data != "string")
			// 	throw Error("Serial tried to send msg of type " + typeof data +
			// 						 "but only ArrayBuffers and strings are supported.");

			plugin.serialWrite(msg);
		});
	},

	// Flushes all bytes in the given connection's input and output
	// buffers.
	flush: function (connectionId, callback) {
		this.imm_(function () {
			var plugin = this.connections[connectionId];
			if (!plugin) {
				callback({bytesSent: 0, error: "disconnectied"});
			}


		});
	},

	// Retrieves the state of control signals on a given connection.
	// calback Obj(bools {dcd, cts, ri, dsr})
	getControlSignals: function (connectionId, callback) {
		this.imm_(function () {
			var plugin = this.connections[connectionId];

			// Call when (and if) conrrol signals are available.
			if (plugin)
				callback({
					dcd: plugin.CD,
					dsr: plugin.DSR,
					ri: plugin.RI,
					cts: plugin.CTS
				});
		});
	},

	// Sets the state of control signals on a given connection.
	// signals: obj {dtr, rts}, callback(bool result)
	setControlSignals: function (connectionId, signals, callback) {
		this.imm_(function () {
			var plugin = this.connections[connectionId];
			if (!plugin) {
				callback(false);
				return;
			}

			plugin.setDTS(signals.dts);
			plugin.setRTS(signals.rts);

			// TODO: Check for failure
			callback(true);
		});
	}
};

function Plugin() {
	// Note that this has typeof 'function' on firefox because it
	// implements [[Call]]
	this.element_ = document.createElement("object");
	this.element_.setAttribute("type", "application/x-codebendercc");
	this.element_.setAttribute("width", "0");
	this.element_.setAttribute("height", "0");
	this.element_.setAttribute("xmlns", "http://www.w3.org/1999/html");

	document.body.appendChild(this.element_);
	this.element_.setAttribute("id", this.element_.instanceId);

	prototypeProperties(this.element_).forEach( function (attr) {
		if (typeof this.element_[attr] == 'function') {
			this[attr] = function () {
				var args = Array.prototype.slice.call(arguments);
				return this.element_[attr].apply(this.element_, args);
			}.bind(this);
		} else {
			var descr = new PluginPropertyDescriptor(this.element_, attr);
			Object.defineProperty(this, attr, descr);
		}
	}.bind(this) );
};

// An event that happens to a serial. You can .addListener and
// .dispatch these events. This is a thin wrapper around vanilla js
// Events
function SerialEvent(id, plugin) {
	this.jsEvent = new Event(id);
	this.eventId = id;
	this.target = document;

	if (plugin instanceof EventTarget)
		this.target = plugin;
	else if (plugin.element_ instanceof EventTarget) {
		this.target = plugin.element_;
	} else {
		throw Error("Plugin provided to SerialEvent not EventTarger.");
	}
}
SerialEvent.prototype.addListener = function (cb) {
	this.target.addEventListener(this.eventId, cb);
};

SerialEvent.prototype.dispatch = function () {
	this.target.dispatchEvent(this.eventId);
};
