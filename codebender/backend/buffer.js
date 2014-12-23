var arraify = require('./util').arraify,
    Log = require('./logging').Log,
    log = new Log('Buffer');

function storeAsTwoBytes(n) {
  var lo = (n & 0x00FF);
  var hi = (n & 0xFF00) >> 8;
  return [hi, lo];
}


// Hex representation of an integer array.
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
  this.databuffer = [];
  this.readers = [];
}

Buffer.prototype = {
  lastReader: function () {
    return this.readers[this.readers.length - 1];
  },

  removeReader: function (reader) {
    log.log("Removing reader:", reader);
    var len = this.readers.length;
    this.readers = this.readers.filter(function (r) {return (r !== reader);});

    if (len == this.readers.length + 1 && reader.timeout )
      clearTimeout(reader.timeout);
    else
      log.warn("Tried to remove nonexistent reader.");

    return false;
  },

  // Event based read
  readAsync: function (maxBytes, callback, timeout, timeoutCb) {
    var reader = {timestamp: (new Date).getTime(),
                  expectBytes: maxBytes,
                  callback: callback,
                  ttl: timeout},
        self = this,
        helper = (new Error()).stack;

    log.log("Registering reader:", reader);
    this.readers.push(reader);
    if (timeout) {
      log.log("Setting reader timeout at", timeout);
      reader.timeout = setTimeout(function () {
        log.log("Reader timed out", reader);
        self.removeReader(reader);
        if (timeoutCb) {
          timeoutCb();
        } else {
          throw Error("Unhandled async buffer read timeout.");
        }
      }, timeout);
    }

    this.runAsyncReaders(this.readers);
  },

  runAsyncReaders: function (readers) {
    var ret = false;
    log.log("Running reader:", readers, "databauffer:", this.databuffer);
    while (readers[0] &&
           readers[0].expectBytes <= this.databuffer.length) {

      log.log("Reader found");
      var reader = this.readers[0];
      this.read(reader.expectBytes, reader.callback);
      this.removeReader(reader);
      ret = true;
    }
    return ret;
  },

  // Read as much as possible until maxBytes and send it to callback
  // in the form of {bytesRead: <>, data: <>}
  read: function (maxBytes, callback) {
    var len =this.databuffer.length,
        accum = this.databuffer.splice(0, maxBytes);
    log.log("Reading from byffer [", maxBytes, "/", len,"]",  accum);
    callback({bytesRead: accum.length, data: accum});
  },


  write: function (readArg) {
    var hexData = bufToBin(readArg.data);
    this.databuffer = this.databuffer.concat(hexData);
    log.log("Pushing to buffer [", hexData.length, "]: ", hexData);
    if (this.readers.length > 0)
      this.runAsyncReaders(this.readers);
  },

  // Dump the entire databuffer
  drain: function(callback) {
    log.log("Draining bytes: ", this.databuffer);
    var ret = this.databuffer;
    this.databuffer = [];
    callback({bytesRead: ret.length, data: ret});
  },

  cleanup: function (callback) {
    log.log("Cleaning everything of buffer.", this.databuffer);
    this.readers.slice().forEach(this.removeReader.bind(this));

    // Because the above is nasty, `undefined` tokens may survive in
    // this.readers. However we dont free the whole array to be sure
    // no real readers survived.
    for (var i=0; i<this.readers.length; i++) {
      if (!this.readers[i]) {
        delete this.readers[i];
      } else {
        throw Error("Buffer reader survived the cleanup" + this.readers[i]);
      }
    }
    this.databuffer = [];
    if (callback) callback();
  }
};

module.exports.Buffer = Buffer;
module.exports.hexRep = hexRep;
module.exports.bufToBin = bufToBin;
module.exports.storeAsTwoBytes = storeAsTwoBytes;
module.exports.binToBuf = binToBuf;
