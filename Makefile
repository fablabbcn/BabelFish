# build_script = build.sh

build_script = remote.sh
XPI = $(CURDIR)/plugin/codebendercc.xpi
PLUGIN = $(CURDIR)/plugin/npCodebendercc.so
ΤΑRGETS = $(XPI) $(PLUGIN)
CPP_DIR = $(CURDIR)/plugin/Codebendercc
CPP = $(CPP_DIR)/CodebenderccAPI.cpp $(CPP_DIR)/CodebenderccAPI.h $(CPP_DIR)/CodebenderccAPIJS.cpp $(CPP_DIR)/Codebendercc.cpp $(CPP_DIR)/Codebendercc.h

MOCHA = mocha $(DEBUG)
URL = http://localhost:8080/test/testpages/plugin-serial/index.html

force:;

plugin:
	git submodule init
	git submodule update

.ONESHELL:
$(XPI): $(CPP) plugin/Codebendercc/fake_install.rdf | plugin
	cd plugin
	./$(build_script)

test-firefox: $(CURDIR)/plugin/codebendercc.xpi
	$(MOCHA) test/firefox-test.js

test-chrome:
	$(MOCHA) test/selenium-test.js

test: test-firefox # test-chrome
	rm -rf /tmp/tmp-*

serve:
	node tools/serve.js

run-chrome:
	(chromium --user-data-dir=/tmp/chromium-user-data --load-extension=./extension chrome://extensions; rm -rf /tmp/chromium-user-data) &

run-firefox:
	firefox -jsconsole -venkman -new-instance -profile "$(shell ls -sdr /tmp/tmp-* | head -1 | awk '{print $$2}')" -url $(URL) &

serve-chrome: run-chrome serve
serve-firefox: run-firefox serve


clean:
	rm -rf $(TARGETS)
