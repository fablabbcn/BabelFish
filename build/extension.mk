# Chrome extension related targets
extension-developer=true
HOST_FILES = $(dot)/chrome-extension/manifest.json	\
	$(dot)/chrome-extension/host/rpc-host.js	\
	$(dot)/chrome-extension/host/background.js	\
	$(dot)/chrome-extension/host/hostbus.js		\
	$(dot)/chrome-extension/host/util.js		\
	$(dot)/chrome-extension/common/config.js	\
	$(dot)/chrome-extension/common/rpc-args.js	\
	$(dot)/chrome-extension/app-page/index.html

HOST_META = $(dot)/chrome-extension/logo128.png \
	$(dot)/chrome-extension/logo16.png	\
	$(dot)/chrome-extension/logo48.png

DEV_FILE = $(dot)/chrome-extension/common/developer.js

extension-version = $(shell sed -n  's/.*"version"[\t ]*:[\t ]*"\(.*\)"[\t ]*,.*/\1/p' $(dot)/chrome-extension/manifest.json)
CHROME_ZIP = $(dot)/bundles/chrome-extension-$(extension-version).zip

$(CHROME_ZIP): $(HOST_FILES)
	cd $(dot)/chrome-extension && \
	zip $@ $(shell echo $(DEV_FILE) $(HOST_FILES) $(HOST_META) | sed 's_$(dot)/chrome-extension/__g')
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
