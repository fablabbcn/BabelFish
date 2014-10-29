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


	test.it("Serial events", function () {
		ff.get("http://localhost:8080/test/testpages/plugin-event/index.html").
			then(function () {
				util.logs(ff, 'listener-d', function (logs) {
					assert.equal(logs[0], "Heard barking", "Bad device");
					assert.equal(logs[1], "Heard barking", "Bad device");
				});
			});
	});


	test.it("Plugin existnesion", function () {
		ff.get("http://localhost:8080/test/testpages/plugin-serial/index.html").
			then(function () {
				util.logs(ff, 'devices', function (devs) {
					assert.equal(devs[0], "/dev/ttyACM0", "Bad device");
				});

				// Check some infos
				util.logs(ff, 'connected-info', function (infos) {
					assert.include(infos, 'bitrate:115200', "Bad baudrate, " +
												 JSON.stringify(infos));
				});

				util.logs(ff, 'ctrlsig1', function (infos) {
				});

				util.logs(ff, 'ctrlsig2', function (infos) {
				});

				util.logs(ff, 'client', function (infos) {
					assert.equal(infos[0], 'Send received: {"bytesSent":2}',
											"Bad response to callback from serial.");
					assert.notInclude(infos[0], "error");
				});

				util.logs(ff, 'onresponse', function (infos) {
					assert.include(infos[0], "onReceive received: ",
												 "Incorrect respose message");
				});

				util.logs(ff, 'onresponse-error', function (infos) {
					assert.lengthOf(infos, 1, "Error on receive.");
				});
			});
	});

	test.it("Plugin existnese", function () {
		ff.get("http://localhost:8080/test/testpages/plugin/index.html").
			then(function () {
				util.logs(ff, 'baudrate', function (logs) {
					assert.equal(logs[0], "9600");
				});
				util.logs(ff, 'plugin', function (logs) {
					assert.equal(logs[0], "Found plugin!");
				});
				util.logs(ff, 'all-plugins', function (logs) {
					assert.include(logs, 'Codebendercc', "Found plugin!");
				});
				util.logs(ff, 'plugin-ids', function (logs) {
					assert.match(logs[0], /[0-9]/, "Plugin 0 has wrong id");
					assert.equal(Number(logs[1]), Number(logs[0]) + 1,
											 "Plugin 1 has wrong id");
				});

				util.logs(ff, 'plugin-properties', function (logs) {
					assert.include(logs, 'instance_id', 'Missing plugin property.');
					assert.include(logs, 'baudrate', 'Missing plugin property.');
					assert.include(logs, 'getPorts', 'Missing plugin property.');
					assert.include(logs, 'disconnect', 'Missing plugin property.');
					assert.include(logs, 'flush', 'Missing plugin property.');
					assert.include(logs, 'serialWrite', 'Missing plugin property.');
					assert.include(logs, 'CD', 'Missing plugin property.');
					assert.include(logs, 'DSR', 'Missing plugin property.');
					assert.include(logs, 'RI', 'Missing plugin property.');
					assert.include(logs, 'CTS', 'Missing plugin property.');
					assert.include(logs, 'setDTR', 'Missing plugin property.');
					assert.include(logs, 'setRTS', 'Missing plugin property.');
					assert.include(logs, 'openPort', 'Missing plugin property.');
				});
			});
	});

	test.after(function() {
		ff.quit();
		srv.stop();
	});
});
