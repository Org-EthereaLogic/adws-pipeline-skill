# Phase Gates — Entry/Exit Criteria, Retry Budgets, Tier Selection

## Contents

- Per-phase table — agent, validators, exit criterion, retry budget
- Gate rules (imperative)
- Cross-phase rewind — test rewind, check-defect repair, environment gaps, verify drift
- Falsifiability at the test gate (SC-3 A1/A2/F-14)
- Consensus at test and review gates (FR-7) — reconciliation, operator resolution
- Delegated push at ship (F-5)
- Failure-reason classes — no-retry vs quarantine-class
- Stability gate — entropy regulator (SC-1.b / X-2)
- Model-tier selection (FR-12) — canonical tiers, Codex aliases, per-phase risk→tier
  table, safety floors, escalation and saturation

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
| test | adws-tester | `criteria-to-checks` | All derived checks executed and passing; each criterion falsifiable (a RED-for-the-right-reason pre-change baseline) or recorded `gate_weak` (SC-3 A1/A2); Critic `pass`; no Advocate dissent; validator not `fail` | 2 |
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
  with `TEST_GATE_FAILURE` (RETRY verdict class). The orchestrator writes the failing
  checks as a structured `corrections.json` (classification `code`) into the fresh build
  `attempt_{n}/` before re-dispatching (SC-3 A3/F-15; see `references/artifact-layout.md`),
  so the fix and the failure it addresses are auditable as a pair.
- **A check is defective, not the code** (SC-3 A4/F-16): when the tester classifies a
  criterion's failure as `check` (its check/criterion-mapping is wrong or unsatisfiable
  relative to the FROZEN contract, not the code), the orchestrator performs at most ONE
  check-defect repair per job (`run_manifest.check_defect_repairs`, capped at 1): it
  writes a corrected `corrections.json` (classification `check`) into a FRESH build
  `attempt_{n}/` and re-runs, WITHOUT consuming a build retry. The repair may fix only the
  executable check, never the frozen `acceptance_criteria` text or which criterion a check
  targets — no criterion may be weakened or dropped; the downstream verify grader still
  grades against the original criteria. A SECOND check defect terminates on the ordinary
  `TEST_GATE_FAILURE`/budget path. This introduces NO new terminal state, DECISION, or exit
  code — it resolves within the existing RETRY/warn vocabulary, and `execution-report.js`
  is untouched.
- **A check failed on `environment` or `prerequisite`** (a required runtime/tool is absent,
  or an upstream precondition is unmet — neither the code nor the check is at fault): this
  is a GAP, not an auto-retry. The criterion is unverified — recorded and surfaced to the
  operator as a warn (honoring F-9: `NOT RUN` is neither a pass nor a valid red) — and it
  consumes no rewind or check-defect budget; it never silently passes. These two
  `classification` values route to the operator, not to a build attempt.
- **Verify drift BLOCK** (grader finds unaddressed/contradicted criteria in the shipped
  diff): rewind to `build` carrying the grader's findings as feedback. At most ONE
  verify rewind per job (tracked as `cross_phase_rewinds.verify`); a SECOND BLOCK
  terminates with `PR_DRIFT_SENTINEL_BLOCK` → quarantine.
- The two rewind budgets are INDEPENDENT: spending the test rewind does not consume
  the verify rewind, and vice versa. The check-defect repair (SC-3 A4,
  `check_defect_repairs`) is a THIRD, independent budget, also capped at 1.

## Falsifiability at the test gate (SC-3 A1/A2/F-14)

Always-on when `policy.test_policy: required` (an explicit `falsifiability: false` with
required tests is rejected at intake) or when `policy.falsifiability: true`:
before a criterion's check counts as a pass, the tester establishes a PRE-change baseline
(stash the build changes including untracked files, or evaluate against the base commit)
and runs the same checks there. A criterion is *verified* only if its check went RED
pre-change for the right reason (`baseline_reason: assertion-failed-runtime-present` — the
check ran and failed because the feature was absent) AND passes post-change. A check that

