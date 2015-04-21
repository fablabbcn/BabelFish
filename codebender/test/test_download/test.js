function poll(cb, time) {
  var inter = setInterval(function () {
    if(cb()) clearInterval(inter);
  }, time || 500);
}

// var cf = new compilerflasher(function (){return [];});
compilerflasher = new compilerflasher();
var cf = compilerflasher,
    protocol = "avr109";

function main () {
  if (!(cf.pluginHandler || cf.pluginHandler.codebenderPlugin))
    return false;

  // Enable the plugin
  cf.pluginHandler.initializePlugin();

  // // We provide parsed hex
  // cf.pluginHandler.codebender_plugin.binaryMode = false;


  $("#flash").click (customFlashSelectedPort);
  var popInt = setInterval(populateConnections, 1000);

  var send = document.getElementById("send");
  send.onclick = function () {
    cf.pluginHandler.serialSend();
  };

  document.getElementById('monitor').innerHTML = "Connect";
  document.getElementById('monitor').onclick = startMonitor;
  return true;
}


function customFlashSelectedPort () {
  var protocol = document.getElementById("protocols").value;
  $.get("/codebender/sketches/blink-" + protocol + ".hex", function (blob) {
    // Pretend to send logs
    console.log("Blob length: ", blob.split("\n").length);
    document.getElementById('hex').innerHTML = "Program length: " +
      blob.split("\n").length;

    var board = {
      upload: {
        maximum_size:32256,
        protocol: protocol,
        speed: 115200},
      build: {
        mcu: "atmega328p"
      }
    },
        flash_args = [
          true,                     //select
          board,                     //device
          undefined,                //Flush with programmer
          ParseHexFile(blob),                       //binary
          function (from, progress) {
            var msg = "Return value:" + progress;
            console.log(msg);
            document.getElementById('hex').innerHTML = msg;
          }];

    // Mimic the usbflash behavior
    if (cf.pluginHandler.connected == true) {
      cf.pluginHandler.disconnect(false);
      setTimeout(function() {
        cf.pluginHandler.doflash.apply(cf.pluginHandler, flash_args);
      }, 200);
    } else {
      cf.pluginHandler.doflash.apply(cf.pluginHandler, flash_args);
    };
  });
}

function startMonitor () {
  cf.pluginHandler.connected = false;
  cf.pluginHandler.connect();
  document.getElementById('monitor').innerHTML = "Connecting...";
  document.getElementById('monitor').disabled = true;

  poll(function () {
    if (!cf.pluginHandler.codebenderPlugin.readingInfo)
      return false;

    document.getElementById('monitor').innerHTML = "Disconnect: " +
      cf.pluginHandler.codebenderPlugin.readingInfo.connectionId;
    document.getElementById('monitor').onclick = killMonitor;
    document.getElementById('monitor').disabled = false;
    return true;
  }, 500);
}

function killMonitor () {
  cf.pluginHandler.disconnect();
  document.getElementById('monitor').innerHTML = "Connect";
  document.getElementById('monitor').onclick = startMonitor;
}

function populateConnections() {
  var cnxul = document.getElementById('connections'),
      devMsg;
  if (window.codebenderChromeDeveloperMode)
    devMsg = "Developer Mode!";
  else
    devMsg = "NON Developer Mode!";

  document.getElementById('title').innerHTML = devMsg;

  cf.pluginHandler.codebenderPlugin.serial.getConnections(function (cnxs) {
    cnxul.innerHTML = "";
    cnxs.forEach(function (cnx) {
      var li = document.createElement("li"), btn = document.createElement("button");
      li.innerHTML += cnx.name + " : " + cnx.connectionId;
      btn.innerHTML = "Disconnect";
      btn.onclick = function () {
        cf.pluginHandler.codebenderPlugin.serial.disconnect(cnx.connectionId, function (ok) {
          if (ok) {
            // Remove from list
            cnxul.removeChild(li);
          } else {
            btn.disabled = false;
            btn.innerHTML = " failed";
          };
        });
        btn.disabled = true;
        btn.innerHTML = "Disconnecting...";
      };
      li.appendChild(btn);
      cnxul.appendChild(li);
    });
  });
}

function quickFlash() {

  var i = -1,
      select = document.getElementById('cb_cf_ports'),
      devs = Array.prototype.forEach.call(select.childNodes, function (n) {
        i++;
        console.log("Checking port:", n.value);
        if (/\/dev\/cu\.usbmodem.*/.test(n.value)) {
          console.log("Selecting port:", n.value, "(", i,")");
          select.selectedIndex = i;
        }
      });

  if (i != -1)
    customFlashSelectedPort();
  else
    throw Error("No suitable port found.");
}

function populateUSBs () {
  var el = document.getElementById("usbdevs");
  chrome.usb.getDevices({}, function (devs) {
    var ihtml = devs.reduce(function (ret, d) {
      return ret + "<li>" + JSON.stringify(d) + "</li>\n";
    }, "");

    if (el.innerHTML != ihtml)
      el.innerHTML = ihtml;
  });
}

var usbInt = setInterval(populateUSBs, 2000);

var sck_default = 10;
function transferOut(data) {
  return {
    recipient: "device",
    direction: "out",
    requestType: "vendor",
    request: 5,                 //Flash or eeprom
    value: sck_default,                   //Delay
    index: 0,                   //Addess
    data: data                  //buffer
  };
};

function transferIn(op, v1, v2) {
  return {
    recipient: "device",
    direction: "in",
    requestType: "vendor",
    request: op,                 //Flash or eeprom
    value: v1,                   //Delay
    index: v2,                   //Addess
    length: 0
  };
};

function openCloseUSB() {
  chrome.usb.getDevices({}, function (devs) {
    console.log("Devices that I will open and close:", devs);
    if (devs.length == 0) {
      console.error("No devices connected");
      return;
    }

    devs.forEach(function (dev) {
      chrome.usb.openDevice(dev, function (h) {
        console.log("Device opened, handler:", h);

        chrome.usb.controlTransfer(h, transferIn(5, sck_default, 1),  function () {
          console.log("Got:", arguments);
          chrome.usb.controlTransfer(h, transferIn(5, sck_default, 0),  function () {
            console.log("Got:", arguments);

            setTimeout(function () { // TOIMOooT

              chrome.usb.controlTransfer(h, transferIn(5, sck_default, 0),  function () {
                console.log("Got:", arguments);
                chrome.usb.controlTransfer(h, transferIn(6, 0, 0),  function () {
                  console.log("Got:", arguments);

                  chrome.usb.closeDevice(h, function () {
                    console.log("Device closed");
                  });
                });
              });
            }, 2000);
          });
        });
      });
    });
  });
}

setTimeout(function _main () {
  console.log("Trying to setup");
  if (!main()) setTimeout(_main, 500);
});
