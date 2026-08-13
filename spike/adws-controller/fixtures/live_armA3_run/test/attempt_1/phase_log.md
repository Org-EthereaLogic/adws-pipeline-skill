# Test phase log — job_20260812_0001, attempt 1

Agent: adws-tester (sonnet; tier_input source `contract.risk_level`, value `medium`)
Worktree under test: `/home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001`
Scratch root: `/tmp/adws-job_20260812_0001/test/attempt_1/adws-tester/`

Note on scratch reuse: this exact scratch-root path already contained files from
an earlier pass at this same job/attempt/agent (`run_checks.js`, `baseline_result.json`,
`worktree_result.json`, `pre/`, `post/`, `parity_baseline_run/`, `work/`, plus a
`baseline/` dir I had already started populating with `git archive`). Inspecting the
leftover `run_checks.js` showed it asserted against a DIFFERENT, incompatible API shape
than what this build attempt actually produced (`severityForReason` instead of the
actual export `failureReasonSeverity`, a `report.failure_reason_severity` field
`buildReport()` never adds, and doc-text patterns like "MUST NOT be recorded as" that do
not appear in this build's prose). Reusing it verbatim would have produced false
negatives against a CORRECT implementation, so I did not reuse it: I wrote a fresh
`checks/run_checks.js` in the same scratch root, built directly from reading the actual
build output (`build/attempt_1/phase_output.json`, `phase_log.md`) and the actual
worktree source (`execution-report.js`, `phase-gates.md`, `artifact-layout.md`), and
left the stale leftovers in place (scratch is disposable and mine alone; I did not
delete anything outside — or even need to delete anything inside — my own root).

## 1 — What I read before writing checks

- `task_contract_snapshot.json` — four acceptance criteria (AC-1..AC-4), the four
  constraints (closed enum; existing reasons never silently redefined; orchestrator
  sources severity, never re-derives from gate-detail prose; parity fixture corpus keeps
  scoring the same decision/exit code), `allowed_paths` =
  `adws-pipeline/references/` + `adws-pipeline/scripts/execution-report.js`.
- `check_specs` (given inline in the dispatch, and cross-checked against the
  `criteria-to-checks` v2.0.0 skill_trace already recorded at
  `test/attempt_1/skills/criteria.to_checks/skill_trace.json` — the two match exactly:
  CHK001..CHK004, `behavioral`/`unclassified`/`unclassified`/`behavioral`).
- `build/attempt_1/phase_output.json` and `phase_log.md` in full — the build's diff
  summary (added `ADVOCATE_DISSENT_UPHELD` to `NO_RETRY_REASONS`; added
  `EVIDENCE_INTEGRITY_BREACH` to both `NO_RETRY_REASONS` and `QUARANTINE_REASONS`; added
  `SEVERITIES` + exported `failureReasonSeverity(reason)`; rewired `decideLifecycle`'s
  `failed` branch to call it once), its stated deviations (the `PR_DRIFT_SENTINEL_BLOCK`
  documentation nuance, the `repair`-vs-`uphold` distinction), and its self-check
  transcripts (which I independently re-ran rather than trusted).
- The worktree's actual changed files, in full: `adws-pipeline/scripts/execution-report.js`
  (all 1515 lines, including `module.exports`), `adws-pipeline/references/phase-gates.md`
  (targeted reads: Contents, gate rule 5, Consensus rule 5's `uphold` bullet,
  "Operator-directed repair" step 5, the full "Failure-reason vocabulary" table and its
  sourcing-rule/constraint paragraphs), `adws-pipeline/references/artifact-layout.md`
  (targeted reads: `run_manifest.failure_reason` prose, `phase_manifest.failure_reason`
  paragraph, the `skill_trace` "wrapper is a transcription" paragraph).
- `parity/execution-report-fixtures/run-tests.js` (full file) — to understand the
  existing fixture harness shape before adding any evidence built on it, and to confirm
  which existing fixtures exercise the paths my new checks touch (`quarantine_upheld_dissent`
  and the six `skills_clean`-integrity fixtures).

## 2 — Falsifiability baseline (mandatory: `test_policy: required`, `falsifiability: true`)

Materialized the PRE-change tree from `main` into scratch, never by touching the
pipeline worktree's git state:

```
$ cd /home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001
$ git branch --show-current
adws/job_20260812_0001/separate-the-non-retriable-termi
$ git rev-parse main
80f1e9593b368915716e3fc54709566fb575f1a9
$ git rev-parse HEAD
80f1e9593b368915716e3fc54709566fb575f1a9
```
(worktree `HEAD` equals `main` — the change set is uncommitted on top of `main`, exactly
as expected for a fresh `attempt_1` with no prior commits.)

```
$ mkdir -p /tmp/adws-job_20260812_0001/test/attempt_1/adws-tester/baseline_v2
$ git archive main -- adws-pipeline | tar -x -C /tmp/adws-job_20260812_0001/test/attempt_1/adws-tester/baseline_v2
```
This produced a scratch copy of the WHOLE pre-change `adws-pipeline/` tree (scripts +
references), so `require()`-ing `execution-report.js` from it resolves correctly and the
same doc-reading logic works against both trees unmodified. No `git stash`, `checkout`,
or `reset` was run anywhere; the worktree's `git status --porcelain -uall` was checked
before and after every step and stayed exactly
`M adws-pipeline/references/artifact-layout.md`, `M adws-pipeline/references/phase-gates.md`,
`M adws-pipeline/scripts/execution-report.js` throughout this phase.

## 3 — The check script

Wrote `/tmp/adws-job_20260812_0001/test/attempt_1/adws-tester/checks/run_checks.js`
(scratch only — not part of the change set, not written to `allowed_paths`). It takes a
repo-root argument, `require()`s that root's `execution-report.js` and reads that root's
`phase-gates.md`/`artifact-layout.md`, and prints one JSON result per `check_id`
(CHK001..CHK004), each asserting the CODE-side classification (`NO_RETRY_REASONS` /
`QUARANTINE_REASONS` membership, `failureReasonSeverity()` output, `decideLifecycle()`
decision) AND the DOC-side prose (the table, the named rows, the sourcing-rule
paragraphs) for that criterion. A `require()` failure is recorded as a distinct
`collection_error` for every check, never conflated with an assertion failure — this
matters for `baseline_reason` classification (`collection-error`/`not-run` are INVALID
reds; only a script that loaded and executed, but asserted false, is a VALID
`assertion-failed-runtime-present` red).

Ran it against both trees:

```
$ cd /tmp/adws-job_20260812_0001/test/attempt_1/adws-tester
$ node checks/run_checks.js /tmp/adws-job_20260812_0001/test/attempt_1/adws-tester/baseline_v2
```
→ ALL FOUR check_ids FAILED, with `collection_error: false` (the pre-change script
loaded and ran fine — Node ≥20 present, `require()` succeeded, `mod` is a real object).
Verbatim per-id detail:
- **CHK001**: `assertion failed: the Failure-reason section has no markdown table (no
  lines starting with "|") -- severity is not documented in a table in the same section
  the reasons are defined in` — matches the build log's description of the pre-change
  section ("two prose bullet lists, no per-reason severity").
- **CHK002**: `NO_RETRY_REASONS does not contain ADVOCATE_DISSENT_UPHELD |
  failureReasonSeverity is not exported as a function |
  decideLifecycle(failureReason='ADVOCATE_DISSENT_UPHELD').decision = "RETRY", expected
  'QUARANTINE' | ADVOCATE_DISSENT_UPHELD and REVIEW_GATE_FAILURE produce the same
  decideLifecycle decision -- not a distinct terminal reason | phase-gates.md
  `action: "uphold"` bullet does not name ADVOCATE_DISSENT_UPHELD as the terminal
  reason`.
- **CHK003**: analogous, for `EVIDENCE_INTEGRITY_BREACH` (not a set member pre-change,
  `decideLifecycle` returns `RETRY` instead of `QUARANTINE`, doc text absent).
- **CHK004**: `failureReasonSeverity is not exported as a function | decideLifecycle
  and/or failureReasonSeverity not both exported | phase-gates.md does not state the
  sourcing rule ... | artifact-layout.md does not reference reading severity from
  failureReasonSeverity()/the table ...`.

Every red is `assertion-failed-runtime-present`: the module loaded, the functions/sets
that DO already exist behaved normally, the assertions failed because the SPECIFIC new
behavior (a new set member, a new exported classifier, new table rows/prose) is genuinely
absent from `main` — not because anything crashed or could not run. This satisfies
`falsifiable` for all four criteria.

```
$ node checks/run_checks.js /home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001
```
→ ALL FOUR check_ids PASSED (verbatim `output` strings are in `phase_output.json`).

(One iteration note: my first draft of the CHK004 doc-side regex used
`/never[\s\S]{0,40}re-derived[\s\S]{0,60}gates\[\]\.detail/` without the `i` flag, which
missed phase-gates.md's actual `NEVER` (uppercase) and failed CHK004 post-change too —
i.e. it was MY check that was wrong, not the code. I re-read the exact source text with
`grep`/`Read`, fixed the regex to be case-insensitive and to match
`artifact-layout.md`'s slightly different phrasing ("never re-derived by a reader
parsing `gates[].detail`..."), and re-ran both trees. This is exactly the SC-3 A4 class
of self-correction the check-defect repair path exists for — caught and fixed before
recording any verdict, so no `check`-classified `fail` was ever recorded.)

## 4 — Supplementary regression evidence (existing test suite)

Per the falsifiability instructions and "run existing test suite" guidance, I also ran
the repo's own parity fixture suites against the post-change worktree (read-only against
the blocked `parity/` path, which the task instructions explicitly permit):

