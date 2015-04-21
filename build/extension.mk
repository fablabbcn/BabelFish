# Chrome extension related targets
extension-developer=true
babelfish-app-dir ?= $(dot)/chrome-extension
HOST_FILES = $(babelfish-app-dir)/manifest.json	\
	$(babelfish-app-dir)/background.html		\
	$(babelfish-app-dir)/background.js		\
	$(babelfish-app-dir)/host/rpc-host.js	\
	$(babelfish-app-dir)/host/hostbus.js		\
	$(babelfish-app-dir)/host/util.js		\
	$(babelfish-app-dir)/host/ad-hoc.js		\
	$(babelfish-app-dir)/host/background.js	\
	$(babelfish-app-dir)/common/config.js	\
	$(babelfish-app-dir)/common/rpc-args.js	\
	$(babelfish-app-dir)/app-page/index.html	\
	$(babelfish-app-dir)/app-page/blizzard.png	\
	$(babelfish-app-dir)/app-page/codebender-transparent.png

HOST_META = $(babelfish-app-dir)/logo128.png \
	$(babelfish-app-dir)/logo16.png	\
	$(babelfish-app-dir)/logo48.png

DEV_FILE = $(babelfish-app-dir)/common/developer.js

extension-version = $(shell sed -n  's/.*"version"[\t ]*:[\t ]*"\(.*\)"[\t ]*,.*/\1/p' $(babelfish-app-dir)/manifest.json)
CHROME_ZIP = $(dot)/bundles/chrome-extension-$(extension-version).zip

$(CHROME_ZIP): $(HOST_FILES) disable-dev-mode
	$(MAKE) disable-dev-mode
	cd $(babelfish-app-dir) && \
	zip $@ $(shell echo $(DEV_FILE) $(HOST_FILES) $(HOST_META) | sed 's_$(babelfish-app-dir)/__g')
	@echo "Created zip: $@"
	$(MAKE) enable-dev-mode

store-zip: $(CHROME_ZIP)

# Remove the abuility for anyone to use developer.js
.PHONY:
enable-dev-mode:
	cp $(DEV_FILE).dev $(DEV_FILE)
	$(MAKE) browserify

.PHONY:
disable-dev-mode:
	cp $(DEV_FILE).nodev $(DEV_FILE)
	$(MAKE) browserify

$(DEV_FILE): enable-dev-mode
