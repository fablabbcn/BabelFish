function openUSBTiny(cb) {
  chrome.usb.getDevices({filters: [{"vendorId": 6017}]}, function (devices) {
    if (!devices) {
      console.log("Error enumerating devices.");
      return;
    }
    var connections = [], pendingAccessRequests = devices.length;
    devices.forEach(function (device) {
      // No need to check for errors at this point.
      // Nothing can be done if an error occurs anyway. You should always try
      // to open the device.
      chrome.usb.openDevices(device, function (connection) {
        console.log(connection);
        if(cb) cb();
      });
    });
  });
}

function findUSBTiny() {
  chrome.usb.findDevices({vendorId: 6017, productId: 3231}, function (handles) {
    console.log(handles);
    handles.forEach(function (hnd) {
      chrome.usb.closeDevice(hnd, function() {
        console.log("Device closed!");
      });
    });
  });
}

openUSBTiny(function () {
  alert("You have succeeded at detecting usbtinyisp. Have a cookie.");
});
