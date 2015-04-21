# Targets for running chromeb
chrome = $(shell which chrome || which chromium || echo  ~/Applications/Chromium.app/Contents/MacOS/Chromium)
chrome-args = --user-data-dir=/tmp/chromium-user-data				\
--load-extension=$(dot)/CodebenderChromeDeveloper,$(babelfish-app-dir)		\
--no-first-run,									\
--no-default-browser-check							\
--allow-insecure-localhost 							\
--allow-running-insecure-content 						\
--disable-web-security								\
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
run-chrome: $(dot)/bundles/chrome-client.js | $(dot)/CodebenderChromeDeveloper $(chrome-log-dir)
	$(chrome) $(chrome-args) $(URL) 2> $(chrome-log-dir)/chrome-$(shell date "+%s").log

# Run a nodejs server and run chrome.
.PHONY:
serve-chrome: run-chrome serve

# Run tests that are chrome specific
CHROME_TEST =  $(dot)/test/selenium-test.js
.PHONY:
test-chrome:
	$(MOCHA) $(CHROME_TEST)
