var serial = new Serial();

function ctrl_sig(cid, val, cb) {
	serial.setControlSignals(cid, {dtr: val, rts: val}, cb);
}

document.body.onload = function () {
	serial.onReceive.addListener(function (info) {
		log('onresponse', "onReceive received: " + str(info));
	});

	serial.onReceiveError.addListener(function (info) {
		log('onresponse-error', "onReceiveError received: " + str(info));
	});

	log('onresponse-error', "Nothing should be here");
	serial.getDevices(function (devs) {
		devs.forEach(function (d) {
			log("devices", d.path);
			serial.connect(d.path, {bitrate: 115200}, function (info) {
				var cid = info.connectionId;
				Object.getOwnPropertyNames(info).forEach(function (k) {
					log("connected-info", k + ":" + info[k]);
				});
				ctrl_sig(cid, true, function(ok) {
					log('ctrlsig1', "Control sig success: " + ok);
					ok && ctrl_sig(cid, true, function(ok) {
						log('ctrlsig2', "Control sig 2 success: " + ok);
						serial.send(cid, '\x30\x20', function (packet) {
							log('client', 'Send received: ' + str(packet));
						});
					});
				});
			});
		});
	});
};
