// Nasty hacks that should be avoided.

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
    cb(manifest.version);
};
