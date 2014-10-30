# build_script = build.sh

build_script = remote.sh
XPI = $(CURDIR)/plugin/codebendercc.xpi
PLUGIN = $(CURDIR)/plugin/npCodebendercc.so
ΤΑRGETS = $(XPI) $(PLUGIN)
CPP_DIR = $(CURDIR)/plugin/Codebendercc
CPP = $(CPP_DIR)/CodebenderccAPI.cpp $(CPP_DIR)/CodebenderccAPI.h $(CPP_DIR)/CodebenderccAPIJS.cpp $(CPP_DIR)/Codebendercc.cpp $(CPP_DIR)/Codebendercc.h

MOCHA = mocha $(DEBUG)
# URL = http://localhost:8080/web/serialmonitor.html
URL = http://localhost:8080/test/testpages/plugin-serial/index.html
CHROME_TEST = test/selenium-test.js
FIREFOX_TEST = test/firefox-test.js

force:;

plugin:
	git submodule init
	git submodule update

.ONESHELL:
$(XPI): $(CPP) plugin/Codebendercc/fake_install.rdf | plugin
	cd plugin
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

run-firefox:
	firefox -jsconsole -venkman -new-instance -profile "$(shell ls -rsd /tmp/tmp-* | head -1 | awk '{print $$2}')" -url $(URL) &

serve-chrome: run-chrome serve
serve-firefox: run-firefox serve


clean:
	rm -rf $(TARGETS)
