export DYLD_LIBRARY_PATH=$(CURDIR)/root/lib:$$DYLD_LIBRARY_PATH
build_script = $(CURDIR)/plugin/build.sh
XPI = $(CURDIR)/plugin/codebendercc.xpi
export CODEBENDER_XPI = $(XPI)
PLUGIN = $(CURDIR)/plugin/npCodebendercc.so
ΤΑRGETS = $(XPI) $(PLUGIN) $(CHROME_ZIP)
CPP_DIR = $(CURDIR)/plugin/Codebendercc
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
# URL = http://localhost:8080/codebender/test/test_download/index.html
URL = http://localhost:8080/codebender/test/test_usb/index.html

CHROME_TEST =  $(CURDIR)/test/selenium-test.js
FIREFOX_TEST =  $(CURDIR)/test/firefox-test.js
PLUGIN_FILES = $(build_script) $(CPP) $(CURDIR)/plugin/Codebendercc/fake_install.rdf
CHROME_ZIP = $(CURDIR)/bundles/chrome-extension.zip

CLIENT_FILES = \
	$(CURDIR)/codebender/backend/buffer.js				\
	$(CURDIR)/codebender/backend/logging.js				\
	$(CURDIR)/codebender/backend/transaction.js			\
	$(CURDIR)/codebender/backend/util.js				\
	$(CURDIR)/codebender/backend/protocols/butterfly.js		\
	$(CURDIR)/codebender/backend/protocols/serialtransaction.js	\
	$(CURDIR)/codebender/backend/protocols/stk500.js		\
	$(CURDIR)/codebender/plugin.js \
	$(CURDIR)/chrome-extension/client/rpc-client.js			\
	$(CURDIR)/chrome-extension/common/config.js			\
	$(CURDIR)/chrome-extension/common/rpc-args.js			\

HOST_FILES = $(CURDIR)/chrome-extension/manifest.json	\
	$(CURDIR)/chrome-extension/host/rpc-host.js	\
	$(CURDIR)/chrome-extension/host/background.js	\
	$(CURDIR)/chrome-extension/host/hostbus.js	\
	$(CURDIR)/chrome-extension/host/util.js		\
	$(CURDIR)/chrome-extension/common/config.js	\
	$(CURDIR)/chrome-extension/common/rpc-args.js

force:;

$(CHROME_ZIP): $(CURDIR)/bundles $(HOST_FILES)
	@echo  "Zipping: $@"
	zip $@ $(HOST_FILES)
chrome-extension:

$(CURDIR)/bundles:
	mkdir $@

$(CURDIR)/node_modules:
	npm install

browserify $(CURDIR)/bundles/chrome-client.js: $(CLIENT_FILES) | $(CURDIR)/node_modules $(CURDIR)/bundles
	$(CURDIR)/node_modules/.bin/browserify $(CLIENT_FILES) > $(CURDIR)/bundles/chrome-client.js

plugin:
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
test: $(CURDIR)/bundles/chrome-client.js $(CURDIR)/bundles/firefox-client.js $(XPI) force
	$(MOCHA) $(CHROME_TEST) | sed 's_http://localhost:8080_$(CURDIR)_g' # $(FIREFOX_TEST)

serve: browserify $(CHROME_ZIP)
	($(CURDIR)/node_modules/.bin/watchify $(CLIENT_FILES) -o $(CURDIR)/bundles/chrome-client.js & node tools/serve.js)

async-serve:
	node $(CURDIR)/tools/serve.js & \
	echo $$! | tee server_pid

kill-server:
	kill $(shell cat server_pid)
	rm server_pid

chrome = ~/Applications/Chromium.app/Contents/MacOS/Chromium
chrome-args = --user-data-dir=/tmp/chromium-user-data --load-extension=./chrome-extension --no-first-run, --no-default-browser-check --debug-print --enable-logging=stderr --v=1
run-chrome: $(CURDIR)/bundles/chrome-client.js
	($(chrome) $(chrome-args) $(URL); rm -rf /tmp/chromium-user-data) &

firefox = /Applications/Firefox.app/Contents/MacOS/firefox # open  -n -a firefox --args
firefox-arch = $(CURDIR)/test/firefox-arch
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
