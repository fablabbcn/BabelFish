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
	this.connectionId = plugin.instance_id;
	this.paused = false;
	this.persistent = false; 			// Option
	this.name = "connection-" + plugin.instance_id;	// Option
	this.bitrate = plugin.baudrate;
	this.bufferSize = 100;				// Hardcoded from plugin
	this.receiveTimeout = null;		// XXX: Look into C++
	this.sendTimeout = null;      // XXX: Look into C++
	this.dataBits = "eight";
	this.parityBit = "no";
	this.stopBits = "one";
	this.ctsFlowControl = false;
}

function Serial () {
	this.plugin = new Plugin();
	this.connections = [this.plugin];
}

Serial.prototype = {
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

	update: function ( connectionId, options, callback) {},
	disconnect: function ( connectionId, calback) {},
	setPaused: function ( connectionId, paused, callback) {},
	getInfo: function ( connectionId, callback) {},
	getConnections: function (callback) {},
	send: function (connectionId, data, callback) {},
	flush: function (connectionId, callback) {},
	getControlSignals: function (connectionId, callback) {},
	setControlSignals: function (connectionId, signals, callback) {}
};

function Plugin() {

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
