# Targets for handling the local node server

serve: browserify
	node tools/serve.js

async-serve: browserify
	node $(dot)/tools/serve.js & \
	echo $$! | tee server_pid

kill-server:
	kill $(shell cat server_pid)
	rm server_pid
