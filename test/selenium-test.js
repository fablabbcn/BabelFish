var assert = require('chai').assert;
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
	test.it("Serial detection.", function () {
		chrome.get("http://localhost:8080/test/usb.html"). then(function () {
			util.browser_logs(chrome, function (entries) {
				assert.match(entries[0], /Found [0-9]+ devices.../,
										 "Response callback did not yield the right message");
			});
		});
	});

  test.after(function() {
		chrome.quit();
		srv.stop();
	});
});
