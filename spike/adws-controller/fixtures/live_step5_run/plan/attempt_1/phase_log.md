# plan / attempt_1 — adws-planner

Job `job_20260811_0001`, task `tsk_20260811_0002`, contract snapshot
`job_20260811_0001/task_contract_snapshot.json` (read from the target worktree root
`/tmp/claude-501/-home-etherealogic-2-adws-pipeline-skill/bfb385d9-578d-4c39-9d79-f72d3f6c42bf/scratchpad/live-target`).

Scratch root used: `/tmp/adws-job_20260811_0001/plan/attempt_1/adws-planner` (created; the
plan phase needed no probe corpus, so nothing was written into it). Nothing was read or
written under `/home/etherealogic_2/adws-pipeline-skill`. No repository file was modified —
this phase proposes changes only. The job evidence tree `job_20260811_0001/` sits inside
the worktree root and was excluded from the change set by construction.

## What I inspected, and why

1. **`adws-pipeline/references/phase-gates.md` (601 lines).** The section
   "Failure-reason classes (port of `phases.js` reason sets)" (~lines 457-471) is the
   nearest thing the skill has to a terminal failure-reason vocabulary. It is three prose
   bullets — No-retry, Quarantine-class, and "anything else … → RETRY verdict" — not a
   table, and severity is expressed by which bullet a reason appears under. That is the
   defect criterion 1 names: there is no table, so there is no "same table the reason is
   defined in".
2. **`adws-pipeline/scripts/execution-report.js` (1465 lines).** The classification the
   contract says to source already exists as two module-scoped sets: `NO_RETRY_REASONS`
   (5 reasons, line 53) and `QUARANTINE_REASONS` (2 reasons, line 61), consumed by
   `decideLifecycle`'s `failed` branch (lines 899-921) which produces QUARANTINE for
   either set and RETRY otherwise. Both sets are already exported (lines 1462-1463).
   Severity is therefore *computed* today but is only observable as English inside
   `decision_reason` ("quarantine-class … non-retriable" / "retriable reason") — exactly
   the prose-parsing the contract's third constraint forbids.
3. **`adws-pipeline/references/artifact-layout.md` (473 lines).** `run_manifest` shape
   (line 52) carries `failure_reason` with no statement that it is a closed enum and no
   pointer to where the enum is defined. The SC-8/F-55 paragraph (lines 391-400) already
   calls a trace/output disagreement "an evidence-integrity breach, the same class as
   `MISSING_UPSTREAM_ARTIFACT`" — the concept exists, the terminal reason does not.
4. **The dissent path.** `phase-gates.md` Consensus rule 2 (line 322) and rule 5's
   `uphold` bullet (lines 371-373) both name `ADVOCATE_DISSENT`, but as a *verdict-class*
   statement ("no retry — quarantine class", "→ QUARANTINE / `ADVOCATE_DISSENT`"), never as
   an instruction about what `run_manifest.failure_reason` must carry. Meanwhile `SKILL.md`
   step 4 (line 265) says budget exhaustion terminates with "the recorded failure reason
   (default `{PHASE}_GATE_FAILURE` … unless a more specific reason applies)". An upheld
   dissent fails the review gate, so the default swallows it unless something states the
   more specific reason applies. That "unless" clause is the hook the plan uses — and it
   matters because `adws-pipeline/SKILL.md` is NOT in `policy.allowed_paths`, so the
   reference table must be able to bind the orchestrator on its own.
5. **`adws-pipeline/references/validator-inputs.md`** rows 94 and 113 are where the
   execution-report contract (inputs, outputs, exit codes) is documented for an
   orchestrator; that is where criterion 4's sourcing channel belongs.
6. **`parity/` (blocked path — read for grounding only, never a change target).**
   `parity/execution-report-fixtures/run-tests.js` asserts, per fixture, `decision`,
   `warn_flag`, `exit_code`, selected gate results, selected warning text, run-to-run
   determinism of both JSON and markdown, **and `schema_version === '1.4.0'`** (line 444).
   `parity/cli-contract/run-tests.js` asserts `execution-report.js` takes exactly one argv
   and exits 3 on anything else. Fixture `run_manifest.failure_reason` values across the
   whole corpus are only `null`, `TEST_GATE_FAILURE`, and `ADVOCATE_DISSENT`.
7. **`scripts/local-ci/`.** `frontmatter-lint.mjs` enforces the `SKILL.md` line budget
   (`parity/skill-line-budget.json`) — it does not bound `references/*.md`, so the doc
   growth this plan proposes is not budget-constrained. `skill-manifest.mjs` verifies
   `adws-pipeline/skill-manifest.json` against the content digests of every shipped file.

