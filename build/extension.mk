# Chrome extension related targets
extension-developer=true
HOST_FILES = $(dot)/chrome-extension/manifest.json	\
	$(dot)/chrome-extension/host/rpc-host.js	\
	$(dot)/chrome-extension/host/background.js	\
	$(dot)/chrome-extension/host/hostbus.js		\
	$(dot)/chrome-extension/host/util.js		\
	$(dot)/chrome-extension/common/config.js	\
	$(dot)/chrome-extension/common/rpc-args.js

ifneq ($(extension-developer),false)
DEV_FILE = $(dot)/chrome-extension/common/developer.js
endif
extension-version = $(shell sed -n  's/.*"version"[\t ]*:[\t ]*"\(.*\)"[\t ]*,.*/\1/p' $(dot)/chrome-extension/manifest.json)
CHROME_ZIP = $(dot)/bundles/chrome-extension-$(extension-version).zip

$(CHROME_ZIP): $(HOST_FILES)
	zip $@ $(HOST_FILES)
	@echo "Created zip: $@"

store-zip: $(CHROME_ZIP)

# Remove the a bility for anyone to use developer.js
.PHONY:
extension-no-dev-mode:
	mv $(DEV_FILE) $(DEV_FILE).tmp
	echo "// Non dev mode" > $(DEV_FILE)

.PHONY:
extension-dev-mode:
	mv $(DEV_FILE).tmp $(DEV_FILE)
