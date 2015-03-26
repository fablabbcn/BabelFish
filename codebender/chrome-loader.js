var _create_chrome_client = require('./../chrome-extension/client/rpc-client');
  if (_create_chrome_client.extentionAvailable) {
    window.CodebenderPlugin = require('./chrome-plugin');
}

if (!window.CodebenderPlugin) {
  console.warn("No extension or plugin.");
}