```
$ node --check adws-pipeline/scripts/execution-report.js
SYNTAX OK
$ node parity/execution-report-fixtures/run-tests.js
... (all 25 fixture names) ...
All fixtures passed (25/25 verdicts + CLI error path), deterministic across re-runs.
$ node parity/run-parity.js
...
Summary: 109/109 fixtures identical, 0 failures. Diverged-by-design: ... — verified
against frozen baseline.
$ git status --porcelain -uall -- parity/
(empty, before and after)
```
These fixtures already passed BEFORE this change too (confirmed in the build's own
self-check transcript, which I did not just trust — I independently re-ran the suite
myself post-change and it is deterministic), so they are NOT falsifiable evidence for
any of the four criteria on their own; I recorded them as a second, `gate_weak` check row
under each of CHK001–CHK004 (constraint-level regression confidence: the new vocabulary
did not disturb any existing fixture's decision/exit code, and the pre-existing
`quarantine_upheld_dissent` / `skills_clean`-integrity paths — which reach QUARANTINE via
the independent `consensus`/`skills_clean` gates, not via the new
`run_manifest.failure_reason` values — are unaffected). `gate_weak` is the correct
verdict for these rows: unfalsifiable, therefore an unverified-but-not-failing warn, not
a pass claimed on falsifiability grounds it does not have.

