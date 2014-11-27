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

  // RPC calls are *truly* asynchronous. There is absolutely no
  // guarantee that anything will run before anything else. Even
  // trying this with 100ms timeouts fails. This may skew a lot from
  // the expected behavior. Making the overhead smaller may reduce
  // this problem but there is no true way of fixing this.
  setTimeout(function () {
    chrome.storage.onChanged.removeListener(_listener);
    setTimeout(function () {
      storage_set({manasu: 'Show only on client list'});
    }, 1000);
  }, 1000);
};
