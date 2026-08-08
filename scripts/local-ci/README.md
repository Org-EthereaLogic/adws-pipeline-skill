# Local CI — `adws-pipeline-skill`

The only remote check, `.github/workflows/codeql.yml`, dies in ~2s on the account-wide
billing lock (and is security-only — it runs none of this repo's tests). This directory is
the **local stand-in CI**: it runs the repo's real deterministic suites fast, re-runs them
in a clean Linux/bash-5 userland to kill host-only passes, and adds a local-LLM second
opinion. Evidence is append-only JSONL in the gitignored `ci_logs/`, meant to be **pasted
into the PR body** while cloud checks can't run.

Patterns (lib.sh, `run_step`, hooks wiring, JSONL evidence, OrbStack bind-mount tricks) are
mirrored from `agentic-starter-kit/scripts/local-ci/`; payloads are specific to this repo.

## Tiers

| Tier | Make target | Blocks? | What it runs |
|---|---|---|---|
| 1 — host gate | `make local-ci` | yes (pre-push) | parity 93 + report 19 + entropy 7 fixtures; SC-3 provenance fixtures 3 + contract micro-drill; `node --check`; `shellcheck`+`bash -n`; SKILL.md frontmatter lint; extended NFR-4 built-ins scan. Seconds, zero-LLM. |
| 2 — clean room | `make ci-orb` | yes (pre-push) | The **same Tier-1 gate**, re-run inside an OrbStack Debian/bash-5 container under **Node 20 and 24** (clean checkout of the exact committed SHA; primary and linked-worktree checkouts supported). Closes the F-13 host-runtime blind spot. |
| 3 — LLM review | `make review` | **never** (advisory) | Two local Ollama models review `git diff origin/main...HEAD` against `review-prompt.md`. A model that isn't pulled is recorded `skipped_not_pulled`. |

`make ci` runs Tier 1 + Tier 2 (what the pre-push hook runs). `make install-hooks` wires the
hook once per clone; bypass a push with `git push --no-verify`.

## Prerequisites

- **Node ≥ 20** (host has v24) and **git** — required for Tier 1.
- **shellcheck** — required for Tier 1: `brew install shellcheck`.
- **OrbStack / Docker** — required for Tier 2 (host has OrbStack 2.2.1).
- **Ollama + models** — required for Tier 3: `ollama serve`, then
  `ollama pull gpt-oss:120b` (~65 GB) and `ollama pull qwen3.5:9b` (~6.6 GB). Override the
  set with `REVIEW_MODELS="…"`. `jq` + `curl` are used to call Ollama.

## Workflow

```sh
make install-hooks          # once per clone
make local-ci               # fast inner-loop gate
make ci-orb                 # clean-room matrix before pushing (also runs at pre-push)
make review                 # advisory LLM pass; paste its record into the PR
```

Each command prints a one-line JSON record; paste it into the PR body as the CI evidence
that would otherwise come from cloud checks. Logs: `ci_logs/local_ci.jsonl`,
`ci_logs/orb_ci.jsonl`, `ci_logs/review.jsonl`, plus per-run `.log` files.

## Notes

- **Suite sizes are asserted, not narrated** (M-3a). The counts in this table, in the
  `Makefile`, in `gate.sh`, and in `.githooks/pre-push` are prose; the assertions live in the
  runners. The report, entropy, and provenance suites cross-check their declared `CASES`
  against the fixtures on disk in both directions (an unrun fixture and a fixtureless case
  each fail by name); `run-parity.js` discovers from disk and so carries
  `EXPECTED_FIXTURE_TOTAL`, which must be updated in the same commit as any fixture
  addition or removal. If you change a count in prose, change the assertion behind it.
- All host-side shell stays **bash-3.2-safe** (macOS stock: no assoc arrays, `${x^^}`,
  `mapfile`) — the repo's own F-13 lesson applied to its tooling.
- Tier 1/2 suites write only gitignored side-effects (`parity/PARITY_REPORT.md`, fixture
  `execution_report.{json,md}`), so the working tree stays clean.
- The SC-3 micro-drill sanitizes repository-scoped Git environment variables before its
  scratch `git init`; pre-push hooks therefore cannot redirect the drill's fixture commit
  into the source repository.
- `ci_logs/` is gitignored; it never enters a commit.
