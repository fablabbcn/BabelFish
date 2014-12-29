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

// Config
// @param: ttl: Reader timeout

function BufferReader (config) {
  var self = this;
  Object.keys(config || {}).forEach(function (k) {
    self[k] = config[k];
  });

  this.modifyDatabuffer = this.modifyDatabuffer.bind(this);
}

BufferReader.prototype = {
  // This is not set in the constructor to have a chance to make
  // modifications.
  register: function (buffer) {
    var self = this;

    this.buffer = buffer;
    buffer.appendReader(this);
    if (this.ttl) {
      this.timeout_ = setTimeout(function () {
        log.log("Reader timed out", this);
        buffer.removeReader(this);
        if (this.timeoutCb) {
          this.timeoutCb();
        } else {
          throw Error("Unhandled async buffer read timeout.");
        }
      }, this.ttl);
    }
  },

  destroy: function () {
    this.buffer.removeReader(this);
    if (this.timeout_)
      clearTimeout(this.timeout_);
  },

  // Return true if you modified it ok You can override the function
  // but `this` will be bound to the reader always.
  modifyDatabuffer: function () {
    if (Number.isInteger(this.expectedBytes) &&
        this.buffer.databuffer.length >= this.expectedBytes) {
      this.setTimeout(
        this.callback.bind(this,
                           this.buffer.databuffer.slice(0, this.expectedBytes)),
        0);
      this.buffer.databuffer = this.buffer.databuffer.slice(true, this.expectedBytes);
      return true;
    } else {
      return false;
    }
  }
};

function Buffer (readerClass) {
  this.databuffer = [];
  this.readers = [];
  this.readerClass = readerClass;
}

Buffer.prototype = {
  removeReader: function (reader) {
    log.log("Removing reader:", reader);
    var len = this.readers.length;
    this.readers = this.readers.filter(function (r) {return (r !== reader);});
  },

  appendReader: function (reader) {
    this.readers.push(reader);
  },

  runAsyncReaders: function () {
    var db;
    log.log("Running readers:", this.readers, "databuffer:", this.databuffer);
    while (this.readers[0] &&
           this.readers[0].modifyDatabuffer(this)) {
      this.readers[0].destroy();
    }
  },

  readAsync: function (maxBytesOrConfig, cb, ttl, errorCb) {
    var reader;
    if (Number.isInteger(maxBytesOrConfig)) {
      reader = new BufferReader({expectedBytes: maxBytesOrConfig,
                                 callback: cb,
                                 ttl: ttl || 2000,
                                 errorCb: errorCb});
    } else {
      reader = new BufferReader(maxBytesOrConfig);
    }

    reader.register(this);
    setTimeout(this.runAsyncReaders.bind(this), 0);
  },

  // Read as much as possible until maxBytes and send it to callback
  // in the form of {bytesRead: <>, data: <>}
  read: function (maxBytes, callback) {
    var len =this.databuffer.length,
        accum = this.databuffer.splice(0, maxBytes);
    log.log("Reading from byffer [", maxBytes, "/", len,"]",  accum);
    setTimeout(function () {
      callback({bytesRead: accum.length, data: accum});
    }, 0);
  },


  write: function (readArg) {
    var hexData = bufToBin(readArg.data);
    this.databuffer = this.databuffer.concat(hexData);
    log.log("Pushing to buffer [", hexData.length, "]: ", hexData);
    if (this.readers.length > 0)
      this.runAsyncReaders();
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
