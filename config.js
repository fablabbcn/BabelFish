// This file is to be hosted.

var config = {
	extensionId: "pcoogjpilcclcmejpkmbifdbihomlgec",
	methods: {
		serial: {
			methods: ['getDevices', 'send'],
			listeners: []
		}
	}
};

try {
	exports.config = config;
} catch (e) {
	;
}
