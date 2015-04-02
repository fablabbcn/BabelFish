# Browserify related targets
force:

CHROME_FILES =								\
	$(dot)/codebender/backend/buffer.js				\
	$(dot)/codebender/backend/logging.js				\
	$(dot)/codebender/backend/transaction.js			\
	$(dot)/codebender/backend/util.js				\
	$(dot)/codebender/backend/protocols/butterfly.js		\
	$(dot)/codebender/backend/protocols/serialtransaction.js	\
	$(dot)/codebender/backend/protocols/stk500.js			\
	$(dot)/chrome-extension/client/rpc-client.js			\
	$(dot)/chrome-extension/common/config.js			\
	$(dot)/chrome-extension/common/rpc-args.js			\
	$(dot)/codebender/chrome-plugin.js

TARGETS = $(dot)/bundles/compilerflasher.js	\
	$(dot)/bundles/chrome-client.js		\
	$(dot)/bundles/firefox-client.js


browserify = $(shell which browserify 2> /dev/null || \
		echo $(dot)/node_modules/.bin/browserify)
$(browserify): $(dot)/node_modules

.PHONY:
browserify: $(TARGETS)

$(dot)/bundles/compilerflasher.js: $(dot)/codebender/ad-hoc-changes.js $(dot)/codebender/compilerflasher.js
	cat $^ > $@

$(dot)/bundles/chrome-client.js: $(CHROME_FILES) $(dot)/codebender/chrome-loader.js $(DEV_FILE) force | $(browserify) $(dot)/bundles
	($(browserify) $(CHROME_FILES) -e $(dot)/codebender/chrome-loader.js |	\
		cat $(DEV_FILE) -  > $@ ) || \
	(rm $(dot)/bundles/chrome-client.js; echo "Maybe run: make enable-dev-mode";false)

$(dot)/bundles/firefox-client.js: $(dot)/codebender/firefox-loader.js $(DEV_FILE) force | $(browserify) $(dot)/bundles
	($(browserify) -e $(dot)/codebender/firefox-loader.js | \
		cat $(DEV_FILE) -				\
		> $(dot)/bundles/firefox-client.js) || (rm $(dot)/bundles/firefox-client.js; echo "Maybe run: make enable-dev-mode";false)

# Replaced by newstyle compilerflasher.
$(dot)/bundles/client.js: $(CLIENT_FILES) $(DEV_FILE) force | $(browserify) $(dot)/bundles
	($(browserify) -e $(dot)/codebender/plugin.js | \
		cat $(DEV_FILE) - \
		> $(dot)/bundles/client.js) || (rm $(dot)/bundles/client.js; echo "Maybe run: make enable-dev-mode";false)

$(DEV_FILE): enable-dev-mode

.PHONY:
browserify-clean:
	rm -f $(TARGETS)
