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
| test | adws-tester | `criteria-to-checks` | All derived checks executed and passing; every emitted `check_specs.check_id` present in `phase_output.json.checks` (SC-5/F-31); each criterion falsifiable (a RED-for-the-right-reason pre-change baseline) or recorded `gate_weak` (SC-3 A1/A2); Critic `pass`; no Advocate dissent; validator not `fail` | 2 |
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
   **Heuristics warn; facts fail (SC-8/F-53).** A validator fails only on something it can
   OBSERVE — no criteria, nothing documented, a path outside `allowed_paths`, a malformed
   patch, a protected branch, missing evidence. Anything it INFERS caps at `warn`:
   `criteria-to-checks` warns on vagueness and fails only on zero criteria;
   `document-coverage-map` warns below 0.7 and fails only on nothing-documented;
   `repo-context-scan` fails on a policy violation and warns on a thin description;
   `review-risk-assess` warns on `risk_level: high` and fails only on an unassessable
   change set. That last one is why the `high` row of the tier table below is reachable at
   all — until v2.0.0 it emitted `fail`, so the run could never reach the recomputation
   that row feeds. This is also why no validator verdict is overridable: a fact is fixed,
   not adjudicated (see `references/artifact-layout.md`, skill_trace).
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
- **A Critic `fail` whose defect is in the CODE** (SC-7/F-46): see "Critic-fail
  remediation" below. Rewinds to `build`, tracked as `cross_phase_rewinds.review` at the
  review gate and `cross_phase_rewinds.test` at the test gate.
- The rewind budgets are INDEPENDENT: spending one never consumes another. The
  check-defect repair (SC-3 A4, `check_defect_repairs`) and the operator-directed repair
  (SC-6 F-37, `operator_directed_rewinds`) are likewise independent budgets, each capped
  at 1. The table below is the authoritative accounting.

### Regression coverage for a repaired defect (SC-13/F-76)

A rewind that repairs a `code` defect must leave behind a check that would catch it again.
Otherwise the only thing between that defect and the next release is the adversarial round
that happened to find it — and a Critic explores a different dimension every time it runs.
Across two consecutive jobs on one deliverable, ten defects were repaired and not one
repair was required to produce a permanent check; the eleventh defect was the ninth's
class resurfacing through the ninth's own fix.

1. **Orchestrator, writing the correction.** Each entry's `check_id` is the id of the
   `criteria-to-checks` spec for the criterion the finding violates. A Critic finding is
   not a check and has no id of its own, so it is joined to the criterion it breaks. If NO
   criterion covers the finding, record that in the entry and surface it — an uncovered
   true defect is a gap in the contract, never a licence to invent an id. Where the finding
   was reproduced, the corpus lives in `{phase}/attempt_{n}/consensus/repro/` (F-77) and
   the correction names it.
2. **Builder, on the rewind attempt.** Add or extend a permanent check that is RED without
   the fix and green with it, inside `allowed_paths`. Record the ids in
   `phase_output.regression_check_ids` and, in `phase_log.md`, the reproduction's observed
   output BEFORE the fix was applied. A regression check nobody watched fail is an
   assertion about the future, not evidence about the present.
3. **Tester, on the forward re-run.** Every id in `regression_check_ids` must appear in
   `phase_output.json.checks` — the existing SC-5/F-31 id-join already enforces this, since
   these are criterion ids — and the reproduction corpus the correction names must be among
   the inputs actually exercised. A criterion repaired in THIS job that comes back
   `gate_weak` fails the gate rather than warning: `gate_weak` means unverified, and
   "unverified" is not an acceptable answer for the defect the job just stopped to fix.

No new validator, DSL, verdict, or exit code — this reuses `check_specs`, the `check_id`
join, and the falsifiability baseline the test gate already runs.

### Rewind budget accounting (SC-7/F-47)

Five budgets can send a job back to `build`. Two things about each were previously
scattered or unstated — the cap, and whether the destination build attempt consumes an
ordinary **build retry** (budget 1). A live run took three build attempts against that
budget with no accounting because the answer was written for only two of the five.

