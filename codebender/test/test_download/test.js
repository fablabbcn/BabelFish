function poll(cb, time) {
  var inter = setInterval(function () {
    if(cb()) clearInterval(inter);
  }, time || 500);
}

var cf = new compilerflasher(function (){return [];});
var protocol = "avr109";

// Enable the plugin
cf.pluginHandler.showPlugin();
cf.enableCompilerFlasherActions();
cf.pluginHandler.scan();
function customFlashSelectedPort () {
  var protocol = document.getElementById("protocols").value;
  $.get("/codebender/sketches/blink-" + protocol + ".hex", function (blob) {
    // Pretend to send logs
    console.log("Blob length: ", blob.split("\n").length);
    document.getElementById('hex').innerHTML = "Program length: " +
      blob.split("\n").length;

    var board = {
      upload: {
        disbale_flushing: undefined,
        maximum_size: 4096,
        protocol: protocol,
        speed: 112500},
      build: {
        mcu: undefined
      }
    },
        flash_args = [
          true,                     //select
          board,                     //device
          undefined,                //Flush with programmer
          ParseHexFile(blob),                       //binary
          function (from, progress) {
            console.log("Uploading progress", from, progress);
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

$("#flash").click (customFlashSelectedPort);

var send = document.getElementById("send");
send.onclick = function () {
  cf.pluginHandler.serialSend();
};


function startMonitor () {
  cf.pluginHandler.connected = false;
  cf.pluginHandler.connect();
  document.getElementById('monitor').innerHTML = "Connecting...";
  document.getElementById('monitor').disabled = true;

  poll(function () {
    if (!cf.pluginHandler.plugin_.readingInfo)
      return false;

    document.getElementById('monitor').innerHTML = "Disconnect: " +
      cf.pluginHandler.plugin_.readingInfo.connectionId;
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

document.getElementById('monitor').innerHTML = "Connect";
document.getElementById('monitor').onclick = startMonitor;

function populateConnections() {
  var cnxul = document.getElementById('connections');

  cf.pluginHandler.plugin_.serial.getConnections(function (cnxs) {
    cnxul.innerHTML = "";
    cnxs.forEach(function (cnx) {
      var li = document.createElement("li"), btn = document.createElement("button");
      li.innerHTML += cnx.name + " : " + cnx.connectionId;
      btn.innerHTML = "Disconnect";
      btn.onclick = function () {
        cf.pluginHandler.plugin_.serial.disconnect(cnx.connectionId, function (ok) {
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

setInterval(populateConnections, 1000);
function cleanLogs() {
  var lglst = document.getElementsByClassName("loglist");
  Array.prototype.forEach.call(lglst, function (el) {el.innerHTML = "";});
}

document.getElementById("cleanlogs").onclick = cleanLogs;

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
