build_script = remote.sh
# build_script = build.sh
TARGETS = plugin/codebendercc.xpi plugin/npCodebendercc.so
force:;

plugin:
	git submodule init
	git submodule update

.ONESHELL:
$(TARGETS): plugin/Codebendercc/fake_install.rdf | plugin
	cd plugin
	./$(build_script)

test-firefox: plugin/codebendercc.xpi
	mocha test/firefox-test.js

test-chrome:
	mocha test/selenium-test.js

test: test-firefox

clean:
	rm -rf $(TARGETS)
