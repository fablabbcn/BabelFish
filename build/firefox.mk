# Targets related to firefox and the plugin


FIREFOX_TEST =  $(dot)/test/firefox-test.js
PLUGIN_FILES = $(build_script) $(CPP) $(dot)/plugin/Codebendercc/fake_install.rdf
firefox = /Applications/Firefox.app/Contents/MacOS/firefox # open  -n -a firefox --args
export DYLD_LIBRARY_PATH=$(dot)/root/lib:$$DYLD_LIBRARY_PATH
build_script = $(dot)/plugin/build.sh
XPI = $(dot)/plugin/codebendercc.xpi
export CODEBENDER_XPI = $(XPI)
PLUGIN = $(dot)/plugin/npCodebendercc.so
ΤΑRGETS = $(XPI) $(PLUGIN) $(CHROME_ZIP)
CPP_DIR = $(dot)/plugin/Codebendercc
CPP = $(CPP_DIR)/CodebenderccAPI.cpp $(CPP_DIR)/CodebenderccAPI.h $(CPP_DIR)/CodebenderccAPIJS.cpp $(CPP_DIR)/Codebendercc.cpp $(CPP_DIR)/Codebendercc.h

SUBMODULES += $(dot)/plugin


$(PLUGIN_FILES): | plugin
	@echo "Pligin file: $@"


.ONESHELL:
$(XPI): $(PLUGIN_FILES)
	cd plugin && \
	$(build_script)

.PHONY:
test-firefox: $(XPI)
	$(MOCHA) $(FIREFOX_TEST)

# XXX: Keep these as refrence
firefox-arch = $(dot)/test/firefox-arch
GET_FF_PROFILES = (find /var/folders -ls | grep  'tmp-[0-9a-zA-Z]*$$') 2> /dev/null | sort -r | awk '{print $$11}'
FF_PROFILE=$(shell $(GET_FF_PROFILES) | head -1)
firefox-args = -jsconsole -new-instance -profile "$(FF_PROFILE)" -url "$(URL)"
$(firefox-arch): $(firefox)
	lipo -thin $(shell uname -m) -output  $@ $(firefox)

run-firefox: kill-firefox-instances
	@echo "Running firefox with profile: $(FF_PROFILE)"
	$(firefox) $(firefox-args) &

gdb-args = -ex='run $(firefox-args)'
debug-firefox: $(firefox-arch) kill-firefox-instances
	gdb $(gdb-args) $(firefox-arch)

kill-firefox-instances:
	(while kill $$(ps aux | grep 'firefox' | grep '-new-instanc[e]' | head -1 | awk '{print $$2}'); do echo 'killing'; done) 2> /dev/null

firefox-profile-path:
	@echo $(FF_PROFILE)

delete-firefox-profiles:
	$(GET_FF_PROFILES) | xargs rm -rf

compile-serve: $(XPI) serve-firefox

serve-firefox: run-firefox serve
debug-serve-firefox: serve debug-firefox
