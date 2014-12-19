// XXX: have the methods generate from avrdude.conf

function OpcodeBit (id) {
  this.id = id.slice(0,1);
  this.index = Number(id.slice(1));
  this.value = Number(this.id) || 0;
}

function OpcodeFactory(bitString) {
  self.bits = bitString
    .split(" ")
    .filter(function (b) {return b.length != 0;})
    .map(function (b) {return new OpcodeBit(b);});
}

OpcodeFactory.prototype = {
  setBits: function (id, data) {
    var array = [];
    while (data) {
      array.push(data & 1);
      data >>= 1;
    }

    this.bits.
      filter(function (b) {return b.id == id;})
      .forEach(function (b) {
        for (var i = 0 ; i < array.length; i++)
          if (b.index == i)
            b.value = data[i];
    });
  },

  // XXX: Get the executable opcodes
  getCmd: function () {
    throw Error("Not implemented");
  }
};

function MemoryOperations() {
}

MemoryOperations.prototype = {

  // Reverse the bits in data
  bitReverse: function (data, bits) {
    var res = [];
    bits = bits || 8;

    for (var i=0; i < bits; i++)
      res.push((data >> i) & 1);

    return res.reverse()
      .reduce(function (bit, ret) {return (ret << 1) | bit;}, 0);
  },

  // Split integer {data} into {bytes} bytes.
  splitBytes: function (data, bytes, bigEndian) {
    var ret = [];

    for (var i = 0; i < bytes; i++) {
      ret.push(data & 0xff);
      data >>= 8;
    }

    return ret;
  },

  readLow: function(addr) {},
  readHigh: function(addr) {},
  read: function(addr) {}
};

module.exports = MemoryOperations;
