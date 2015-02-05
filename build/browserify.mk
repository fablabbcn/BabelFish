# Browserify related targets


CLIENT_FILES =								\
	$(dot)/codebender/backend/buffer.js				\
	$(dot)/codebender/backend/logging.js				\
	$(dot)/codebender/backend/transaction.js			\
	$(dot)/codebender/backend/util.js				\
	$(dot)/codebender/backend/protocols/butterfly.js		\
	$(dot)/codebender/backend/protocols/serialtransaction.js	\
	$(dot)/codebender/backend/protocols/stk500.js			\
	$(dot)/codebender/plugin.js					\
	$(dot)/chrome-extension/client/rpc-client.js			\
	$(dot)/chrome-extension/common/config.js			\
	$(dot)/chrome-extension/common/rpc-args.js


browserify = $(shell which browserify || echo $(dot)/node_modules/.bin/browserify)
$(browserify): $(dot)/node_modules

.PHONY:
browserify: $(dot)/bundles/chrome-client.js
$(dot)/bundles/chrome-client.js: $(CLIENT_FILES) $(DEV_FILE) $(dot)/codebender/ad-hoc-changes.js $(dot)/codebender/compilerflasher.js | $(browserify) $(dot)/bundles
	($(browserify) -e $(dot)/codebender/plugin.js | \
		cat $(DEV_FILE) - $(dot)/codebender/ad-hoc-changes.js $(dot)/codebender/compilerflasher.js \
		> $(dot)/bundles/chrome-client.js) || (rm $(dot)/bundles/chrome-client.js; echo "Maybe run: make enable-dev-mode")

$(DEV_FILE): enable-dev-mode
