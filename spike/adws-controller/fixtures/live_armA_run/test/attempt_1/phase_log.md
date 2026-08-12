# Test phase log — job_20260812_0001 / attempt_1

## Inputs

- Task contract: `artifacts/job_20260812_0001/task_contract_snapshot.json`
- Worktree under test: `/home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001`
- Build phase output: `artifacts/job_20260812_0001/build/attempt_1/phase_output.json`
  (`regression_check_ids: []` — this is not a rewind; no `REG-…` ids to carry.)
- `check_specs` (from `criteria-to-checks` v2, 4 ids, matching the 4 frozen acceptance
  criteria 1:1 — `check_specs.length == criteria_count`): CHK001 (behavioral), CHK002
  (unclassified), CHK003 (unclassified), CHK004 (behavioral). Both `unclassified` specs
  were treated identically to the `behavioral` ones — derived, executed, baselined — per
  the dispatch instructions (`unclassified` is a statement about wording, not a verdict).
- `scratch_root`: `/tmp/adws-job_20260812_0001/test/attempt_1/adws-tester/`

## Change set under test

4 files, uncommitted in the worktree: `adws-pipeline/scripts/execution-report.js`,
`adws-pipeline/references/phase-gates.md`, `adws-pipeline/references/artifact-layout.md`,
`adws-pipeline/references/troubleshooting.md`. All inside `policy.allowed_paths`. No
`parity/` or `spike/` file was modified (confirmed: `git status --porcelain -- parity/`
returned empty before and after running the corpus).

## Method

Read the changed script and reference docs directly (`Read` tool) to understand the
diff before writing any check. Did NOT read anything under `spike/` or `docs/` (operator
restriction), and did NOT read the parity fixture design docs — only executed the
corpus runners unmodified, per the operator's explicit instruction that doing so is the
job.

For each of CHK001–CHK004 I wrote one direct-verification Node script
(`<scratch>/run_checks.js`, not part of the change set, kept in scratch) that `require()`s
the target `execution-report.js` and reads the target reference docs, then asserts the
criterion's observable behaviour. The script takes a repo-root argument so the identical
assertions run against two trees:

- **Baseline**: `git archive main | tar -x -C <scratch>/baseline` — a separate,
  disposable copy of `main` materialized under scratch. The pipeline worktree's git state
  was never touched (no stash/checkout/reset/restore).
- **Post-change**: the pipeline worktree itself, read-only.

## CHK001 — vocabulary documents retriable/non-retriable + severity in one table

Check: parse `phase-gates.md`'s `## Failure-reason classes` section; assert it contains a
markdown table with a severity-carrying header, and that every reason in the closed
vocabulary (derived independently by grepping `execution-report.js`, `SKILL.md`,
`task-contract.md` for every literal reason string: `CREDENTIAL_FAILURE`,
`OPERATOR_CANCEL`, `MISSING_UPSTREAM_ARTIFACT`, `PLAN_COHERENCE_BELOW_THRESHOLD`,
`ADVOCATE_DISSENT`, `EVIDENCE_INTEGRITY_BREACH`, `PROTECTED_BRANCH_BLOCKED`,
`PR_DRIFT_SENTINEL_BLOCK`, `STABILITY_BUDGET_EXCEEDED`, `{PHASE}_GATE_FAILURE` family)
appears as a row carrying a retriable/non-retriable value.

- Baseline: RED — `assertion-failed-runtime-present`. The pre-change section is a
  two-bullet list ("No-retry: …", "Quarantine-class: …"), not a table; no lines start
  with `|`. The script ran fine (Node present, file read fine); the feature (a severity
  table) is simply absent.
- Post-change: GREEN — a 10-row table with `Terminal severity` / `Verdict class` /
  `In-run retry` / `Emitted by` columns; all 9 named reasons + the `{PHASE}_GATE_FAILURE`
  family carry a value.
- **Verdict: verified.**

## CHK002 — upheld advocate dissent → distinct non-retriable reason

