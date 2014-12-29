// File: /chrome-extension/common/config.js

var config = {
  //  extensionId: "adkkcgijolkkeldfhjcabekomonffhck", // windows remote
  // extensionId: "iihpjpedfemglflaabiadnnjanplblia", // mac local
  extensionId: "emkdlimhllpafhceedllklcaogghkadf",
  // extensionId: "ejbadlbnpnlkflknleplmkebianiiegc", // Koka ubuntu
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
    app: {
      methods: ['window.create'],
      listeners: [{starter: 'runtime.onLaunched.addListener',
                   cleaner: 'runtime.onLaunched.removeListener'}]
    },
    notifications: {
      methods: ['create', 'clear'],
      listeners: [{starter: 'onClicked.addListener',
                   cleaner: 'onClicked.removeListener'}]
    },
    storage: {
      methods: ['local.get', 'local.set'],
      listeners: [{starter: 'onChanged.addListener',
                   cleaner: 'onChanged.removeListener'}]
    },
    syncFileSystem: {
      methods: ['requestFileSystem'],
      listeners: []
    },
    alarms: {
      methods: ['clear', 'create', 'getAll'],
      listeners: [{starter: 'onAlarm.addListener',
                   cleaner: 'onAlarm.removeListener'}]
    },
    runtime: {
      methods: ['getPlatformInfo'],
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

updateExtensionId(matchUrls);

try {
  module.exports = config;
  if (window)
    window.config = config;

} catch (e) {
  ;
}
