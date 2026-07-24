# Makefile — local CI for adws-pipeline-skill (stand-in for billing-locked CodeQL).
# See scripts/local-ci/README.md. Tier 3 (review) is advisory; Tiers 1-2 gate pre-push.

.PHONY: local-ci ci-orb review ci install-hooks help

help:
	@echo "make local-ci      Tier 1: fast host gate (parity 84/13/7 + static + lints)"
	@echo "make ci-orb        Tier 2: OrbStack clean-room, Node 20/24 (closes F-13)"
	@echo "make review        Tier 3: advisory local-LLM review (Ollama; never blocks)"
	@echo "make ci            Tier 1 + Tier 2 (what the pre-push hook runs)"
	@echo "make install-hooks wire .githooks/pre-push via core.hooksPath (once per clone)"

local-ci:
	bash scripts/local-ci/gate.sh

ci-orb:
	bash scripts/local-ci/orb-ci.sh

review:
	bash scripts/local-ci/review.sh

ci: local-ci ci-orb

install-hooks:
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-push
	@echo "hooks installed: core.hooksPath=.githooks  (bypass a push with: git push --no-verify)"
