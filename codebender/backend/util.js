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

// Callback gets the next iteration as first
function infinitePoll (timeout, cb) {
  var finished = false;
  function stopPoll() {
    finished = true;
  }
  if (finished) {
    return;
  }
  cb(function () {
    setTimeout(function () {
      infinitePoll(timeout, cb);
    }, timeout);
  });
  return stopPoll;
}

function dbg (varargs) {
  var args = arraify(arguments, 0, '[plugin frontent]');
  return console.log.apply(console, args);
}

function forEachWithCallback (array, iterationCb, finishCb) {
  var arr = array.slice();
  function nextCb () {
    if (arr.length != 0) {
      var item = arr.shift();
      // Iteration with item
      iterationCb(item, nextCb);
    }
    else {
      finishCb();
    }
  }
  nextCb();
}

function poll (maxRetries, timeout, cb, errCb) {
  if (maxRetries < 0){
    if (errCb)
      errCb();
    else
      throw Error("Retry limit exceeded");

    return;
  }
  cb(function () {
    setTimeout(function () {
      poll(maxRetries-1, timeout, cb, errCb);
    }, timeout);
  });
}

// Python style zip
function zip(varArgs) {
  var arrays = arraify(arguments);

  return arrays[0].map(function(_,i) {
    return arrays.map(function(array){return array[i];});
  });
}

// Python style zip
function arrEqual(varArgs) {
  var arrays = arraify(arguments);

  if (arrays.length == 0) {
    return true;
  }

  if (arrays.some(function (a) {a.length != arrays[0].length}))
    return false;

  // Is there an element for which there is an element that is not
  // equal to it?
  return !arrays[0].some(function(ele, i) {
    return arrays.some(function(array) {
      return array[i] != ele;
    });
  });
}

function pyzip() {
  var args = [].slice.call(arguments);
  var shortest = args.length==0 ? [] : args.reduce(function(a,b){
    return a.length<b.length ? a : b;
  });

  return shortest.map(function(_,i){
    return args.map(function(array){return array[i];});
  });
}

// Chain functiona arrays. Each function in the array receives as a
// first arg a callback whose arguments are the 2nd, 3rd... arg of
// the next call. Eg.
//
// chain([function (next) {next(1,2,3);},
//        function (next, a, b, c) {console.log(a, b, c)}]);
//
// Will print "1 2 3"
function chain (functionArray, final) {
  if (functionArray.length == 0) {
    if (final)
      final();
    return;
  }

  var args = [chain.bind(null, functionArray.slice(1), final)]
        .concat(arraify(arguments, 2));
  functionArray[0].apply(null, args);
}

function makeArrayOf(value, length) {
  assert (length < 100000 && length >= 0,
          "Length of array too large or too small");

  var arr = [], i = length;
  while (i--) {
    arr[i] = value;
  }
  return arr;
}

function assert(val, msg) {
  if (!val)
    throw Error("AssertionError: " + msg);
}

// Non destructive. Makes a copy of each object. object o2 overrides
// o1.
function merge(o1, o2) {
  var ret = {};
  Object.getOwnPropertyNames(o1).forEach(function (k) {
    ret[k] = o1[k];
  });

  Object.getOwnPropertyNames(o2).forEach(function (k) {
    ret[k] = o2[k];
  });

  return ret;
}

module.exports.makeArrayOf = makeArrayOf;
module.exports.merge = merge;
module.exports.arraify = arraify;
module.exports.assert = assert;
module.exports.chain = chain;
module.exports.zip = zip;
module.exports.deepCopy = deepCopy;
module.exports.infinitePoll = infinitePoll;
module.exports.poll = poll;
module.exports.dbg = dbg;
module.exports.forEachWithCallback = forEachWithCallback;
module.exports.arrEqual = arrEqual;
