// All hosts should share the same global bus
var bus, dbg = (function () {
  var DEBUG = true;
  return function (msg) {
    if (DEBUG) {
      console.log.apply(console, Array.prototype.slice.apply(arguments));
    }
  };
})();

function err(msg) {
  console.error("[Server:ERR] " + msg);
}

// Get a callable member of this.obj given the name. Dot paths are
// supported.
function path2callable (object, name) {
  var names =  name.split('.'),
      method = names.pop(),
      obj = (names.reduce(function (ob, meth) {return ob[meth];}, object)
             || object),
      self = this;

  if (!obj[method]) {
    console.warn("Tried to resolve bad object path: " + name);
    return null;
  }

  return obj[method].bind(obj);
};
