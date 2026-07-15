# Phase Gates — Entry/Exit Criteria, Retry Budgets, Tier Selection

Semantics ported from ADWS_Pro `src/phases.js`, `src/orchestrator.js`,
`src/orchestrator-cross-phase.js`. The phase order is fixed and linear:

```
plan → build → test → review → document → ship → verify → COMPLETED
```

No phase may be skipped. No later phase may start while an earlier gate is failing.
The only terminal states are `completed`, `failed`, `quarantined`, `canceled`.

## Per-phase table

| Phase | Agent | Validators (scripts) | Exit criterion (gate) | Retry budget |
|---|---|---|---|---|
| plan | adws-planner | `task-normalize` | Plan written with per-criterion file-change proposal; validator not `fail` | 1 |
| build | adws-builder | `repo-context-scan` | All planned changes applied in worktree; no policy-path violation; validator not `fail` | 1 |
| test | adws-tester | `criteria-to-checks` | All derived checks executed and passing; Critic `pass`; no Advocate dissent; validator not `fail` | 2 |
| review | adws-reviewer | `review-risk-assess` | Critic `pass`; no Advocate dissent; risk recorded; validator not `fail` | 1 |
| document | adws-documenter | `document-coverage-map` | Docs delta + changelog entry written; validator not `fail` | 1 |
| ship | adws-shipper | `ship-mode-select`, `patch-compose` | Mode-specific artifact produced (PR URL / pushed branch / patch file); both validators not `fail` | 1 |
| verify | adws-verifier | `verify-evidence-map`, `drift-sentinel` + adws-grader | All structural checks pass; grader verdict not `fail`; validators not `fail` | 1 |

Budget semantics: the budget counts retries beyond the first attempt (budget 1 = at
most 2 attempts; test's budget 2 = at most 3 attempts). Any phase not listed defaults
to 2 retries (DPPD FR-3). Every attempt — including retries — gets a fresh
`attempt_{n}` directory and is recorded; exhaustion terminates the job (never silent
continuation).

## Gate rules (imperative)

1. Run the phase agent. Run the phase's validator script(s) on its output. Record every
   validator verdict as a trace file in the attempt directory.
2. Validator `fail` → gate fails. Validator `warn` → record, surface in the execution
   report, but do not block (FR-6).
3. Gate passes → advance to the next phase, reset attempt counter.
4. Gate fails and retries remain → new attempt of the same phase, escalating the phase
   agent's model one tier (see below).
5. Gate fails and budget exhausted → terminate: status `failed` with the recorded
   failure reason (execution report will map it to RETRY or QUARANTINE).

## Cross-phase rewind (exceptions to rule 4)

- **Test checks fail because the code is wrong** (not the checks): rewind to `build`
  instead of retrying `test`. At most ONE test rewind per job (tracked as
  `cross_phase_rewinds.test` in `run_manifest.json`); a second such failure terminates
  with `TEST_GATE_FAILURE` (RETRY verdict class).
- **Verify drift BLOCK** (grader finds unaddressed/contradicted criteria in the shipped
  diff): rewind to `build` carrying the grader's findings as feedback. At most ONE
  verify rewind per job (tracked as `cross_phase_rewinds.verify`); a SECOND BLOCK
  terminates with `PR_DRIFT_SENTINEL_BLOCK` → quarantine.
- The two rewind budgets are INDEPENDENT: spending the test rewind does not consume
  the verify rewind, and vice versa.

## Consensus at test and review gates (FR-7)

At the test and review gates, after the phase agent (Architect) produces its output:

1. Spawn **adws-critic** and **adws-advocate** as independent subagents with FRESH
   context: each receives only the task contract and the change set (diff + check
   results). Neither sees the Architect's reasoning nor the other's conclusion.
2. Reconciliation: unanimous pass → promote. Critic `fail` → gate fails (retry path,
   rule 4/rewind). Advocate dissent → record the dissent VERBATIM in
   `consensus/advocate.json`, present it to the operator once for resolution; if
   unresolved, terminate with `ADVOCATE_DISSENT` (no retry — quarantine class). Never
   silently override a dissent.
3. An Advocate `verdict: "fail"` IS a dissent and must carry a non-null `dissent`
   text. A `fail` with null `dissent` is malformed evidence: re-dispatch the Advocate
   once; if still malformed, treat the findings text as the dissent and proceed per
   rule 2.

## Failure-reason classes (port of `phases.js` reason sets)

- **No-retry** (terminate immediately, ignore remaining budget): `CREDENTIAL_FAILURE`,
  `OPERATOR_CANCEL`, `MISSING_UPSTREAM_ARTIFACT`, `PLAN_COHERENCE_BELOW_THRESHOLD`
  (reserved — ported from the original reason set; no gate in this skill currently
  emits it), `ADVOCATE_DISSENT`, `PROTECTED_BRANCH_BLOCKED`.
- **Quarantine-class** (execution report decides QUARANTINE, not RETRY):
  `CREDENTIAL_FAILURE`, `OPERATOR_CANCEL`, `MISSING_UPSTREAM_ARTIFACT`,
  `PLAN_COHERENCE_BELOW_THRESHOLD`, `ADVOCATE_DISSENT`, plus
  `PR_DRIFT_SENTINEL_BLOCK` on second BLOCK. Note `PROTECTED_BRANCH_BLOCKED` is
  no-retry but NOT quarantine-class: it maps to a RETRY verdict (the operator must
  fix the contract and resubmit).
- Anything else terminating the job (budget exhaustion, recorded as
  `{PHASE}_GATE_FAILURE`, or a second test rewind → `TEST_GATE_FAILURE`) → RETRY
  verdict.

## Model-tier selection (FR-12)

Deterministic inputs → tier table. The risk score is the contract's `risk.risk_level`
until the review gate; from review onward, use the `risk_level` output of the
`review-risk-assess` validator (recomputed from the actual change set).

| Risk | Architect (phase agents) | Critic | Advocate | Grader |
|---|---|---|---|---|
| low | sonnet | haiku | haiku | opus |
| medium | sonnet | sonnet | haiku | opus |
| high | opus | sonnet | sonnet | opus |

- **Retry escalation:** each retry of a phase escalates that phase agent's model one
  tier (haiku → sonnet → opus; capped at opus).
- **Recording:** every attempt's `phase_manifest.json` records `model_tier` and the
  risk input that selected it (`tier_input`: source + value). The grader always runs at
  the Architect floor (opus) per the original `pr.drift_sentinel.spec` tier policy.
