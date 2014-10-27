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
	this.timeout(30000);

	test.before(function() {
		ff = util.firefox_driver("extension"),
		srv = new Server(".", 8080);
  });

	// test.it("Plugin existnese", function () {
	// 	ff.get("http://localhost:8080/test/testpages/plugin/index.html").
	// 		then(function () {
	// 			util.logs(ff, 'baudrate', function (logs) {
	// 				assert.equal(logs[0], "9600");
	// 			});
	// 			util.logs(ff, 'plugin', function (logs) {
	// 				assert.equal(logs[0], "Found plugin!");
	// 			});
	// 			util.logs(ff, 'all-plugins', function (logs) {
	// 				assert.include(logs, 'Codebendercc', "Found plugin!");
	// 			});
	// 			util.logs(ff, 'plugin-ids', function (logs) {
	// 				assert.equal(logs[0], '0', "");
	// 				assert.equal(logs[1], '1', "");
	// 			});
	// 		});
	// });

	test.it("Plugin existnese", function () {
		ff.get("http://localhost:8080/test/testpages/plugin-serial/index.html").
			then(function () {
				util.logs(ff, 'devices', function (devs) {
					assert.equal(devs[0], "/dev/ttyACM0", "Bad device");
				});

				// Check some infos
				util.logs(ff, 'connected-info1', function (infos) {
					assert.include(infos, 'name:connection-0', "Bad connection id");
					assert.include(infos, 'baudrate:115200', "Bad baudrate");
				});
			});
	});

	test.after(function() {
		ff.quit();
		srv.stop();
	});
});
