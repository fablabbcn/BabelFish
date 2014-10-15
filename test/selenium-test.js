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

	test.it("Chrome api listeners", function () {
		chrome.get("http://localhost:8080/test/testpages/chrome-listener/index.html").
			then(function () {
				util.logs(chrome, 'host-storage', function (host_log) {
					assert.notEqual(host_log.length, 0, "No logging");
					util.logs(chrome, 'client-storage', function (cli_log) {
						assert.equal(host_log.length, cli_log.length,
														"Different number of tabs were reported by\
												 host and client");

						for (var i=0 ; i < cli_log.length; i++)
							assert.equal(cli_log[i].split('~')[1], host_log[i].split('~')[1],
													 "Different tabs were logged by host and client");
					});
				});
			});
	});

	test.it("Chrome serial calls", function () {
		chrome.get("http://localhost:8080/test/testpages/serial/index.html").
			then(function () {
				util.logs(chrome, 'onresponse', function (entries) {
					assert.notEqual(entries.length, 0, "No logging");
				});
				util.logs(chrome, 'send1', function (entries) {
					assert.notEqual(entries.length, 0, "No platform received.");
					assert.match(entries[0], /^Platform: {"arch":".*?","nacl_arch":".*?","os":".*?"}$/,
											 "Not receiveng expected entry format for platform.");
				});
			});
	});

	test.it("Chrome api calls", function () {
		chrome.get("http://localhost:8080/test/testpages/chrome/index.html").
			then(function () {
				util.logs(chrome, 'devices', function (entries) {
					assert.notEqual(entries.length, 0, "No logging");
				});
				util.logs(chrome, 'platform', function (entries) {
					assert.notEqual(entries.length, 0, "No platform received.");
					assert.match(entries[0], /^Platform: {"arch":".*?","nacl_arch":".*?","os":".*?"}$/,
											 "Not receiveng expected entry format for platform.");
				});
			});
	});

	// Tests
	test.it("Echo bus service", function () {
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
