function rcv (dev) {
	log('devices', str(dev));
}

window.onload = function () {
	chrome.serial.getDevices(function (devs) {
		console.log("Received devs: " + str(devs));
		if (devs.length != 0) {
			devs.forEach(rcv);
		} else {
			rcv('<i>No devices</i>');
		}
	});
};
