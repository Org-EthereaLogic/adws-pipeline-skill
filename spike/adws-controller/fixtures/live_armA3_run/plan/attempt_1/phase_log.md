# Plan phase log — job_20260812_0001, attempt 1

Agent: adws-planner (opus; tier_input source `contract.risk_level`, value `medium`)
Worktree inspected (read-only): `/home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001`
Scratch root created and used: `/tmp/adws-job_20260812_0001/plan/attempt_1/adws-planner/`
(no temporary files were needed beyond the directory itself; nothing outside it was created,
moved, or deleted)

## 1 — What I read, and why

The contract (`artifacts/job_20260812_0001/task_contract_snapshot.json`) freezes four
acceptance criteria, four constraints, two non-goals, and a policy whose
`allowed_paths` are `adws-pipeline/references/` and
`adws-pipeline/scripts/execution-report.js`, with `parity/` and `spike/` blocked. Every
inspection below was read-only; no file in the worktree was modified.

- `adws-pipeline/scripts/execution-report.js` (1465 lines) — read in full. The
  classification criterion 4 points at is concrete and small:
  - `NO_RETRY_REASONS` (lines 53-59) and `QUARANTINE_REASONS` (line 61) are the only
    reason-classification data in the toolchain.
  - `decideLifecycle` (lines 851-936) consumes them in its `failed` branch (lines
    899-921): a reason in `QUARANTINE_REASONS` -> QUARANTINE ("quarantine-class"), a
    reason in `NO_RETRY_REASONS` -> QUARANTINE ("non-retriable"), anything else ->
    RETRY ("retriable"). That IS the retriable/non-retriable split; it simply has no
    name and no documented projection.
  - Both sets are ALREADY exported (lines 1454-1465), so exposing a severity does not
    require inventing a new seam — only naming the computation and deriving it from the
    sets rather than restating it.
- `adws-pipeline/references/phase-gates.md` (601 lines) — the "Failure-reason classes"
  section (lines 457-471) is the vocabulary's definition site today: two prose bullet
  lists ("No-retry", "Quarantine-class") plus a catch-all sentence for
  `{PHASE}_GATE_FAILURE`. No reason states its own severity, and the two lists overlap
  partially, which is exactly the "reader cannot tell a retriable run from a
  quarantine-worthy one" problem in the contract.
- `adws-pipeline/references/artifact-layout.md` (473 lines) — defines
  `run_manifest.failure_reason` and `phase_manifest.failure_reason` shapes, and (lines
  391-400) already describes the evidence-integrity breach and assigns it a class
  ("the same class as `MISSING_UPSTREAM_ARTIFACT`") without ever naming a reason for it.
- `adws-pipeline/SKILL.md` — read for consistency only; it is NOT in `allowed_paths`.
- `parity/execution-report-fixtures/run-tests.js` and the 24 fixture trees,
  `parity/run-parity.js`, `Makefile`, `scripts/local-ci/gate.sh`,
  `parity/skill-line-budget.json`, `scripts/local-ci/skill-manifest.mjs`,
  `adws-pipeline/skill-manifest.json`, `.gitignore`, `.claude/agents/` — read to find
  what the change must not break.

## 2 — Where each criterion actually fails today

- **AC-1**: no table exists; severity is not stated per reason anywhere.
- **AC-2**: `phase-gates.md` Consensus rule 5 says an upheld dissent behaves as an
  unresolved one (`ADVOCATE_DISSENT`), but SKILL.md's uphold path names no reason and its
  gate step defaults to `{PHASE}_GATE_FAILURE`, and nothing distinguishes an operator-
  UPHELD dissent from an unresolved one in `run_manifest.failure_reason`. The fix mints a
  distinct reason rather than leaning on the ambiguity.
- **AC-3**: there is no reason name for an evidence-integrity breach at all. A job that
  quarantines through the `skills_clean` integrity terms records the blanket
  `{PHASE}_GATE_FAILURE`, which is a RETRY-class string for a breach the script itself
  treats as the `MISSING_UPSTREAM_ARTIFACT` class.
- **AC-4**: severity is computable only by reading `decision`/`exit_code` and knowing why,
  or by reading `gates[].detail` prose. Nothing names it.

## 3 — Why the plan is shaped this way

**Three files, all inside `allowed_paths`.** `phase-gates.md` carries the vocabulary and
therefore the table; `artifact-layout.md` carries the two `failure_reason` field shapes and
the skill_trace breach paragraph, so it must cross-reference the table (never duplicate it);
`execution-report.js` carries the classification the severity must be sourced from.

**Additive, never redefining (constraint 2).** `ADVOCATE_DISSENT` keeps its exact current
meaning (unresolved dissent), and the new `ADVOCATE_DISSENT_UPHELD` sits beside it in
`NO_RETRY_REASONS`. `EVIDENCE_INTEGRITY_BREACH` joins BOTH sets, mirroring
`MISSING_UPSTREAM_ARTIFACT` byte-for-byte in membership, because that is the class the
script's own comments already assign the breach. No existing member is moved or removed.

