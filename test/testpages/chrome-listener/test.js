function storage_set (kv) {
  chrome.storage.local.set(kv, function () {
    log('client-storage', "Client storage ~ " + str(kv['manasu']));
  });
}

window.onload = function () {
  console.log("Storage listening");
  var _listener = function (changes, areaName) {
    log('host-storage', "Host Storage ~ " + str(changes.manasu.newValue));
  };
  chrome.storage.onChanged.addListener(_listener);

  storage_set({manasu: "psofaei?"});
  storage_set({manasu: 'oles psofan!'});
  storage_set({manasu: 'dax den psofaei'});

  setTimeout(function () {
    chrome.storage.onChanged.removeListener(_listener);
    setTimeout(function () {
      storage_set({manasu: 'Show only on client list'});
    }, 1000);
  }, 1000);
};
