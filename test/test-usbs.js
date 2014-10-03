var VENDOR_ID = 0x2341,
		PRODUCT_ID = 0x0043;

var serial = new RPCClient('pcoogjpilcclcmejpkmbifdbihomlgec',
													 'serial', ['getDevices']);
var devs = serial.getDevices(function (devs) {
	console.log("Got " + devs + " devices...");
	devs.forEach(function (d) {
		console.log(d.path);
		document.getElementById('usbs').innerHTML += "<li>" + JSON.stringify(d) + "</li>";
	});
});
