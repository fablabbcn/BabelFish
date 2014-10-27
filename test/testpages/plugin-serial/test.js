var serial = new Serial();

serial.getDevices(function (devs) {
	devs.forEach(function (d) {
		log("devices", d.path);
		serial.connect(d.path, {bitrate: 115200}, function (info) {
			Object.getOwnPropertyNames(info).forEach(function (k) {
				log("connected-info", k + ":" + info[k]);});
		});
	});
});
