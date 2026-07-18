# ADWS Pipeline Field Run — 2026-07-18 — agentic-starter-kit issue #104

Operator: Anthony (Cowork cloud session, orchestrated by Claude).
Target: `Org-EthereaLogic/agentic-starter-kit` — issue #104, check-governance.sh
CRIT-002 gate passes vacuously when the loader fails (process-substitution masks
exit code), `area:governance` / `area:ci` / `bug`.
Job: `job_20260718_0002` / `tsk_20260718_0002`. Verdict: **PROMOTE** (exit 0, no
warnings) — after an initial **QUARANTINE** (exit 2) caused by a skill spec
defect, not by the change (see Finding 1). 7/7 gates; 1 attempt per phase except
verify (2 attempts); grader 4/4 satisfied on both grading passes; both consensus
rounds clean with exact schemas; zero entropy events.
Evidence tree: `artifacts/job_20260718_0002/` (46 files) in the target repo.

## Run environment

Cowork cloud sandbox (Node 22, Python 3.11, PyYAML, pytest 9.1.1, cookiecutter
2.7.1 — unlike the #103 run, real template renders were possible, so no F-9
substitution was needed; shellcheck installed by the builder). No `gh`, no push
credentials. Target repo mirrored via `git clone` from GitHub (cheaper and
byte-verifiable vs the #103 tarball route; origin/main `93cbd16` was one commit
ahead of the operator's local main `4fcb921` — a vitest bump not touching the
change surface; the patch was verified `git apply --check`-clean against BOTH).
Ship mode `patch`; post-PROMOTE local branch
`adws/job_20260718_0002/fix-crit002-loader-exit` created on the operator's
machine via plumbing (temp `GIT_INDEX_FILE`, `read-tree`/`apply --cached`/
`write-tree`/`commit-tree`/`update-ref`), parented on local main `4fcb921`,
working tree and `.git/index` untouched. Post-run replay on the operator's
machine from branch content: `python3 tests/test_skill_contracts.py` → 7/7 OK
(device Python 3.10). F-11 inline-spec fallback used for all dispatches
(agent types not registered in this runtime); tiers honored, including the
mid-run recompute at review (medium → low) and a retry escalation
(sonnet → opus) at verify attempt 2.

## What worked well (measured)

