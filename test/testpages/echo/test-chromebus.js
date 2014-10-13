var msg = "I mana sou",
		cnt = 0;

function rcv (msg) {
	if (msg.error) {
		log('errors', "Remote error(id: " + msg.extensionId + "): " + msg.error);
	} else {
		log('log0', "Received: " + str(msg));
	}
}

bus.busCommand("echo_mode");
bus.clientMessage(false, msg, rcv);
bus.clientMessage(false, msg, rcv);
bus.clientMessage(false, msg, rcv);
