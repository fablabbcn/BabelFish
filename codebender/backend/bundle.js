// Board API (in progress):
//
// Connect
// ReadFlash
// WriteFlash

// API
function NewAvr109Board(serial, pageSize, dispatcher) {
  if (typeof(serial) === "undefined") {
    return { status: Status.Error("serial is undefined") }
  }

  if (typeof(pageSize) === "undefined") {
    return { status: Status.Error("pageSize is undefined") }
  }

  if (typeof(dispatcher) === "undefined") {
    return { status: Status.Error("dispatcher is undefined") }
  }

  return { status: Status.OK,
           board: new Avr109Board(serial, pageSize, dispatcher) };
};

function Avr109Board(serial, pageSize, dispatcher) {
  this.serial_ = serial;
  this.pageSize_ = pageSize;
  this.globalDispatcher_ = dispatcher;
};

Avr109Board.prototype.connect = function(deviceName, doneCb) {
  // TODO: Validate doneCb
  // TODO: Validate deviceName?

  if (this.state_ != Avr109Board.State.DISCONNECTED) {
    doneCb(Status.Error("Can't connect. Current state: " + this.state_));
    return;
  }

  this.readHandler_ = null;
  this.state_ = Avr109Board.State.CONNECTING;
  this.kickBootloader_(deviceName, doneCb);
};

Avr109Board.prototype.writeFlash = function(boardAddress, data, doneCb) {
  if (this.state_ != Avr109Board.State.CONNECTED) {
    return doneCb(Status.Error("Not connected to board: " + this.state_));
  };

  if (boardAddress % this.pageSize_ != 0) {
    return doneCb(Status.Error(
      "boardAddress must be alligned to page size of " + this.pageSize_
        + " (" + boardAddress + " % " + this.pageSize_ + " == "
        + (boardAddress % this.pageSize_) + ")"));
  }

  if (data.length % this.pageSize_ != 0) {
    return doneCb(Status.Error(
      "data size must be alligned to page size of " + this.pageSize_
        + " (" + data.length + " % " + this.pageSize_ + " == "
        + (data.length % this.pageSize_) + ")"));
  }


  var board = this;
  this.writeAndGetReply_(
    [AVR.ENTER_PROGRAM_MODE],
    function(response) {
      var hexResponse = binToHex(response.data);
      if (hexResponse.length == 1 && hexResponse[0] == 0x0D) {
        board.beginProgramming_(boardAddress, data, doneCb)
      } else {
        return doneCb(Status.Error(
          "Error entering program mode: " + hexRep(response)));
      }
    });
};

Avr109Board.prototype.readFlash = function(boardAddress, length, doneCb) {
  if (this.state_ != Avr109Board.State.CONNECTED) {
    doneCb({
      status: Status.Error("Not connected to board: " + this.state_) });
  } else {
    doneCb({
      status: Status.Error("Not implemented")});
  }
};

// IMPLEMENTATION
Avr109Board.State = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected"
};

Avr109Board.prototype.globalDispatcher_ = null;
Avr109Board.prototype.pageSize_ = -1;
Avr109Board.prototype.serial_ = null;
Avr109Board.prototype.state_ = Avr109Board.State.DISCONNECTED;
Avr109Board.prototype.connectionId_ = -1;
Avr109Board.prototype.clock_ = new RealClock;
Avr109Board.prototype.readHandler_ = null;

Avr109Board.MAGIC_BITRATE = 1200;

Avr109Board.prototype.readDispatcher_ = function(readArg) {
  if (this.readHandler_ != null) {
    this.readHandler_(readArg);
    return;
  }

  log(kDebugNormal, "No read handler for: " + JSON.stringify(readArg));
}

Avr109Board.prototype.kickBootloader_ = function(originalDeviceName, doneCb) {
  var oldDevices = [];
  var serial = this.serial_;
  var board = this;

  serial.getDevices(function(devicesArg) {
    oldDevices = devicesArg;
    serial.connect(originalDeviceName, {bitrate: Avr109Board.MAGIC_BITRATE }, function(connectArg) {
      // TODO: validate connect arg
      serial.disconnect(connectArg.connectionId, function(disconnectArg) {
        // TODO: validate disconnect arg
        board.waitForNewDevice_(
          oldDevices, doneCb, board.clock_.nowMillis() + 10 * 1000);
//          oldDevices, doneCb, board.clock_.nowMillis() + 1000);
      });
    });
  });
}

function findMissingIn(needles, haystack) {
  var haystack2 = [];
  for (var i = 0; i < haystack.length; ++i) {
    haystack2.push(haystack[i].path);
  }

  var r = [];
  for (var i = 0; i < needles.length; ++i) {
    if (haystack2.indexOf(needles[i].path) == -1) {
      r.push(needles[i].path);
    }
  }

  return r;
}

Avr109Board.prototype.waitForNewDevice_ = function(oldDevices, doneCb, deadline) {
  var serial = this.serial_;
  var board = this;

  if (this.clock_.nowMillis() > deadline) {
    doneCb(Status.Error("Deadline exceeded while waiting for new devices"));
    return;
  }

  var found = false;
  serial.getDevices(function(newDevices) {
    var appeared = findMissingIn(newDevices, oldDevices);
    var disappeared = findMissingIn(oldDevices, newDevices);
 
    for (var i = 0; i < disappeared.length; ++i) {
      log(kDebugFine, "Disappeared: " + disappeared[i]);
    }
    for (var i = 0; i < appeared.length; ++i) {
      log(kDebugFine, "Appeared: " + appeared[i]);
    }

    if (appeared.length == 0) {
      setTimeout(function() {
        board.waitForNewDevice_(newDevices, doneCb, deadline);
      }, 10);
    } else {
      log(kDebugNormal, "Aha! Connecting to: " + appeared[0]);
      // I'm not 100% sure why we need this setTimeout
      setTimeout(function() {
        serial.connect(appeared[0], { bitrate: 57600 }, function(connectArg) {
          board.serialConnected_(connectArg, doneCb);
        });
      }, 500);
    }
  });
}

Avr109Board.prototype.serialConnected_ = function(connectArg, doneCb) {
  // TODO: test this?
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    doneCb(Status.Error("Couldn't connect to board. " + connectArg + " / " + connectArg.connectionId));
    return;
  }

  this.connectionId_ = connectArg.connectionId;