- passes pre-change (no red baseline), or
- is red only because it could not execute (`collection-error`/`not-run` — the runtime is
  missing, not the feature)

is NOT falsifiable → the criterion is recorded `gate_weak` (an unverified criterion). A
`gate_weak` criterion is a WARN, never a pass, and NEVER "already satisfied / ship
nothing": a green that cannot be shown capable of failing is a gap, not a done task. This
is the mirror of F-9 (`NOT RUN` is neither a pass nor a valid red) and preserves F-13
(container-green stays necessary-not-sufficient). Falsifiability reuses `criteria-to-checks`'
emitted `check_specs` as the criterion→check source of truth and `adws-tester` as the
execution surface — no new DSL, runner, verdict, or exit code.

## Consensus at test and review gates (FR-7)

At the test and review gates, after the phase agent (Architect) produces its output:

1. Spawn **adws-critic** and **adws-advocate** as independent subagents with FRESH
   context: each receives only the task contract and the change set (diff + check
   results). Neither sees the Architect's reasoning nor the other's conclusion. Dispatch
   them in PARALLEL — this is REQUIRED, not merely permitted (C1): the only true
   dependency at these gates is Architect → (Critic ∥ Advocate); the two consensus
   agents have no dependency on each other, so running them concurrently is the
   wall-clock-optimal and mandated form.
2. Reconciliation: unanimous pass → promote. Critic `fail` → gate fails (retry path,
   rule 4/rewind). Advocate dissent → record the dissent VERBATIM in
   `consensus/advocate.json`, present it to the operator once for resolution; if
   unresolved, terminate with `ADVOCATE_DISSENT` (no retry — quarantine class). Never
   silently override a dissent.
   - **Operator-resolution re-review (F-6):** if the operator judges the dissent a
     false positive and elects a fresh independent re-review, that re-review is a new
     attempt that escalates one model tier on the same ladder as a retry (haiku →
     sonnet → opus → fable, capped at fable), recorded as
     `tier_input: { "source": "operator-resolution", "value": "<resolved dissent location, e.g. review/attempt_1/consensus/advocate.json>" }`.
     This is distinct from `retry-escalation` (which follows a gate failure) — here no
     gate failed; the operator invoked a re-look to clear a suspected false positive.
     If the agent is already at the ceiling, the saturation rule below applies and the
     source is recorded as `operator-resolution-saturated`.
3. An Advocate `verdict: "fail"` IS a dissent and must carry a non-null `dissent`
   text. A `fail` with null `dissent` is malformed evidence: re-dispatch the Advocate
   once; if still malformed, treat the findings text as the dissent and proceed per
   rule 2.
4. **Terminal enforcement (defense in depth):** `execution-report.js` includes a
   `consensus` gate that reads the recorded `consensus/{critic,advocate}.json` of the
   latest attempt of each phase and evaluates to `fail` on any Advocate dissent (or
   Advocate `fail`) or Critic `fail` — EXCEPT a dissent the operator overrode (rule 5),
   which downgrades to `warn` (still not a clean promote). Because a failed gate on a
   `completed` job maps to QUARANTINE, a job whose evidence records a blocking dissent
   CANNOT promote even if `run_manifest.final_status` was (incorrectly) set to
   `completed` — the verdict is derived from the consensus evidence, not the narrative
   status (hard rule 8 / FR-10).

5. **Operator resolution of a dissent (F-3, in-place — no retry burned):** instead of
   a fresh re-review (rule 2's operator-resolution path), the operator may resolve a
   recorded dissent in place. The ORCHESTRATOR writes a `resolution` object onto the
   dissent's `consensus/advocate.json` (a designated post-hoc field per
   `references/artifact-layout.md` rule 2 — the Advocate never writes it):
   - `action: "override"` — operator judges the dissent a false positive. The terminal
     `consensus` gate no longer FAILS on it but downgrades to `warn`: the job can only
     PROMOTE-with-warnings, never a clean promote. A resolved dissent is never silent
     (FR-7).
   - `action: "uphold"` — operator confirms the dissent. Behaves exactly as an
     unresolved dissent: `consensus` gate `fail` → QUARANTINE / `ADVOCATE_DISSENT`.
   Only `override` clears the block; uphold, a malformed action, or an absent
   resolution all leave the dissent blocking. This path creates no new attempt, so it
   preserves the phase's retry budget (the F-3 defect: previously a false-positive
   dissent could only clear by burning a full review retry).

