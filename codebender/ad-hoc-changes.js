window.osBrowserIsSupported = function () {return true;};
window.isChrome = function () { return true; };
window.isFirefox = function () { return false; };
window.browserSupported = function () {return true; };
window.isSupportedOs = function () {return true; };
window.osSupported = function () {return true; };

setTimeout(function () {
  window.osBrowserIsSupported = function () {return true;};
  window.isChrome = function () { return true; };
  window.isFirefox = function () { return false; };
  window.browserSupported = function () {return true; };
  window.isSupportedOs = function () {return true; };
  window.osSupported = function () {return true; };

  compilerflasher.pluginHandler.runPlugin();
}, 10000);