//  this.serial_.onReceive.addListener(this.readDispatcher_.bind(this));
  // TODO: be more careful about removing this listener
  this.globalDispatcher_.addListener(
    this.connectionId_,
    this.readDispatcher_.bind(this));
  this.startCheckSoftwareVersion_(doneCb);
}

Avr109Board.prototype.writeAndGetReply_ = function(payload, handler) {  
  this.setReadHandler_(handler);
  this.write_(payload);
};

Avr109Board.prototype.write_ = function(payload) {
  this.serial_.send(
    this.connectionId_, hexToBin(payload), function(writeArg) {
      // TODO: veridy writeArg
    });
}


Avr109Board.prototype.setReadHandler_ = function(handler) {
  this.readHandler_ = handler;
};

Avr109Board.prototype.startCheckSoftwareVersion_ = function(doneCb) {
  var board = this;
  this.writeAndGetReply_(
    [ AVR.SOFTWARE_VERSION ],
    function(readArg) {
      board.finishCheckSoftwareVersion_(readArg, doneCb);
    });
}

Avr109Board.prototype.finishCheckSoftwareVersion_ = function(readArg, doneCb) {
  var hexData = binToHex(readArg.data);
  // TODO: actuall examine response
  if (hexData.length == 2) {
    this.state_ = Avr109Board.State.CONNECTED;
    doneCb(Status.OK);
  } else {
    doneCb(Status.Error("Unexpected software version response: " + hexRep(hexData)));
  }

  // TODO: Deadline?
};


Avr109Board.prototype.beginProgramming_ = function(boardAddress, data, doneCb) {
  var board = this;
  var addressBytes = storeAsTwoBytes(boardAddress);
  this.writeAndGetReply_(
    // TODO: endianness
    [AVR.SET_ADDRESS, addressBytes[1], addressBytes[0]],
    function(readArg) {
      var hexData = binToHex(readArg.data);
      if (hexData.length == 1 && hexData[0] == 0x0D) {
        board.writePage_(0, data, doneCb);
      } else {
        return doneCb(Status.Error("Error setting address for programming."));
      }
    });
}

Avr109Board.prototype.writePage_ = function(pageNo, data, doneCb) {
  var numPages = data.length / this.pageSize_;
  if (pageNo == 0 || pageNo == numPages - 1 || (pageNo + 1) % 5 == 0) {
    log(kDebugFine, "Writing page " + (pageNo + 1) + " of " + numPages);
  }

  var board = this;
  var pageSize = this.pageSize_;

  var payload = data.slice(pageNo * this.pageSize_,
                           (pageNo + 1) * this.pageSize_);

  var sizeBytes = storeAsTwoBytes(this.pageSize_);

  // TODO: endianness
  var writeMessage = [AVR.WRITE, sizeBytes[0], sizeBytes[1], AVR.TYPE_FLASH];
  writeMessage = writeMessage.concat(payload);

  this.writeAndGetReply_(
    writeMessage,
    function(readArg) {
      var hexData = binToHex(readArg.data);
      if (hexData.length == 1 && hexData[0] == 0x0D) {
        if (pageSize * (pageNo + 1) >= data.length) {
          // TODO(mrjones): get board address from beginProgramming
          var boardAddress = 0;
          return board.beginVerification_(boardAddress, data, doneCb);
//          return board.exitProgramMode_(doneCb);
        }
        board.writePage_(pageNo + 1, data, doneCb);
      } else {
        return doneCb(Status.Error("Error writing page " + pageNo + ": " +
                                   hexRep(hexData)));
      }
    });
}

Avr109Board.prototype.beginVerification_ = function(boardAddress, data, doneCb) {
  var board = this;
  var addressBytes = storeAsTwoBytes(boardAddress);
  this.writeAndGetReply_(
    [AVR.SET_ADDRESS, addressBytes[1], addressBytes[0]],
    function(readArg) {
      var hexData = binToHex(readArg.data);
      if (hexData.length == 1 && hexData[0] == 0x0D) {
        board.verifyPage_(0, data, doneCb);
      } else {
        return doneCb(Status.Error("Error setting address for verification."));
      }

    });
}

Avr109Board.prototype.verifyPage_ = function(pageNo, data, doneCb) {
  var numPages = data.length / this.pageSize_;
  if (pageNo == 0 || pageNo == numPages - 1 || (pageNo + 1) % 5 == 0) {
    log(kDebugFine, "Verifying page " + (pageNo + 1) + " of " + numPages);
  }

  var board = this;
  var pageSize = this.pageSize_;
  var expected = data.slice(pageNo * this.pageSize_,
                            (pageNo + 1) * this.pageSize_);
  var sizeBytes = storeAsTwoBytes(this.pageSize_);

  var pageOffset = 0;
  this.writeAndGetReply_(
    [AVR.READ_PAGE, sizeBytes[0], sizeBytes[1], AVR.TYPE_FLASH],
    // TODO(mrjones): test for handling fragmented response payloads
    function(readArg) {
      var hexData = binToHex(readArg.data);
//      log(kDebugFine, "Got " + hexData.length + " bytes to verify");
      if (pageOffset + hexData.length > pageSize) {
        doneCb(Status.Error("Error verifying. Page #" + pageNo + ". Read too long (" + hexData.length + " vs. page size: " + pageSize));
        return;
      }
      for (var i = 0; i < hexData.length; i++) {
        if (hexData[i] != data[pageSize * pageNo + pageOffset]) {
          doneCb(Status.Error("Error verifying. Page #" + pageNo + ". Data mismatch at offset " + pageOffset + "(expected: " + data[pageSize * pageNo + pageOffset] + ", actual:" + hexData[i] + ")"));
          return;
        }
        pageOffset++;
      }

      if (pageOffset == pageSize) {
        if (pageSize * (pageNo + 1) >= data.length) {
          return board.exitProgramMode_(doneCb);
        }
        board.verifyPage_(pageNo + 1, data, doneCb);
      } else {
//        log(kDebugFine, "Waiting for " + (pageSize - pageOffset) + " more bytes...");
      }
    });
}

Avr109Board.prototype.exitProgramMode_ = function(doneCb) {
  var board = this;
  this.writeAndGetReply_(
    [AVR.LEAVE_PROGRAM_MODE],
    function(readArg) {
      var hexData = binToHex(readArg.data);
      if (hexData.length == 1 && hexData[0] == AVR.CR) {
        board.exitBootloader_(doneCb);
      } else {
        doneCb(Status.Error("Error leaving progam mode: " + hexRep(hexData)));
      }
    });
};

