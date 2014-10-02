var assert = require('assert'),
    test = require('selenium-webdriver/testing'),
    webdriver = require('selenium-webdriver'),
    chromedriver = require('selenium-webdriver/chrome'),
		Server = require('./../tools/serve').StaticServer,
		config = require('./../config').config,
		util = require('./../tools/util');

test.describe('Test', function() {
  var chrome, srv;
	this.timeout(10000);

	test.before(function() {
		chrome = util.chrome_driver("extension"),
		srv = new Server(".", 8080);
  });

	// Tests
	test.it("USB detection.", function () {
		chrome.get("http://localhost:8080/test/usb.html"). then(function () {
			util.browser_logs(chrome, function (entries) {
				if (entries)
					entries.forEach(function (e) {console.log("Log: " + e.message);});
				else
					console.log("Error with entries.");

				assert.ok(false);
			});
		});
	});

  test.after(function() {
		chrome.quit();
		srv.stop();
	});
});
