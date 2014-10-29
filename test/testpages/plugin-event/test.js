document.body.onload = function () {
	[new DeclarativeEvent(), new SerialEvent].forEach(function (e) {

		e.addListener(function (sound) {
			log('listener-d', "Heard " + sound);
		});

		e.dispatch('barking');
	});
};
