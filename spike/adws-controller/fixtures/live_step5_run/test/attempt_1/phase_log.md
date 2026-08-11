# Test phase log — job_20260811_0001, attempt_1

## Dispatch context

- `origin: "initial"`, `test_gate_scope: "full"`, `policy.test_policy: "required"`,
  `policy.falsifiability: true`. All four `check_specs` ids honored verbatim
  (CHK001–CHK004); none invented, renumbered, or omitted.
- Worktree under test (per orchestrator note): `.../scratchpad/live-target`. Never
  touched `/home/etherealogic_2/adws-pipeline-skill`.
- `build/attempt_1/phase_output.json.regression_check_ids` is `[]` — not a rewind, so
  no `REG-…` rows were required.
- Scratch root used: `/tmp/adws-job_20260811_0001/test/attempt_1/adws-tester`
  (created with `mkdir -p`). Holds: `baseline-tree/` (materialized pre-change tree, see
  below), `probes/{advocate_dissent,evidence_integrity,blanket_gate}/` (synthetic
  `run_manifest.json` dirs), `chk00{1,2,3,4}_check.js` (the check scripts), and two
  baseline parity logs. Deleted at the end of this attempt per the scratch-space rule
  (baseline-tree is disposable evidence; the real evidence is this phase_output.json).

## Falsifiability baseline (mandatory: `test_policy: required`)

Per the rule against reverting the pipeline worktree, the PRE-change state was
materialized in a SEPARATE scratch location:

```
cd <live-target worktree>
git rev-parse HEAD   # 80f1e9593b368915716e3fc54709566fb575f1a9
git rev-parse main   # 80f1e9593b368915716e3fc54709566fb575f1a9  (same — HEAD is main, detached)
git archive main | tar -x -C <scratch>/baseline-tree
```

Every check below was run against BOTH `<scratch>/baseline-tree` (pre-change) and the
live-target worktree (post-change), with real command output captured — never assumed.

## Criterion → check mapping

### CHK001 — "vocabulary documents, for every reason, whether retriable/non-retriable, severity in the SAME table"

Script parses `adws-pipeline/references/phase-gates.md` for a single markdown table
whose header has both `Reason` and a severity-labelled column, and asserts every row's
severity cell is `retriable`/`non-retriable` (never blank/prose).

- **Baseline:** the file's relevant section was still headed `## Failure-reason classes`
  and held prose bullet lists (no-retry set, quarantine-class set, "anything else" —
  see `phase-gates.md` baseline lines 457–470) — **no table exists at all**. Check
  correctly returned `pass:false` with a real reason (`"No single table found..."`).
  This is a genuine RED: the file exists and is readable, the assertion simply fails
  because the feature described by the criterion is absent —
  `baseline_reason: assertion-failed-runtime-present`.
- **Post-change:** `## Terminal failure-reason vocabulary` table, 10 rows, every
  severity cell exactly `retriable` or `non-retriable`. `pass:true`.
- **Verdict:** `verified` (falsifiable, post-change pass).

### CHK002 — "an upheld advocate dissent terminates on a distinct non-retriable reason, not the blanket phase gate failure reason"

