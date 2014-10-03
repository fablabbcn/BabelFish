var    webdriver = require('selenium-webdriver'),
    chromedriver = require('selenium-webdriver/chrome');

function browser_logs(driver, callback) {
	driver.manage().logs().
		get(webdriver.logging.Type.BROWSER).then(callback);
}

// @param extensions: string of unpacked extension path to install.
function chrome_driver(extension) {
	var logperfs = new webdriver.logging.Preferences(),
			opts = new chromedriver.Options().
				addArguments("--load-extension=" + extension ||
										 '../extension');

	logperfs.setLevel(webdriver.logging.Type.BROWSER,
										webdriver.logging.Level.ALL);

	var chrome = new webdriver.Builder().
				withCapabilities(webdriver.Capabilities.chrome()).
				setChromeOptions(opts).
				setLoggingPrefs(logperfs).
				build();

	chrome.manage().timeouts().pageLoadTimeout(5000);
	return chrome;
}

function dataUrl(var_args) {
  return 'data:text/html,'
    + Array.prototype.slice.call(arguments, 0).join('');
}

exports.dataUrl = dataUrl;
exports.chrome_driver = chrome_driver;
exports.browser_logs = browser_logs;
