var serial = new Serial(),
		received = false;

function hexToBin(hex) {
  var buffer = new ArrayBuffer(hex.length);
  var bufferView = new Uint8Array(buffer);
  for (var i = 0; i < hex.length; i++) {
    bufferView[i] = hex[i];
  }

	console.log("Buffer length: " + binToHex(buffer).length);
  return buffer;
}

function binToHex(bin) {
  var bufferView = new Uint8Array(bin);
  var hexes = [];
  for (var i = 0; i < bufferView.length; ++i) {
    hexes.push(bufferView[i]);
  }
  return hexes;
}

function ctrl_sig(cid, val, cb) {
	serial.setControlSignals(cid, {dtr: val, rts: val}, cb);
}

document.body.onload = function () {
	serial.onReceive.addListener(function (info) {
		log('onresponse', "onReceive received: " + binToHex(info.data));
		received = true;
	});

	serial.onReceiveError.addListener(function (info) {
		log('onresponse-error', "onReceiveError received: " + binToHex(info.data));
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
				ctrl_sig(cid, false, function(ok) {
					log('ctrlsig1', "Control sig success: " + ok);
					ok && ctrl_sig(cid, true, function(ok) {
						log('ctrlsig2', "Control sig 2 success: " + ok);

						var interv;
						interv = setInterval(function () {
							if (ok && !received) {
								serial.send(cid, hexToBin([0x30,0x20]), function (packet) {
									log('client', 'Send received: ' + str(packet));
								});
							} else {
								log('autopsy', received ? "Stopped due to reception" :
										"Failed to set signals");
								clearInterval(interv);
							}
						}, 1000);
					});
				});
			});
		});
	});
};
