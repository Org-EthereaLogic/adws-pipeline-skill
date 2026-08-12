# Build phase log — job_20260812_0001, attempt 1

Agent: adws-builder (Architect, build phase). Model tier: sonnet (tier_input:
`contract.risk_level` = medium). Task: `tsk_20260811_0002` — separate the non-retriable
terminal failure reasons from the retriable ones. This is a first attempt: no
`corrections.json`, no rewind, nothing to read from a prior build attempt.

Scratch root used (all temporary files, nothing else touched):
`/tmp/adws-job_20260812_0001/build/attempt_1/adws-builder/`
Code changes were made **only** in the worktree
`/home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001`. The only writes outside
scratch and the worktree are the three evidence files in this attempt directory. No commit,
no push, no staging (`git add`) was performed.

## Operator read restriction

The dispatch forbade reading anything under `spike/` or `docs/` in either tree. I did not
need to read either: everything the plan's four file_change_proposal entries touch lives
under `adws-pipeline/references/`, `adws-pipeline/scripts/`, and `parity/` (the last read
only, per the contract — never written). No blocked-read to report.

## What I read before changing anything

- The task contract (`artifacts/job_20260812_0001/task_contract_snapshot.json`) and the
  plan's `phase_output.json` / `phase_log.md` — the plan's grounding (measured baseline,
  exact line ranges, the three findings on the new-file, SCHEMA_VERSION, and the
  PROTECTED_BRANCH_BLOCKED/PR_DRIFT_SENTINEL_BLOCK divergence) is treated as load-bearing,
  not re-derived from scratch.
- The four target files in the WORKTREE as they actually stand today
  (`adws-pipeline/scripts/execution-report.js`, 1465 lines;
  `adws-pipeline/references/phase-gates.md`, 601 lines;
  `adws-pipeline/references/artifact-layout.md`, 473 lines;
  `adws-pipeline/references/validator-inputs.md`, 140 lines) — confirmed every line number
  and function name the plan cites still matches (no drift since planning).
- `parity/execution-report-fixtures/run-tests.js` (25-case CASES array, the
  `schema_version === '1.4.0'` assertion at its `schema_version` check, the fixture-coverage
  harness) and the three specific fixture trees the plan's check_ideas name.

## Baseline measured myself, before writing any code

Rather than trust the plan's baseline claim on faith, I reproduced it. Commands run (from
the primary checkout, `parity/` read-only, nothing written there):

```
node parity/execution-report-fixtures/run-tests.js
```
→ `All fixtures passed (25/25 verdicts + CLI error path), deterministic across re-runs.`
`git status --porcelain parity/` → empty. This is the pre-change control run.

Then, into scratch (`$SCRATCH/baseline/`), I copied three fixture trees and ran the
**pre-change** `execution-report.js` CLI over the copies:

- `quarantine_upheld_dissent/artifacts/job-4e5f6a` → `decision=QUARANTINE exit_code=2`,
  `report.failure_reason: null`, no `terminal_failure_reason`/`failure_severity` keys. The
  only occurrence of `ADVOCATE_DISSENT` anywhere in the report: a substring of the
  `consensus` gate's `detail` string
  (`"… Advocate dissent in review/attempt_1 (operator UPHELD the dissent) — blocks
  promotion (ADVOCATE_DISSENT / AC-4.2): …"`).
- `quarantine_trace_mismatch/artifacts/job-9b2e14` → same shape: `QUARANTINE/2`,
  `failure_reason: null`, the breach legible only inside `skills_clean`'s `detail`.
