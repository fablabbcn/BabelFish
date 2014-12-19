var arraify = require('./util').arraify,
    Log = require('./logging').Log,
    log = new Log('Buffer');

function storeAsTwoBytes(n) {
  var lo = (n & 0x00FF);
  var hi = (n & 0xFF00) >> 8;
  return [hi, lo];
}


// Async reading to and from buffer
function binToBuf(hex) {
  if (hex instanceof ArrayBuffer)
    return hex;

  var buffer = new ArrayBuffer(hex.length);
  var bufferView = new Uint8Array(buffer);
  for (var i = 0; i < hex.length; i++) {
    bufferView[i] = hex[i];
  }

  return buffer;
}

function bufToBin(buf) {
  if (!buf instanceof ArrayBuffer)
    return buf;

  var bufferView = new Uint8Array(buf);
  var hexes = [];
  for (var i = 0; i < bufferView.length; ++i) {
    hexes.push(bufferView[i]);
  }

  return hexes;
}

function Buffer () {
}

Buffer.prototype = {
  mergeReadArgs: function (ra1, ra2) {
    return {bytesRead: ra1.bytesRead + ra1.bytesRead,
            data: ra1.data.concat(ra2.data)};
  },

  // Execute callback when you get enough data
  registerReader: function (maxBytes, readArg, callback) {

  },

  readPersist: function (maxBytes, callback) {
    this.read(maxBytes, function (readArg) {
      console.assert(readArg.byterRead > maxBytes,
                     "Buffer.read read more bytes than requested.");
      if (readArg.byterRead < maxBytes) {
        this.reagisterReader(maxBytes, readArg, callback);
      } else {
        callback(readArg);
      }
    });
  },

  read: function (maxBytes, callback) {
    if (typeof(this.databuffer) == "undefined") {
      log.log("Creating buffer...");
      this.databuffer = [];
      callback({bytesRead: 0, data: []});
      return;
    }

    var bytes = Math.min(maxBytes, this.databuffer.length);
    log.log("Reading", bytes, " from buffer");

    var accum = this.databuffer.slice(0, bytes);
    this.databuffer = this.databuffer.slice(bytes);
    log.log("readFromBuffer -> " + bufToBin(accum));
    callback({bytesRead: bytes, data: accum});
  },

  write: function (readArg) {
    var hexData = bufToBin(readArg.data);
    log.log("Pushing to buffer:", hexData);
    this.databuffer = this.databuffer.concat(hexData);
    log.log("Buffer now of size ", this.databuffer.length);
  }
};

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

module.exports.Buffer = Buffer;
module.exports.hexRep = hexRep;
module.exports.bufToBin = bufToBin;
module.exports.storeAsTwoBytes = storeAsTwoBytes;
module.exports.binToBuf = binToBuf;
