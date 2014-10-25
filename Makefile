build_script = remote.sh
# build_script = build.sh
TARGETS = plugin/codebendercc.xpi plugin/npCodebendercc.so
# FORCE=force
MOCHA = mocha $(DEBUG)

force:;

plugin:
	git submodule init
	git submodule update

.ONESHELL:
$(TARGETS): plugin/Codebendercc/fake_install.rdf $(FORCE) | plugin
	cd plugin
	./$(build_script)

test-firefox: plugin/codebendercc.xpi
	$(MOCHA) test/firefox-test.js

test-chrome:
	$(MOCHA) test/selenium-test.js

test: test-firefox # test-chrome

serve-chrome:
	(chromium --user-data-dir=/tmp/chromium-user-data --load-extension=./extension chrome://extensions & node tools/serve.js )
	rm -rf /tmp/chromium-user-data

clean:
	rm -rf $(TARGETS)
