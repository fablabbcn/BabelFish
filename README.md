# Chrome RPC

RPC protocol to provide selective access to the chrome api to the
front end code. More simply it is an extension that allows you to run
restricted chrome API calls from regular fetched javascript.

## Usage

And in config.js (unless you want something strage it should be setup:

	...
	serial: {
		methods: ['getDevices', 'send'],
		listeners: [...]
	}
	...

and in the web page:

	<script type="text/javascript" src="/config.js"></script>
	<script type="text/javascript" src="/extension/rpc-client.js"></script>

And then from web your web page javascript:

	chrome.serial.getDevices(function (devs) {...do.something()...)})

## Protocol overview

The host is the extension and the client is the website code. An
`RPCHost` is initialized on the host and a corresponding `RPCClient`
gets initialized on the client.

Valid RPC call are transparent, as if `client_object = host_object`,
but may have no more than one callback in the arguments and there is
no way to obtain the return value of a method. These restrictions are
good enough at least for the `usb` and `serial` chrome APIs.

The client can make two kinds of requests to the host. A

- single method calls
- listener calls

**Single method calls** just send a message asking for a method to be
executed and wait for a response. The response contains the arguments
that the client uses to run the callback or an error message which is
raised on the client side.

**Listener calls** open start off the same as single method calls,
  only when they receive a response on how to run the callback and it
  finishes execution, they keep waiting and run the callback whenever
  there is a message from the host.

A message that initiates any transaction is an object that comes from
the client and has the following format:

Attribute | Description
-----|----
timestamp | Epoch timestamp
method | method name, may be a dot path
object | Parent object name, typically chrome.<object>
args | Array of arguments with one function allowed.

A response is an object of the form

Attribute | Description
-----|----
args | callback arguments
error | An error code or null

*Note: not all the above functionality is thoroughly tested, the
 priority is to implement the chrome.serial.\* API*
