// FireFox test of serial

var assert = require('chai').assert,
    test = require('selenium-webdriver/testing'),
    webdriver = require('selenium-webdriver'),
    chromedriver = require('selenium-webdriver/chrome'),
		Server = require('./../tools/serve').StaticServer,
		config = require('./../config').config,
		util = require('./../tools/util');

test.describe('Test Firefox', function() {
  var ff, srv;
	this.timeout(10000);

	test.before(function() {
		ff = util.firefox_driver("extension"),
		srv = new Server(".", 8080);
  });

	test.it("Plugin existnese", function () {
		ff.get("http://localhost:8080/test/testpages/plugin/index.html").
			then(function () {
				util.logs(ff, 'plugin', function (logs) {
					assert.equal(logs[0], "Found plugin!");
				});
				util.logs(ff, 'all-plugins', function (logs) {
					assert.include(logs, 'Codebendercc', "Found plugin!");
				});
			});
	});

	test.after(function() {
		ff.quit();
		srv.stop();
	});
});
