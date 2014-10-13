describe("RPC end-to-end", function () {
	var host, browser_serial, chrome;

	before(function () {
		chrome = new MockChrome();
		host = new RPCHost('serial', ['send', 'getDevices'],
											 ['onReceive.addListener'], chrome.serial);
		browser_serial = new RPCClient('1234', 'serial', [ 'getDevices', 'send'],
																	 ['onReceive.addListener']);
	});

	it("Client setup", function () {
		assert.equal(typeof(browser_serial.getDevices), 'function',
								 'Method "getDevices" not registered');
		assert.equal(typeof(browser_serial.onReceive), 'object',
								 'Listener "onReceive" not registered. Registered methods: ' +
								 Object.getOwnPropertyNames(browser_serial));
		assert.equal(typeof(browser_serial.onReceive.addListener), 'function',
								 "Failed to register dotted paths.");
	});


  it("Simple chromecall", function () {
		var collected_bytes = false;
		setupMock(browser_serial);
		browser_serial.send(1, 'some data', function (res) {
			assert.ok(res, 'Sending failed');
			collected_bytes = true;
		});

		// assert.ok(chrome.calleed.indexOf('serial') == -1,
		// 					"Mock serial not accessed");
		assert.ok(collected_bytes, 'Send callback not called');
		assert.equal(chrome.serial._journal[0], 'some data', 'Sent wrong data');
	});

	it("Multiple chromecalls", function () {
		var collected1 = false,
				collected2 = false;
		chrome.serial._raw_data = "";
		browser_serial.send(1, 'My name is ', function (res) {
			assert.ok(res, 'Sending failed');
			collected1 = true;
		});
		browser_serial.send(1, 'Awesome-o', function (res) {
			assert.ok(res, 'Sending failed');
			collected2 = true;
		});

		assert.ok(collected1 && collected2);
		assert.ok(chrome.serial._raw_data, 'My name is Awesome-o');
		assert.deepEqual(bus.msg_log.pop().args, [1, 'Awesome-o', "<function>"],
										 "Did not pass through the mock bus.");
	});

	it("Persistent listeners", function () {
		var res = "";
		browser_serial.onReceive.addListener( function (msg) {
			res += msg + " ";
		});
		assert.equal(res, "Everything is awesome when ur part of the team. ");
	});
});