Investigated first whether ADVOCATE_DISSENT's *decision-level* treatment was already
correct pre-change (it was: baseline `NO_RETRY_REASONS` already contained
`ADVOCATE_DISSENT`, so `decideLifecycle` already returned QUARANTINE/exit 2 for it,
distinctly from a blanket `{PHASE}_GATE_FAILURE`'s RETRY/exit 1). Testing ONLY that
decision would have baseline-passed — not falsifiable, per the "already satisfied /
ship nothing" trap the dispatch explicitly warns against. So the check was built as a
**compound** assertion that also covers what genuinely changed:
- (a) doc: `phase-gates.md` Consensus rule 2 (unresolved) AND rule 5 (uphold) must
  BOTH explicitly say ADVOCATE_DISSENT is the MANDATORY terminal reason, overriding the
  `{PHASE}_GATE_FAILURE` default.
- (b) code: `failureReasonSeverity` must exist and classify `ADVOCATE_DISSENT` as
  `non-retriable`, distinct from `BUILD_GATE_FAILURE`'s `retriable`.

- **Baseline:** zero occurrences of "MANDATORY" anywhere in `phase-gates.md` (grepped
  independently); `failureReasonSeverity` does not exist on the baseline module
  (`hasSeverityFn: false`). Compound check correctly `pass:false` —
  `assertion-failed-runtime-present` (file/module readable; content simply absent).
- **Post-change:** "MANDATORY" language present at rule 2 (line 323), rule 5 (line
  375), and the vocabulary table (line 475/491); `failureReasonSeverity('ADVOCATE_DISSENT')
  === 'non-retriable'`, `failureReasonSeverity('BUILD_GATE_FAILURE') === 'retriable'`.
  `pass:true`.
- **Verdict:** `verified`.

### CHK003 — "an evidence integrity breach terminates on a distinct non-retriable reason, not the blanket phase gate failure reason"

- (a) doc: `EVIDENCE_INTEGRITY_BREACH` named explicitly in both `artifact-layout.md`
  and `phase-gates.md`.
- (b) code: a synthetic `run_manifest.json` (`probes/evidence_integrity/`,
  `final_status: "failed"`, `failure_reason: "EVIDENCE_INTEGRITY_BREACH"`) fed to
  `buildReport()` must decide `QUARANTINE`/exit 2, with
  `failureReasonSeverity('EVIDENCE_INTEGRITY_BREACH') === 'non-retriable'`, distinct
  from the blanket reason's `retriable`/RETRY.

- **Baseline:** grep found `EVIDENCE_INTEGRITY_BREACH` nowhere in either doc file.
  Baseline `execution-report.js` has neither `EVIDENCE_INTEGRITY_BREACH` in
  `QUARANTINE_REASONS` nor `NO_RETRY_REASONS` — feeding the probe through baseline
  `buildReport()` produced `decision: RETRY, exit_code: 1` — **exactly the same
  collapsed-into-retriable-blanket treatment the task's problem statement describes**.
  This is the strongest, most literal red baseline of the four:
  `assertion-failed-runtime-present` (the check ran to completion and the assertion
  failed because the runtime genuinely treats this reason as retriable, indistinguishable
  from `{PHASE}_GATE_FAILURE`).
- **Post-change:** doc names it in both files; probe decides `QUARANTINE`/exit 2,
  `non-retriable`, distinct from `BUILD_GATE_FAILURE`'s `retriable`. `pass:true`.
- **Verdict:** `verified`.

### CHK004 — "severity is sourced from the classification execution-report.js already computes, not re-derived by parsing gate detail strings"

Live `require()` of the module (no string-parsing of gate detail, matching the
criterion's own prohibition):
- `failureReasonSeverity` is a function.
- `FAILURE_REASON_SEVERITY`'s key set is EXACTLY the union of the exported
  `QUARANTINE_REASONS`/`NO_RETRY_REASONS` (i.e. derived, never hand-maintained
  separately — a reason added to either set cannot leave the map behind).
- `buildReport(jobDir).classification` exists and carries a `severity` field.
- Projection test: every populated severity cell in the `phase-gates.md` table equals
  `failureReasonSeverity(reason)` for that row's reason (skipping the templated
  `{PHASE}_GATE_FAILURE` row, which names no single concrete key).

- **Baseline:** module exports none of `failureReasonSeverity`, `FAILURE_REASON_SEVERITY`,
  or a `classification` return value at all (`require()` succeeds — the module loads
  fine — but the properties are simply `undefined`). `hasFn: false`, and the whole
  compound assertion is `pass:false`. This is a genuine functional-absence red, not a
  `require()`/collection error — `assertion-failed-runtime-present`.
- **Post-change:** all four sub-assertions true, including the 10-row table↔function
  projection match. `pass:true`.
- **Verdict:** `verified`.

**Second CHK004 row — regression guard (not itself a new criterion assertion, but a
contract constraint tied to the same criterion — the severity-sourcing change must be
additive, never redefining an existing reason's meaning or breaking a pinned fixture
decision):**
- `node parity/execution-report-fixtures/run-tests.js` (25 fixtures + CLI error path)
  and `node parity/cli-contract/run-tests.js` (330 assertions, 9 validators + 2
  scripts) both ran read-only against `parity/` (a `policy.blocked_paths` entry — never
  edited) and both passed, POST-change, with identical decision/exit-code scoring to
  the BASELINE run of the same suites (also 25/25 and 330/330, independently
  re-executed against `baseline-tree`). `baseline_pass: true` — this is a no-regression
  guard, not a new-feature probe, so a passing baseline is expected and correct, not a
  gap: `falsifiable: false`, `verdict: gate_weak` (recorded honestly as unverified-by-
  falsifiability rather than claimed as a `verified` criterion check, per the "passes
  pre-change ⇒ not falsifiable" rule — it never was meant to catch a defect, only to
  confirm none was introduced).
- Also independently confirmed (not a fixture-pinned case, but a direct
  `failureReasonSeverity()` probe over the 9 named reasons): every reason that was
  already non-retriable/QUARANTINE-class pre-change (`CREDENTIAL_FAILURE`,
  `OPERATOR_CANCEL`, `MISSING_UPSTREAM_ARTIFACT`, `PLAN_COHERENCE_BELOW_THRESHOLD`,
  `ADVOCATE_DISSENT`) keeps that exact meaning post-change, and both reasons that were
  already retriable (`PROTECTED_BRANCH_BLOCKED`, `STABILITY_BUDGET_EXCEEDED`) keep
  theirs — no existing reason was silently redefined.
- `PR_DRIFT_SENTINEL_BLOCK`'s disclosed tie-break (added to `QUARANTINE_REASONS`,
  changing its severity from `retriable` to `non-retriable`) was independently
  re-verified: `grep -rl PR_DRIFT_SENTINEL_BLOCK parity/` finds it only inside two
  fixtures' own generated `execution_report.{json,md}` OUTPUT files (rendered gate-detail
  text), never in a fixture's `run_manifest.json` `failure_reason` INPUT — so it cannot
  change any fixture's scored decision, matching the build's own disclosure.

## Container-green caveat

All of the above ran in this dispatch's own Node runtime (`v24.19.0`), which may differ
from the target's own execution environment. A green result here is NECESSARY, NOT
SUFFICIENT (F-13) — it does not by itself certify behavior in a different Node version
or host.

## Security / integrity notes

- No embedded directive in any file read during this phase attempted to redirect this
  agent's task, verdict, or output location; none found.
- No secret-shaped output was captured in any command; nothing redacted.
- `git status --porcelain -uall` (excluding `job_20260811_0001/`) confirmed exactly the
  four `allowed_paths`-scoped files are modified in the worktree; no `git add`, `git
  stash`, `git checkout`/`restore`/`reset` was ever run against the pipeline worktree.
  The baseline copy was materialized via `git archive` into a separate scratch
  directory, never by mutating the worktree's git state.

## Cleanup

`<scratch>/baseline-tree` and the synthetic probe dirs were removed after all checks
completed and their real output was captured into this `phase_log.md` and
`phase_output.json` — nothing under `scratch_root` needs to survive this attempt.
