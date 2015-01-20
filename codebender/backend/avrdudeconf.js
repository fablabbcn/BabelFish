var parts = require('./parts.min'),
    _conf = null;

function getMCUConf (mcu) {
  if (!_conf) {
    Object.getOwnPropertyNames(parts).forEach(function (pn) {
      _conf[parts[pn].AVRPart.toLowerCase()] = parts[pn];
    });
  }

  return _conf[mcu];
}

module.exports.getMCUConf = getMCUConf;