Avr109Board.prototype.exitBootloader_ = function(doneCb) {
  this.writeAndGetReply_(
    [AVR.EXIT_BOOTLOADER],
    function(readArg) {
      var hexData = binToHex(readArg.data);
      if (hexData.length == 1 && hexData[0] == AVR.CR) {
        // TODO: add a "disconnect" method, and call it everywhere
        this.globalDispatcher_.removeListener(this.connectionId_);

        // TODO: don't forget to disconnect in all the error cases (yuck)
        chrome.serial.disconnect(this.connectionId_, function(disconnectArg) {
            doneCb(Status.OK);
        });
      } else {
        doneCb(Status.Error("Error leaving bootloader: " + hexRep(hexData)));
      }
    });
}
// Parse an Intel hex file (http://en.wikipedia.org/wiki/Intel_HEX).
//
// For simplicity: Requires that the hex file specifies a single, contiguous
// block of data, starting at address 0.
//
// input: A string (separated by '\n' newlines) representing the file.
//
// returns: an array of integers (necessarily in the range [0,255]) where the n-th
//   array entry represents the byte at address 'n'.
//
// TODOs:
// - Validate checksum
// - Handle other record types
function ParseHexFile(input) {
  var kStartcodeBytes = 1;
  var kSizeBytes = 2;
  var kAddressBytes = 4;
  var kRecordTypeBytes = 2;
  var kChecksumBytes = 2;

  var inputLines = input.split("\n");

  var out = [];

  var nextAddress = 0;

  for (var i = 0; i < inputLines.length; ++i) {
    var line = inputLines[i];

    //
    // Startcode
    //
    if (line[0] != ":") {
      console.log("Bad line [" + i + "]. Missing startcode: " + line);
      return "FAIL";
    }

    //
    // Data Size
    //
    var ptr = kStartcodeBytes;
    if (line.length < kStartcodeBytes + kSizeBytes) {
      console.log("Bad line [" + i + "]. Missing length bytes: " + line);
      return "FAIL";
    }
    var dataSizeHex = line.substring(ptr, ptr + kSizeBytes);
    ptr += kSizeBytes;
    var dataSize = hexToDecimal(dataSizeHex);

    //
    // Address
    //
    if (line.length < ptr + kAddressBytes) {
      console.log("Bad line [" + i + "]. Missing address bytes: " + line);
      return "FAIL";
    }
    var addressHex = line.substring(ptr, ptr + kAddressBytes);
    ptr += kAddressBytes;
    var address = hexToDecimal(addressHex);

    //
    // Record Type
    //
    if (line.length < ptr + kRecordTypeBytes) {
      console.log("Bad line [" + i + "]. Missing record type bytes: " + line);
      return "FAIL";
    }
    var recordTypeHex = line.substring(ptr, ptr + kRecordTypeBytes);
    ptr += kRecordTypeBytes;

    //
    // Data
    //
    var dataChars = 2 * dataSize;  // Each byte is two chars
    if (line.length < (ptr + dataChars)) {
      console.log("Bad line [" + i + "]. Too short for data: " + line);
      return "FAIL";
    }
    var dataHex = line.substring(ptr, ptr + dataChars);
    ptr += dataChars;

    //
    // Checksum
    //
    if (line.length < (ptr + kChecksumBytes)) {
      console.log("Bad line [" + i + "]. Missing checksum: " + line);
      return "FAIL";
    }
    var checksumHex = line.substring(ptr, ptr + kChecksumBytes);

    //
    // Permit trailing whitespace
    //
    if (line.length > ptr + kChecksumBytes + 1) {
      var leftover = line.substring(ptr, line.length);
      if (!leftover.match("$\w+^")) {
          console.log("Bad line [" + i + "]. leftover data: " + line);
          return "FAIL";
      }
    }

    var kDataRecord = "00";
    var kEndOfFileRecord = "01";

    if (recordTypeHex == kEndOfFileRecord) {
      return out;
    } else if (recordTypeHex == kDataRecord) {
      if (address != nextAddress) {
        console.log("I need contiguous addresses");
        return "FAIL";
      }
      nextAddress = address + dataSize;

      var bytes = hexCharsToByteArray(dataHex);
      if (bytes == -1) {
        console.log("Couldn't parse hex data: " + dataHex);
        return "FAIL";
      }
      out = out.concat(bytes);
    } else {
      console.log("I can't handle records of type: " + recordTypeHex);
      return "FAIL";
    }
  }

  console.log("Never found EOF!");
  return "FAIL";
}

function hexToDecimal(h) {
  if (!h.match("^[0-9A-Fa-f]*$")) {
    console.log("Invalid hex chars: " + h);
    return -1;
  }
  return parseInt(h, 16);
}

function hexCharsToByteArray(hc) {
  if (hc.length % 2 != 0) {
    console.log("Need 2-char hex bytes");
    return -1; // :(
  }

  var bytes = [];
  for (var i = 0; i < hc.length / 2; ++i) {
    var hexChars = hc.substring(i * 2, (i * 2) + 2);
    var byte = hexToDecimal(hexChars);
    if (byte == -1) {
      return -1;
    }
    bytes.push(byte);
  }
  return bytes;
}
function Status(ok, errorMessage) {
  this.ok_ = ok;
  this.errorMessage_ = errorMessage;
};

Status.prototype.ok = function() { return this.ok_; }
Status.prototype.errorMessage = function() { return this.errorMessage_; }

Status.prototype.toString = function() {
  if (this.ok_) {
    return "OK";
  } else {
    return "ERROR: '" + this.errorMessage_ + "'";
  }
}

Status.OK = new Status(true, null);

Status.Error = function(message) {
  return new Status(false, message);
}

var kDebugError = 0;
var kDebugNormal = 1;
var kDebugFine = 2;

var visibleLevel = kDebugFine;
var consoleLevel = kDebugFine;

var visibleLoggingDiv_ = "";

function configureVisibleLogging(divName) {
  visibleLoggingDiv_ = divName;
}

function timestampString() {
  var now = new Date();
  var pad = function(n) {
    if (n < 10) { return "0" + n; }
    return n;
  }
  return pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds()) + "." + now.getMilliseconds();
}

function visibleLog(message) {
  if (visibleLoggingDiv_ != "") {
    document.getElementById(visibleLoggingDiv_).innerHTML =
      "[" + timestampString() + "] " + message + 
      "<br/>" + document.getElementById(visibleLoggingDiv_).innerHTML;
  }
}

