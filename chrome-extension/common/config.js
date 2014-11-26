// File: /chrome-extension/common/config.js

var config = {
  extensionId: "iihpjpedfemglflaabiadnnjanplblia",
  methods: {
    serial: {
      methods: ['getDevices', 'send', 'connect', 'disconnect', 'setControlSignals', 'getControlSignals', 'getConnections'],
      listeners: [{starter: 'onReceive.addListener',
		   cleaner: 'onReceive.removeListener'}]
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
};

try {
  module.exports = config;
  if (window)
    window.config = config;

} catch (e) {
  ;
}
