// A op to an array of bytes. No parameters.
function opToBin(op) {
  var ret = [];
  for (var i = 0; i < Math.ceil(op.length / 8); i++)
    ret.push(0x0);

  op.forEach(function (bitStruct, index) {
    var bit = bitStruct.instBit % 8,
        byte = Math.floor(bitStruct.instBit / 8);
    if (bitStruct.bitType == "VALUE")
      ret[byte] |= bitStruct.value << bit;
  });

  return ret.reverse();
}

module.exports.opToBin = opToBin;
