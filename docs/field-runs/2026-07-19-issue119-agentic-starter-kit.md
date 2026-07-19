# ADWS Pipeline Field Run — 2026-07-19 — agentic-starter-kit issue #119

Operator: Anthony (Cowork cloud session, orchestrated by Claude on
`claude-opus-4-8`; device bridge to the local Mac for ship/merge).
Target: `Org-EthereaLogic/agentic-starter-kit` — issue #119, the CRIT-001
`marker-scan.sh` vacuous-scan follow-up filed during the #104/#118 review.
The `--list-marker-surfaces` read used an unguarded `done < <(...)` process
substitution, so under `set -euo pipefail` a governance-loader crash specific
to that call (after `--marker-regex` had already succeeded) silently left
`surfaces` empty and the scan proceeded against zero surfaces instead of
failing — the milder instance of the CRIT-002 bug #104 fixed in
`check-governance.sh`.

Job: `job_20260719_0003` / `tsk_20260719_0119`, `patch` mode. Verdict:
**PROMOTE with warnings** (`execution-report.js` exit 10) — 7/7 gates on the
FIRST attempt of every phase, 9/9 validators `pass`, both Critic/Advocate
consensus rounds clean (no dissent), grader 3/4 `satisfied` + 1 `partial`,
zero rewinds, zero parse failures (no `entropy_history.jsonl` created; the
healthy-missing path fed `drift-sentinel` `{"entropy_history": []}` at verify,
SAFE/pass). Shipped as
[PR #140](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/140)
(squash `4b10421`, issue #119 auto-closed), dashboard synced via
[PR #141](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/141)
(twelfth post-merge sync, `83df341`). Evidence tree:
`artifacts/job_20260719_0003/` (cloud session artifact; the target repo keeps
evidence trees out of version control).

## The change (5 files, +86 / −9)

- `{{cookiecutter.project_slug}}/scripts/marker-scan.sh` — replace the
  unguarded `surfaces=(); while … done < <("${GOV_LOADER[@]}"
  --list-marker-surfaces)` read with the capture-first guard already used
  four times in `check-governance.sh`: `if ! surfaces_raw="$("${GOV_LOADER[@]}"
  --list-marker-surfaces)"; then log_error "governance loader failed:
  ${GOV_LOADER[*]} --list-marker-surfaces"; exit 1; fi`, then parse
  `surfaces_raw` via a `<<<` here-string. A process substitution's exit
  status is invisible to the enclosing `while` under `set -euo pipefail`; a
  `<<<` here-string over a captured variable propagates it. Bash 3.2-safe
  (no `mapfile`, no process substitution). The adjacent `markers="$(...)"`
  line (already a guarded-by-`set -e` bare command substitution) and the
  `for s in "${surfaces[@]}"` loop are untouched (explicit non-goals).
- `{{cookiecutter.project_slug}}/tests/test_validation_scripts.py` — new
  `test_marker_scan_fails_loudly_when_surfaces_loader_crashes`, mirroring
  `test_hidden_and_ignored_marker_search_scope_matches_fallback`'s fixture
  setup and `test_skill_contracts.py::test_governance_check_fails_loudly_on_
  corrupt_rules_file`'s assertion shape. Fixture: valid
  `prohibited_markers.pattern_pairs` but `surfaces: null` — so `--marker-regex`
  succeeds while `--list-marker-surfaces` raises in `get_marker_surfaces()`'s
  `list(None)`. Asserts non-zero exit AND `governance loader failed` on stderr.
- `{{cookiecutter.project_slug}}/scripts/check-governance.sh` — comment-only:
  correct the now-stale parenthetical that described marker-scan's read as
  "tracked separately, not fixed here." No logic change.
- `{{cookiecutter.project_slug}}/tests/README.md` — one line documenting the
  new regression's coverage (document-phase `docs_delta`, not in the build's
  file list — the ship phase staged the 5-file union, as in #104).
- `CHANGELOG.md` — `[Unreleased] › Fixed` entry cross-referencing #104.

## Run environment

Cowork cloud container (Linux, Node v22.22.2, Python 3.11.15, bash 5.2.21,
PyYAML 6.0.3, shellcheck 0.9.0, pytest). Repo transport: a `git bundle` of
`main` at `2aa7ed9` (745 KB) created on the Mac via Desktop Commander, staged
over the device bridge into `adws-pipeline-skill/_transfer/`, cloned in the
container (recover from "remote HEAD refers to nonexistent ref" with
`git fetch origin main && git checkout -b main FETCH_HEAD`, as for the cloud
path). The standalone `adws-pipeline-skill` tree (SKILL.md, references,
scripts, agent specs) was staged from `~/Dev/adws-pipeline-skill` and executed
from there — the third acceptance run of the standalone packaging after
#107/#135. F-11 inline-spec fallback used for ALL 12 dispatches (`adws-*`
agent types not registered in Cowork). Tiers per the low-risk row: architect
sonnet, critic haiku, advocate haiku, grader opus; `review-risk-assess`
recomputed `low` post-review (no change). Worktree isolation via
`git worktree add`. No push credentials in the container → `patch` mode with
the established cloud→Mac ship path: `git am -c commit.gpgsign=false` of the
format-patch, push, `gh pr create`, squash-merge with `--admin` (Actions
billing-locked). Ship gh account `AJ-EthereaLogic-ai` (keyring).

## What worked well (measured)

- **Clean pipeline mechanics.** First-attempt pass on all seven gates; all
  nine validator invocations `pass`; both consensus rounds exact-schema (no
  extra keys) with live `date -u` timestamps — the haiku write-and-verify
  dispatch instruction held 4/4 again (four-for-four across #107/#135/#119);
  0 rewinds, 0 entropy events.
- **Orchestrator-verified planning isolated the regression fixture BEFORE
  build.** `governance.py` `safe_load`s the whole YAML in `__init__`, so a
  whole-file corruption trips `set -e` on the *already-guarded* `--marker-regex`
  call — a tautological test. Only a rules file that PARSES but makes
  `get_marker_surfaces()` (`list(data["prohibited_markers"]["surfaces"])`)
  crash while `get_marker_regex()` succeeds isolates #119's specific gap:
  valid `pattern_pairs` + `surfaces: null` → `list(None)` TypeError on
  `--list-marker-surfaces` only. Confirmed empirically on a scratch render
  before the build phase.
- **Cross-platform correctness caught a subtle bash-version split.** The
  vacuous bug manifests DIFFERENTLY by bash version: on Linux/bash-5 the
  pre-fix script exits 0 (the true vacuous pass); on macOS/bash-3.2 the empty
  `surfaces` array trips a DIFFERENT `set -u` unbound-variable error at
  `for s in "${surfaces[@]}"` (exit 1). The regression test's DUAL assertion
  (non-zero exit AND `governance loader failed` on stderr) is regression-
  proving on BOTH: the pre-fix script fails the exit-code assertion on Linux
  and the diagnostic-string assertion on bash 3.2; only the guarded script
  satisfies both. Full `test_validation_scripts.py` 5/5 on Linux (bash 5.2)
  AND macOS (bash 3.2.57).
- **Regression-proof exercised independently at build, test, and review
  gates** (plus the orchestrator) — the new test fails against `main`'s
  pre-fix `marker-scan.sh` (`AssertionError: 0 == 0` on Linux), passes against
  the fix.

## Findings

1. **[GRADER MANDATE AMBIGUITY — the sole warning] "Grade against the diff
   alone" vs. "independently reproduce" for runtime-assertion criteria.** The
   grader graded AC3 ("the full suite passes" + "`marker-scan.sh` exits 0 on
   the real rules") as `partial` because those are RUNTIME assertions no
   static diff can prove — and this run's grader dispatch explicitly told it
   not to re-run tests. The grader spec says grade "against the diff alone —
   ship-phase narrative and prior evidence do not count," which literally
   yields `partial` here. But the #135 grader independently REPRODUCED runtime
   evidence (unpatched-vs-patched `post-create.sh`; re-confirmed a commit in
   git history) and returned 4/4 `satisfied`. Both readings are spec-
   defensible; the ambiguity is genuine and decides exit 10 vs exit 0. Net
   effect: PROMOTE-with-warnings for a criterion that IS satisfied at runtime
   (test phase 12/12 + independent 5/5 on Linux and macOS). No re-grade was
   performed — the `warn` is honest and non-blocking, and overwriting the
   attempt's grader verdict would violate append-only and read as outcome-
   shopping. **Recommendation (orchestration practice, not a script change):**
   for acceptance criteria carrying runtime assertions, the grader dispatch
   should PERMIT independent reproduction (the grader has Bash + worktree
   access, and reproduction yields the replayable proof the criterion demands
   — DPPD P2), turning a spurious `partial` into a grounded `satisfied`. A
   SKILL.md clarification resolving "diff alone" vs "independently reproduce"
   for runtime-assertion criteria is a candidate (not made this run).
2. **[CONTRACT PHRASING — companion to Finding 1] A runtime assertion bundled
   into an AC guarantees a diff-only `partial`.** AC3 combined "suite passes"
   + "exits 0 on real rules" — both runtime. Phrasing a runtime AC so its
   proof is an artifact the diff carries (e.g. "a test EXISTS that asserts X",
   which the diff shows) grades `satisfied` from the diff; "the suite passes"
   cannot. Minor intake lesson; not a defect.
3. **[FROZEN VALIDATOR, known] `patch-compose` undercounts the shipped set.**
   As in #104/#135, `patch-compose` read `build.files_changed` (4) and
   reported `files_to_ship: 4`, while ship staged the 5-file union (build +
   the document phase's `docs_delta` = `tests/README.md`). Documented
   divergence; the shipper recorded the note in its `phase_log.md`. Not a
   failure.

## Skill changes resulting from this run

None to the frozen scripts, validators, or agent specs — no spec defect
surfaced, and per the frozen-baseline policy only spec/docs-side changes are
in scope. The single actionable item is the ORCHESTRATION-PRACTICE note in
Finding 1 (grader dispatch should allow runtime reproduction for runtime-
assertion criteria; a SKILL.md clarification is a candidate). The run
otherwise exercised the pipeline end-to-end with zero mechanics friction.

## Ledger

| Item | Value |
| --- | --- |
| Job / task | `job_20260719_0003` / `tsk_20260719_0119` |
| Mode | patch (cloud container) → `git am` + PR on Mac |
| Verdict | PROMOTE with warnings, exit 10 |
| Gates | 7/7 first-attempt; consensus 2/2 clean; grader 3 satisfied + 1 partial; 9/9 skills pass |
| Rewinds / entropy | 0 / no history file (healthy-missing path exercised) |
| Ship | PR #140 → squash `4b10421` on `main`; #119 auto-closed |
| Dashboard | twelfth post-merge sync, PR #141 (`83df341`) |
| Linux validation | `test_validation_scripts.py` 5/5 (bash 5.2); marker-scan exits 0 on real rules |
| macOS parity | `test_validation_scripts.py` 5/5 (bash 3.2.57) incl. the new test |
| Evidence | cloud `artifacts/job_20260719_0003/` (target repo keeps trees out of VCS) |
| Open follow-ups | target #111 (refactor/optimization); no new candidates surfaced |