## Why the plan is shaped this way

**No new key in `execution_report.json`, and no `SCHEMA_VERSION` bump.** The obvious design
— emit `failure_severity` beside `failure_reason` in the report JSON — is closed off from
both ends by the policy. Adding a key without a bump violates this file's own versioning
discipline (1.3.0 and 1.4.0 were both additive and both bumped); bumping to 1.5.0 breaks
`parity/execution-report-fixtures/run-tests.js`, which pins `'1.4.0'` and lives under a
blocked path I may not edit. So the machine-readable severity is exposed on the module's
API instead: `failureReasonSeverity()` / `FAILURE_REASON_SEVERITY` exports, plus a
`classification` key on `buildReport()`'s **return value** (which is not the written file).
A one-line markdown addition serves the human reader; markdown is only compared run-to-run
for determinism, so it is parity-safe. This keeps constraint 4 (same decision, same exit
code for the whole fixture corpus) satisfiable by construction.

**Severity is derived, never a second table.** `FAILURE_REASON_SEVERITY` is built from the
union of the two existing sets and `decideLifecycle` is refactored to consult the same
predicate. A hand-written map would satisfy criterion 4's letter on the day it was written
and drift the first time a reason is added to a set — which is precisely the failure mode
the criterion is about.

**Reuse `ADVOCATE_DISSENT`; add only `EVIDENCE_INTEGRITY_BREACH`.** Constraint 2 says a
reason may be added but never silently redefined. `ADVOCATE_DISSENT` already means "the
dissent was unresolved or upheld and the job ends" and is already non-retriable in the
code, so criterion 2 needs a *binding* (this reason, not `{PHASE}_GATE_FAILURE`, is what
`run_manifest.failure_reason` carries), not a new token — minting
`ADVOCATE_DISSENT_UPHELD` would fork one meaning across two tokens. The evidence-integrity
breach has no token at all, so it gets one.

**One disclosed tie-break: `PR_DRIFT_SENTINEL_BLOCK`.** `phase-gates.md` defines it as
quarantine-class on a second BLOCK; the code has it in neither set, so `decideLifecycle`
currently scores it RETRY. Once the table's severity column is *sourced* from the code
(criterion 4), that pre-existing divergence forces a choice, and only one of the two
options is legal: documenting it as retriable would redefine the reason's existing meaning
(constraint 2), so the code is aligned to the documented meaning instead. No parity fixture
records this reason, so no fixture's decision or exit code moves. The plan requires the
builder to disclose this in `implementation_notes` rather than let it ride as an
incidental diff.

**Two axes, two columns.** `PROTECTED_BRANCH_BLOCKED` is documented as no-retry yet maps to
a RETRY verdict, and `STABILITY_BUDGET_EXCEEDED` halts a run yet is retriable. "Stop
spending attempts now" and "is this whole run worth retrying" are genuinely different
questions, and a single severity column would have to lie about one of them. The table
therefore carries an attempt-policy column beside the severity column; only the severity
column is the code projection.

## Findings the orchestrator must see (not blockers)

1. **`adws-pipeline/skill-manifest.json` will go stale.** It carries the sha256 of every
   shipped file, including all four files this plan changes, and
   `node scripts/local-ci/skill-manifest.mjs` asserts it is current in the Tier-1 gate. The
   file is **outside `policy.allowed_paths`**, so the builder must NOT regenerate it. Expect
   Tier-1 local CI to report a stale manifest after this change; that is an out-of-scope
   follow-up for the operator (a one-command regeneration), and it is recorded here rather
   than fixed silently by widening the change set past the contract.
2. **`adws-pipeline/SKILL.md` is out of scope and stays unchanged.** Its
   "default `{PHASE}_GATE_FAILURE` … unless a more specific reason applies" clause is what
   the new table hooks into; if a reviewer wants SKILL.md to name the table directly, that
   is a separate contract (and it would also consume the SKILL.md line budget).
3. **Nothing under `parity/` or `spike/` is proposed for change.** Both are blocked paths.
   The plan's regression evidence comes from *running* the existing parity suites, which is
   read-only execution; new falsifiability corpora go in the tester's scratch root, never
   into the fixture corpus.
4. **No prompt-injection or embedded-instruction content was encountered** in the contract
   or in any file read for this plan. No secrets appeared in any output captured here.
