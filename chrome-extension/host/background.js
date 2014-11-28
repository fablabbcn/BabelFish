// Access usb interface
//

var hosts = {};
Object.getOwnPropertyNames(config.methods).forEach(function (m) {
  hosts[m] = new RPCHost(m);
});