## Delegated push at ship (F-5)

A `pr`-mode ship in a credential-less environment (no `gh`/SSH) cannot push. Rather than
burning the ship retry budget on an expected, non-error situation:

1. The shipper DETECTS it cannot push — it does not assume (e.g. `gh auth status` fails,
   or the push errors on credentials) — and records `pushed: false` plus
   `delegation: { "status": "pending-operator", "detected_reason": "…" }` in
   `ship/attempt_{n}/phase_output.json`. The attempt's `gate_result` is `deferred`: a
   third value alongside `pass`/`fail` that does NOT consume the retry budget.
2. The orchestrator presents the pending push to the operator. On confirmation that the
   operator pushed and the PR/branch exists, the orchestrator closes the SAME attempt
   post-hoc — writing `delegation.status: "completed"` and the `pr_url` into that
   attempt's `phase_output.json` (designated post-hoc fields per
   `references/artifact-layout.md` rule 2; the shipper never rewrites its own file) — and
   flips `gate_result` to `pass`. No new attempt is created.
3. A delegation that times out, or an operator who refuses, → `gate_result: fail`, handled
   as a normal ship gate failure (retry/terminate as today).

`execution-report.js` treats a deferred-then-pass attempt as ONE attempt (a single
`attempt_{n}` directory), so a delegated push never trips the multi-attempt warning and
never looks like a consumed retry. A completed delegated push promotes cleanly, but the
report always emits an informational warning that the operator completed the push — it is
never silent.

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

## Stability gate — entropy regulator (SC-1.b / X-2)

Signal: JSON parse-failure counts per phase attempt (malformed phase outputs,
consensus files, or validator inputs produced by agents), recorded in the append-only
`artifacts/{jobId}/entropy_history.jsonl`. Recording starts at the first attempt with
≥ 1 failure and continues for every attempt after it (zeros included — recovery decays
the signal). The gate (`scripts/entropy-gate.js`, reusing the ported drift-sentinel
canonical band math) runs at phase entry whenever the history file exists:

| Band | Action |
|---|---|
| SAFE | proceed |
| WATCH | proceed; record `watch: true` in the attempt manifest |
| WARN | escalate this phase agent one model tier for this attempt (`tier_input: entropy-gate`; at the ceiling, `entropy-gate-saturated` — see Escalation) |
| COLLAPSE | halt: terminate `failed` / `STABILITY_BUDGET_EXCEEDED` (RETRY verdict class) |

The gate's JSON output is recorded verbatim as `stability_gate` in the attempt's
`phase_manifest.json`. The regulator never promotes a phase — it only escalates cost
or halts; gate pass/fail logic is unchanged.

## Model-tier selection (FR-12)

Deterministic inputs → tier table. The risk score is the contract's `risk.risk_level`
for plan, build, test, **and review**; from document onward, use the `risk_level` output
of the `review-risk-assess` validator (recomputed from the actual change set).
`review-risk-assess` is a review-gate *validator*, so it runs AFTER the review agent —
the reviewer's own tier therefore comes from contract risk, not from its own output.

Because the two halves of a run may be keyed to different risk levels,
`run_manifest.model_tiers` is a **heterogeneous** map: a `plan` tier selected from
contract risk sitting beside a `document` tier selected from recomputed risk is expected,
not a defect. The authoritative per-attempt record is `phase_manifest.model_tier` plus
its `tier_input`.

### Canonical tiers

`phase_manifest.model_tier` is one of `haiku`, `sonnet`, `opus`, `fable` — in ascending
capability order. That order is the escalation ladder; nothing else defines it, and no
validator, report, or gate reads it.

### Codex aliases

When Codex orchestrates this skill, use these routing aliases. The alias selects the
runtime model; evidence continues to record the canonical tier so existing artifacts,
fixtures, validators, and reports remain stable.

