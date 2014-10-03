describe("RPC end-to-end", function () {
	var host, browser_serial;

	before(function () {
		chrome = new MockChrome();
		host = new RPCHost('serial', ['send', 'getDevices'],
											 ['onRsponse.addListener']);
		browser_serial = new RPCClient('1234', 'serial', [ 'getDevices', 'send'],
																	 ['onRsponse.addListener']);
	});

	it("Client setup", function () {
		assert.equal(typeof(browser_serial.getDevices), 'function',
								 'Method "getDevices" not registered');
		assert.equal(typeof(browser_serial.onResponse.addListener), 'function',
								'Listener "onReceive" not registered.');
	});


  it("Simple chromecall", function () {
		var collected_bytes = false;
		browser_serial.send(1, 'some data', function (res) {
			assert.ok(res, 'Sending failed');
			collected = true;
		});

		assert.ok(collected, 'Send callback not called');
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
	});
});
