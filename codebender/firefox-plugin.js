// file: firefox-plugin.js

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

  // if (this.init)
  //   this.init();
  // else
  //   throw Error("Codebendercc plugin not available");
}

function CodebenderPlugin () {
  Plugin.apply(this, Array.prototype.slice(arguments));
  this.getPorts = this.getPortsCb;
};

if (typeof Object.create !== 'function') {
  Object.create = function(o) {
    var F = function() {};
    F.prototype = o;
    return new F();
  };
}

CodebenderPlugin.prototype = Object.create(Plugin);

CodebenderPlugin.prototype.getPortsCb = function (cb) {
  var ports = this.element_.getPorts();
  setTimeout(function () {
    cb(ports);
  }, 50);
};

CodebenderPlugin.prototype.availablePortsCb  = function (cb) {
  var ports = this.element_.availablePorts();
  setTimeout(function () {
    cb(ports);
  }, 50);
};

CodebenderPlugin.prototype.getFlashResultCb  = function (cb) {
  var result = this.element_.getFlashResult();
  setTimeout(function () {
    cb(result);
  }, 50);
};

module.exports = CodebenderPlugin;
