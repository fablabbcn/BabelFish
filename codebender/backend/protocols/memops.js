var util = require('./../util');

// A op to an array of bytes. Optional parameter param is an object
// with keys corresponding to avrdude.conf's bitTypes. Some of them
//
// - ADDRESS
//
function opToBin(op, param) {
  var ret = [];
  param = param || {};
  for (var i = 0; i < Math.ceil(op.length / 8); i++)
    ret.push(0x0);

  op.forEach(function (bitStruct, index) {
    var bit = bitStruct.instBit % 8,
        byte = Math.floor(bitStruct.instBit / 8);
    if (bitStruct.bitType == "VALUE") {
      ret[byte] |= bitStruct.value << bit;
    } else {
      var val = (param[bitStruct.bitType] >> bitStruct.bitNo & 0x01);
      ret[byte] |= val << bit;
    }
  });

  return ret.reverse();
}

function intToByteArray (intData, bitNum) {
  return util.makeArrayOf(0, Math.ceil(bitNum / 8))
    .map(function (_, index) {
      return (intData >> index * 8) & 0xff;
    });
}

function extractOpData(type, op, bin) {
  var retBits = 0,
      intData = op.reduce(function (ret, bitStruct, index) {
        var bit = bitStruct.instBit % 8,
            byte = Math.floor(bitStruct.instBit / 8),
            byteMask = 1 << bit;

        retBits = Math.max(retBits, bitStruct.bitNo + 1);

        if (bitStruct.bitType == type) {
          return ret | (((bin[byte] & byteMask) >> bit) << bitStruct.bitNo);
        }

        return ret;
      }, 0);

  return intToByteArray(intData, retBits);
}

module.exports.extractOpData = extractOpData;
module.exports.opToBin = opToBin;
