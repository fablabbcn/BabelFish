var    webdriver = require('selenium-webdriver'),
    chromedriver = require('selenium-webdriver/chrome');

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
module.exports.chrome_driver = chrome_driver;

function browser_logs(driver, callback) {
	driver.manage().logs().
		get(webdriver.logging.Type.BROWSER).then(callback);
}
module.exports.browser_logs = browser_logs;


function show_new_logs (driver) {
	if (!show_new_logs.logs) show_new_logs.logs = [];
	browser_logs(driver, function (lgs) {
		if(show_new_logs.logs.length < lgs.length) {
			lgs.slice(show_new_logs.logs).forEach(function (msg) {
				console.log("BrowserLog: " + msg.message);
			});
		}
	});
}

function get_elements(driver, css) {
	return driver.findElements(webdriver.By.css(css));
}

// Wait for css element and callback with a list of the findings.
// eg.
// wait_for(chrome, 'ul#messages li', function (ele) {
//   ele[0].getText().then(function (e) {...});
// }
function wait_for(driver, css, cb) {
	return driver.wait((function (driver, css) {
		show_new_logs(driver);
		return driver.isElementPresent(webdriver.By.css(css));
	}).bind(null, driver, css), 3000, 'Timed out waiting for ' + css).
		then(function () {
			get_elements(driver, css).then(function (el) {
				cb(el);
			});
		});
};

// Get logs of id synchronously
function logs(driver, id, cb) {
	var ret = [], elemslen = -1;
	wait_for(driver, 'ul#' + id + ' li', function (ele) {
		elemslen = ele.length;
		ele.forEach(function (el) {
			el.getText().then(function (txt) {ret.push(txt);});
		});
	});

	driver.wait(function () {
		return elemslen >= 0 && ret.length == elemslen;
	},
							3000, 'Timeout waiting for log texts of ' + id).
		then(function () {
			cb(ret);
		});
}
module.exports.logs = logs;
