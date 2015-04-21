// Nasty hacks that should be avoided.
chrome.adhoc = {};

// Force a serial receive error: when we flash we need to force an
// error event trigger.
chrome.serial.onReceiveError.forceDispatch = function (info) {
  hosts.serial.garbageCollectCallbacks();

  hosts.serial.getListenerCallbacks('onReceiveError.addListener')
    .forEach(function (cb) {
      cb(info);
    });
};

chrome.runtime.getManifestAsync = function (cb) {
  var manifest = chrome.runtime.getManifest();
  cb(manifest);
};

// Aggregate calls in a packet and send if an interval is provided.
// ATTENTION: in order for chrome message passing to JSONify the
// callback arguments we return arrays instead of arraybuffers in
// readArg.data.
var realReceiveListener = chrome.serial.onReceive.addListener.bind(chrome.serial.onReceive);
chrome.serial.onReceive.addListener = function (cb, interval) {
  var args = [], timeout = null, callback = cb;

  // Fallback for backwards compatibility.
  if (!interval) {
    realReceiveListener(callback);
    return;
  }

  function storeArg (readArg) {
    if (args.length > 1000){
      console.warn("Many messages from dev: ", args.length);
    }

    var bufferView = new Uint8Array(readArg.data);
    readArg.data = [].slice.call(bufferView);
    var cbargs = [].slice.call(arguments);

    args = args.concat([cbargs]);
    if (timeout === null) {
      timeout = setTimeout(flush, interval);
    }
  }

  function flush() {
    timeout = null;
    if (args.length != 0) {
      callback(args);
      args = [];
    }
  }

  realReceiveListener(storeArg);
};
