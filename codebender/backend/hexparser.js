var util = require("./util");

function mergeChunks (blob, chunk) {
  // Empty chunks are as good as null
  if (blob && blob.data.length == 0)
    blob = null;

  if (chunk && chunk.data.length == 0)
    chunk = null;

  // Preserve data consistency by returning an as-good-as-null
  // chunk.
  if (chunk === null || blob === null)
    return blob || chunk || {addr: 0, data: []};

  var minStart = Math.min(chunk.addr, blob.addr),
      maxEnd = Math.max(chunk.addr + chunk.data.length,
                        blob.addr + blob.data.length),
      // Make sure the array has the length maxAddr - minAddr
      data = util.makeArrayOf(0, blob.addr - minStart)
        .concat(blob.data)
        .concat(util.makeArrayOf(0,  maxEnd - (blob.data.length + blob.addr)));

  chunk.data.forEach(function (byte, byteRelAddr) {
    // Absoltue address - blob offset = blob relative
    data[byteRelAddr + (chunk.addr - minStart)] = byte;
  });

  return {
    addr: minStart,
    data: data
  };
}

function hexToBytes(strData) {
  var tmp;
  return util.arraify(strData).reduce(function (arr, c, i) {
    // Pair hex digits and parse them.
    if (i % 2) {
      return arr.concat([Number.parseInt(tmp + c, 16)]);
    } else {
      tmp = c;
      return arr;
    }
  }, []);
}

function ParseHexFile(hexString) {
  var offsetLin = 0;
  // Do nothing (eg eof line) is null

  function lineToChunk (line) {
    if (line.length == 0)
      return null;

    var index = 0,
        // Types
        DATA = 0,
        EOF = 1,
        EXTENDED_SEG_ADDR = 2,
        START_SEG_ADDR = 3,
        EXTENDED_LIN_ADDR = 4,
        START_LIN_ADDR = 5;

    function rng(length) {
      var start = index, end = index + length;
      index = end;
      return line.substring(start, end);
    }

    var start = rng(1),
        length = Number.parseInt(rng(2), 16),
        addr = Number.parseInt(rng(4), 16),
        type = Number.parseInt(rng(2), 16),
        strData = rng(length * 2), // two hex characters = one byte
        // Check all the byts preceeding the checksum
        actualCheck = hexToBytes(line.substring(1, index))
          .reduce(function (a, b) {
            return a+b;
          }, 0) & 0xff,
        checksum = Number.parseInt(rng(2), 16),
        byteData = hexToBytes(strData);

    util.assert(start == ':', "Hex file line did not start with ':': " + line);

    // 2's complement checksum, ie negative sum.
    util.assert(checksum == ((-actualCheck) & 0xff),
                "Checksum failed for line: " + line);

    switch (type) {
    case DATA:
      return {addr: addr + offsetLin, data: byteData};
      break;
    case EXTENDED_LIN_ADDR:
      offsetLin = Number.parseInt(strData) << 16;
    default:
      // XXX: ignore all other types.
      return null;
    }
  }

  return hexString.split("\n")
    .map(lineToChunk)
    .reduce(mergeChunks, null) || {addr: 0, data: []};
}

