function prototypeProperties(obj) {
	return Object.getOwnPropertyNames(Object.getPrototypeOf(obj));
}

function PortInfo(pluginDev) {
	this.path = pluginDev.port;
	var vidpid = pluginDev.hardware_id.split("=")[1].split(" ")[0];
	this.vendorId = vidpid.split(":")[0],
	this.productId = vidpid.split(":")[1];
	this.displayName = this.path.split('/').pop();
}

function ConnectionInfo(plugin) {
	this.connectionId = plugin.instanceId;
	this.paused = false;
	this.persistent = false; 			// Option
	this.name = "connection-" + plugin.instanceId;	// Option
	this.baudrate = pligin.baudrate;
	this.bufferSize = 100;
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
	// Methods
	getDevices: function (callback) {
		var ports = JSON.parse(this.plugin.availablePorts());
		log('plugin-log', "Ports: " + ports);
		setTimeout(function () {
			callback(ports.map(function (d) {return new PortInfo(d);}));
		}, 0);
	},

	connect: function (path, options, callback) {
		for (var i=0; i < this.connnections; i++) {
			if (!this.connections[i]) {
				this.connections[i] = new Plugin();
				callback(new ConnectionInfo(this.connections[i], i));
				return;
			}
		}

		this.connections.push(new Plugin());
	}
	,
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

	this.element_ = document.createElement("object");
	this.element_.setAttribute("type", "application/x-codebendercc");
	this.element_.setAttribute("width", "0");
	this.element_.setAttribute("height", "0");
	this.element_.setAttribute("xmlns", "http://www.w3.org/1999/html");

	document.body.appendChild(this.element_);
	this.element_.setAttribute("id", this.element_.instanceId);

	prototypeProperties(this.element_).forEach(function (attr) {
		if (typeof this.element_[attr] == 'function') {
			log('plugin-log',"Plugin attr: " + attr + " type: " + typeof this.element_[attr]);
			this[attr] = this.element_[attr].bind(this.element_);
		}
	}.bind(this));
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
