function ctrl_sig(cid, val, cb) {
	chrome.serial.setControlSignals(cid, {dtr: val, rts: val}, cb);
}
window.onload = function () {
	console.log("Storage listening");
	chrome.serial.onReceive.addListener(function (info) {
		log('onresponse', "onReceive received: " + str(info));
	});

	chrome.serial.getDevices(function (devs) {
		if (devs.length == 0) {
			log('nodev', "<i>Will not run this test, connect a serial.</i>");
		}

		chrome.serial.connect(devs[0].path, {bitrate: 115200}, function (conInfo) {
			var cid = conInfo.connectionId;
			ctrl_sig(cid, true, function(ok) { ok && ctrl_sig(cid, true, function(ok) {
				log('clinet', "Control signals: " + ok);
				if (ok) {
					chrome.serial.send(cid, hexToBin([0x30,0x20]), function (packet) {
						log('client', 'Send receided: ' + str(packet));
					});
				}
			});});
		});
	});
};