Check, three parts: (1) `severityForReason('ADVOCATE_DISSENT') === 'non-retriable'`,
distinct from `severityForReason('TEST_GATE_FAILURE')`/`('REVIEW_GATE_FAILURE') ===
'retriable'`; (2) `buildReport()` against a synthetic `run_manifest.json`
(`final_status:'failed', failure_reason:'ADVOCATE_DISSENT'`) records
`report.failure_reason_severity === 'non-retriable'`, distinct from the same run with
`failure_reason:'TEST_GATE_FAILURE'`; (3) `phase-gates.md`'s Consensus rules 2/5 and the
new table explicitly state ADVOCATE_DISSENT `MUST NOT be recorded as
REVIEW_GATE_FAILURE or TEST_GATE_FAILURE`.

- Baseline: RED — `assertion-failed-runtime-present`. `severityForReason` does not exist
  pre-change (`typeof mod.severityForReason !== 'function'`), so
  `report.failure_reason_severity` is `undefined` for both scenarios (not distinct), and
  the "MUST NOT be recorded as…" sentence is absent from `phase-gates.md`. The module
  still loaded and ran fine — this is a real, present-runtime assertion failure, not a
  collection error.

  Note: `ADVOCATE_DISSENT` itself was ALREADY a member of `NO_RETRY_REASONS` /
  `QUARANTINE_REASONS` before this change (this diff only adds
  `EVIDENCE_INTEGRITY_BREACH` to those sets) — so the underlying enum classification was
  not new. What this change adds, and what the check is falsifiable on, is (a) the
  queryable `severityForReason()`/`failure_reason_severity` classification surface itself,
  and (b) the explicit "MUST NOT be recorded as the blanket reason" documentation rule.
  Both are genuinely new and both flip red→green.
- Post-change: GREEN on all three parts.
- **Verdict: verified.**

## CHK003 — evidence integrity breach → distinct non-retriable reason

Same three-part structure, for `EVIDENCE_INTEGRITY_BREACH` (a brand-new reason string —
unlike CHK002, this one did not exist in either Set pre-change at all).

- Baseline: RED — `assertion-failed-runtime-present`. `NO_RETRY_REASONS` /
  `QUARANTINE_REASONS` do not contain the string, `severityForReason` does not exist, and
  neither `phase-gates.md` nor `artifact-layout.md` mentions the string at all.
- Post-change: GREEN — both sets contain it, `severityForReason` returns
  `'non-retriable'` (distinct from `'retriable'` for `BUILD_GATE_FAILURE`),
  `buildReport()` confirms it in a synthetic report, and both docs state it is the
  terminal reason for the `skills_clean` unreadable-evidence / trace-mismatch breach and
  is never recorded as `{PHASE}_GATE_FAILURE`.
