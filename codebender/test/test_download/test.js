var cf = new compilerflasher(function (){return [];});

// Enable the plugin
cf.pluginHandler.showPlugin();
cf.enableCompilerFlasherActions();
$("#flash").click (function () {
  $.get("/web/blink-example.hex", function (blob) {
    // Pretend to send logs
    dbg("Blob length: ", blob.split("\n").length);
    document.getElementById('hex').innerHTML = blob;

    var flash_args = [
      true,			//select
      {
	upload: {
	  disbale_flushing: undefined,
	  maximum_size: 4096,
	  protocol: "stk500",
	  speed: 112500},
	build: {
	  mcu: undefined
	}
      },                     //device
      undefined, 		//Flush with programmer
      ParseHexFile(blob),			//binary
      function (from, progress) {
	console.log("Uploading", from, progress);
      }];

    // Mimic the usbflash behavior
    if (cf.pluginHandler.connected == true) {
      cf.pluginHandler.disconnect(false);
      setTimeout(function() {
	cf.pluginHandler.doflash.apply(cf.pluginHandler, flash_args);
      }, 200);
    } else {
      cf.pluginHandler.doflash.apply(cf.pluginHandler, flash_args);
    };
  });
});

function startMonitor () {
  cf.pluginHandler.connected = false;
  cf.pluginHandler.connect();
  document.getElementById('monitor').innerHTML = "Disconnect";
  document.getElementById('monitor').onclick = killMonitor;
}

function killMonitor () {
  cf.pluginHandler.disconnect();
  document.getElementById('monitor').innerHTML = "Connect";
  document.getElementById('monitor').onclick = startMonitor;
}
document.getElementById('monitor').innerHTML = "Connect";
document.getElementById('monitor').onclick = startMonitor;
