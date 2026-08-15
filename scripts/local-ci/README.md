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
| 1 — host gate | `make local-ci` | yes (pre-push) | parity 116 + report 29 + entropy 7 fixtures; SC-3 provenance fixtures 5 + contract micro-drill; **secret-scan** over 11 credential rules; **CLI contract** over 9 validators + 2 scripts; **guard-ablation** sweep; `node --check`; `shellcheck`+`bash -n`; SKILL.md frontmatter lint **+ line-budget ratchet**; extended NFR-4 built-ins scan; CLI-wrapper and agent-block byte-identity lints; **no-eval scan** (no execution sink in the shipped tree, no read of the agent-authored `command` field anywhere); **advertised-count lint** (every suite count and validator version printed in prose, against the suites on disk); skill-manifest currency. Seconds, zero-LLM. |
| 2 — clean room | `make ci-orb` | yes (pre-push) | The **same Tier-1 gate**, re-run inside an OrbStack Debian/bash-5 container under **Node 20 and 24** (clean checkout of the exact committed SHA; primary and linked-worktree checkouts supported). Varies the **Node version only**, on `linux/arm64`. |
| 3 — LLM review | `make review` | **never** (advisory) | Two local Ollama models review `git diff origin/main...HEAD` against `review-prompt.md`. A model that isn't pulled is recorded `skipped_not_pulled`. |

`make ci` runs Tier 1 + Tier 2 (what the pre-push hook runs). `make install-hooks` wires both
hooks once per clone; bypass a push with `git push --no-verify`.

| Hook | Fires | Blocks? |
|---|---|---|
| `pre-push` | every push | **yes** — Tier 1 then Tier 2 |
| `post-merge` | a merge or pull that changes `skill-manifest.json` | **never** — runs `check-installs` and prints the result |

`post-merge` exists because a merged fix does not reach a run until someone reinstalls
(F-72), and it fires only when the shipped bytes actually changed: a reminder on every pull
is a reminder nobody reads, which is the same reason `check-installs` is not a gate step.

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

- **Suite sizes are asserted, not narrated** (M-3a, completed by SC-18). The assertions live
  in the runners: the report, entropy, and provenance suites cross-check their declared
  `CASES` against the fixtures on disk in both directions (an unrun fixture and a fixtureless
  case each fail by name); `run-parity.js` discovers from disk and so carries
  `EXPECTED_FIXTURE_TOTAL`, which must be updated in the same commit as any fixture addition
  or removal.

  The counts printed in *prose* — this table, the `Makefile`, `gate.sh`, `.githooks/pre-push`,
  and the root `README.md` — were the half nothing checked, and this note used to end with
  "if you change a count in prose, change the assertion behind it". That instruction was
  followed by hand twice (SC-13, SC-17) and both times the numbers went stale again within
  two work packages; when SC-18 finally compared them, the table above was advertising a
  parity suite seven fixtures smaller than the one on disk, and this very bullet was the text
  claiming otherwise. `counts-lint.mjs` now derives each number from the suite and fails the
  gate on disagreement, in both directions — a registered claim that stops matching fails just
  as loudly as a wrong number, so rewording prose cannot silently retire an assertion.
  Historical counts in `docs/` are deliberately **not** covered: a line reading "report
  fixtures 24 → 25" records a moment and is not a claim about today.
- **This gate had never failed — and then it did, four times, on purpose.** Across the
  first **73** runs recorded in `ci_logs/local_ci.jsonl` (everything before M-5a),
  `overall` was `pass` every time and all **657** steps passed. That was never a logging
  artifact: `gate.sh` sets `overall=fail` and emits the JSONL record *before* the non-zero
  exit. Every finding in the F-register had been found by a field run, a review bot, or a
  human audit; none was ever found here. A green signal from a gate that has never gone red
  carries less information than its volume suggests.

  The ledger is append-only, so a later recount sees more. **Across the first 287 runs (through
  SC-18, 2026-08-15): 14 red records in 7 distinct steps** — `guard-ablation` ×3,
  `skill-manifest` ×5, `bash32-scan` ×2, and one each of `requires`, `cli-block`, `frontmatter`,
  `counts`. None is a regression.

  Stated as a claim about a **prefix** of the ledger, deliberately, so it stays true as the
  ledger grows — the same reason the "first 73 runs" sentence above has never needed editing. The
  first draft of this paragraph said "14 red across 285 runs" and was wrong within two gate runs,
  which is the whole lesson of the step it was documenting.

  The four below are the original M-5a-era set, kept because each is worth reading as evidence
  that a new step works:

  | # | run_id | Step | What it caught |
  |---|---|---|---|
  | 78 | `20260808T211049Z` | `guard-ablation` | Four rules SC-9 had just added that no fixture pinned — one of them dead security-shaped code |
  | 83 | `20260808T212913Z` | `requires` | A false positive in `requires-lint` itself: it matched `from "…"` inside comment prose. The lint was the defect; comments are now stripped |
  | 86 | `20260808T213304Z` | `bash32-scan` | Its own first run — three of its explanatory comments, plus three real unguarded `"${arr[@]}"` sites under `set -u` |
  | 88 | `20260808T213734Z` | `guard-ablation` | A deliberately stale baseline entry, proving the bidirectional rule fails in both directions |
  | 278 | `20260815T040754Z` | `counts` | Its own first run, twice over: seven stale advertised counts across four files, then the lint-count in `gate.sh`'s own header going stale the moment `counts` was added as another one |

  Read the ledger with that in mind: "N passes, 0 failures" was the *problem* this series set
  out to fix, not the achievement. **This tally is prose and cannot be gated** — `ci_logs/` is
  gitignored, so a fresh clone has no ledger to count and `counts-lint` has nothing to compare
  against. It is the one number in this file that stays a hand-sync, and saying so is better than
  a reader assuming the SC-18 mechanism covers it.
- **`guard-ablation` is the first step that can fail for a reason nobody wrote a fixture
  for.** It mutates each target validator's `execute()` one rule at a time and reports any
  mutation the whole fixture corpus fails to notice. A surviving mutant means the rule it
  touched is pinned by nothing — the defect class a field run recorded as *"deleting the
  guard left both fixtures green."* Accepted survivors live in
  `parity/guard-ablation-baseline.json`, which may only shrink, and a stale entry fails the
  gate just as loudly as a new survivor.
- **`make check-installs` is deliberately NOT in the gate.** It reads machine-local state
  (`.adws-installs`, gitignored) and would fail in CI, in a fresh clone, and on any machine
  that has never installed the skill — a step that cannot pass everywhere is a step people
  learn to ignore. Run it after a merge, which is exactly when F-72 bites. What *is* gated is
  `skill-manifest`, which asserts the shipped manifest describes the tree it ships with, so
  an install can never stamp itself with a version that does not match its own contents.
- All host-side shell stays **bash-3.2-safe** (macOS stock: no assoc arrays, `${x^^}`,
  `mapfile`) — the repo's own F-13 lesson applied to its tooling.
- Tier 1/2 suites write only gitignored side-effects (`parity/PARITY_REPORT.md`, fixture
  `execution_report.{json,md}`), so the working tree stays clean.
- The SC-3 micro-drill sanitizes repository-scoped Git environment variables before its
  scratch `git init`; pre-push hooks therefore cannot redirect the drill's fixture commit
  into the source repository.
- `ci_logs/` is gitignored; it never enters a commit.