| Budget | Origin | Cap | Consumes a build retry? |
|---|---|---|---|
| `cross_phase_rewinds.test` | test checks fail, tester classifies `code` | 1 | **No** |
| `cross_phase_rewinds.review` | verified Critic `fail` at the review gate (F-46) | 1 | **No** |
| `cross_phase_rewinds.verify` | grader drift BLOCK | 1 | **No** |
| `check_defect_repairs` | tester classifies `check` (SC-3 A4) | 1 | **No** |
| `operator_directed_rewinds.{test,review}` | operator confirms a dissent, `resolution.action: "repair"` (SC-6 F-37) | 1 each | **Yes** |

The gate-automatic rewinds do not draw on the build retry budget because their own
cap-of-1 already bounds them: a rewind is not the builder failing, it is the pipeline
finding a defect the build gate could not see, and charging it to the build's retry would
make the FIRST such finding exhaust the budget and the second impossible. The
operator-directed repair does consume one, because nothing else bounds an operator who
keeps electing `repair` — that is the loop-breaker named in F-37 step 5.

Exhausting a rewind budget is not a retry exhaustion: a second occurrence terminates on
that rewind's own recorded reason (`TEST_GATE_FAILURE`, `REVIEW_GATE_FAILURE`, second
`PR_DRIFT_SENTINEL_BLOCK` → quarantine), never silently.

### Critic-fail remediation (SC-7/F-46)

Before SC-7 the whole rule was "Critic `fail` → gate fails (retry path)". At the TEST
gate that is survivable — a code defect there can reach `cross_phase_rewinds.test`
through the tester's `code` classification. At the REVIEW gate it was a dead end: rule 4
re-dispatches `adws-reviewer` over UNCHANGED code, the review budget is 1, and no rewind
origin admitted a Critic finding. So a Critic that correctly identified a real code
defect at review could only burn the review retry and terminate `REVIEW_GATE_FAILURE`.
That is exactly the inverted incentive SC-6/F-37 removed for the Advocate — the
adversarial agent doing its job well being procedurally indistinguishable from the job
failing — left in place for the other half of consensus. A live run
(`job_20260807_0001`, cadence-method-skill issue #21) hit it, stopped, and asked the
operator, because the spec had no answer.

1. **Reproduce before routing.** The orchestrator MUST attempt to reproduce the Critic's
   finding from the evidence — read the cited code, construct the failing case, run it.
   Verification chooses the ROUTE, never the verdict: a Critic `fail` has already failed
   the gate either way. This is what keeps a wrong Critic from spending a rewind, and it
   is cheap next to the build attempt it gates.
   Work in the orchestrator's own scratch root (`{scratch}/{jobId}/orchestrator/`, per the
   shared scratch block in `references/agent-shared-blocks.md`) and copy the corpus you
   ran into the failing attempt's `consensus/repro/` (SC-13/F-77) so the routing decision
   is re-runnable from the archive. Record what you ran and what you observed in the
   attempt manifest's `gate_failure_detail.orchestrator_reproduction`. Scratch is
   disposable and shared; a probe corpus that only ever existed there has been lost
   mid-verification before.
2. **Reproduced, and the defect is in the CODE** → rewind to `build`. Write the finding
   into a FRESH `build/attempt_{n}/corrections.json` with `classification: "code"` and
   `source_attempt` naming the real origin (`review/attempt_{n}` or `test/attempt_{n}` —
   the enum admits both since SC-6/F-39). Increment `cross_phase_rewinds.review` (review
   gate) or `cross_phase_rewinds.test` (test gate), each capped at 1. The failing gate
   attempt closes `gate_result: "fail"` with the attempt-level `failure_reason:
   "CRITIC_FAIL_REPAIRED"` — an ATTEMPT annotation only, exactly like
   `ADVOCATE_DISSENT_REPAIRED`: never written to `run_manifest.failure_reason`, never in
   the terminal failure-reason classes, never seen by `decideLifecycle`.
3. **Not reproduced** → the finding does not route to build. Take the ordinary retry path
   (rule 4): a new attempt of the same phase at the escalated tier, with a fresh
   consensus round. Record in the attempt manifest that the finding did not reproduce and
   what you ran — a Critic fail is never dismissed silently.
4. **Reproduced, but the defect is in the CHECK or the environment** (a test-gate case):
   route it exactly as the tester's own `check` / `environment` classifications route —
   check-defect repair, or an operator-facing gap. No new path.