- **Verdict: verified.**
- One iteration note: the first cut of the doc-side regex for this check was too narrow
  (window too short to span the table cell's prose) and produced a false FAIL against the
  post-change worktree; widened the window and added a second acceptable phrasing (rule
  (iii)'s "terminates on EVIDENCE_INTEGRITY_BREACH, never on {PHASE}_GATE_FAILURE"
  sentence) before recording the result below. Re-ran both baseline and post-change after
  the fix; baseline result was unaffected (still RED for the same reasons).

## CHK004 — severity sourced, not re-derived

Two checks recorded under this id.

**(a) Code + doc sourcing check.** `severityForReason(r)` confirmed `'non-retriable'` for
every `r` in `NO_RETRY_REASONS ∪ QUARANTINE_REASONS` and `'retriable'` for a sample
outside it (`BUILD_GATE_FAILURE`, `TEST_GATE_FAILURE`, `PROTECTED_BRANCH_BLOCKED`,
`PR_DRIFT_SENTINEL_BLOCK`, `STABILITY_BUDGET_EXCEEDED`, an unknown string), `null` for
null/undefined/empty. `buildReport().report.failure_reason_severity` confirmed to equal
`severityForReason(failure_reason)` exactly across 4 synthetic fixtures, and the
Markdown render carries a matching `- **Failure reason severity:**` line in every case.
`phase-gates.md`'s new Sourcing rule (i) and `artifact-layout.md` both state the value is
sourced from `severityForReason()` and never re-derived from gate `detail`/
`decision_reason` prose.

- Baseline: RED — `assertion-failed-runtime-present`. `severityForReason` and the
  `failure_reason_severity` field do not exist pre-change; the sourcing-rule sentences
  are absent from both docs.
- Post-change: GREEN.
- **Verdict: verified.**

**(b) Constraint check — parity fixture corpus (executed unmodified).** Ran
`node parity/execution-report-fixtures/run-tests.js` (the repo's dedicated
execution-report parity harness — 25 fixture jobs + 1 CLI-error case) unmodified against
the changed script, per the operator's instruction that executing the corpus unmodified
is the job, and that I must not read the fixture *design* docs nor write anything under
`parity/` (blocked_path). Also ran `parity/run-parity.js` (the unrelated validator-port
parity harness) unmodified as a broader regression sanity check.

- Baseline (`main`, whole-repo `git archive` copy): `node
  parity/execution-report-fixtures/run-tests.js` → exit 0, 25/25 PASS.
- Post-change (worktree): exit 1, 25 top-level FAIL lines — but every one of those 25 is
  the corpus's own hardcoded `schema_version === '1.4.0'` literal assertion
  (`grep '^  FAIL' | grep -v schema_version` → 0 matches). Every decision, `warn_flag`,
  `exit_code`, `expectGate`, `expectWarning`, and both determinism re-run assertions still
  pass unchanged. This directly matches the contract's stated constraint — "The parity
  fixture corpus must keep scoring the same decision and exit code" — which does not
  mention `schema_version`. The literal's staleness is the expected, foreseen consequence
  of the additive `SCHEMA_VERSION` bump (`1.4.0` → `1.5.0`, documented in the script's own
  version-history comment); fixing that literal would require writing under `parity/`,
  which is out of `allowed_paths` for this job.
- `parity/run-parity.js`: 109/109 fixtures identical, 0 failures — confirms no incidental
  regression outside `execution-report.js`.
- **Falsifiability:** this check is NOT falsifiable in the SC-3 A1/A2 sense — the baseline
  (narrowly: "decision/exit_code assertions all pass") was already green pre-change,
  because it is a preserve-existing-behaviour constraint check, not a new-capability
  check. Per the rule ("a check that passes pre-change is NOT falsifiable → gate_weak,
  never a pass"), this is recorded `gate_weak` even though the constraint itself is
  satisfied and the corpus's only red is a documented, out-of-scope literal.
  **This does not weaken CHK004's primary (a) row above**, which IS falsifiable and
  verified; (b) is supplementary regression evidence for the contract's explicit
  parity-preservation constraint, attached to CHK004 because it is the closest of the
  four criteria in subject matter (additive-only sourcing change).
- **Verdict: gate_weak.** Classification: null (not a fail).

## Coverage

All 4 emitted `check_specs` ids (CHK001, CHK002, CHK003, CHK004) appear in
`phase_output.json.checks` — CHK004 appears twice (two checks for one criterion, per the
allowed "one id, several checks" rule). Every criterion is falsifiable and verified
except the supplementary parity-corpus row, which is honestly recorded `gate_weak` for
the reason above.

## No rewind / no regression_check_ids to carry

`build/attempt_1/phase_output.json.regression_check_ids` is `[]` — this job is a forward
run, not a repair. No `REG-…` id or repro corpus applies.

## Findings / anomalies (report-only — not code changes)

None found that constitute a prompt-injection or embedded-directive attempt in the
repository content read during this phase. All command output captured is synthetic
(scratch fixtures I authored) or the corpus's own deterministic PASS/FAIL text; nothing
resembling a credential/secret was observed, so no redaction was necessary.
