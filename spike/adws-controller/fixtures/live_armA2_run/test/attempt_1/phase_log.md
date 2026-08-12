# Test phase log — job_20260812_0001, attempt 1

Agent: adws-tester. Model tier: sonnet (`tier_input.source = contract.risk_level`, value
`medium`). Scratch root used: `/tmp/adws-job_20260812_0001/test/attempt_1/adws-tester/`
(pre-existing files from an earlier/unrelated run were found there at start —
`baseline_parity.txt`, `baseline_result.json`, `run_checks.js`, `worktree_parity.txt`,
`worktree_result.json` — I did not trust or reuse them since their provenance could not be
verified as mine; I created fresh `baseline/`, `pre/`, `post/`, `work/`, `parity_baseline_run/`
subdirectories and left the pre-existing files untouched, per the rule against deleting
anything in scratch that isn't clearly mine to remove).

Operator read restriction observed: no file under `spike/` or `docs/` was read in either
tree. Everything needed to derive and run these checks lives in
`adws-pipeline/scripts/execution-report.js`, `adws-pipeline/references/{phase-gates,
artifact-layout,validator-inputs}.md`, and `parity/execution-report-fixtures/`.

## Change under test

Build attempt_1 (see `build/attempt_1/phase_output.json`) modified exactly the four files
the plan proposed, all inside `policy.allowed_paths`:
`adws-pipeline/scripts/execution-report.js`, `adws-pipeline/references/phase-gates.md`,
`adws-pipeline/references/artifact-layout.md`, `adws-pipeline/references/validator-inputs.md`.
`regression_check_ids` is empty — no rewind-repair check rows were required this attempt.
Confirmed via `git status --porcelain=v2` in the worktree that exactly these four files are
modified and nothing else.

## Criterion -> check mapping (check_specs from criteria-to-checks v2.0.0)

| check_id | check_type | criterion (short) | checks run | verdict |
|---|---|---|---|---|
| CHK001 | behavioral | terminal failure-reason table documents severity per-reason | 1 structural check | verified |
| CHK002 | unclassified | upheld advocate dissent -> distinct non-retriable reason | 1 runtime check | verified |
| CHK003 | unclassified | evidence integrity breach -> distinct non-retriable reason | 2 runtime checks (trace-mismatch + unreadable-file sub-branches) | verified |
| CHK004 | behavioral | severity sourced from execution-report.js's own classification, never re-derived from gate detail prose | 2 checks (export/projection purity + strip-detail-and-still-determined) | verified |

`unclassified` (CHK002, CHK003) was treated as ordinary in-scope work, not a verdict or a
reason to skip — both got a falsifiable pre-change baseline and an executed post-change check
on exactly the same terms as the `behavioral` ones.

## Falsifiability baseline methodology (SC-3 A1/A2, mandatory: test_policy=required,
policy.falsifiability=true)

The pipeline worktree's git state was never touched (no stash/checkout/reset/clean). The
pre-change state was materialized with targeted `git show main:<path>` copies into
`scratch/baseline/` (`execution-report.js`, `phase-gates.md`, `artifact-layout.md`,
`validator-inputs.md`) — `node --check` confirmed the baseline script parses. Fixture data
under test (three `parity/execution-report-fixtures/` job trees) was copied byte-for-byte
into `scratch/pre/` and `scratch/post/` and run there — `parity/` itself was never written
to by any of these copies.

For each behavioral/unclassified check, the SAME check logic ran twice: once against
`scratch/pre/...` with the baseline (pre-change) script, once against
`scratch/post/...` (or directly against the worktree) with the post-change script.

- **CHK001**: baseline `phase-gates.md` (from `main`) has NO `## Terminal failure-reason
  table` section at all — it has `## Failure-reason classes (port of phases.js reason sets)`,
  a two-bullet-list (`No-retry` / `Quarantine-class`) that never states a per-reason
  retriable/non-retriable severity value in the same place the reason is defined, and
  `EVIDENCE_INTEGRITY_BREACH` does not exist there. The checker script
  (`scratch/work/check_reason_table.js`) ran cleanly against this file and correctly reported
  `section_found: false` — a real, informative red, not a crash. `baseline_reason:
  assertion-failed-runtime-present`. Post-change: the section exists with 10 reason rows, all
  10 carrying a `retriable`/`non-retriable` severity cell — `pass: true`.