5. **Second Critic fail at the same gate**, or the rewind cap already spent → terminate
   `failed` with `{PHASE}_GATE_FAILURE` (`REVIEW_GATE_FAILURE` / `TEST_GATE_FAILURE`).
   **No new terminal state, verdict, or exit code** — this resolves entirely inside the
   existing RETRY vocabulary.
6. **The finding is never erased.** The superseded attempt stays in the tree with its
   `critic.json` intact, and the terminal report scores it (see Consensus rule 4): a
   Critic fail recorded anywhere in a job's evidence forbids a CLEAN promote, the same
   standard an Advocate dissent has carried since F-38.

## Falsifiability at the test gate (SC-3 A1/A2/F-14)

Always-on when `policy.test_policy: required` (an explicit `falsifiability: false` with
required tests is rejected at intake) or when `policy.falsifiability: true`:
before a criterion's check counts as a pass, the tester establishes a PRE-change baseline
and runs the same checks there. The baseline is materialized in a SEPARATE location —
`git archive {target_branch}` into a scratch directory, a temporary worktree/clone created
outside the pipeline worktree, or `git show {target_branch}:<path>` for targeted checks —
and NEVER by reverting the pipeline worktree (F-36). `git stash push --include-untracked`
+ `git stash pop`, which earlier revisions of this section and of `adws-tester.md` named as
the technique, is now PROHIBITED for the same reason `adws-reviewer.md` has always
prohibited it: at the test gate the worktree holds the only copy of an uncommitted, partly
untracked change set, so a dispatch that dies mid-stash orphans the whole build with
nothing to recover from, and any concurrent reader (see F-35 above) silently observes an
empty tree. A criterion is *verified* only if its check went RED
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

Since v2.0.0 (SC-5/F-27) `check_specs` carries EVERY criterion, typed in its
**`check_type`** field (the key is `check_type`, not `type`) as `behavioral` or
`unclassified`; `unclassified` records that the lexical classifier found no outcome verb,
which is a statement about the wording, NOT a verdict on the criterion. An `unclassified`
spec needs a pre-change baseline and an executed check on the same terms as a `behavioral`
one, and is `gate_weak` when it has none. Before v2.0.0 an unrecognized criterion was
omitted from `check_specs` entirely — it silently left the tester's work list while
`test_policy: required` still demanded a check for it. A criterion count that disagrees
with the `check_specs` length is therefore a defect, never an expected narrowing.

Coverage is verified **by id, not by prose** (SC-5/F-31): `adws-tester` echoes each spec's
`check_id` onto the checks it runs, and the gate confirms every emitted id appears at least
once in `phase_output.json.checks`. One id may repeat across several checks; a missing one
is an uncovered criterion and fails the gate. Full emission (F-27) guarantees the criterion
reaches the tester; the id join is what proves it was answered — without it the guarantee
stops at the hand-off, which is exactly where the original defect hid.

That join only works if the tester HAS the specs, so **`criteria-to-checks` is the one
validator that runs before its phase agent** (SC-7/F-45): the orchestrator runs it at
test-phase entry, confirms `check_specs.length == criteria_count`, and passes the specs
into the `adws-tester` dispatch. It is a pure function of the frozen
`task.acceptance_criteria`, so it needs no phase output and running it early costs
nothing. A tester dispatched without the specs can only mint its own ids, which cannot
join back to the criteria — the coverage gate then either fails spuriously or is
satisfied by ids that prove nothing. Deterministic re-runs (e.g. after a rewind) recompute
the same specs, so each fresh test attempt gets its own trace with identical contents.

## Consensus at test and review gates (FR-7)

At the test and review gates, after the phase agent (Architect) produces its output:

