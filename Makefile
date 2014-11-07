build_script = $(CURDIR)/plugin/build.sh
XPI = $(CURDIR)/plugin/codebendercc.xpi
export CODEBENDER_XPI = $(XPI)
PLUGIN = $(CURDIR)/plugin/npCodebendercc.so
ΤΑRGETS = $(XPI) $(PLUGIN)
CPP_DIR = $(CURDIR)/plugin/Codebendercc
CPP = $(CPP_DIR)/CodebenderccAPI.cpp $(CPP_DIR)/CodebenderccAPI.h $(CPP_DIR)/CodebenderccAPIJS.cpp $(CPP_DIR)/Codebendercc.cpp $(CPP_DIR)/Codebendercc.h

MOCHA = mocha $(DEBUG)
# URL = http://localhost:8080/web/serialmonitor.html
URL = http://localhost:8080/test/testpages/plugin-serial/index.html
# URL = http://localhost:8080/test/testpages/plugin/index.html
CHROME_TEST = test/selenium-test.js
FIREFOX_TEST = test/firefox-test.js
PLUGIN_FILES = $(build_script) $(CPP) $(CURDIR)/plugin/Codebendercc/fake_install.rdf

force:;

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
test: force $(XPI)
	$(MOCHA) $(FIREFOX_TEST) # $(CHROME_TEST)

serve:
	node tools/serve.js

async-serve:
	node $(CURDIR)/tools/serve.js & \
	echo $$! | tee server_pid

kill-server:
	kill $(shell cat server_pid)
	rm server_pid

run-chrome:
	(chromium --user-data-dir=/tmp/chromium-user-data --load-extension=./extension chrome://extensions; rm -rf /tmp/chromium-user-data) &

firefox = /Applications/Firefox.app/Contents/MacOS/firefox # open  -n -a firefox --args
firefox-arch = $(CURDIR)/test/firefox-arch
GET_FF_PROFILES = (find /var/folders -ls | grep  'tmp-[0-9a-zA-Z]*$$') 2> /dev/null | sort -r | awk '{print $$11}'
FF_PROFILE=$(shell $(GET_FF_PROFILES) | head -1)
firefox-args = -jsconsole -new-instance -profile "$(FF_PROFILE)" -url "$(URL)"

$(firefox-arch): $(firefox)
	lipo -thin $(shell uname -m) -output  $@ $(firefox)

run-firefox: kill-firefox-instances
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