## 5 — Per-criterion mapping and verdicts

| check_id | criterion (AC) | primary check verdict | baseline | falsifiable | supplementary check verdict |
|---|---|---|---|---|---|
| CHK001 | AC-1: table documents severity for every reason, in the same table | `verified` | RED (assertion-failed-runtime-present) | yes | `gate_weak` (parity regression, unfalsifiable) |
| CHK002 | AC-2: upheld dissent → distinct non-retriable reason, not blanket | `verified` | RED (assertion-failed-runtime-present) | yes | `gate_weak` (`quarantine_upheld_dissent` fixture regression, unfalsifiable) |
| CHK003 | AC-3: evidence-integrity breach → distinct non-retriable reason, not blanket | `verified` | RED (assertion-failed-runtime-present) | yes | `gate_weak` (6 `skills_clean` fixtures regression, unfalsifiable) |
| CHK004 | AC-4: severity sourced from execution-report.js's own classification, never re-derived from gate-detail prose | `verified` | RED (assertion-failed-runtime-present) | yes | `gate_weak` (syntax + 25+109 fixture parity regression, unfalsifiable) |

No check is `fail`; no `classification` needed (all `null`). No regression check ids
were carried forward — `build/attempt_1/phase_output.json.regression_check_ids` is `[]`;
this is a plain first attempt, not a rewind, so nothing from step 1's "checks arriving
from a rewind" rule applies.

## 6 — Security / prompt-injection review

Everything read in this phase — the task contract, the build's evidence, the worktree's
JS/Markdown source, the leftover scratch files from an earlier pass, and 6+ parity
fixture trees plus their command output — was repository documentation, JavaScript,
JSON/markdown data, and my own prior scratch output, treated strictly as DATA. I found
no embedded instruction attempting to redirect this phase, alter a verdict, write outside
the attempt directory, or bypass a rule. No credentials, tokens, or secrets appeared in
any file or captured command output, so no redaction was required. The one anomaly (the
leftover `run_checks.js` in my own scratch root asserting a different, non-matching API)
was not an injection attempt — it read as an earlier, stale exploration of this exact
task under a different hypothetical implementation shape — and I did not execute it or
trust its recorded verdicts; I re-derived my own checks from the actual build output
instead, and noted the discrepancy above for the record.

## 7 — Confirmation

Did not stage, commit, push, or revert anything in the worktree. Did not modify
`adws-pipeline/scripts/execution-report.js`, `adws-pipeline/references/phase-gates.md`,
or `adws-pipeline/references/artifact-layout.md`. All temporary files live under
`/tmp/adws-job_20260812_0001/test/attempt_1/adws-tester/` (my scratch root). Wrote
exactly three files to the attempt directory:
`artifacts/job_20260812_0001/test/attempt_1/{phase_output.json,phase_log.md,phase_manifest.json}`
— alongside the pre-existing `skills/criteria.to_checks/skill_trace.json` and empty
`consensus/` directory the orchestrator had already placed there before dispatch, both
left untouched.