function consoleLog(message) {
  console.log(message);
  if (chrome.extension.getBackgroundPage()) {
    chrome.extension.getBackgroundPage().log(message);
  }
}

function log(level, message) {
  if (level <= consoleLevel) {
    console.log(message);
  }
  if (level <= visibleLevel) {
    visibleLog(message);
  }
}
// Board API (in progress):
//
// Connect
// ReadFlash
// WriteFlash

// API
function Stk500Board(serial) {
  if (typeof(serial) === "undefined") {
    console.log(kDebugError, "serial is undefined");
  }
  this.serial_ = serial;
};

Stk500Board.prototype.connect = function(deviceName, doneCb) {
  // TODO: Validate doneCb
  // TODO: Validate deviceName?
  if (this.state_ != Stk500Board.State.DISCONNECTED) {
    doneCb(Status.Error("Can't connect. Current state: " + this.state_));
    return;
  }

  this.state_ = Stk500Board.State.CONNECTING;

  var board = this;
  this.serial_.connect(deviceName, { bitrate: 57600 }, function(connectArg) {
    board.serialConnected_(connectArg, doneCb);
  });
};

Stk500Board.prototype.writeFlash = function(boardAddress, data) {
  if (this.state_ != Stk500Board.CONNECTED) {
    return Status.Error("Not connected to board: " + this.state_);
  }
};

Stk500Board.prototype.readFlash = function(boardAddress) {
  if (this.state_ != Stk500Board.CONNECTED) {
    return Status.Error("Not connected to board: " + this.state_);
  }

  console.log(kDebugError, "Not implemented");
};

// IMPLEMENTATION
Stk500Board.State = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected"
};

Stk500Board.prototype.serial_ = null;
Stk500Board.prototype.state_ = Stk500Board.State.DISCONNECTED;
Stk500Board.prototype.connectionId_ = -1;

Stk500Board.prototype.serialConnected_ = function(connectArg, doneCb) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    doneCb(Status.Error("Unable to connect to device!"));
    return;
  }

  this.connectionId_ = connectArg.connectionId;
  this.twiddleControlLines(doneCb);
}

Stk500Board.prototype.twiddleControlLines = function(doneCb) {
  var cid = this.connectionId_;
  var serial = this.serial_;
  setTimeout(function() {
    serial.setControlSignals(cid, {dtr: false, rts: false}, function(ok) {
      if (!ok) {
        doneCb(Status.Error("Couldn't set dtr/rts low"));
        return;
      }
      serial.setControlSignals(cid, {dtr: true, rts: true}, function(ok) {
        if (!ok) {
          doneCb(Status.Error("Couldn't set dtr/rts high"));
          return;
        }
        // TODO: next setp
        doneCb(Status.OK);
      });
    });
  });
}

function SerialDispatcher() {
  this.listeners_ = [];
};

SerialDispatcher.prototype.listeners_ = [];

SerialDispatcher.prototype.dispatch = function(readArg) {
  for (var i = 0; i < this.listeners_.length; ++i) {
    this.listeners_[i].listener(readArg);
  }
}

SerialDispatcher.prototype.addListener = function(id, listener) {
  for (var i = 0; i < this.listeners_.length; ++i) {
    if (this.listeners_[i].id == id) {
      log(kDebugError, "Already has a listener with id '" + id + "'");
      return;
    }
  }
  this.listeners_.push({id: id, listener: listener});
}

SerialDispatcher.prototype.removeListener = function(id) {
  for (var i = 0; i < this.listeners_.length; ++i) {
    if (this.listeners_[i].id == id) {
      this.listeners_.splice(i, 1);
    }
  }
}
// API
//
// uploadCompiledSketch(parseHexfile(filename), serialportname) ??

var STK_OK = 0x10;
var STK_INSYNC = 0x14;

var STK_CRC_EOP = 0x20;

var STK_GET_SYNC = 0x30;
var STK_GET_PARAMETER = 0x41;
var STK_ENTER_PROGMODE = 0x50;
var STK_LEAVE_PROGMODE = 0x51;
var STK_LOAD_ADDRESS = 0x55;
var STK_PROG_PAGE = 0x64;
var STK_READ_SIGN = 0x75;

var STK_HW_VER = 0x80;
var STK_SW_VER_MAJOR = 0x81;
var STK_SW_VER_MINOR = 0x82;

////

var databuffer = { };

var globalDispatcher = new SerialDispatcher();
if (typeof(chrome) != "undefined" &&
    typeof(chrome.serial) != "undefined") {
  // Don't want to do this in unit tests
  // TODO: make this a little more elegant?
  chrome.serial.onReceive.addListener(
    globalDispatcher.dispatch.bind(globalDispatcher));
}

function readToBuffer(readArg) {
  log(kDebugFine, "READ TO BUFFER:" + JSON.stringify(readArg));
  if (typeof(databuffer[readArg.connectionId]) == "undefined") {
    log(kDebugFine, "Constructed buffer for: " + readArg.connectionId);
    databuffer[readArg.connectionId] = [];
  }

  var hexData = binToHex(readArg.data);

  log(kDebugFine, "Pushing " + hexData.length + " bytes onto buffer for: " + readArg.connectionId + " " + hexData);
  for (var i = 0; i < hexData.length; ++i) {
    //    log(kDebugFine, i);
    databuffer[readArg.connectionId].push(hexData[i]);
  }
  log(kDebugFine, "Buffer for " + readArg.connectionId + " now of size " + databuffer[readArg.connectionId].length);
}

function readFromBuffer(connectionId, maxBytes, callback) {
  if (typeof(databuffer[connectionId]) == "undefined") {
    log(kDebugFine, "No buffer for: " + connectionId + ", creating...");
    databuffer[connectionId] = [];
    callback({bytesRead: 0, data: []});
    return;
  }

  var bytes = Math.min(maxBytes, databuffer[connectionId].length);
  log(kDebugFine, "Reading " + bytes + " from buffer for " + connectionId);

  var accum = [];
  for (var i = 0; i < bytes; ++i) {
    accum.push(databuffer[connectionId].shift());
  }

  log(kDebugFine, "readFromBuffer -> " + binToHex(accum));

  callback({bytesRead: bytes, data: accum});
}

