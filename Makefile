# Spaces in path trick
developer = "true"
nullstring :=
space := $(nullstring) # a space at the end
path = $(subst $(space),\ ,$1)
dot = $(call path,$(CURDIR))

firefox = /Applications/Firefox.app/Contents/MacOS/firefox # open  -n -a firefox --args
chrome = $(shell which chrome || which chromium || echo  ~/Applications/Chromium.app/Contents/MacOS/Chromium)
export DYLD_LIBRARY_PATH=$(dot)/root/lib:$$DYLD_LIBRARY_PATH
build_script = $(dot)/plugin/build.sh
XPI = $(dot)/plugin/codebendercc.xpi
export CODEBENDER_XPI = $(XPI)
PLUGIN = $(dot)/plugin/npCodebendercc.so
ΤΑRGETS = $(XPI) $(PLUGIN) $(CHROME_ZIP)
CPP_DIR = $(dot)/plugin/Codebendercc
CPP = $(CPP_DIR)/CodebenderccAPI.cpp $(CPP_DIR)/CodebenderccAPI.h $(CPP_DIR)/CodebenderccAPIJS.cpp $(CPP_DIR)/Codebendercc.cpp $(CPP_DIR)/Codebendercc.h

MOCHA = mocha $(DEBUG)

# URL = http://localhost:8080/web/serialmonitor.html
## FIREFOX TESTS
# URL = http://localhost:8080/test/testpages/plugin-serial/index.html
# URL = http://localhost:8080/test/testpages/plugin/index.html

## CHROME TESTS
# URL = http://localhost:8080/test/testpages/serial/index.html
# URL = http://localhost:8080/test/testpages/chrome-listener/index.html

## Codebender tests
URL = http://localhost:8080/codebender/test/test_download/index.html
# URL = http://localhost:8080/codebender/test/test_usb/index.html

CHROME_TEST =  $(dot)/test/selenium-test.js
FIREFOX_TEST =  $(dot)/test/firefox-test.js
PLUGIN_FILES = $(build_script) $(CPP) $(dot)/plugin/Codebendercc/fake_install.rdf
CHROME_ZIP = $(dot)/bundles/chrome-extension.zip

ifneq ($(developer),)
DEV_FILES = $(dot)/chrome-extension/common/developer.js
endif

CLIENT_FILES = \
	$(dot)/codebender/backend/buffer.js				\
	$(dot)/codebender/backend/logging.js				\
	$(dot)/codebender/backend/transaction.js			\
	$(dot)/codebender/backend/util.js				\
	$(dot)/codebender/backend/protocols/butterfly.js		\
	$(dot)/codebender/backend/protocols/serialtransaction.js	\
	$(dot)/codebender/backend/protocols/stk500.js		\
	$(dot)/codebender/plugin.js \
	$(dot)/chrome-extension/client/rpc-client.js			\
	$(dot)/chrome-extension/common/config.js			\
	$(dot)/chrome-extension/common/rpc-args.js			\

HOST_FILES = $(dot)/chrome-extension/manifest.json	\
	$(dot)/chrome-extension/host/rpc-host.js	\
	$(dot)/chrome-extension/host/background.js	\
	$(dot)/chrome-extension/host/hostbus.js	\
	$(dot)/chrome-extension/host/util.js		\
	$(dot)/chrome-extension/common/config.js	\
	$(dot)/chrome-extension/common/rpc-args.js

force:;

$(CHROME_ZIP): $(dot)/bundles $(HOST_FILES)
	@echo  "Zipping: $@"
	zip $@ $(HOST_FILES)
chrome-extension:

$(dot)/bundles:
	mkdir $@

$(dot)/node_modules:
	npm install

browserify = $(shell which browserify || echo $(dot)/node_modules/.bin/browserify)
$(browserify): $(dot)/node_modules
browserify $(dot)/bundles/chrome-client.js: $(CLIENT_FILES) | $(browserify) $(dot)/bundles
	$(browserify) -e $(dot)/codebender/plugin.js | \
		cat $(DEV_FILES) - $(dot)/codebender/compilerflasher.js \
		> $(dot)/bundles/chrome-client.js

$(dot)/plugin $(dot)/CodebenderChromeDeveloper:
	git submodule init
	git submodule update

$(PLUGIN_FILES): | plugin
	@echo "Pligin file: $@"

.ONESHELL:
$(XPI): $(PLUGIN_FILES)
	cd plugin && \
	$(build_script)

.PHONY:
test-firefox: $(XPI)
	$(MOCHA) $(FIREFOX_TEST)

.PHONY:
test-chrome:
	$(MOCHA) $(CHROME_TEST)

.PHONY:
test: $(dot)/bundles/chrome-client.js $(dot)/bundles/firefox-client.js $(XPI) force
	$(MOCHA) $(CHROME_TEST) | sed 's_http://localhost:8080_$(dot)_g' # $(FIREFOX_TEST)

serve: browserify
	node tools/serve.js

async-serve:
	node $(dot)/tools/serve.js & \
	echo $$! | tee server_pid

kill-server:
	kill $(shell cat server_pid)
	rm server_pid

chrome-args = --user-data-dir=/tmp/chromium-user-data					\
--load-extension=$(dot)/CodebenderChromeDeveloper,$(dot)/chrome-extension	\
--no-first-run,										\
--no-default-browser-check								\
--disable-web-security									\
--no-sandbox										\

chrome-log-dir = $(dot)/chrome-logs

chrome-args:
	@echo $(chrome-args)

$(chrome-log-dir):
	mkdir $@

run-chrome: $(dot)/bundles/chrome-client.js | $(dot)/CodebenderChromeDeveloper /tmp $(chrome-log-dir)
	(sleep 3 &&\
		$(chrome) $(chrome-args) $(URL) 2> $(chrome-log-dir)/chrome-$(shell date "+%s").log) &

firefox-arch = $(dot)/test/firefox-arch
GET_FF_PROFILES = (find /var/folders -ls | grep  'tmp-[0-9a-zA-Z]*$$') 2> /dev/null | sort -r | awk '{print $$11}'
FF_PROFILE=$(shell $(GET_FF_PROFILES) | head -1)
firefox-args = -jsconsole -new-instance -profile "$(FF_PROFILE)" -url "$(URL)"
$(firefox-arch): $(firefox)
	lipo -thin $(shell uname -m) -output  $@ $(firefox)

run-firefox: kill-firefox-instances
	@echo "Running firefox with profile: $(FF_PROFILE)"
	$(firefox) $(firefox-args) &

gdb-args = -ex='run $(firefox-args)'
debug-firefox: $(firefox-arch) kill-firefox-instances
	gdb $(gdb-args) $(firefox-arch)

kill-firefox-instances:
	(while kill $$(ps aux | grep 'firefox' | grep '-new-instanc[e]' | head -1 | awk '{print $$2}'); do echo 'killing'; done) 2> /dev/null

firefox-profile-path:
	@echo $(FF_PROFILE)

delete-firefox-profiles:
	$(GET_FF_PROFILES) | xargs rm -rf

compile-serve: $(XPI) serve-firefox

serve-chrome: run-chrome serve
serve-firefox: run-firefox serve
debug-serve-firefox: serve debug-firefox

clean:
	rm -rf $(TARGETS)