- `quarantine_unreadable_manifest/artifacts/job-unr001` — this one needs its declared
  `chmod: { 'test/attempt_1/consensus/advocate.json': 0o000 }` applied first (git stores
  only the exec bit, so a plain `cp -r` leaves the file readable and the fixture is
  vacuous). Applied `chmod 000` to the scratch copy of that file, ran the CLI, then
  `chmod 644` back. With the chmod applied: `decision=QUARANTINE exit_code=2`,
  `failure_reason: null`, the breach legible only inside `skills_clean`'s `detail`
  (`"EVIDENCE INTEGRITY: 1 evidence file(s) present but unreadable — …"`). Without the
  chmod applied the fixture is vacuous (PROMOTE/0) — confirmed and noted, matches the
  fixture author's own comment about the first cut being vacuous for the same reason.

This exactly reproduced the plan's grounding: for these three conditions there is no
token at all in `run_manifest.failure_reason`, and the only recoverable signal was a
substring of prose — precisely the re-derivation-by-parsing AC-4 forbids.

## Implementation

### `adws-pipeline/scripts/execution-report.js`

1. Added `'EVIDENCE_INTEGRITY_BREACH'` as a new member of `NO_RETRY_REASONS` (comment
   explains why, beside the constant). Did not touch `QUARANTINE_REASONS`,
   `decideLifecycle`, `exitCodeFor`, `DECISIONS`, `GATE_STATUSES`, or any gate key — the
   plan is explicit that only `NO_RETRY_REASONS` gets the new member, and I verified this
   is sufficient: `decideLifecycle({status:'failed', failureReason:'EVIDENCE_INTEGRITY_BREACH',
   gates:[]}).decision === 'QUARANTINE'` (checked directly, see below).
2. Added the exported `TERMINAL_FAILURE_REASON_PRECEDENCE = Object.freeze(['EVIDENCE_INTEGRITY_BREACH', 'ADVOCATE_DISSENT'])`
   constant, right beside the two reason Sets.
3. Added the exported `failureReasonSeverity(reason)` helper immediately after, computed
   strictly as a read of `NO_RETRY_REASONS`/`QUARANTINE_REASONS` — no parallel catalog.
4. `evalConsensus`'s blocking-dissent FAIL branch (the one `blocking.length > 0` returns)
   gained `failure_reason: 'ADVOCATE_DISSENT'`. The Critic-fail FAIL branch directly below
   it was deliberately left untouched (no token of its own, per the plan) — verified this
   stays true after the change (see checks below).
5. `evalSkillsClean`'s two integrity FAIL branches (unreadable-evidence, and
   trace/validator mismatch) each gained `failure_reason: 'EVIDENCE_INTEGRITY_BREACH'`. The
   plain skill-`fail`/`warn`/`unverified` branches further down were left untouched.
