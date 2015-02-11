// A op to an array of bytes. No parameters.
function opToBin(op) {
  var ret = [0x0, 0x0, 0x0, 0x0];
  op.forEach(function (bitStruct, index) {
    var bit = bitStruct.instBit % 8,
        byte = 3 - Math.floor(bitStruct.instBit / 8);
    if (bitStruct.bitType == "VALUE")
      ret[byte] |= bitStruct.value << bit;
  });

  return ret;
}

module.exports.opToBin = opToBin;
