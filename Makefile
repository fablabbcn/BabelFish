build_script = remote.sh
# build_script = build.sh
ΤΑRGETS = plugin/codebendercc.xpi plugin/npCodebendercc.so
# FORCE=force
MOCHA = mocha $(DEBUG)
URL = http://localhost:8080/test/testpages/plugin-serial/index.html

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
