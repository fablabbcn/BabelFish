build_script = build.sh
XPI = $(CURDIR)/plugin/codebendercc.xpi
export CODEBENDER_XPI = $(XPI)
PLUGIN = $(CURDIR)/plugin/npCodebendercc.so
ΤΑRGETS = $(XPI) $(PLUGIN)
CPP_DIR = $(CURDIR)/plugin/Codebendercc
CPP = $(CPP_DIR)/CodebenderccAPI.cpp $(CPP_DIR)/CodebenderccAPI.h $(CPP_DIR)/CodebenderccAPIJS.cpp $(CPP_DIR)/Codebendercc.cpp $(CPP_DIR)/Codebendercc.h

MOCHA = mocha $(DEBUG)
# URL = http://localhost:8080/web/serialmonitor.html
# URL = http://localhost:8080/test/testpages/plugin-serial/index.html
URL = http://localhost:8080/test/testpages/plugin/index.html
CHROME_TEST = test/selenium-test.js
FIREFOX_TEST = test/firefox-test.js
PLUGIN_FILES = $(build_script) $(CPP) plugin/Codebendercc/fake_install.rdf

force:;

plugin:
	git submodule init
	git submodule update

$(PLUGIN_FILES): | plugin

.ONESHELL:
$(XPI): $(PLUGIN_FILES)
	cd plugin && \
	./$(build_script)

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

run-chrome:
	(chromium --user-data-dir=/tmp/chromium-user-data --load-extension=./extension chrome://extensions; rm -rf /tmp/chromium-user-data) &

firefox = open  -n -a firefox --args
FF_PROFILE=$(shell (find /var/folders -ls | grep  'tmp-[0-9a-zA-Z]*$$') 2> /dev/null | sort -r | awk '{print $$11}' | head -1)
run-firefox:
	$(firefox) -jsconsole -new-instance -profile "$(FF_PROFILE)" -url "$(URL)" &

kill-firefox-instances:
	(while kill $$(ps aux | grep 'firefox' | grep '-new-instanc[e]' | head -1 | awk '{print $$2}'); do echo 'killing'; done) 2> /dev/null
serve-chrome: run-chrome serve
serve-firefox: kill-firefox-instances run-firefox serve

clean:
	rm -rf $(TARGETS)
