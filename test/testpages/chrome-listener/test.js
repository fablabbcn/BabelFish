function storage_set (kv) {
	chrome.storage.local.set(kv, function () {
		log('client-storage', "Client storage ~ " + str(kv['manasu']));
	});
}

window.onload = function () {
	console.log("Storage listening");
	chrome.storage.onChanged.addListener(function (changes, areaName) {
		log('host-storage', "Host Storage ~ " + str(changes.manasu.newValue));
	});

	storage_set({manasu: "psofaei?"});
	storage_set({manasu: 'oles psofan!'});
	storage_set({manasu: 'dax den psofaei'});
};