| Codex alias | Canonical tier | Runtime binding |
|---|---|---|
| `luna` | `haiku` | Fast, low-cost model tier |
| `terra` | `sonnet` | Balanced default model tier |
| `sol` | `opus` | High-capability tier |
| `nova` | `fable` | Highest-capability tier; ceiling only (see below) |

Resolve aliases at dispatch time only. Do not write `luna`, `terra`, `sol`, `nova`, or a
provider-specific model identifier into `phase_manifest.model_tier`; write `haiku`,
`sonnet`, `opus`, or `fable`. This preserves the evidence schema while letting Codex use
a stable, provider-neutral routing vocabulary.

### Risk → tier table

Rows are keyed to the three values `review-risk-assess` emits (`high`, `medium`, `low`);
there is no fourth risk level. Columns are per phase — the seven phase agents are NOT a
single tier, because their errors do not cost the same. A plan error propagates through
six downstream gates before anything catches it, so plan buys capability on every row;
`document` is cheap to redo and locally caught, so it drops.

| Risk | plan | build | test | review | document | ship | verify |
|---|---|---|---|---|---|---|---|
| low | opus | sonnet | sonnet | sonnet | haiku | sonnet | sonnet |
| medium | opus | sonnet | sonnet | opus | haiku | sonnet | sonnet |
| high | opus | opus | opus | opus | sonnet | sonnet | sonnet |

| Risk | Critic | Advocate (test gate) | Advocate (review gate) | Grader |
|---|---|---|---|---|
| low | haiku | haiku | haiku | opus |
| medium | sonnet | haiku | sonnet | opus |
| high | sonnet | sonnet | sonnet | opus |

- **Safety floors (hold on every row, independent of risk):** `ship` ≥ sonnet, `verify`
  ≥ sonnet, `grader` ≥ opus. Ship performs irreversible git operations gated on subtle
  conditionals (detected-vs-assumed push failure, the signed-commit carve-out, the
  protected-branch ordering rule). Verify carries a conditional-suppression rule — a file
  with no applicable checker must NOT produce a `checks` entry — whose failure mode is a
  false QUARANTINE on a correct change, and its retry budget is 1, so a single flake
  burns the only retry.
- **Grader floor:** the grader runs at `opus` on every row, independent of any phase
  tier and never below it (the original `pr.drift_sentinel.spec` tier policy).
- **`fable` is a ceiling, not a floor.** No cell above mandates it. It is reachable only
  by (i) escalating off `opus` on the ladder, or (ii) an explicit operator opt-in
  recorded as `tier_input: { "source": "operator-tier-override", "value": "fable" }`.
  Two reasons it is never mandated: the tier requires 30-day data retention and returns
  `400` wherever the effective retention configuration is below that, so a mandated cell
  would make a whole row unrunnable on any install that has not enabled 30-day retention
  for the calling workspace; and its safety classifiers can decline a
  request (HTTP 200, `stop_reason: "refusal"`, empty content), which reaches the evidence
  tree as a phase that wrote nothing — the same shape the missing-phase-evidence gate
  reads as QUARANTINE.

### Escalation

- **Retry escalation:** each retry escalates the phase agent one tier (`luna` → `terra`
  → `sol` → `nova` in Codex; canonically haiku → sonnet → opus → fable), capped at
  `nova` / `fable`.
- **Other escalation sources:** the stability gate's `escalate` action and the F-6
  operator-resolution re-review use this same ladder and cap.
- **Saturation.** An escalation requested when the agent is already at `fable` does not
  change the tier. Record the unchanged `model_tier` and mark the source saturated —
  `retry-escalation-saturated`, `entropy-gate-saturated`, or
  `operator-resolution-saturated` — so a real escalation is never indistinguishable from
  a no-op in the evidence. Saturation is a recording rule only: it consumes the retry as
  usual and changes no gate, budget, or verdict.
- **Recording:** every attempt's `phase_manifest.json` records `model_tier` and the
  input that selected it (`tier_input`: source + value).
