# Chrome RCP

RCP protocol to provide selective access to the chrome api to the
front end code.

## Usage

in the extension:

	var rcp_serial = new RPCHost(chrome.serial, 'serial', ['detectDevices', 'write'])

*Note: It is an object to maintain state*

In the website javascript:

	var chrome = {serial: new RCPClient(<extension-id>, 'serial', ['detectDevices', 'write'])}
	chrome.serial.write(...);
