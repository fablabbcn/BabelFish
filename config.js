// This file is to be hosted.

var config = {
	extensionId: "pcoogjpilcclcmejpkmbifdbihomlgec",
	methods: {
		serial: {
			methods: ['getDevices', 'send', 'connect', 'disconnect', 'setControlSignals'],
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
	exports.config = config;
} catch (e) {
	;
}
