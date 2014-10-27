document.onload = function () {
	log('plugin',
			document.getElementById('plugin1').probeUSB ?
			"Found plugin!" : "No plugin");

	log('plugin',
			document.getElementById('plugin0').probeUSB ?
			"Found plugin!" : "No plugin");

	log('plugin-ids', document.getElementById('plugin0').instance_id);
	log('plugin-ids', document.getElementById('plugin1').instance_id);

	log('baudrate', document.getElementById('plugin0').baudrate);

	log('attrs', Object.getOwnPropertyNames(document.getElementById('plugin0')));

	Array.prototype.forEach.call(navigator.plugins, function (p) {
		log('all-plugins', p.name);
	});
};
