// Testing the test here

describe("Test Bus", function () {
	var bus;

	before(function () {
		chrome = new MockChrome();
		bus = chrome._bus;
	});

  it("end to end (chrome wrapper)", function () {
		var last_event = "started";

		// TRANSACTION
		chrome.runtime.onMessageExternal.addListener(function (msg, sender, sendResp) {
			assert.equal(last_event, "send message");
			assert.equal(msg, "client speaking");

			last_event = "send response";
			sendResp("extension speaking");
		});

		last_event = "send message";
		chrome.runtime.sendMessage('mocker', 'client speaking', function (msg) {
			assert.equal("extension speaking", msg);
			assert.equal(last_event, "send response");
			last_event = "received response";
		});

		// ASSERTION
		// There should be no concurrency.
		assert.equal(last_event, "received response");

		// Uncomment to see all the recorded messages
		// bus.msg_log.forEach(function (log) {
		// 	console.log("Log: " + log.from + " -> " + log.msg);
		// });

		// Client sent a message
		assert.equal(bus.msg_log[0].msg, "client speaking");
		assert.equal(bus.msg_log[0].from, "sendMessage");
		// The same msg was received by the listener
		assert.equal(bus.msg_log[1].msg, "client speaking");
		assert.equal(bus.msg_log[1].from, "onMessageExternal");
		// then sendResp sent the message to the client
		assert.equal(bus.msg_log[2].msg, "extension speaking");
		assert.equal(bus.msg_log[2].from, "sendResp");
		// Finally the client receives  the message
		assert.equal(bus.msg_log[3].msg, "extension speaking");
		assert.equal(bus.msg_log[3].from, "sendMessageCb");
	});

	after(function () {
		chrome = new MockChrome();
	});
});
