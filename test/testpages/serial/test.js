var received = false;

function ctrl_sig(cid, val, cb) {
  log('signals'+val, 'Signals set to '+ val);
  chrome.serial.setControlSignals(cid, {dtr: val, rts: val}, cb);
}

document.body.onload = function () {
  console.log("Storage listening");
  chrome.serial.onReceive.addListener(function (info) {
    log('onresponse', "onReceive received: " + binToHex(info.data));
    received = true;
  });

  chrome.serial.getDevices(function (devs) {
    if (devs.length == 0) {
      log('nodev', "<i>Will not run this test, connect a serial.</i>");
    }

    chrome.serial.connect(devs[0].path, {bitrate: 115200}, function (conInfo) {
      var cid = conInfo.connectionId;
      ctrl_sig(cid, false, function(ok) { ok && ctrl_sig(cid, true, function(ok) {
	log('clinet', "Control signals were set all the way: " + ok);
	var inter;
	inter = setInterval(function () {
	  if (ok && !received) {
	    log('client', 'Sending 0x30, 0x20...');
	    chrome.serial.send(cid, hexToBin([0x30,0x20]), function (packet) {
	      log('client', 'Bytes sent: ' + packet.bytesSent);
	    });
	  } else {
	    clearInterval(inter);
	  }
	}, 1000);
      });});
    });
  });
};
