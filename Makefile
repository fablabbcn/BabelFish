# Spaces in path trick
nullstring :=
space := $(nullstring) # a space at the end
path = $(subst $(space),\ ,$1)
dot = $(call path,$(CURDIR))

MOCHA = mocha $(DEBUG)

# Some morons force you to have parens and spaces in executable paths
# (i am talking to you fucking Microsoft)
MAKE:='$(MAKE)'

# URL = http://localhost:8080/web/serialmonitor.html
## FIREFOX TESTS
# URL = http://localhost:8080/test/testpages/plugin-serial/index.html
# URL = http://localhost:8080/test/testpages/plugin/index.html

## CHROME TESTS
# URL = http://localhost:8080/test/testpages/serial/index.html
# URL = http://localhost:8080/test/testpages/chrome-listener/index.html

## Codebender tests
URL = http://localhost:8080/codebender/test/test_download/index.html
# URL = http://localhost:8080/codebender/test/test_usb/index.html

force:;

$(dot)/bundles:
	mkdir $@

$(dot)/node_modules:
	npm install

include $(dot)/build/server.mk
include $(dot)/build/browserify.mk
include $(dot)/build/chrome.mk
include $(dot)/build/extension.mk
include $(dot)/build/firefox.mk


$(SUBMODULES):
	git submodule init
	git submodule update
