# Targets for handling the local node server

serve: browserify
	node $(dot)/tools/serve.js

async-serve: browserify
	$(MAKE) serve & echo $$! | tee server_pid

kill-server:
	kill $(shell cat server_pid) || true
	rm server_pid
