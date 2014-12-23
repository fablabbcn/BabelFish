// XXX: have the methods generate from avrdude.conf

// Reverse the bits in data
function bitReverse (data, bits) {
  var res = [];
  bits = bits || 8;

  for (var i=0; i < bits; i++)
    res.push((data >> i) & 1);

  return res.reverse()
    .reduce(function (bit, ret) {return (ret << 1) | bit;}, 0);
}

// Split integer {data} into {bytes} bytes.
function splitBytes (data, bytes, bigEndian) {
  var ret = [];

  for (var i = 0; i < bytes; i++) {
    ret.push(data & 0xff);
    data >>= 8;
  }

  return ret;
}


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
    var bitArray = [];
    while (data) {
      bitArray.push(data & 1);
      data >>= 1;
    }

    // Set each bit object to a value.
    this.bits.
      filter(function (b) {return b.id == id;})
      .forEach(function (b) {
        for (var i = 0 ; i < bitArray.length; i++)
          if (b.index == i)
            b.value = data[i];
      });
  },

  // Byte list of opcoes
  getCmd: function () {
    splitBytes(this.bits.reduce(function (val, bit) {
      return (val << 1 | bit.value);
    }));
  }
};

function MemoryOperations() {
}

MemoryOperations.prototype = {
  readLow: function(addr) {},
  readHigh: function(addr) {},
  read: function(addr) {}
};

module.exports = MemoryOperations;
