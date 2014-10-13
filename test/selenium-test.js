var assert = require('chai').assert,
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

	test.it("Chrome api functionality", function () {
		chrome.get("http://localhost:8080/test/testpages/chrome/index.html").
			then(function () {
				util.logs(chrome, 'devices', function (entries) {
					assert.notEqual(entries.length, 0, "No logging");
				});
				util.logs(chrome, 'platform', function (entries) {
					assert.notEqual(entries.length, 0, "No logging");
				});
			});
	});

	// Tests
	test.it("Echo bus service", function () {
		debugger;
		chrome.get("http://localhost:8080/test/testpages/echo/index.html").
			then(function () {
				util.logs(chrome, 'log0', function (entries) {
					assert.notEqual(entries.length, 0, "No echo..");
					assert.equal(entries[0], 'Received: "I mana sou"',
											 "No proper echo mode.");
				});
			});
	});

	test.after(function() {
		chrome.quit();
		srv.stop();
	});
});
