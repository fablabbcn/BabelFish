// XXX: have the methods generate from avrdude.conf

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
