log('plugin', document.getElementById('plugin0').probeUSB ?
		"Found plugin!" : "No plugin");
Array.prototype.forEach.call(navigator.plugins, function (p) {
	log('all-plugins', p.name);
});
