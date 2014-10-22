function binToHex(bin) {
  var bufferView = new Uint8Array(bin);
  var hexes = [];
  for (var i = 0; i < bufferView.length; ++i) {
    hexes.push(bufferView[i]);
  }
  return hexes;
}

// May be destructive
function argsEncode(args) {
	var ret = {callback: null};
	ret.args = args.map(function (arg) {
		if (arg instanceof Function) {
			ret.callback = arg;
		} else if (arg instanceof ArrayBuffer) {
			return {type: 'arraybuffer', val: binToHex(arg)};
		}

		// XXX: extremely ad-hoc
		if (arg.data && arg.data instanceof ArrayBuffer) {
			console.warn("arg.data");
			arg.data = binToHex(arg.data);
			return {type: 'data-arraybuffer', val: arg};
		}

		return {type: typeof(arg), val: arg};
	});

	return ret;
}


function hexToBin(hex) {
  var buffer = new ArrayBuffer(hex.length);
  var bufferView = new Uint8Array(buffer);
  for (var i = 0; i < hex.length; i++) {
    bufferView[i] = hex[i];
  }

  return buffer;
}

function argsDecode(args, cbHandler) {
	return (args.args || []).map( function (arg) {
		switch (arg.type) {
		case 'function':
			return cbHandler;
			break;
		case 'arraybuffer':
			return hexToBin(arg.val);
		case 'data-arraybuffer':
			arg.val.data = hexToBin(arg.val.data);
		default:
			return arg.val;
			break;
		}
	});
}