- **All seven #103 finding fixes held.** Every agent left `gate_result: null`
  (orchestrator wrote all gate decisions post-hoc); every timestamp was a real
  `date -u` value; both consensus rounds produced EXACT schemas (no extra keys —
  the #103 schema-drift fix verified); the reviewer baselined via `git show
  main:<path>` and /tmp clones, never stash; `validator-inputs.md` allowed all
  9 validator inputs to be assembled without reopening script headers;
  the drift-sentinel empty-history convention (`{"entropy_history": []}` when no
  parse failures occurred) was applied as documented.
- **FR-10 defense-in-depth caught an orchestrator misjudgment.** The
  orchestrator marked the verify attempt-1 gate `pass` treating skipped syntax
  checks as non-blocking; `execution-report.js` independently evaluated
  `verify_structural` as `fail` and QUARANTINED a `completed` job. The verdict
  came from evidence, not narrative — exactly the designed behavior. The
  quarantine was a FALSE negative (spec defect, Finding 1), but the mechanism
  that produced it is the one that also makes false PROMOTEs impossible.
- **Consensus independence held at both gates.** Critic re-derived everything
  (re-ran tests, re-rendered the template, re-checked the corrupt-YAML path)
  rather than trusting `phase_output.json`; the review-gate Critic independently
  root-caused the 25 pre-existing `test_pre_tool_use_hook.py` failures as
  unrendered-Jinja environment artifacts on untouched `main`.
- **The reviewer's regression-proof check is worth institutionalizing:** it
  swapped the pre-fix script under the new regression test and confirmed the
  test FAILS against the old code — proving the test is not tautological.
- **F-10 recovery exercised twice on the device mount.** A bare `git status`
  left a zero-byte `.git/index.lock` (recovered per the three-step procedure,
  removal via rename); plumbing object writes left `tmp_obj_*` files whose
  unlink is blocked on the deletion-restricted mount (harmless; moved by
  explicit path to `_to_delete/`). See suggested F-10 addendum below.

## Findings → skill changes applied this run

1. **[FIXED — adws-verifier.md] Verifier skip semantics guaranteed false
   QUARANTINE on any change set containing files with no applicable syntax
   checker (e.g. `.md`).** Three-way spec contradiction: adws-verifier.md
   mandated recording such files as `"skipped": true`, not passed (i.e.
   `pass: false`); `artifact-layout.md` documents `verify_result.checks` as
   exactly `{check, pass}` (the `skipped` key was itself schema drift); and
   `execution-report.js`'s `verify_structural` gate requires every recorded
   check to pass. This run's change set touched `CHANGELOG.md` and
   `tests/README.md` — whose exclusion from checks is the TARGET REPO'S OWN
   convention (its pre-commit config excludes `.md` everywhere) — so attempt 1
   verified 5/7 and the job quarantined despite grader 4/4 and clean consensus.
   The #103 run missed this only because chance let its verifier not emit
   markdown check entries. Fix (spec-only; frozen scripts untouched, parity
   preserved): a file with no applicable checker is NOT a check — no boolean
   entry; it is listed in `phase_log.md` under "no applicable syntax checker"
   with one line of reasoning. Applied mid-run with operator approval; verify
   attempt 2 (opus, `tier_input: retry-escalation`) verified 5/5 → PROMOTE
   exit 0. Attempt 1 preserved append-only as the record of the defect.
2. **[FIXED — SKILL.md] Ship staging wording contradicted adws-shipper.md.**
   SKILL.md said "stage explicit file paths from `build.files_changed` only"
   in all three mode bullets; adws-shipper.md correctly defines the change set
   as the UNION of `build.files_changed` and the document phase's `docs_delta`.
   This run's documenter added `tests/README.md` (not in build's list); the
   shipper staged the 4-file union per its spec. Following SKILL.md's letter
   would have silently dropped a documented delta from the shipped patch.
   SKILL.md's three bullets now name the union.
3. **[DOCUMENTED — frozen validator] `patch-compose` undercounts the shipped
   set.** Its input contract is `build_output.files_changed`, so its trace
   recorded `files_to_ship: 3` while ship staged 4. The shipper itself flagged
   the inconsistency in `phase_log.md` (good behavior worth keeping). Frozen
   validator; divergence documented here and visible in the evidence tree. A
   future (non-parity) revision could accept the union input.
4. **[OBSERVATION] Runtime path drift in dispatch prompts.** The first
   dispatch used `/home/claude/...` paths; the subagent's runtime resolved
   `$HOME` to `/root`, and the planner had to locate the real evidence root
   itself (it cross-checked `run_manifest.json` before writing — good).
   Orchestrators should resolve absolute physical paths (`readlink -f`) before
   composing dispatch prompts. No spec change; noted for orchestration
   practice.
5. **[OBSERVATION] `verify-evidence-map` `warn` tracks the same defect as
   Finding 1** (skips counted as unpassed → coverage 0.71 → warn on attempt 1;
   1.0 → pass on attempt 2). No script change needed once the verifier stops
   emitting inapplicable checks.
6. **[FOLLOW-UP CANDIDATE for the target repo] marker-scan.sh has the same
   vacuous-failure exposure for CRIT-001.** The reviewer found its `surfaces`
   array (lines ~34-36) is still fed by a raw process substitution over the
   loader — same masking bug #104 fixed for CRIT-002, out of contract scope
   here (non-goal). Suggest filing a follow-up issue on
   `Org-EthereaLogic/agentic-starter-kit`.
7. **[SUGGESTED F-10 ADDENDUM] `tmp_obj_*` unlink warnings during plumbing on
   deletion-restricted mounts.** Writing loose objects emits harmless
   `unable to unlink .git/objects/xx/tmp_obj_*` warnings (objects land
   correctly; only temp-file cleanup fails). Recovery: move the leftover
   `tmp_obj_*` files by explicit path to `_to_delete/`; never wildcard-sweep
   inside `.git/objects`.

## Deviations from spec recorded for this run

- `jobId` allocated as `job_20260718_0002` although the local `artifacts/`
  scan would have yielded `_0001`: that id was consumed by the #103 run earlier
  the same day (recorded in its field-run doc) and reusing it would collide in
  any merged evidence store. "Next free" should be read against the day's
  history, not just the local directory.
- Verify attempt-1 `gate_result` was recorded `pass` before the terminal
  report evaluated `verify_structural` as `fail`. Append-only rules were
  honored: nothing in attempt 1 was rewritten; the retry created `attempt_2`
  and the report was regenerated (derived files may be regenerated). The
  strict gate criterion ("all structural checks pass") should have produced
  `fail` + retry at the gate itself — with the Finding-1 fix, the situation no
  longer arises for inapplicable-checker files.
- adws-verifier.md was amended mid-run (operator-approved) before dispatching
  attempt 2 — the fixed spec is what attempt 2's inlined prompt carried.
- Ship staged the 4-file union per adws-shipper.md despite SKILL.md's
  then-narrower wording (Finding 2; SKILL.md now agrees).
- Grader ran twice (attempt 1 and attempt 2, both opus, both 4/4 fresh
  gradings) because the report reads the LATEST verify attempt; the attempt-2
  grading was performed fresh rather than copying attempt 1's verdict
  (timestamp integrity over convenience).

## Regression evidence (skill repo, after this run's edits)

Spec/doc files only (`.claude/agents/adws-verifier.md`, `adws-pipeline/SKILL.md`,
this document); no bundled script touched — `parity/` fixtures remain frozen and
authoritative. Front-matter of the edited agent file re-validated post-edit.

## Merge record — 2026-07-18 (same day)

The shipped change reached `main` via the operator's local (on-computer) agent:
PR [#118](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/118)
squash-merged as `30cd59c` (closes #104); Finding 6 filed as follow-up issue
[#119](https://github.com/Org-EthereaLogic/agentic-starter-kit/issues/119)
(marker-scan.sh `--list-marker-surfaces` read); PROJECT_DASHBOARD synced via
PR [#120](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/120)
(`main` at `c4efb4a`). Two corrections surfaced in that review, recorded here for
the ledger:

- **Contract over-claim (intake lesson):** this run's contract non-goal read
  "marker-scan.sh already uses the safe pattern" — true only of its `markers=`
  line; the `--list-marker-surfaces` loop was and is exposed (hence #119). The
  shipped comment/CHANGELOG wording inherited the over-claim and was corrected
  during PR review. Intake should verify claims about NEIGHBORING code before
  writing them into the contract, not just claims about the change surface.
- **Evidence-tree disposition:** the target repo keeps evidence trees out of
  version control; `artifacts/job_20260718_0002/` was removed from the operator's
  checkout after merge. The full tree survives as the session artifact
  (`job_20260718_0002-evidence.tgz`) delivered in-conversation, plus this report.
  Target-repo CI was billing-locked at merge time (all checks fail instantly);
  both merges were gated on local validation instead — consistent with how
  #113–#117 merged.