1. Spawn **adws-critic** and **adws-advocate** as independent subagents with FRESH
   context: each receives only the task contract and the change set (diff + check
   results). Neither sees the Architect's reasoning nor the other's conclusion. Dispatch
   them in PARALLEL — this is REQUIRED, not merely permitted (C1): the only true
   dependency at these gates is Architect → (Critic ∥ Advocate); the two consensus
   agents have no dependency on each other, so running them concurrently is the
   wall-clock-optimal and mandated form.

   **The parallel set is exactly {Critic, Advocate} (F-35).** That arrow is a
   BARRIER, not a formality: the phase agent must have finished writing its evidence
   — and the phase validators must have run — before either consensus agent is
   dispatched. Never widen the batch to include the phase agent itself. Both
   consensus agents read the worktree the phase agent is still writing, so a
   concurrent dispatch means they may assess a change set that does not yet exist, is
   half-written, or (if the phase agent touches git state) has momentarily vanished.
   The failure is silent by construction — the consensus agents cannot tell a
   mid-write tree from a finished one, and a verdict reached against the wrong tree
   looks exactly like a verdict reached against the right one. A live run took this
   path: at `test/attempt_1` of `job_20260805_0004` the tester ran 23:09:56–23:15:42Z
   while the Advocate assessed at 23:13:02Z and the Critic at 23:14:06Z, both inside
   that window, and the tester's `git stash` baseline (see F-36 below, now
   prohibited) briefly emptied the tree underneath them. The assessments survived on
   the evidence, but nothing in the pipeline would have caught it if they had not.
   Where the dispatch mechanism encourages batching independent calls into one
   message, that guidance is about calls with no ordering constraint; this one has an
   ordering constraint.
2. Reconciliation: unanimous pass → promote. Critic `fail` → gate fails; reproduce the
   finding, then route it per "Critic-fail remediation" above (rewind to build on a
   verified code defect, ordinary retry when it does not reproduce). Advocate dissent →
   record the dissent VERBATIM in
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
   which downgrades to `warn` (still not a clean promote). Since SC-6/F-38 it ALSO
   scans the superseded (non-latest) attempts and downgrades to `warn` on what it finds,
   recording them in the report's `superseded_consensus` array and quoting each verbatim.
   Superseded rounds never FAIL the gate — a later
   attempt already answered them, and the report certifies the job's final state — but
   they can no longer be invisible. The governing rule is simple: **a blocking Advocate
   dissent OR a Critic `fail`, recorded anywhere in a job's evidence, forbids a CLEAN
   promote.** Before F-38 the
   opposite held for the strongest resolution: a dissent the operator conceded and
   repaired vanished behind the later clean round, while an `override` (the dissent was
   wrong, nothing changed) stayed visible. SC-7/F-52 extends the same scan to the Critic,
   which F-38 had left out: the superseded scan read only `advocate.json`, so a Critic
   fail — the other half of consensus, and now a rewind origin in its own right (F-46) —
   disappeared completely the moment a later attempt superseded it. A live run promoted
   reading `consensus: pass — "2 round(s) clean"` after two independent Critics had
   caught two real defects that changed the shipped artifact. Because a failed gate on a
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
   - `action: "uphold"` — operator confirms the dissent and ends the job. Behaves
     exactly as an unresolved dissent: `consensus` gate `fail` → QUARANTINE /
     `ADVOCATE_DISSENT`.
   - `action: "repair"` (SC-6/F-37) — operator confirms the dissent and elects to FIX
     the deliverable instead of ending the job. See "Operator-directed repair" below.
   Only `override` and a COMPLETED `repair` clear the block; uphold, a malformed
   action, or an absent resolution all leave the dissent blocking. `override` creates
   no new attempt, so it preserves the phase's retry budget (the F-3 defect:
   previously a false-positive dissent could only clear by burning a full review
   retry); `repair` deliberately does create new attempts, because its whole purpose
   is to change the artifact.

## Operator-directed repair of a correct dissent (SC-6/F-37)

