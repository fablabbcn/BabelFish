# Targets for handling the local node server

.PHONY:
serve: browserify
	node $(dot)/tools/serve.js

.PHONY:
async-serve: kill-server browserify
	$(MAKE) serve & echo $$! | tee server_pid

.PHONY:
.ONESHELL:
kill-server:
	if [ -f server_pid ]; then \
		kill $$(cat server_pid); \
	fi
	rm -f server_pid
