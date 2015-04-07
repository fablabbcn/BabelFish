var arraify = require('./util').arraify,
    Log = require('./logging').Log,
    log = new Log('Buffer');

log.log = function () {};

function storeAsTwoBytes(n) {
  var lo = (n & 0x00FF);
  var hi = (n & 0xFF00) >> 8;
  return [hi, lo];
}

function storeAsFourBytes(n) {
  return [(n & 0xFF)
          (n & 0xFF << 8) >> 8,
          (n & 0xFF << 16) >> 16,
          (n & 0xFF << 24) >> 24];

}


// Hex representation of an integer array.
function hexRep(intArray) {
  if (intArray === undefined)
    return "<undefined>";

  var buf = "[";
  var sep = "";
  for (var i = 0; i < intArray.length; ++i) {
    var hex = intArray[i].toString(16);
    hex = hex.length < 2 ? "0" + hex : hex;
    buf += (" " + hex);;
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
        log.log("Reader timed out", self);
        buffer.removeReader(self);
        if (self.timeoutCb) {
          self.timeoutCb();
        } else {
          throw Error("Unhandled async buffer read timeout.");
        }
      }, this.ttl);
    }
  },

  destroy: function () {
    log.log("Destroying reader from buffer", this.buffer);
    this.buffer.removeReader(this);
    if (this.timeout_)
      clearTimeout(this.timeout_);
  },

  // Return true if you modified it ok You can override the function
  // but `this` will be bound to the reader always.
  modifyDatabuffer: function () {
    if (Number.isInteger(this.expectedBytes) &&
        this.buffer.databuffer.length >= this.expectedBytes) {
      setTimeout(
        this.callback.bind(this,
                           this.buffer.databuffer.slice(0, this.expectedBytes)),
        0);
      this.buffer.databuffer = this.buffer.databuffer.slice(this.expectedBytes);
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
  this.maxBufferSize = 1000;
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
    var self = this;
    log.log("Running readers:", this.readers, ":", this.databuffer);

    // Walk over the readers untill one modifies the buffer (and is then destroyed.)
    this.readers.slice().some(function (r) {
      return r && r.modifyDatabuffer(self) && (r.destroy() || true);
    });
  },

  readAsync: function (maxBytesOrConfig, cb, ttl, timeoutCb) {
    var reader;
    if (Number.isInteger(maxBytesOrConfig)) {
      reader = new BufferReader({expectedBytes: maxBytesOrConfig,
                                 callback: cb,
                                 ttl: ttl || 2000,
                                 timeoutCb: timeoutCb});
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
    log.log("Reading from byffer [", maxBytes, "/", len,"]",  hexRep(accum));
    setTimeout(function () {
      callback({bytesRead: accum.length, data: accum});
    }, 0);
  },


  write: function (readArg, errorCb) {
    var hexData = bufToBin(readArg.data);
    log.log("Dev said:", hexRep(hexData));
    this.databuffer = this.databuffer.concat(hexData);
    if (this.databuffer.length > this.maxBufferSize) {
      if (errorCb)
        errorCb("Receive buffer larger than " + this.maxBufferSize);
      else
        throw Error("Receive buffer larger than " + this.maxBufferSize);
    }

    if (this.readers.length > 0)
      this.runAsyncReaders();
  },

  // Dump the entire databuffer
  drain: function(callback) {
    var ret = this.databuffer, self = this;

    log.log("Draining bytes: ", hexRep(this.databuffer));
    // Clean up readers
    this.readers.slice().forEach(function (r) {
      self.removeReader(r);
      setTimeout(r.timeoutCb, 0);
    });

    this.databuffer = [];
    callback({bytesRead: ret.length, data: ret});
  },

  cleanup: function (callback) {
    log.log("Cleaning everything of buffer.", hexRep(this.databuffer));
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
module.exports.storeAsFourBytes = storeAsFourBytes;
module.exports.binToBuf = binToBuf;
