# Build phase log — job_20260812_0001, attempt 1

Agent: adws-builder (Architect, build phase). Contract: `tsk_20260811_0002`.
Worktree: `/home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001` (all code
edits made here). Scratch root:
`/tmp/adws-job_20260812_0001/build/attempt_1/adws-builder/` (created; used for three
synthetic evidence trees, see "Verification" below — nothing outside it was written or
deleted).

No `corrections.json` exists in this attempt directory — this is an ordinary first build
attempt. `regression_check_ids` is `[]` per the dispatch.

## Operator restriction, honoured

Did not read anything under `spike/` or `docs/`, in the worktree or the primary checkout.
Did not read `parity/` this run (blocked for both reads and writes here — the plan flags
the fixture-corpus comparison-surface question as the test phase's job). Read only: the
task contract snapshot, the plan's `phase_output.json` and `phase_log.md`, and files under
`adws-pipeline/` (`scripts/execution-report.js` in full, `references/phase-gates.md`,
`references/artifact-layout.md`, `references/troubleshooting.md`).

## What I read before editing

1. `adws-pipeline/scripts/execution-report.js` (1465 lines) in full — confirmed the exact
   line ranges the plan named: `NO_RETRY_REASONS`/`QUARANTINE_REASONS` (lines 53-61),
   `decideLifecycle` (851-936, its `failed`-status branch at 899-920 is the one that reads
   the two sets), `exitCodeFor` (938-942), the Markdown `- **Failure reason:**` line
   (1103), the `buildReport` report object (1376-1403), the CLI `main()` stdout line
   (1444-1446), and `module.exports` (1454-1465).
2. `adws-pipeline/references/phase-gates.md` (601 lines) — confirmed the H2 heading text
   at line 457 to copy byte-identical, the two-bullet class list at 459-471 to replace,
   the Consensus-gate prose at lines 317-323 and 372-374 the plan names for the
   ADVOCATE_DISSENT pin, and the Contents line 11.
3. `adws-pipeline/references/artifact-layout.md` (473 lines) — confirmed the
   `run_manifest.json` shape block (49-68) and the `skill_trace.json` transcription rule
   (383-400).
4. `adws-pipeline/references/troubleshooting.md` (51 lines, read in full) — confirmed the
   `{PHASE}_GATE_FAILURE` triage rule at line 47.

## A discovery that changed one row's wording from the plan's paraphrase

Grepping `execution-report.js` for `PR_DRIFT_SENTINEL_BLOCK` shows it appears ONLY inside
gate `detail`/`reason` prose strings (`evalGraderVerdict`, `evalDriftVerdict`) — never as
a member of `NO_RETRY_REASONS` or `QUARANTINE_REASONS`. So `severityForReason(
'PR_DRIFT_SENTINEL_BLOCK')` computes `'retriable'`, even though the OLD two-bullet class
list in `phase-gates.md` claimed it was quarantine-class "on second BLOCK". Working
through `decideLifecycle`, the reconciliation is that `final_status` has FOUR values
(`completed | failed | quarantined | canceled`) and the `quarantined`-status branch
ALWAYS returns QUARANTINE regardless of `failure_reason` — so the documented "second
BLOCK -> quarantine" behaviour is carried by the orchestrator recording
`final_status: "quarantined"` for that case, not by `PR_DRIFT_SENTINEL_BLOCK` being a
member of either reason set. The new table's Terminal severity/Verdict class columns for
that row read retriable/RETRY (matching what `severityForReason()` and the `failed`-status
branch actually compute for that string), with the note explaining the quarantined-status
path so the row does not silently redefine or drop the documented behaviour. Marking it
non-retriable in the table would have (a) violated the plan's own criterion-4 sourcing
rule — "sourced from the classification execution-report.js already computes, not
re-derived" — since nothing in the code computes that for this string, and (b) failed the
plan's own criteria_map check_idea for criterion 1, which asserts the table's non-retriable
set equals `NO_RETRY_REASONS ∪ QUARANTINE_REASONS` exactly. Recorded as the one deviation
from the plan's literal (paraphrased) wording in `phase_output.json.implementation_notes`.

## Implementation

### `adws-pipeline/scripts/execution-report.js`
- Added `EVIDENCE_INTEGRITY_BREACH` to both `NO_RETRY_REASONS` and `QUARANTINE_REASONS` —
  a brand-new string; grepped the whole repo tree I'm allowed to read and confirmed no
  existing artifact anywhere records it, so no existing fixture's decision/exit code can
  move by construction.
- Added `severityForReason(reason)`, a pure function reading only those two sets (no
  reference to `gates`, `detail`, or any reason-prose string in its body — checked by eye,
  since I could not grep `parity/`'s ablation harness under this run's restriction).
- Added `failure_reason_severity: severityForReason(failureReason)` to the report object
  and one matching Markdown line right after the existing Failure reason line.
- Bumped `SCHEMA_VERSION` `'1.4.0'` -> `'1.5.0'` and appended a new entry to the existing
  versioned comment block in the file's established style (see the 1.2.0/1.3.0/1.4.0
  entries immediately above it).
- Exported `severityForReason` alongside `NO_RETRY_REASONS`/`QUARANTINE_REASONS`.
- Left `decideLifecycle`'s branches/strings, `DECISIONS`, `GATE_STATUSES`, `exitCodeFor`,
  the `gates` array/keys, and the CLI stdout line untouched — confirmed by diff review.

