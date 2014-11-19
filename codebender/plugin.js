function dbg (var_args) {
  console.log.apply(console, Array.prototype.slice.call(arguments));
}

if (!chrome.serial) {
  dbg("Not on chrome");
  function PluginPropertyDescriptor(pluginElement, prop) {
    var desc = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(pluginElement), prop);

    // Be careful not to evaluate any pluginproperties. Some may have
    // side effects
    if (desc)
      Object.getOwnPropertyNames(desc).forEach(function (pp) {
	if (pp != "value" && true) {
	  console.log(prop + '[' + pp + ']');
	  this[pp] = pluginElement[pp];
	}
      });
    else
      throw Error("Could not determine property descruptor of plugin property '"
		  + prop);

    this.get = function () {return pluginElement[prop];};
    this.set = function (val) {pluginElement[prop] = val;};
  }

  function prototypeProperties(obj) {
    return Object.getOwnPropertyNames(Object.getPrototypeOf(obj));
  }

  // Copy the plugin interfacez
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

    if (this.init)
      this.init();
    else
      throw Error("Codebendercc plugin not available");
  }
} else {
  dbg("Looks like we are on chrome.");

  // A plugin object implementing the plugin interface.
  function Plugin() {
    dbg("Initializing plugin.");
    this.serial = chrome.serial;
  }

  Plugin.prototype = {
    // Async methods
    serialRead: function (port, baudrate, cb, valCb) {},

    flashBootloader: function (device, protocol, speed, force,
 			       delay, high_fuses, low_fuses,
 			       extended_fuses, unlock_bits, mcu,
 			       cb) {
      // Validate the data
      // Async run doFlashWithProgrammer
    },

    flashWithProgrammer: function (port, code, maxsize, protocol,
				   communication, speed, force,
				   delay, mcu, cb) {
      var prog = new Programmer({
	protocol: protocol,
	speed: speed,
	communication: communication,
	force: force,
	delay: delay,
	mcu: mcu,
	port: port
      });
      if (prog.validation() != 0) setTimeout(cb.bind(prog.validation()), 0);

      setTimeout(this.doFlashWithProgrammer.bind(this), 0);
      return 0;
    },

    // Wrongly sync methods

    // Return a string of the port list
    availablePorts: function (cb) {
      this.serial.getDevices(function (devs) {
	cb(devs.map(function (d) {return d.path;}).join(','));
      });
    },

    // Return json files with the prots
    getPorts: function (cb) {
      this.serial.getDevices(function (devs) {
	cb(devs.map(this.pluginDevFormat_));
      }.bind(this));
    },

    pluginDevFormat_: function (dev) {
      return {port: dev['path']};
    },

    probeUSB: function () {},

    // Inherently sync or void methods
    disconnect: function () {},

    init: function () {},

    saveToHex: function (strData) {},

    serialWrite: function (strData) {},

    setCallback: function (cb) {},

    version: function () {},

    deleteMap: function () {},

    closeTab: function () {}
  }
}