6. `buildReport`: computed `terminalFailureReason` by scanning `gates` in
   `TERMINAL_FAILURE_REASON_PRECEDENCE` order for the first gate whose `failure_reason`
   matches, falling back to `run_manifest`'s `failureReason`; computed `failureSeverity =
   failureReasonSeverity(terminalFailureReason)`. Added both as additive top-level report
   fields (`terminal_failure_reason`, `failure_severity`), and added `failure_reason: g.failure_reason || null`
   to each entry of `gates.map(...)`. No existing report key changed shape or meaning.
7. `renderMarkdown`: two new lines next to the existing `**Failure reason:**` line.
8. `module.exports`: added `failureReasonSeverity` and `TERMINAL_FAILURE_REASON_PRECEDENCE`.
   `buildReport`, `generateExecutionReport`, `decideLifecycle`, `exitCodeFor`, `DECISIONS`,
   `GATE_STATUSES`, `PHASE_NAMES`, `NO_RETRY_REASONS`, `QUARANTINE_REASONS`,
   `SCHEMA_VERSION` are all still exported, unchanged.
9. `SCHEMA_VERSION` left at `'1.4.0'`, with a comment placed directly above the constant
   (in the same running commentary block that documents 1.2.0/1.3.0/1.4.0) explaining the
   deferral: `parity/execution-report-fixtures/run-tests.js` pins `'1.4.0'` by exact string
   match and `parity/` is a blocked path for this contract, so the version bump this
   change's own convention would suggest cannot land in the same job as its fixture
   update. Recorded exactly as the plan required, "where a reviewer reads it."

Design calls not fully specified by the plan, made and disclosed here:
- **In-run retry column for `EVIDENCE_INTEGRITY_BREACH`.** The plan established the
  two-axis table shape but this is a brand-new reason with no prior prose to preserve. I
  classified it `no-retry` (terminate immediately) in the phase-gates.md table, by analogy
  to `ADVOCATE_DISSENT` — the closest existing reason: both are discovered by
  `execution-report.js` scanning the whole evidence tree (not by an in-flight per-attempt
  gate check), and both are non-retriable, so treating them identically on the second axis
  keeps the table internally consistent rather than inventing a third pattern for one row.
- **In-run retry column for `STABILITY_BUDGET_EXCEEDED`.** Classified `no-retry`: the
  existing prose already says the entropy gate's COLLAPSE band "halt[s]" the run at phase
  entry, which reads as an immediate stop independent of whatever phase-retry budget
  remains — the same shape as the other no-retry rows, not a budget-exhaustion case.
  Existing text ("RETRY verdict class") for the Verdict/Severity columns was preserved
  unchanged; only the new In-run-retry column required a judgment call.

### `adws-pipeline/references/phase-gates.md`

Replaced the "Failure-reason classes" prose section with "Terminal failure-reason table
(SC-14)": one canonical table (Reason | Severity | In-run retry | Verdict | When recorded)
covering every reason the plan named, plus the reason-selection precedence rule, the
sourcing rule, and the closed-enum restatement. Updated the Contents bullet. Added a
one-clause pointer at the `uphold` bullet and at the consensus "Terminal enforcement"
rule, each pointing at the new table, per the plan.

The `PR_DRIFT_SENTINEL_BLOCK` row states the doc/code divergence as a fact (old prose
called it quarantine-class; the code Sets have never contained it, so it is retriable
today) rather than silently resolving it either direction — per the plan's explicit
instruction not to change routing for this reason.

### `adws-pipeline/references/artifact-layout.md`

Added a `failure_reason` paragraph at the `run_manifest.json` field notes (closed enum,
single authority = the phase-gates.md table, names `EVIDENCE_INTEGRITY_BREACH` and
`ADVOCATE_DISSENT` explicitly, states the sourcing rule). Added an `execution_report.json`
entry under File shapes naming the three new fields and citing rule 8 (undocumented extra
key = schema drift) as the reason this is required, not cosmetic. Updated the Contents
bullet.

### `adws-pipeline/references/validator-inputs.md`

Extended the `execution-report.js` row in the "Non-validator scripts" table and the
"Verdict vocabularies and exit codes" table with the same sourcing rule, at the point an
orchestrator actually looks the script up. No vocabulary in this file changed.

## Verification performed (commands run, from the primary checkout unless noted)

```
node --check adws-pipeline/scripts/execution-report.js
```
→ no output (syntax OK).

```
node parity/execution-report-fixtures/run-tests.js
```
→ (post-change) `PASS fixture coverage — 25 fixture dir(s) ↔ 25 CASES entr(ies)`, all 25
named cases `PASS`, plus `cli_error_missing_dir`, ending
`All fixtures passed (25/25 verdicts + CLI error path), deterministic across re-runs.`
Identical outcome (decision/warn_flag/exit_code/schema_version, per case) to the
pre-change run recorded above.

```
git status --porcelain parity/
```
→ empty, both before and after the fixture run.

```
git status --porcelain   # whole worktree
```
→ exactly the four files listed in `phase_output.json.files_changed`, all `M`, nothing
else — no new file, `parity/` and `spike/` untouched, `adws-pipeline/skill-manifest.json`
untouched.

Direct module checks (`node -e`, `require()`-ing the changed script, never executing a
recorded `command` string from evidence — this was a fresh, self-authored probe against
the module I had just edited):
- `Object.keys(require(...))` → confirms `failureReasonSeverity` and
  `TERMINAL_FAILURE_REASON_PRECEDENCE` are exported alongside every pre-existing export.
- `[...NO_RETRY_REASONS]` → the five original members plus `EVIDENCE_INTEGRITY_BREACH`;
  `[...QUARANTINE_REASONS]` → unchanged (`CREDENTIAL_FAILURE`, `MISSING_UPSTREAM_ARTIFACT`)
  — no existing reason removed or renamed.
- `failureReasonSeverity(r)` for every `r` in the union of both Sets → `'non-retriable'`
  for all six; for `'BUILD_GATE_FAILURE'` and `'PROTECTED_BRANCH_BLOCKED'` →
  `'retriable'`; for `null`/`undefined`/`''` → `null`.
- `decideLifecycle({status:'failed', failureReason:'EVIDENCE_INTEGRITY_BREACH', gates:[]})`
  → `{ decision: 'QUARANTINE', ... }` — a `failed` run carrying the new token is not
  routed to RETRY.

Scratch-copy CLI runs, post-change (same three fixture trees copied fresh into
`$SCRATCH/baseline/`, `job-unr001` re-chmod'd 0o000 on the same file):
- `job-4e5f6a`: `gates.find(g=>g.gate==='consensus').failure_reason === 'ADVOCATE_DISSENT'`,
  `terminal_failure_reason === 'ADVOCATE_DISSENT'`, `failure_severity === 'non-retriable'`,
  `decision === 'QUARANTINE'`, `exit_code === 2` — all match; `terminal_failure_reason`
  does not match `/_GATE_FAILURE$/`.
- `job-9b2e14`: `gates.find(g=>g.gate==='skills_clean').failure_reason ===
  'EVIDENCE_INTEGRITY_BREACH'`, `terminal_failure_reason === 'EVIDENCE_INTEGRITY_BREACH'`,
  `failure_severity === 'non-retriable'`, `decision/exit` unchanged at `QUARANTINE`/`2`.
- `job-unr001` (chmod'd): same three fields, same values, as `job-9b2e14`; `decision/exit`
  unchanged.
- Deleted every `gates[].detail` string and `decision_reason` from the parsed `job-4e5f6a`
  report in memory and re-read `terminal_failure_reason`/`failure_severity` — both still
  present and correct, proving a reader that never touches `detail` gets the same answer
  (AC-4's "not re-derived by parsing" requirement, checked directly rather than assumed).

```
node scripts/local-ci/frontmatter-lint.mjs
```
→ `OK — … 7 reference file(s) all indexed …` — the bidirectional reference index still
passes; no reference file was added, renamed, or removed.

```
node scripts/local-ci/skill-manifest.mjs
```
→ `FAIL (5)` — the manifest is stale, naming exactly the four files this job changed. This
is the exact consequence plan/attempt_1/phase_log.md flagged as an operator decision, not
a defect: `adws-pipeline/skill-manifest.json` is outside `policy.allowed_paths` for this
contract, so it cannot be regenerated inside this job. Recorded here as expected, measured
behavior rather than left as a surprise for the tester.

## Deviations from the plan

None. All four files were modified exactly as `file_change_proposal` described; no file
was created; `parity/`, `spike/`, and `adws-pipeline/skill-manifest.json` were left
untouched; `decideLifecycle`, `exitCodeFor`, `DECISIONS`, `GATE_STATUSES`, and every
existing gate key are byte-identical to before this change.

## Untrusted-content check

Repository prose, fixture JSON, and command output were treated as data throughout,
including the two fixture trees' `dissent` and `detail` text (which read as ordinary
project narrative, not directives). I found no embedded instruction attempting to redirect
this task, alter a verdict, widen the write scope, or bypass a rule. Nothing captured in
this session contained a credential, token, or key, so no redaction was required. No
`command` string from any prior attempt's evidence was executed — the only commands run
were ones I authored myself against files I had just changed.
