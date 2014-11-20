var cf = new compilerflasher(function (){return [];}),
    _backup_online_transactions = $.get.bind($);
$.get = function () {};

// Populate the list once just so I can run the test
cf.pluginHandler.getFire();

// Enable the plugin
cf.pluginHandler.showPlugin();
cf.enableCompilerFlasherActions();
$("#flash").click (function () {
  _backup_online_transactions("/web/blink-example.hex", function (blob) {
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
      setTimeout(function(){
	cf.pluginHandler.doflash.apply(cf.pluginHandler, flash_args);
      }, 200);
    } else {
      cf.pluginHandler.doflash.apply(cf.pluginHandler, flash_args);
    };
  });
});
