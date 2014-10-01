describe("RPC end-to-end", function () {
	var host;

	before(function () {
		chrome = new MockChrome();
		host = RPCHost(chrome.serial, 'serial', ['send']);
	});

  it("Simple chromecall", function () {
		var collected_bytes = false;
		chrome.serial.send(1, 'some data', function (res) {
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
		chrome.serial.send(1, 'My name is ', function (res) {
			assert.ok(res, 'Sending failed');
			collected1 = true;
		});
		chrome.serial.send(1, 'Awesome-o', function (res) {
			assert.ok(res, 'Sending failed');
			collected2 = true;
		});

		assert.ok(collected1 && collected2);
		assert.ok(chrome.serial._raw_data, 'My name is Awesome-o');
	});
});
