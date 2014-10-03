// Access usb interface
//
// XXX: And then there is onReceive.addListener which requires
// connection.
var host = new RPCHost('serial', ['getDevices',
																 'connect',
																 'send',
																 'connect',
																 'disconnect',
																 'setConnectionSignals']);
