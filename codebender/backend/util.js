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
  }
  cb(function () {
    setTimeout(function () {
      poll(maxRetries-1, timeout, cb, errCb);
    }, timeout);
  });
}


module.exports.arraify = arraify;
module.exports.deepCopy = deepCopy;
module.exports.infinitePoll = infinitePoll;
module.exports.poll = poll;
module.exports.dbg = dbg;
module.exports.forEachWithCallback = forEachWithCallback;
