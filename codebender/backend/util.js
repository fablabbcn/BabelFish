function arraify(arrayLike, offset, prefixVarArgs) {
  var ret = Array.prototype.slice.call(arrayLike, offset),
      prefix = Array.prototype.slice.call(arguments, 2);

  return prefix.concat(ret);
}

function deepCopy(obj) {
  switch (typeof obj) {
  case 'array':
    return obj.map(deepCopy);
    break;
  case 'object':
    var ret = {};
    Object.ownPropertyNames(obj).forEach(function (k) {
      ret[k] = deepCopy(obj[k]);
    });
    return ret;
    break;
  default:
    return obj;
  }
}

module.exports.arraify = arraify;
module.exports.deepCopy = deepCopy;