// Parse an Intel hex file (http://en.wikipedia.org/wiki/Intel_HEX).
//
// For simplicity: Requires that the hex file specifies a single, contiguous
// block of data, starting at address 0.
//
// input: A string (separated by '\n' newlines) representing the file.
//
// returns: an array of integers (necessarily in the range [0,255]) where the n-th
//   array entry represents the byte at address 'n'.
//
// TODOs:
// - Validate checksum
// - Handle other record types
function _ParseHexFile(input) {
  var kStartcodeBytes = 1;
  var kSizeBytes = 2;
  var kAddressBytes = 4;
  var kRecordTypeBytes = 2;
  var kChecksumBytes = 2;

  var inputLines = input.split("\n");

  var out = [];

  var nextAddress = 0;

  for (var i = 0; i < inputLines.length; ++i) {
    var line = inputLines[i];

    //
    // Startcode
    //
    if (line[0] != ":") {
      console.log("Bad line [" + i + "]. Missing startcode: " + line);
      return "FAIL";
    }

    //
    // Data Size
    //
    var ptr = kStartcodeBytes;
    if (line.length < kStartcodeBytes + kSizeBytes) {
      console.log("Bad line [" + i + "]. Missing length bytes: " + line);
      return "FAIL";
    }
    var dataSizeHex = line.substring(ptr, ptr + kSizeBytes);
    ptr += kSizeBytes;
    var dataSize = hexToDecimal(dataSizeHex);

    //
    // Address
    //
    if (line.length < ptr + kAddressBytes) {
      console.log("Bad line [" + i + "]. Missing address bytes: " + line);
      return "FAIL";
    }
    var addressHex = line.substring(ptr, ptr + kAddressBytes);
    ptr += kAddressBytes;
    var address = hexToDecimal(addressHex);

    //
    // Record Type
    //
    if (line.length < ptr + kRecordTypeBytes) {
      console.log("Bad line [" + i + "]. Missing record type bytes: " + line);
      return "FAIL";
    }
    var recordTypeHex = line.substring(ptr, ptr + kRecordTypeBytes);
    ptr += kRecordTypeBytes;

    //
    // Data
    //
    var dataChars = 2 * dataSize;  // Each byte is two chars
    if (line.length < (ptr + dataChars)) {
      console.log("Bad line [" + i + "]. Too short for data: " + line);
      return "FAIL";
    }
    var dataHex = line.substring(ptr, ptr + dataChars);
    ptr += dataChars;

    //
    // Checksum
    //
    if (line.length < (ptr + kChecksumBytes)) {
      console.log("Bad line [" + i + "]. Missing checksum: " + line);
      return "FAIL";
    }
    var checksumHex = line.substring(ptr, ptr + kChecksumBytes);

    //
    // Permit trailing whitespace
    //
    if (line.length > ptr + kChecksumBytes + 1) {
      var leftover = line.substring(ptr, line.length);
      if (!leftover.match("$\w+^")) {
        console.log("Bad line [" + i + "]. leftover data: " + line);
        return "FAIL";
      }
    }

    var kDataRecord = "00";
    var kEndOfFileRecord = "01";

    if (recordTypeHex == kEndOfFileRecord) {
      return out;
    } else if (recordTypeHex == kDataRecord) {
      if (address != nextAddress) {
        console.log("I need contiguous addresses");
        console.log(input);
        return "FAIL";
      }
      nextAddress = address + dataSize;

      var bytes = hexCharsToByteArray(dataHex);
      if (bytes == -1) {
        console.log("Couldn't parse hex data: " + dataHex);
        return "FAIL";
      }
      out = out.concat(bytes);
    } else {
      console.log("I can't handle records of type: " + recordTypeHex);
      return "FAIL";
    }
  }

  console.log("Never found EOF!");
  return "FAIL";
}

function hexToDecimal(h) {
  if (!h.match("^[0-9A-Fa-f]*$")) {
    console.log("Invalid hex chars: " + h);
    return -1;
  }
  return parseInt(h, 16);
}

function hexCharsToByteArray(hc) {
  if (hc.length % 2 != 0) {
    console.log("Need 2-char hex bytes");
    return -1; // :(
  }

  var bytes = [];
  for (var i = 0; i < hc.length / 2; ++i) {
    var hexChars = hc.substring(i * 2, (i * 2) + 2);
    var byte = hexToDecimal(hexChars);
    if (byte == -1) {
      return -1;
    }
    bytes.push(byte);
  }
  return bytes;
}

var Base64Binary = {
  _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

  /* will return a  Uint8Array type */
  decodeArrayBuffer: function(input) {
    var bytes = (input.length/4) * 3;
    var ab = new ArrayBuffer(bytes);
    this.decode(input, ab);

    return ab;
  },

  decode: function(input, arrayBuffer) {
    //get last chars to see if are valid
    var lkey1 = this._keyStr.indexOf(input.charAt(input.length-1));
    var lkey2 = this._keyStr.indexOf(input.charAt(input.length-2));

    var bytes = (input.length/4) * 3;
    if (lkey1 == 64) bytes--; //padding chars, so skip
    if (lkey2 == 64) bytes--; //padding chars, so skip

    var uarray;
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    var j = 0;

    if (arrayBuffer)
      uarray = new Uint8Array(arrayBuffer);
    else
      uarray = new Uint8Array(bytes);

    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

    for (i=0; i<bytes; i+=3) {
      //get the 3 octects in 4 ascii chars
      enc1 = this._keyStr.indexOf(input.charAt(j++));
      enc2 = this._keyStr.indexOf(input.charAt(j++));
      enc3 = this._keyStr.indexOf(input.charAt(j++));
      enc4 = this._keyStr.indexOf(input.charAt(j++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      uarray[i] = chr1;
      if (enc3 != 64) uarray[i+1] = chr2;
      if (enc4 != 64) uarray[i+2] = chr3;
    }

    return uarray;
  }
}

window.ParseHexFile = ParseHexFile;
window.Base64Binary = Base64Binary;
module.exports.ParseHexFile = ParseHexFile;
module.exports.Base64Binary = Base64Binary;
