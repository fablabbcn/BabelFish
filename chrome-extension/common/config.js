// File: /chrome-extension/common/config.js

var config = {
  extensionId: "magknjdfniglanojbpadmpjlglepnlko",
  methods: {
    serial: {
      methods: ['getDevices', 'send', 'connect', 'disconnect', 'setControlSignals', 'getControlSignals', 'getConnections', 'flush', 'onReceiveError.forceDispatch'],
      listeners: [{starter: 'onReceiveError.addListener',
                   cleaner: 'onReceiveError.removeListener'},
                  {starter: 'onReceive.addListener',
                   cleaner: 'onReceive.removeListener'}]
    },
    usb: {
      methods: ['getDevices', 'openDevice', 'findDevices', 'closeDevice', 'resetDevice', 'requestAccess', 'controlTransfer', 'setConfiguration']
    },
    storage: {
      methods: ['local.get', 'local.set'],
      listeners: [{starter: 'onChanged.addListener',
                   cleaner: 'onChanged.removeListener'}]
    },
    runtime: {
      methods: ['getManifestAsync']
    }
  }
},
    matchUrls = ["http://localhost:8080/*",
                 "http://localhost/*",
                 "http://ec2-54-174-134-98.compute-1.amazonaws.com:8080/*"];

if (window.chrome && window.chrome.runtime && window.chrome.runtime.id)
  config.extensionId = chrome.runtime.id;

if (window.codebenderChromeDeveloperMode)
  updateExtensionId(matchUrls, config);

try {
  module.exports = config;
  if (window)
    window.config = config;

} catch (e) {
  ;
}