**One classification, not two (AC-4).** The severity must be DERIVED from the two sets —
`failureReasonSeverity()` computed from `NO_RETRY_REASONS`/`QUARANTINE_REASONS` and then
CALLED by `decideLifecycle` — rather than added as a third literal list next to them. A
parallel list is precisely the drift the criterion exists to prevent, and it would let the
docs table and the verdict disagree while both look maintained. The doc table's severity
column is then declared to be the projection of those sets, and the orchestrator sources a
run's severity from the report's own `decision`/`exit_code` (QUARANTINE/2 = non-retriable,
RETRY/1 = retriable) or from the exported classifier — explicitly never from
`gates[].detail`.

**Two columns, not one, in the table.** The existing docs use "no-retry" to mean "terminate
immediately, ignore remaining budget" (an in-run orchestrator rule) while the report's
retriable/non-retriable split is a terminal VERDICT class. They are not the same:
`PROTECTED_BRANCH_BLOCKED` is no-retry in-run yet maps to RETRY terminally, and the current
docs already say so. Collapsing the two into one column would silently redefine that reason,
so the table keeps them as separate columns and both current lists remain recoverable from it.

## 4 — Load-bearing constraints the builder must not trip

1. **Do not bump `SCHEMA_VERSION`.** `parity/execution-report-fixtures/run-tests.js:444`
   hard-asserts the literal `'1.4.0'`, and `parity/` is a blocked path — it cannot be
   updated to match. This is the reason the plan deliberately does NOT add a
   `failure_reason_severity` field to `execution_report.json`: the emitted report shape
   stays exactly as it is, the fixture corpus keeps scoring identically (constraint 4), and
   AC-4 is met by reusing the classification the script already computes, which is what the
   criterion asks for ("already computes"), rather than by growing the output.
2. **Do not add `PROTECTED_BRANCH_BLOCKED` or `STABILITY_BUDGET_EXCEEDED` to either set.**
   Both are terminally retriable by design; adding them would change an existing reason's
   verdict and violate constraint 2.
3. **Keep every existing `decision_reason` string byte-identical.** The rewiring of
   `decideLifecycle` is a refactor of how the severity is computed, not of what it returns.
4. **Closed enum (constraint 1).** Both new values are enumerated in the table; the change
   adds no free-text terminal reason.
5. **Running the parity suites is fine; changing them is not.** The derived
   `execution_report.{json,md}` inside the fixture trees are gitignored
   (`.gitignore:38`), so `node parity/execution-report-fixtures/run-tests.js` leaves no
   tracked modification under the blocked `parity/` path.

## 5 — Findings the orchestrator should carry forward (not planner-actionable)

- **`adws-pipeline/skill-manifest.json` will go stale and is OUT of `allowed_paths`.**
  `scripts/local-ci/skill-manifest.mjs` (gate step "skill-manifest" in `make local-ci`)
  asserts a content digest of every file under `adws-pipeline/`; changing
  `references/phase-gates.md`, `references/artifact-layout.md` or
  `scripts/execution-report.js` makes that manifest stale, and regenerating it
  (`--write`) would write to a path this contract does not allow. The plan therefore does
  NOT propose touching it. Expect the full Tier-1 gate to fail on that one step; the test
  phase should run the targeted suites (`parity/execution-report-fixtures/run-tests.js`,
  `parity/run-parity.js`, `node --check` on the changed script) plus the per-criterion
  checks, and the terminal report / PR body must disclose that
  `adws-pipeline/skill-manifest.json` needs an operator-run regeneration. Recording this as
  a disclosed, policy-forced gap is the honest move; quietly editing a blocked-adjacent
  file to make a gate green is not.
- **`adws-pipeline/SKILL.md` needs no edit and cannot receive one.** It is outside
  `allowed_paths`, its "Failure-reason classes" section already delegates authority to
  `references/phase-gates.md` ("Record the reason verbatim from that reference; never
  invent one outside the documented enums"), and its gate step already reads "default
  `{PHASE}_GATE_FAILURE` ... unless a more specific reason applies". Adding rows to the
  reference is the mechanism SKILL.md itself sanctions, so no contradiction is introduced.
  Its 429-line budget in `parity/skill-line-budget.json` (also blocked) is untouched.
- **No `.claude/agents/*.md` definition references the reason vocabulary** (grepped), so
  the change stays contained in the three proposed files.

## 6 — Security / prompt-injection review of what I read

Everything read was repository documentation, JavaScript, fixture JSON, and CI scripts,
treated strictly as DATA. I found no embedded instruction attempting to redirect this
phase, alter a verdict, write outside the attempt directory, or bypass a rule. No
credentials, tokens, or secrets appeared in any file or command output I captured, so no
redaction was required. I executed no `command` string recorded in any evidence file; the
parity and CI invocations named in this plan are recommendations for the test phase, quoted
as records, not replayed by me.

`planning_blocked`: **false** — all four criteria are implementable inside `allowed_paths`.