// TODO: board and prototocol should be separate variables
function uploadBlinkSketch(deviceName, protocol) {
  log(kDebugFine, "uploading blink sketch");
  var hexfile = 'http://linode.mrjon.es/blink.hex';
  if (protocol == 'avr109' || protocol == 'avr109_beta') {
    //
    hexfile = 'http://linode.mrjon.es/blink-micro.hex?bustcache=' + (new Date().getTime());
  }

  fetchProgram(hexfile, function(programBytes) {
    log(kDebugFine, "Fetched program. Uploading to: " + deviceName);
    log(kDebugFine, "Protocol: " + protocol);
    uploadCompiledSketch(programBytes, deviceName, protocol);
  });
}

function fetchProgram(url, handler) {
  log(kDebugFine, "Fetching: " + url)
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if (xhr.status == 200) {
        var programBytes = ParseHexFile(xhr.responseText);
        log(kDebugFine, "Program Data: " + xhr.responseText.substring(0,25) + "...");
        handler(programBytes);
      } else {
        log(kDebugError, "Bad fetch: " + xhr.status);
      }
    }
  };
  xhr.open("GET", url, true);
  xhr.send();
}

var sketchData_;
var inSync_ = false;

function pad(data, pageSize) {
  while (data.length % pageSize != 0) {
    data.push(0);
  }
  return data;
}

function uploadCompiledSketch(hexData, deviceName, protocol) {
  sketchData_ = hexData;
  inSync_ = false;
  if (protocol != "avr109_beta" && !readToBuffer.listening) {
    chrome.serial.onReceive.addListener(readToBuffer);
    readToBuffer.listening = true;
  }

  if (protocol == "stk500") {
    // Recursive awesomeness: Disconnect all devices whose name is the
    // deviceName and when you check everything connect to
    // deviceName. Note that there is no way to find out the path of
    // the device if the connect() method does not set it as name so
    // we probably wont play with other serial frameworks.
    chrome.serial.getConnections(function _maybeDisconnectFirst(connections){
      if (connections.length == 0) {
	log(kDebugFine, "Connecting to " + deviceName);
	chrome.serial.connect(deviceName, { bitrate: 115200, name: deviceName },
			      stkConnectDone.bind(null, hexData));
	return;
      }

      var candid = connections.pop();
      log(kDebugFine, "Checking connection " + candid.name);
      if (candid.name == deviceName) {
	chrome.serial.disconnect(candid.connectionId,function () {
	  _maybeDisconnectFirst(connections);
	});
      } else {
	_maybeDisconnectFirst(connections);
      }
    });
  } else if (protocol == "avr109") {
    // actually want tocheck that board is leonardo / micro / whatever
    kickLeonardoBootloader(deviceName);
  } else if (protocol == "avr109_beta") {
    var boardObj = NewAvr109Board(chrome.serial, 128, globalDispatcher);
    if (!boardObj.status.ok()) {
      log(kDebugError, "Couldn't create AVR109 Board: " + boardObj.status.toString());
      return;
    }
    var board = boardObj.board;
    board.connect(deviceName, function(status) {
      if (status.ok()) {
        board.writeFlash(0, pad(hexData, 128), function(status) {
          log(kDebugNormal, "AVR programming status: " + status.toString());

        });
      } else {
        log(kDebugNormal, "AVR connection error: " + status.toString());
      }
    });
  } else {
    log(kDebugError, "Unknown protocol: "  + protocol);
  }
}


//
// Internal/implementation
// TODO(mrjones): move into an object/namespace.
//

// Reads a pre-specified number of bytes on the serial port.
//
// The message format expected is:
// STK_INSYNC, <specified number of bytes>, STK_OK
//
// Params:
// - connectionId: the serial connection ID to attempt to read from
// - payloadSize: the number of bytes to read between INSYNC and OK
// - callback: will be called after a read with three arguments:
//   1. int connectionId: the connection that the read was attempted on
//      (this will be the same as the connectionId input param).
//   2. boolean success: true iff a well-formed message was read
//   3. int[] accum: if success is 'true' the payload data read (not
//      including STK_INSYNC or STK_OK.
function stkConsumeMessage(connectionId, payloadSize, callback) {
  log(kDebugNormal, "stkConsumeMessage(conn=" + connectionId + ", payload_size=" + payloadSize + " ...)");
  var ReadState = {
    READY_FOR_IN_SYNC: 0,
    READY_FOR_PAYLOAD: 1,
    READY_FOR_OK: 2,
    DONE: 3,
    ERROR: 4,
  };

  var accum = [];
  var state = ReadState.READY_FOR_IN_SYNC;
  var kMaxReads = 100;
  var reads = 0;
  var payloadBytesConsumed = 0;

  var handleRead = function(arg) {
    if (reads++ >= kMaxReads) {
      log(kDebugError, "Too many reads. Bailing.");
      return;
    }
    var hexData = binToHex(arg.data);
    if (arg.bytesRead > 0) {
      log(kDebugFine, "[" + connectionId + "] Read: " + hexData);
    } else {
      log(kDebugFine, "No data read.");
    }
    for (var i = 0; i < hexData.length; ++i) {
      log(kDebugFine, "Byte " + i + " of " + hexData.length + ": " + hexData[i]);
      if (state == ReadState.READY_FOR_IN_SYNC) {
        if (hexData[i] == STK_INSYNC) {
          if (payloadSize == 0) {
            log(kDebugFine, "Got IN_SYNC, no payload, now READY_FOR_OK");
            state = ReadState.READY_FOR_OK;
          } else {
            log(kDebugFine, "Got IN_SYNC, now READY_FOR_PAYLOAD");
            state = ReadState.READY_FOR_PAYLOAD;
          }
        } else {
          log(kDebugError, "Expected STK_INSYNC (" + STK_INSYNC + "). Got: " + hexData[i] + ". Ignoring.");
	  //          state = ReadState.ERROR;
        }
      } else if (state == ReadState.READY_FOR_PAYLOAD) {
        accum.push(hexData[i]);
        payloadBytesConsumed++;
        if (payloadBytesConsumed == payloadSize) {
          log(kDebugFine, "Got full payload, now READY_FOR_OK");
          state = ReadState.READY_FOR_OK;
        } else if (payloadBytesConsumed > payloadSize) {
          log(kDebugFine, "Got too many payload bytes, now ERROR")
          state = ReadState.ERROR;
          log(kDebugError, "Read too many payload bytes!");
        }
      } else if (state == ReadState.READY_FOR_OK) {
        if (hexData[i] == STK_OK) {
          log(kDebugFine, "Got OK now DONE");
          state = ReadState.DONE;
        } else {
          log(kDebugError, "Expected STK_OK. Got: " + hexData[i]);
          state = ReadState.ERROR;
        }
      } else if (state == ReadState.DONE) {
        log(kDebugError, "Out of sync (ignoring data)");
        state = ReadState.ERROR;
      } else if (state == ReadState.ERROR) {
        log(kDebugError, "In error state. Draining byte: " + hexData[i]);
        // Remains in state ERROR
      } else {
        log(kDebugError, "Unknown state: " + state);
        state = ReadState.ERROR;
      }
    }

    if (state == ReadState.ERROR || state == ReadState.DONE) {
      log(kDebugFine, "Finished in state: " + state);
      callback(connectionId, state == ReadState.DONE, accum);
    } else {
      log(kDebugFine, "Paused in state: " + state + ". Reading again.");

      if (!inSync_ && (reads % 3) == 0) {
        // Mega hack (temporary)
        log(kDebugFine, "Mega Hack: Writing: " + hexRep([STK_GET_SYNC, STK_CRC_EOP]));
        chrome.serial.send(connectionId, hexToBin([STK_GET_SYNC, STK_CRC_EOP]), function() {
          readFromBuffer(connectionId, 1024, handleRead);
        });
      } else {
        // Don't tight-loop waiting for the message.
        setTimeout(function() {
          readFromBuffer(connectionId, 1024, handleRead);
        }, 10);
      }

    }
  };

  log(kDebugFine, "Scheduling a read in .1s");
  setTimeout(function() { readFromBuffer(connectionId, 1024, handleRead); }, 10);
}

