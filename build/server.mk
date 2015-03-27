# Targets for handling the local node server

.PHONY:
serve: browserify
	node $(dot)/tools/serve.js

.PHONY:
async-serve: kill-server browserify
	$(MAKE) serve & echo $$! | tee server_pid

.ONESHELL:
.PHONY:
kill-server:
	if [ -f server_pid ]; then
		kill $(shell cat server_pid);
	fi
	rm -f server_pid
