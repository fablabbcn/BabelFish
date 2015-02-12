// A op to an array of bytes. Optional parameter addr is the address
// to fill in the address bits.
function opToBin(op, addr) {
  var ret = [];
  addr = addr || 0;
  for (var i = 0; i < Math.ceil(op.length / 8); i++)
    ret.push(0x0);

  op.forEach(function (bitStruct, index) {
    var bit = bitStruct.instBit % 8,
        byte = Math.floor(bitStruct.instBit / 8);
    switch (bitStruct.bitType) {
    case "VALUE":
      ret[byte] |= bitStruct.value << bit;
      break;
    case "ADDRESS":
      var val = (addr >> bitStruct.bitNo & 0x01);
      ret[byte] |= val << bit;
      break;
    }
  });

  return ret.reverse();
}

module.exports.opToBin = opToBin;