function hexRep(intArray) {
  var buf = "[";
  var sep = "";
  for (var i = 0; i < intArray.length; ++i) {
    buf += (sep + "0x" + intArray[i].toString(16));
    sep = ",";
  }
  buf += "]";
  return buf;
}

// Write a message, and then wait for a reply on a given serial port.
//
// Params:
// - int connectionId: the ID of the serial connection to read and write on
// - int[] outgoingMsg: the data to write on the serial connection. Each entry
//   represents one byte, so ints must be in the range [0-255]. This currently
//   does not append an STK_CRC_EOP at the end of a message, so callers must
//   be sure to include it.
// - int responsePayloadSize: The number of bytes expected in the response
//   message, not including STK_INSYNC or STK_OK (see
//   'stkConsumeMessage()').
// - callback: See 'callback' in 'stkConsumeMessage()'.
//
// TODO(mrjones): consider setting STK_CRC_EOP automatically?
function stkWriteThenRead(connectionId, outgoingMsg, responsePayloadSize, callback) {
  log(kDebugNormal, "[" + connectionId + "] Writing: " + hexRep(outgoingMsg));
  var outgoingBinary = hexToBin(outgoingMsg);
  // schedule a read in 100ms
  chrome.serial.send(connectionId, outgoingBinary, function(writeArg) {
    stkConsumeMessage(connectionId, responsePayloadSize, callback);
  });
}

function stkConnectDone(hexCode, connectArg) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    log(kDebugError, "Bad connectionId / Couldn't connect to board");
    return;
  }

  log(kDebugFine, "Connected to board. ID: " + connectArg.connectionId);


  readFromBuffer(connectArg.connectionId, 1024, function(readArg) {
    stkDrainedBytes(readArg, connectArg.connectionId);
  });
};

function stkDtrSent(ok, connectionId) {
  if (!ok) {
    log(kDebugError, "Couldn't send DTR");
    return;
  }
  log(kDebugFine, "DTR sent (low) real good");

  readFromBuffer(connectionId, 1024, function(readArg) {
    stkDrainedAgain(readArg, connectionId);
  });

}

function stkDrainedAgain(readArg, connectionId) {
  log(kDebugError, "DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    readFromBuffer(connectionId, 1024, function(readArg) {
      stkDrainedBytes(readArg, connectionId);
    });
  } else {
    // Start the protocol
    setTimeout(function() {
      stkWriteThenRead(connectionId, [STK_GET_SYNC, STK_CRC_EOP],
		       0, stkInSyncWithBoard); }, 50);
  }

}

function stkDrainedBytes(readArg, connectionId) {
  log(kDebugError, "DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    readFromBuffer(connectionId, 1024, function(readArg) {
      stkDrainedBytes(readArg, connectionId);
    });
  } else {
    log(kDebugFine, "About to set DTR low");

    setTimeout(function() {
      chrome.serial.setControlSignals(connectionId, {dtr: false, rts: false}, function(ok) {
        log(kDebugNormal, "sent dtr false, done: " + ok);
        setTimeout(function() {
          chrome.serial.setControlSignals(connectionId, {dtr: true, rts: true}, function(ok) {
            log(kDebugNormal, "sent dtr true, done: " + ok);
            setTimeout(function() { stkDtrSent(ok, connectionId); }, 500);
          });
        }, 500);
      });
    }, 500);
  }
}

function stkInSyncWithBoard(connectionId, ok, data) {
  if (!ok) {
    log(kDebugError, "InSyncWithBoard: NOT OK");
  }
  log(kDebugNormal, "InSyncWithBoard: " + ok + " / " + data);
  inSync_ = true;
  stkWriteThenRead(connectionId, [STK_GET_PARAMETER, STK_HW_VER, STK_CRC_EOP], 1, stkReadHardwareVersion);
}

function stkReadHardwareVersion(connectionId, ok, data) {
  log(kDebugFine, "HardwareVersion: " + ok + " / " + data);
  stkWriteThenRead(connectionId, [STK_GET_PARAMETER, STK_SW_VER_MAJOR, STK_CRC_EOP], 1, stkReadSoftwareMajorVersion);
}

function stkReadSoftwareMajorVersion(connectionId, ok, data) {
  log(kDebugFine, "Software major version: " + ok + " / " + data);
  stkWriteThenRead(connectionId, [STK_GET_PARAMETER, STK_SW_VER_MINOR, STK_CRC_EOP], 1, stkReadSoftwareMinorVersion);
}

function stkReadSoftwareMinorVersion(connectionId, ok, data) {
  log(kDebugFine, "Software minor version: " + ok + " / " + data);
  stkWriteThenRead(connectionId, [STK_ENTER_PROGMODE, STK_CRC_EOP], 0, stkEnteredProgmode);
}

function stkEnteredProgmode(connectionId, ok, data) {
  log(kDebugNormal, "Entered progmode: " + ok + " / " + data);
  stkWriteThenRead(connectionId, [STK_READ_SIGN, STK_CRC_EOP], 3, stkReadSignature);
}