- **CHK002 / CHK003**: baseline runs against `scratch/pre/...` completed successfully
  (exit 2, QUARANTINE, decision/exit_code identical to post-change — the non-goal "must not
  change the decision or exit-code vocabulary" holds both sides) but produced NO
  `terminal_failure_reason` / `failure_severity` fields at all, and no gate carried a
  `failure_reason` field — the only trace of ADVOCATE_DISSENT / EVIDENCE_INTEGRITY_BREACH was
  a substring inside the free-text `detail` string. Confirmed empirically that this
  `detail`/`decision_reason` wording is IDENTICAL, word for word, between the upheld-dissent
  fixture and an unrelated Critic-fail fixture (`quarantine_critic_fail`) pre-change — i.e.
  the "blanket phase gate failure reason" the acceptance criteria describe is not a metaphor,
  it is a literally shared string across causally distinct terminal failures. This is a valid
  red: the script ran fine and failed the assertion because the field genuinely does not
  exist yet. `baseline_reason: assertion-failed-runtime-present`. Post-change: the specific
  field and value are present, distinct from that shared blanket string.
- **CHK004**: baseline `require()` of the pre-change module has no `failureReasonSeverity` /
  `TERMINAL_FAILURE_REASON_PRECEDENCE` exports at all (`undefined`), and pre-change reports
  never carry `terminal_failure_reason` / `failure_severity`. Ran fine, asserted false for a
  real reason. `baseline_reason: assertion-failed-runtime-present`. Post-change: both exports
  present; `failureReasonSeverity` is a pure projection of `NO_RETRY_REASONS union
  QUARANTINE_REASONS` (every member -> `non-retriable`, `BUILD_GATE_FAILURE` (outside the
  union) -> `retriable`, empty/null/undefined -> `null`); and stripping every `detail` /
  `decision_reason` prose field from three real post-change reports still leaves
  `terminal_failure_reason` / `failure_severity` fully determined — a reader that never reads
  `detail` gets the same answer as one that does.

No check in this run came back `gate_weak` — every criterion's baseline was red for the
right reason (`assertion-failed-runtime-present`), never a pass-before or a `not-run`.

## Contract constraint 4 (parity corpus) — reported separately, not check-specs-scored

Not an acceptance criterion, so it carries no `check_specs` id; the dispatch explicitly asked
for it to be run and reported. Ran `node parity/execution-report-fixtures/run-tests.js`
directly in the pipeline worktree (post-change): `25/25` fixtures plus the CLI-error case
passed, deterministic across the suite's own double-run check, exit code 0.
`git status --porcelain parity/` immediately after: empty (`execution_report.json`/`.md` are
listed in `.gitignore` as derived/overwrite-allowed files; the one fixture that chmods a file
(`quarantine_unreadable_manifest`) reverts the mode in a `finally` block).

For completeness, also ran the identical 25-fixture + CLI-error corpus against the PRE-change
script: copied `parity/execution-report-fixtures/` + `parity/_harness.js` into
`scratch/parity_baseline_run/` (the real `parity/` tree was never edited) and repointed only
that scratch copy's `CLI` constant at `scratch/baseline/execution-report.js`. Result: also
`25/25` + CLI-error case, identical decisions/exit codes. This is expected and correct — a
"must not regress" constraint is supposed to hold both before and after a purely additive
change, so a green baseline here is NOT evidence of a weak check the way it would be for an
acceptance criterion claiming new behavior; recorded `falsifiable: false`,
`baseline_reason: not-applicable-no-regression-invariant` rather than forcing it into the
`gate_weak` bucket, since nothing about this check needed to be a valid pre-change red to be
meaningful.

## Other observations (not gating, not check_specs items)

- The build's own diff summary flags `adws-pipeline/skill-manifest.json` as now stale
  (outside `policy.allowed_paths`, so this job could not touch it) — an operator-facing
  follow-up, not a defect in this change; confirmed consistent with the four-file diff stat.
- `phase-gates.md`'s new table documents one PRE-EXISTING divergence explicitly in prose
  (`PR_DRIFT_SENTINEL_BLOCK` was called "quarantine-class" in the old doc but the code's
  `NO_RETRY_REASONS`/`QUARANTINE_REASONS` Sets never contained it) — called out as a
  "documented divergence, not a routing change" right in the table, not a silent redefinition,
  and outside this job's four acceptance criteria; not scored as a check here.
- No secret/credential material was encountered in any command output; no redaction was
  needed.
- No embedded instruction-injection attempts were found in the files read for this job.

## Result

All four `check_specs` ids (CHK001–CHK004) verified: falsifiable pre-change baseline (red for
the right reason) and a passing post-change run for every one of them. The parity fixture
corpus constraint also holds, and `parity/` was left clean. `gate_result` is left `null` in
`phase_manifest.json` — the gate decision belongs to the orchestrator.
