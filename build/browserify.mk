# Browserify related targets
force:
CODEBENDER_CC ?= $(dot)/../codebender.cc
codebender-twig-dir = $(CODEBENDER_CC)/Symfony/src/Codebender/GenericBundle/Resources/views/CompilerFlasher
CHROME_FILES =								\
	$(dot)/codebender/backend/buffer.js				\
	$(dot)/codebender/backend/logging.js				\
	$(dot)/codebender/backend/transaction.js			\
	$(dot)/codebender/backend/util.js				\
	$(dot)/codebender/backend/protocols/butterfly.js		\
	$(dot)/codebender/backend/protocols/serialtransaction.js	\
	$(dot)/codebender/backend/protocols/stk500.js			\
	$(dot)/chrome-extension/client/rpc-client.js			\
	$(dot)/chrome-extension/common/config.js			\
	$(dot)/chrome-extension/common/rpc-args.js			\
	$(dot)/codebender/chrome-plugin.js

TARGETS = $(dot)/bundles/compilerflasher.js	\
	$(dot)/bundles/chrome-client.js		\
	$(dot)/bundles/firefox-client.js

TWIG_TARGETS = $(codebender-twig-dir)/chrome-client.js.twig		\
	$(codebender-twig-dir)/firefox-client.js.twig

js-libraries = $(dot)/bundles/chrome-client.js $(dot)/bundles/client.js $(dot)/bundles/firefox-client.js

browserify = $(shell which browserify 2> /dev/null || \
		echo $(dot)/node_modules/.bin/browserify)
$(browserify): $(dot)/node_modules

.PHONY:
browserify: $(TARGETS)

browserify-twig:
	$(MAKE) disable-dev-mode
	$(MAKE) $(TWIG_TARGETS)
	$(MAKE) enable-dev-mode

log-since-push:
	@git --no-pager log "$(shell head $(codebender-twig-dir)/chrome-client.js.twig | sed -n 's_// Commit: \(.*\)_\1_p')..HEAD"

y-or-n = (read -n 1 -p "==== Are you ok with this (y/n)? " answer && [[ "$$answer" = "y" ]] && answer="")
cbgit = git --no-pager -C $(CODEBENDER_CC)
pull-request-branch = babelfish_$(shell git for-each-ref --format='%(refname)' --sort=-committerdate refs/heads/ | grep -v 'master' | sed 's_refs/heads/\(.*\)_\1_p' | head -1)
.PHONY:
setup-pull-branch:
	$(cbgit) checkout development
	$(cbgit) pull origin development
	@echo "--------"
	@echo "Will create branch named '$(pull-request-branch)' (set pull-request-branch to override)"
	$(y-or-n)
	(($(cbgit) checkout -b "$(pull-request-branch)") || $(y-or-n))

.PHONY:
pull-request: setup-pull-branch browserify-twig
	$(cbgit) commit -a -m '$(shell $(MAKE) log-since-push)' || \
		(echo "===== Nothing to commit =====" && false)
	@echo "You can push with: make -C '$(dot)' pull-request-branch=$(pull-request-branch) push-pull-request"


push-pull-request:
	$(cbgit) diff development
	@echo "Will now push..."

$(dot)/bundles:
	mkdir -p $@

$(codebender-twig-dir)/%.twig: $(dot)/bundles/%
	@echo "Generating: $@"
	echo "// Commit: $(shell git rev-parse HEAD)"| cat - $< > $@

$(dot)/bundles/compilerflasher.js: $(dot)/codebender/ad-hoc-changes.js $(dot)/codebender/compilerflasher.js $(dot)/bundles
	cat $^ > $@

$(dot)/bundles/%-client.js: $(dot)/codebender/%-loader.js $(DEV_FILE) force | $(browserify) $(dot)/bundles
	($(browserify) -e $< | \
		cat $(DEV_FILE) - > $@) || \
	(rm $@; echo "Maybe run: make enable-dev-mode";false)

.PHONY:
browserify-clean:
	rm -f $(TARGETS)
