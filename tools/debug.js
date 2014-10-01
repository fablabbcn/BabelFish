function getAttrs(obj) {
	var ret = Object.getOwnPropertyNames(obj);
	while (true) {
		obj = Object.getPrototypeOf(obj);
		try {
			var arr = Object.getOwnPropertyNames(obj);
		} catch (e) {
			break;
		}

		for (var i=0; i<arr.length; i++) {
			if (ret.indexOf(arr[i]) == -1)
				ret.push(arr[i]);
		}
	}

	return ret;
}
