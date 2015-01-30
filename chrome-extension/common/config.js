// File: /chrome-extension/common/config.js

var config = {
  extensionId: "emkdlimhllpafhceedllklcaogghkadf",
  methods: {
    serial: {
      methods: ['getDevices', 'send', 'connect', 'disconnect', 'setControlSignals', 'getControlSignals', 'getConnections', 'flush', 'onReceiveError.forceDispatch'],
      listeners: [{starter: 'onReceiveError.addListener',
                   cleaner: 'onReceiveError.removeListener'},
                  {starter: 'onReceive.addListener',
                   cleaner: 'onReceive.removeListener'}]
    },
    usb: {
      methods: ['getDevices', 'openDevice', 'findDevices', 'closeDevice', 'resetDevice']
    },
    storage: {
      methods: ['local.get', 'local.set'],
      listeners: [{starter: 'onChanged.addListener',
                   cleaner: 'onChanged.removeListener'}]
    },
    runtime: {
      methods: ['getPlatformInfo', 'getManifestAsync'],
      listeners: [{starter: 'onLaunched.addListener',
                   cleaner: 'onLaunched.removeListener'}]
    }
  }
},
    matchUrls = ["http://localhost:8080/*",
                 "http://localhost/*",
                 "http://ec2-54-174-134-98.compute-1.amazonaws.com:8080/*"],
    extensionSet;


if (window.chrome && window.chrome.runtime && window.chrome.runtime.id)
  config.extensionId = chrome.runtime.id;

// Send the extension id to the server to send correct config to the
// client. Kind of async but we have a backup and we will make many
// more requests to the server before useing the extensionId
function updateExtensionId (urls, set) {
  var xhr = new XMLHttpRequest(),
      ext = "extensionid",
      url = urls.shift();

  // Define it if you are an extension
  if (window.chrome && window.chrome.runtime && chrome.runtime.id)
    ext += "?extensionid="+ chrome.runtime.id;

  url = url.replace("*", ext);
  xhr.onreadystatechange = function () {
    if (extensionSet) return;
    if (xhr.readyState == 4 &&
        xhr.status == 200 &&
        xhr.responseText.length > 0) {
      config.extensionId = xhr.responseText;
      console.log("Extension id is:", config.extensionId, "based on", url);
      extensionSet = true;
    } else {
      console.log("Failed to get extension id from", url);
      if (urls.length) updateExtensionId(urls);
    }

  };

  try {
    xhr.open("GET", url, true);
    xhr.send();
  } catch (e) {
    ;
  }
}

// If the codebender developer extension is available it means we
// can't trust the id from the config object and need to update it.
if (window.codebenderChromeDeveleoperMode)
  updateExtensionId(matchUrls);

try {
  module.exports = config;
  if (window)
    window.config = config;

} catch (e) {
  ;
}
