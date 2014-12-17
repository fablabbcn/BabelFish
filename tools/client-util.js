// File: /tools/client-util.js

// Log in a list called id
function log(id, msg) {
  var ele = document.getElementById(id);
  if (!ele) {
    var he = document.createElement('h3');
    he.innerHTML = id;
    ele = document.createElement('ul');
    ele.id = id;
    ele.className = "loglist";
    document.body.appendChild(he);
    document.body.appendChild(ele);
  }

  console.log("[" + id + "] " + msg );
  ele.innerHTML += '<li>' + msg + '</li>';
}

function str(obj) {
  return JSON.stringify(obj);
}

try {
  module.exports = {str: str, log: log};
} catch (e) {
  ;
}

window.log = log;
window.str = str;

var dbg = (function () {
  var DEBUG=false;
  if (DEBUG) {
    return function (var_args) {
      console.log.apply(console, ["[Client] "].concat(Array.prototype.slice.call(arguments)));
    };
  } else {
    return function (msg) {};
  }
})();
window.dbg = dbg;
