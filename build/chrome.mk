# Targets for running chromeb

chrome = $(shell ls $(chromium-dbg) 2> /dev/null ||	\
		which chromium-dev 2> /dev/null ||		\
		which chromium 2> /dev/null ||		\
		which chrome 2> /dev/null ||		\
		echo  ~/Applications/Chromium.app/Contents/MacOS/Chromium)

extensions = $(dot)/CodebenderChromeDeveloper,$(dot)/chrome-extension
chrome-args = --user-data-dir=$(dot)/chromium-user-data	\
	--load-extension=$(extensions)			\
	--no-first-run,					\
	--no-default-browser-check			\
	--disable-web-security				\
	--no-sandbox


chrome-log-dir = $(dot)/chrome-logs

SUBMODULES += $(dot)/CodebenderChromeDeveloper

.PHONY:
chrome-args:
	@echo $(chrome-args)

$(chrome-log-dir):
	mkdir $@

# Fire up an asynchronous chrome instance
.PHONY:
run-chrome: $(dot)/bundles/chrome-client.js | $(dot)/CodebenderChromeDeveloper
	$(chrome) $(chrome-args) $(URL)

# Run a nodejs server and run chrome.
.PHONY:
serve-chrome:
	$(MAKE) async-serve
	$(MAKE) run-chrome; $(MAKE) kill-server

# Run tests that are chrome specific
CHROME_TEST =  $(dot)/test/selenium-test.js
.PHONY:
test-chrome:
	$(MOCHA) $(CHROME_TEST)


chromium-path = /home/fakedrake/Projects/chromium/src
chromium-dbg = $(chromium-path)/out/Debug/chrome
gdb = gdb --fullname --args
define GDB_CMDS
python
import sys
sys.path.insert(0, "$(chromium-path)/third_party/WebKit/Tools/gdb/")
import webkit
sys.path.insert(0, "$(chromium-path)/tools/gdb/")
import gdb_chrome
endef

.PHONY:
debug-chrome: async-serve $(dot)/bundles/chrome-client.js $(chromium-dbg) | $(dot)/CodebenderChromeDeveloper $(chrome-log-dir)
	$(gdb) $(chromium-dbg) $(chrome-args) $(URL) || true
	$(MAKE) kill-server