Before SC-6 the three resolutions above covered only dissents the operator thought
WRONG (`override`, and rule 2's fresh re-review) or dissents that ended the job
(`uphold`). A dissent the operator judged RIGHT had exactly one exit: terminate with
`ADVOCATE_DISSENT`. That inverted the incentive at the most important moment in the
pipeline — the Advocate doing its job well was indistinguishable, procedurally, from
the job failing — and it left the obvious response, "the Advocate is correct, so fix
the deliverable and check again," undefined. A live run (`job_20260805_0004`,
cadence-method-skill issue #5) took that response anyway and had to improvise the
bookkeeping. SC-6 defines it:

1. The orchestrator writes `resolution.action: "repair"` onto the dissenting
   `consensus/advocate.json`, with a `rationale` recording that the dissent was
   CONFIRMED, not overridden.
2. The gate attempt closes `gate_result: "fail"` with the attempt-level
   `failure_reason: "ADVOCATE_DISSENT_REPAIRED"`. This is an ATTEMPT annotation only —
   it is never written to `run_manifest.failure_reason`, never enters the terminal
   failure-reason classes, and never reaches `decideLifecycle`. The terminal verdict
   taxonomy is unchanged; in particular this is NOT the terminal `ADVOCATE_DISSENT`,
   which means almost the opposite (an unresolved or upheld dissent that quarantines).
3. Rewind to `build`: write the dissent into a FRESH `build/attempt_{n}/corrections.json`
   with `classification: "code"` and `source_attempt` pointing at the dissent's real
   location (`review/attempt_{n}` or `test/attempt_{n}` — the enum admits both since
   SC-6/F-39). Then re-run forward from build; each downstream phase opens an ordinary
   new attempt inside its own budget.
4. The build attempt escalates one tier on the standard ladder recording
   `tier_input: { "source": "operator-resolution", "value": "<dissent location>" }` —
   the same F-6 rule that governs rule 2's re-review, for the same reason (the previous
   tier produced work an independent assessor faulted).
5. **Budget.** Track it in `run_manifest.operator_directed_rewinds` (`{ "test": 0,
   "review": 0 }`), capped at 1 per gate. This is an independent budget: it is none of
   the three gate-AUTOMATIC rewinds (`cross_phase_rewinds.test` from failing checks,
   `.review` from a verified Critic fail, `.verify` from a grader BLOCK) nor the
   check-defect repair, and it consumes none of them — see the accounting table above.
   Alone among them it DOES consume an ordinary build retry,
   which is what bounds the loop. When either the repair cap or the build retry budget
   is spent, `repair` is no longer available and the operator's remaining choices are
   `override` or `uphold`.
6. **The dissent is never erased.** `resolution` is a designated post-hoc field on the
   original attempt (`references/artifact-layout.md` rule 2); the dissenting
   `advocate.json` is not edited otherwise and the superseded attempt stays in the
   tree. A repaired dissent surfaces in the terminal report as a `consensus` WARN, so
   the job can reach PROMOTE-with-warnings and never a CLEAN promote (F-38) — the same
   standard `override` has carried since F-3.
7. A `repair` still sitting on a phase's LATEST attempt means the rewind never produced
   a newer round (the job died first). That is not a completed repair, so it stays
   blocking exactly like `uphold`.

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
- **Cross-phase rewind (SC-7/F-48).** A rewind's destination `build` attempt escalates
  one tier on the same ladder, recording
  `tier_input: { "source": "cross-phase-rewind", "value": "<origin attempt, e.g. review/attempt_1>" }`
  (`cross-phase-rewind-saturated` at the ceiling). The rationale is F-6's and F-37's: the
  previous tier produced work an independent assessor or an executed check faulted, so
  the fix attempt is worth more capability. This applies to every rewind origin in the
  accounting table — test-checks, Critic-fail, verify-drift, and the check-defect repair.
  Before SC-7 no enum value covered this, so a live run escalated its rewind build from
  sonnet to opus and had nowhere conforming to record why.
- **The forward re-run after a rewind is NOT a retry.** Once the rewind's build attempt
  passes its gate, each downstream phase opens an ordinary fresh attempt at the **table
  tier** for the current risk level, recording the ordinary
  `contract.risk_level` / `review-risk-assess` source — not `retry-escalation`. Nothing
  about those phases failed; they are being re-run because their input changed. A phase
  that then fails its own gate escalates from the table tier as usual.
- **Saturation.** An escalation requested when the agent is already at `fable` does not
  change the tier. Record the unchanged `model_tier` and mark the source saturated —
  `retry-escalation-saturated`, `entropy-gate-saturated`,
  `operator-resolution-saturated`, or `cross-phase-rewind-saturated` — so a real
  escalation is never indistinguishable from
  a no-op in the evidence. Saturation is a recording rule only: it consumes the retry as
  usual and changes no gate, budget, or verdict.
- **Recording:** every attempt's `phase_manifest.json` records `model_tier` and the
  input that selected it (`tier_input`: source + value).
