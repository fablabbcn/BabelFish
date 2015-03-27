// file: plugin.js
require('./../tools/client-util');

window.CodebenderPlugin = require('./firefox-plugin');

if (!window.CodebenderPlugin) {
  console.warn("No firefox plugin.");
}
