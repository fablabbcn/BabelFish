// file: plugin.js
require('./../tools/client-util');

// XXX: Use lawnchair for this.
window.plugins_initialized = 0;

if (!window.chrome) {
  window.CodebenderPlugin = require('./firefox-plugin');
} else {
  var _create_chrome_client = require('./../chrome-extension/client/rpc-client');
  if (window.extentionAvailable) {
    window.CodebenderPlugin = require('./chrome-plugin');
  }
}