function stkReadSignature(connectionId, ok, data) {
  log(kDebugFine, "Device signature: " + ok + " / " + data);

  stkProgramFlash(connectionId, sketchData_, 0, 128, stkDoneProgramming);
}

function stkDoneProgramming(connectionId) {
  sketchData_ = null;
  stkWriteThenRead(connectionId, [STK_LEAVE_PROGMODE, STK_CRC_EOP], 0, stkLeftProgmode);
}

function stkIsProgramming() {
  return sketchData_ == null;
}

function stkLeftProgmode(connectionId, ok, data) {
  log(kDebugNormal, "Left progmode: " + ok + " / " + data);
}

function stkProgramFlash(connectionId, data, offset, length, doneCallback) {
  log(kDebugFine, "program flash: data.length: " + data.length + ", offset: " + offset + ", length: " + length);
  var payload;

  if (offset >= data.length) {
    log(kDebugNormal, "Done programming flash: " + offset + " vs. " + data.length);
    doneCallback(connectionId);
    return;
  }

  if (offset + length > data.length) {
    log(kDebugFine, "Grabbing " + length + " bytes would go past the end.");
    log(kDebugFine, "Grabbing bytes " + offset + " to " + data.length + " bytes would go past the end.");
    payload = data.slice(offset, data.length);
    var padSize = length - payload.length;
    log(kDebugFine, "Padding " + padSize + " 0 byte at the end");
    for (var i = 0; i < padSize; ++i) {
      payload.push(0);
    }
  } else {
    log(kDebugFine, "Grabbing bytes: " + offset + " until " + (offset + length));
    payload = data.slice(offset, offset + length);
  }

  var addressBytes = storeAsTwoBytes(offset / 2); // Word address, verify this
  var sizeBytes = storeAsTwoBytes(length);
  var kFlashMemoryType = 0x46;

  var loadAddressMessage = [
    STK_LOAD_ADDRESS, addressBytes[1], addressBytes[0], STK_CRC_EOP];
  var programMessage = [
    STK_PROG_PAGE, sizeBytes[0], sizeBytes[1], kFlashMemoryType];
  programMessage = programMessage.concat(payload);
  programMessage.push(STK_CRC_EOP);

  stkWriteThenRead(connectionId, loadAddressMessage, 0, function(connectionId, ok, reponse) {
    if (!ok) { log(kDebugError, "Error programming the flash (load address)"); return; }
    stkWriteThenRead(connectionId, programMessage, 0, function(connectionId, ok, response) {
      if (!ok) { log(kDebugError, "Error programming the flash (send data)"); return }
      // Program the next section
      stkProgramFlash(connectionId, data, offset + length, length, doneCallback);
    });
  });
}

function storeAsTwoBytes(n) {
  var lo = (n & 0x00FF);
  var hi = (n & 0xFF00) >> 8;
  return [hi, lo];
}

function stkWaitForSync(connectionId) {
  log(kDebugFine, "readying sync bit from: " + connectionId);
  var hex = [STK_GET_SYNC, STK_CRC_EOP];
  var data = hexToBin(hex);
  log(kDebugFine, "writing: " + hex + " -> " + data);
  chrome.serial.send(connectionId, data, function(arg) { checkSync(connectionId, arg) } );
}

function hexToBin(hex) {
  var buffer = new ArrayBuffer(hex.length);
  var bufferView = new Uint8Array(buffer);
  for (var i = 0; i < hex.length; i++) {
    bufferView[i] = hex[i];
  }

  return buffer;
}

function binToHex(bin) {
  var bufferView = new Uint8Array(bin);
  var hexes = [];
  for (var i = 0; i < bufferView.length; ++i) {
    hexes.push(bufferView[i]);
  }
  return hexes;
}

function findMissingNeedlesInHaystack(needles, haystack) {
  var haystack2 = [];
  for (var i = 0; i < haystack.length; ++i) {
    haystack2.push(haystack[i].path);
  }

  var r = [];
  for (var i = 0; i < needles.length; ++i) {
    if (haystack2.indexOf(needles[i].path) == -1) {
      r.push(needles[i].path);
    }
  }

  return r;
}

function waitForNewDevice(oldDevices, deadline) {
  log(kDebugFine, "Waiting for new device...");
  if (new Date().getTime() > deadline) {
    log(kDebugError, "Exceeded deadline");
    return;
  }

  var found = false;
  chrome.serial.getDevices(function(newDevices) {
    var appeared = findMissingNeedlesInHaystack(newDevices, oldDevices);
    var disappeared = findMissingNeedlesInHaystack(oldDevices, newDevices);

    for (var i = 0; i < disappeared.length; ++i) {
      log(kDebugNormal, "Disappeared: " + disappeared[i]);
    }
    for (var i = 0; i < appeared.length; ++i) {
      log(kDebugNormal, "Appeared: " + appeared[i]);
    }

    if (appeared.length == 0) {
      setTimeout(function() { waitForNewDevice(newDevices, deadline); }, 100);
    } else {
      log(kDebugNormal, "Aha! Connecting to: " + appeared[0]);
      setTimeout(function() {
        chrome.serial.connect(appeared[0], { bitrate: 57600, name: appeared[0] }, avrConnectDone);}, 500);
    }
  });
}

function kickLeonardoBootloader(originalDeviceName) {
  log(kDebugNormal, "kickLeonardoBootloader(" + originalDeviceName + ")");
  var kMagicBaudRate = 1200;
  var oldDevices = [];
  chrome.serial.getDevices(function(devicesArg) {
    oldDevices = devicesArg;
    chrome.serial.connect(originalDeviceName, { bitrate: kMagicBaudRate, name: originalDeviceName}, function(connectArg) {
      log(kDebugNormal, "Made sentinel connection to " + originalDeviceName);
      chrome.serial.disconnect(connectArg.connectionId, function(disconnectArg) {
        log(kDebugNormal, "Disconnected from " + originalDeviceName);
        waitForNewDevice(oldDevices, (new Date().getTime()) + 10000);
	//        setTimeout(function() {
	//          chrome.serial.connect(originalDeviceName, { bitrate: 57600 }, avrConnectDone);
	//        }, 300);
      });
    });
  });
}