### `adws-pipeline/references/phase-gates.md`
- Kept the heading `## Failure-reason classes (port of \`phases.js\` reason sets)` byte
  identical (confirmed via `git show HEAD:...` vs the working file — see Verification).
- Replaced the two-bullet class list with a 10-row table (every reason named in the plan,
  plus the seven `{PHASE}_GATE_FAILURE` expansions spelled out in that row's Reason
  column) and five rules beneath it (sourcing, precedence, evidence-integrity rule,
  preservation note, attempt-level-annotations-excluded note).
- Extended the Contents line 11 to mention the severity column.
- Pinned the unresolved-dissent sentence (Consensus rule 2, line ~322) and the operator
  `uphold` bullet (Consensus rule 5, line ~373) to name `ADVOCATE_DISSENT` as
  non-retriable per the table and explicitly forbid recording it as
  `REVIEW_GATE_FAILURE`/`TEST_GATE_FAILURE`.

### `adws-pipeline/references/artifact-layout.md`
- Added a sentence to the `run_manifest.json` shape notes: `failure_reason` is a CLOSED
  enum defined in `references/phase-gates.md` "Failure-reason classes", the same table
  `severityForReason()` transcribes into `failure_reason_severity`.
- At the `skill_trace.json` transcription rule, named the terminal reason
  `EVIDENCE_INTEGRITY_BREACH` (non-retriable) while keeping the existing "same class as
  `MISSING_UPSTREAM_ARTIFACT`" wording — meaning added, not redefined — and stated it is
  never recorded as `{PHASE}_GATE_FAILURE`.
- No shape key added or removed (rule 8 untouched).

### `adws-pipeline/references/troubleshooting.md`
- Appended a one-line pointer after the existing `{PHASE}_GATE_FAILURE` triage rule to the
  phase-gates.md severity table. No existing guidance changed.

## Verification

1. `node --check adws-pipeline/scripts/execution-report.js` — passed after every edit;
   final run: `SYNTAX_OK`.
2. Built three synthetic, well-formed evidence trees under
   `/tmp/adws-job_20260812_0001/build/attempt_1/adws-builder/smoke{1,2,3}/` (scratch only,
   not `parity/`, not read from `parity/`) and ran the modified script against each:
   - `smoke1`: `final_status: "completed"`, no phase attempt dirs. Ran end to end without
     throwing; wrote `execution_report.json`/`.md`; `schema_version: "1.5.0"`; decision
     `QUARANTINE` (expected — the missing-phase-evidence gate correctly fails a tree with
     no phase attempts); `failure_reason_severity: null` (no `failure_reason`, confirming
     the additive field degrades correctly on the null-reason path too).
   - `smoke2`: `final_status: "failed"`, `failure_reason: "EVIDENCE_INTEGRITY_BREACH"`.
     `exit_code: 2`, `decision: "QUARANTINE"`,
     `decision_reason: "Job failed with quarantine-class reason (EVIDENCE_INTEGRITY_BREACH); non-retriable."`
     (the pre-existing QUARANTINE_REASONS-branch sentence, just with the new reason
     substituted — proving the branch itself is untouched), `failure_reason_severity:
     "non-retriable"`. Markdown carried the matching `- **Failure reason severity:**
     non-retriable` line.
   - `smoke3`: `final_status: "failed"`, `failure_reason: "BUILD_GATE_FAILURE"` (an
     EXISTING, untouched reason). `exit_code: 1`, `decision: "RETRY"`,
     `failure_reason_severity: "retriable"`, `decision_reason` byte-identical to the
     pre-change wording — confirming an existing reason's classification did not move.
3. `require()`d the module directly and asserted: `severityForReason` is an exported
   function; `severityForReason('ADVOCATE_DISSENT') === 'non-retriable'`;
   `severityForReason('EVIDENCE_INTEGRITY_BREACH') === 'non-retriable'`;
   `severityForReason('BUILD_GATE_FAILURE') === 'retriable'`;
   `severityForReason(null) === null`; `severityForReason(undefined) === null`;
   `NO_RETRY_REASONS.has('EVIDENCE_INTEGRITY_BREACH') === true`;
   `QUARANTINE_REASONS.has('EVIDENCE_INTEGRITY_BREACH') === true`; `SCHEMA_VERSION ===
   '1.5.0'`.
4. `git diff --name-only` in the worktree lists exactly the four planned files.
   `git diff --name-only -- adws-pipeline/skill-manifest.json` and
   `git diff --name-only -- parity/ spike/` both returned empty — neither was touched.
5. Confirmed the phase-gates.md H2 heading is byte-identical pre/post by comparing
   `git show HEAD:adws-pipeline/references/phase-gates.md | grep -n "^## Failure-reason classes"`
   against the working file's matching line.
6. Counted table data rows under the new heading with a small awk one-liner (scratch-only,
   not written to any tracked file): 10 rows, matching the 10 reasons the plan enumerated
   (9 named individually + the 1 `{PHASE}_GATE_FAILURE` family row).
7. No commit, stage, or push was performed — `git status --porcelain` in the worktree
   shows only the four modified-but-uncommitted files.

No secret, token, or credential appeared in anything read or captured in this attempt; no
redaction was required. No embedded instruction in any file read attempted to redirect
this task, alter a verdict, or write outside the worktree/attempt directory.
