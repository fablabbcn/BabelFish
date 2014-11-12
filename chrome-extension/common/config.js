// File: /chrome-extension/common/config.js

var config = {
  extensionId: "iihpjpedfemglflaabiadnnjanplblia",
  methods: {
    serial: {
      methods: ['getDevices', 'send', 'connect', 'disconnect', 'setControlSignals', 'getControlSignals'],
      listeners: ['onReceive.addListener']
    },
    runtime: {
      methods: ['getPlatformInfo'],
      listeners: ['onLaunched.addListener']
    },
    app: {
      methods: ['window.create'],
      listeners: ['runtime.onLaunched.addListener']
    },
    notifications: {
      methods: ['create', 'clear'],
      listeners: ['onClicked.addListener']
    },
    storage: {
      methods: ['local.get', 'local.set'],
      listeners: ['onChanged.addListener']
    },
    syncFileSystem: {
      methods: ['requestFileSystem'],
      listeners: []
    },

    alarms: {
      methods: ['clear', 'create', 'getAll'],
      listeners: ['onAlarm.addListener']
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