function avrConnectDone(connectArg) {
  if (typeof(connectArg) == "undefined" ||
      typeof(connectArg.connectionId) == "undefined" ||
      connectArg.connectionId == -1) {
    log(kDebugError, "(AVR) Bad connectionId / Couldn't connect to board");
    return;
  }

  log(kDebugFine, "Connected to board. ID: " + connectArg.connectionId);

  readFromBuffer(connectArg.connectionId, 1024, function(readArg) {
    avrDrainedBytes(readArg, connectArg.connectionId);
  });
};

function avrWaitForBytes(connectionId, n, accum, deadline, callback) {
  if (new Date().getTime() > deadline) {
    log(kDebugError, "Deadline passed while waiting for " + n + " bytes");
    return;
  }
  log(kDebugNormal, "Waiting for " + n + " bytes");

  var handler = function(readArg) {
    var hexData = binToHex(readArg.data);
    for (var i = 0; i < hexData.length; ++i) {
      accum.push(hexData[i]);
      n--;
    }

    if (n < 0) {
      log(kDebugError, "Read too many bytes !?");
    } else if (n == 0) {
      log(kDebugFine, "Response: " + hexRep(accum));
      callback(connectionId, accum);
    } else { // still want more data
      setTimeout(function() {
        avrWaitForBytes(connectionId, n, accum, deadline, callback);
      }, 50);
      // TODO: deadline?
    }
  }

  readFromBuffer(connectionId, n, handler);
}

var AVR = {
  SOFTWARE_VERSION: 0x56,
  ENTER_PROGRAM_MODE: 0x50,
  LEAVE_PROGRAM_MODE: 0x4c,
  SET_ADDRESS: 0x41,
  WRITE: 0x42, // TODO: WRITE_PAGE
  TYPE_FLASH: 0x46,
  EXIT_BOOTLOADER: 0x45,
  CR: 0x0D,
  READ_PAGE: 0x67,
};

function avrWriteThenRead(connectionId, writePayload, readSize, callback) {
  log(kDebugFine, "Writing: " + hexRep(writePayload) + " to " + connectionId);
  chrome.serial.send(connectionId, hexToBin(writePayload), function(writeARg) {
    avrWaitForBytes(connectionId, readSize, [], (new Date().getTime()) + 1000, callback);
  });
}

function avrGotVersion(connectionId, version) {
  log(kDebugNormal, "Got version: " + version);
  avrPrepareToProgramFlash(connectionId, sketchData_, avrProgrammingDone);
}

function avrEnterProgramMode(connectionId) {
  avrWriteThenRead(
    connectionId, [ AVR.ENTER_PROGRAM_MODE ], 1,
    function(connectionId, payload) {
      avrProgramFlash(connectionId, sketch_data_, 0, 128, avrProgrammingDone);
    });
}


function avrProgrammingDone(connectionId) {
  log(kDebugNormal, "avrProgrammingDone");
  avrWriteThenRead(connectionId, [ AVR.LEAVE_PROGRAM_MODE ], 1, function(connectionId, payload) {
    avrWriteThenRead(connectionId, [ AVR.EXIT_BOOTLOADER ], 1, function(connection, payload) {
      log(kDebugNormal, "ALL DONE");
    });
  });
}

function avrDrainedAgain(readArg, connectionId) {
  log(kDebugFine, "avrDrainedAgain({readarg}, " + connectionId);
  log(kDebugError, "DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    readFromBuffer(connectionId, 1024, function(readArg) {
      avrDrainedBytes(readArg, connectionId);
    });
  } else {
    // Start the protocol

    avrWriteThenRead(connectionId, [ AVR.SOFTWARE_VERSION ], 2, avrGotVersion);
  }
}

function avrDrainedBytes(readArg, connectionId) {
  log(kDebugError, "DRAINED " + readArg.bytesRead + " BYTES on " + connectionId);
  if (readArg.bytesRead == 1024) {
    // keep draining
    readFromBuffer(connectionId, 1024, function(readArg) {
      avrDrainedBytes(readArg, connectionId);
    });
  } else {
    setTimeout(function() { avrDtrSent(true, connectionId); }, 1000);
  }
}

function avrDtrSent(ok, connectionId) {
  if (!ok) {
    log(kDebugError, "Couldn't send DTR");
    return;
  }
  log(kDebugFine, "DTR sent (low) real good on connection: " + connectionId);

  readFromBuffer(connectionId, 1024, function(readArg) {
    avrDrainedAgain(readArg, connectionId);
  });
}

function avrPrepareToProgramFlash(connectionId, data, doneCallback) {
  var addressBytes = storeAsTwoBytes(0);

  var loadAddressMessage = [
    AVR.SET_ADDRESS, addressBytes[1], addressBytes[0] ];

  avrWriteThenRead(connectionId, loadAddressMessage, 1, function(connectionId, response) {
    avrProgramFlash(connectionId, data, 0, 128, avrProgrammingDone);
  });
}

function avrProgramFlash(connectionId, data, offset, length, doneCallback) {
  log(kDebugFine, "program flash: data.length: " + data.length + ", offset: " + offset + ", length: " + length);
  var payload;

  if (offset >= data.length) {
    log(kDebugNormal, "Done programming flash");
    doneCallback(connectionId);
    return;
  }

  if (offset + length > data.length) {
    log(kDebugFine, "Grabbing bytes " + offset + " to " +
        data.length + " bytes would go past the end.");
    payload = data.slice(offset, data.length);
    var padSize = length - payload.length;
    log(kDebugFine, "Padding " + padSize + " 0 byte at the end");
    for (var i = 0; i < padSize; ++i) {
      payload.push(0);
    }
  } else {
    log(kDebugFine, "Grabbing bytes: " + offset + " until " + (offset + length));
    payload = data.slice(offset, offset + length);
  }

  var sizeBytes = storeAsTwoBytes(length);
  var kFlashMemoryType = 0x46;



  var programMessage = [
    AVR.WRITE, sizeBytes[0], sizeBytes[1], AVR.TYPE_FLASH ];
  programMessage = programMessage.concat(payload);

  avrWriteThenRead(connectionId, programMessage, 1, function(connectionId, response) {
    avrProgramFlash(connectionId, data, offset + length, length, doneCallback);
  });

  //  log(kDebugNormal, "Want to write: " + hexRep(loadAddressMessage));
  //  log(kDebugNormal, "Then: " + hexRep(programMessage));

  //  avrProgramFlash(connectionId, data, offset + length, length, doneCallback);
}
function RealClock() {

};


RealClock.prototype.nowMillis = function() {
  return new Date().getTime();
}
