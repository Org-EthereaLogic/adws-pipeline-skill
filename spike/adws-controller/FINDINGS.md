# Spike FINDINGS — `adws-run.js` controller (§6.2)

Tracks [docs/SPIKE_CONTROLLER_PLAN.md](../../docs/SPIKE_CONTROLLER_PLAN.md). Throwaway code;
the findings are the deliverable. **No shipped code was modified** — `adws-pipeline/` and
`parity/` are untouched; everything here lives under `spike/`.

> **Status: steps 1, 2 and 3 are implemented.** Q1 is now answered — **one real
> `adws-planner` subagent has been dispatched through the handshake and its evidence gated**
> — along with Q2, Q3 and Q4. **Q5 still decides §6.2 and is only half measured**: the
> round-trip count is now a real number, the line-delta and the token-behaviour half are not.
>
> **The live dispatch found two defects in twenty minutes, and both were in code two
> adversarial rounds had already read.** Both had the same cause: the controller and the
> phase agent write the SAME FILE by instruction, and the controller was reading that file's
> existence as its own act. See findings 18 and 19 — one of them meant a live run went
> terminal with the planner's output unread; the other meant an agent could grant itself its
> own gate and the controller would dispatch the next phase against it.
>
> Step 2 broke a promise step 1 could keep, and the "What step 2 costs" section still states
> it before anything else. **Step 3 does not repeat that**: the one gate it adds is
> single-sourced from the scorer.
>
> **Step 1 status: the four fixes the second adversarial review required are implemented and
> verified.** The counterexample that refuted the previous version is now a standing
> regression test and is refused at three independent layers. That closes the specific
> defect class; it does not re-open the broader claims this file has already retracted
> twice. What is established and what is still unproven are both listed at the bottom.

## History (why this file has been rewritten five times)

1. The first step-1 report overclaimed: a "decisive GO", "Q2 answered decisively", and a
   completed-but-contradicted → QUARANTINE class that was "structurally unreachable."
2. Adversarial review refuted two of three. Root cause: the controller's gate was a
   **partial reimplementation** of the scorer (`computeGate()` read only the top-level
   `rubric_result`), so the two could disagree. Verdict: NO-GO, plus a 6-item checklist.
3. That checklist was implemented and this file claimed it complete. **A second independent
   pass produced a decisive counterexample and refuted the completion claim.**
4. That round's four fixes were implemented and verified, plus six new findings the work
   itself surfaced — two of them defects in my own code (one caught by the new matrix, one
   by self-review). Step 1 closed there.
5. **This version adds STEP 2 — retries and rewinds.** Q3 and Q4 answered; five more
   findings; and one thing step 1 could claim that step 2 cannot, stated up front rather
   than discovered by the next reviewer.

## The counterexample, and what closes it

Record `plan` from an **empty** dispatch directory (an agent that died before writing
anything — the F-12 shape), then clean golden evidence for the other six phases. Before the
fix, with **no post-gate mutation anywhere**:

```
record plan --from <empty-dir> -> gate_result: pass        # WRONG: plan produced no output
… six clean phases …           -> gate_result: pass
finalize                       -> run_manifest.final_status: completed
UNMODIFIED scorer              -> QUARANTINE, exit 2 (pipeline_completion=fail)
verify-canonical.js            -> CANONICAL OK              # WRONG
```

Root cause: `rawGateVerdict()` excluded `pipeline_completion` **wholesale**. That gate does
double duty — (a) phases-not-reached, correctly ignored mid-run, and (b) a phase that WAS
reached but wrote no readable `phase_output.json`, a real per-phase completeness check. (b)
was discarded with (a); `finalize` decided completion from manifest presence alone; the
validator never required `phase_output.json`. Nothing caught it before the scorer.

The same input now, at each of the three layers:

```
record plan --from <empty-dir> -> gate_result: FAIL
    reason: pipeline_completion: 0/7 — Missing phase evidence:
            plan (attempt_1 wrote no readable phase_output.json), …
next                           -> action: terminal, verdict: RETRY
record build                   -> REFUSED, exit 65
finalize                       -> final_status: failed  ->  scorer RETRY / exit 1
verify-canonical.js            -> CANONICAL FAIL (1): no phase_output.json
```

Asserted end-to-end by [run-counterexample.sh](run-counterexample.sh), which also covers the
case the old negative driver could not: a **post-gate mutation**, where every gate is already
written before the evidence is corrupted. There, no per-phase gate can catch it and finalize
must — it retracts `completed` to `quarantined`, and the scorer QUARANTINEs at exit 2.

## STEP 1 — the four fixes the second review required

### 1. `record` rejects a phase that wrote no readable evidence

[`gateVerdict()`](adws-run.js:253) now asks the scorer two questions from one
`buildReport()`. The completeness half is single-sourced without re-deriving anything: after
recording phase *i*, exactly *i+1* phases have been reached, so if the scorer's own
`pipeline_completion` count reports fewer than *i+1* complete, the phase just recorded wrote
no readable evidence. The count comes from the gate's `value`, not its pass/fail status, so
the not-yet-reached phases and the `final_status` term cannot contaminate it.

Ordering matters: `record` writes the `phase_manifest` **first** with `gate_result: null`, so
the scorer sees a structurally complete entry and answers about the *output* rather than
about the manifest the controller is in the middle of writing. `gate_result: null` cannot
skew the read — the only gate that consumes it, `phase_gates`, is excluded as circular.

### 2. `finalize` derives readiness from the scorer's full terminal gate set

[`cmdFinalize()`](adws-run.js:416) asserts `completed`, asks the scorer, and **retracts**
before leaving the file on disk if the answer is not PROMOTE. Retraction goes to
`quarantined` when the scorer quarantines — writing `failed` there would *downgrade* a
quarantine, since `decideLifecycle` maps a `failed` job with a retriable reason to RETRY /
exit 1. Verified by the mutation case above and by `quarantine_unreadable_manifest` in the
matrix, where the fixture's runtime `chmod 000` is applied after every gate is written and
finalize is the only thing standing between it and a false promote.

### 3. Controller and validator reconciled with the real contracts

| Contract | Source | Was | Now |
|---|---|---|---|
| Provenance mandatory half | SKILL.md:192; artifact-layout.md F-17 disposition; [provenance-fixtures/run-tests.js:17](../../parity/provenance-fixtures/run-tests.js) | all-null advisory object — precisely the "thirteen field runs" shape the harness says must now be **rejected** | `started_at`, `completed_at`, derived `wall_clock_s`, `agent`, `model_tier_requested` present and non-null; the five structurally-unavailable keys present and `null` |
| Agent id | artifact-layout.md:147 | `planner` | `adws-planner` |
| Tier source | phase-gates.md FR-12 | `contract.risk_level` on all seven | `contract.risk_level` for plan/build/test/review; `review-risk-assess` for document/ship/verify, read from review's own recorded validator trace |
| Phase output | execution-report.js `missingPhaseEvidence` | not required by the validator | required, in every attempt dir |

Two consequences worth stating plainly:

- **`run_manifest.model_tiers` is now genuinely heterogeneous**, as artifact-layout.md says
  it should be. The golden contract carries no `risk` block (→ `medium`), while
  `review-risk-assess` recomputes `low` from the actual change set, so document/ship/verify
  are re-keyed at the review gate and record `{"source": "review-risk-assess", "value":
  "low"}`. The controller **refuses** to record document/ship/verify if review recorded no
  such risk, rather than substituting contract risk under a mislabelled source.
- **`wall_clock_s > 0` is unrepresentable for an instantaneous mocked dispatch.** The
  contract requires the value to be `> 0` *and* to equal the difference of two
  second-precision stamps. A mocked dispatch returns in microseconds, so the options were to
  fabricate a duration or let one really elapse. [`record` blocks until a whole second has
  genuinely passed](adws-run.js:128) since the dispatch stamp `next` took. A real dispatch
  never reaches that sleep; the fixture-ingest matrix bypasses it by replaying each fixture's
  own recorded stamps, since it is replaying evidence rather than dispatching.

### 4. The audit-only matrix is replaced by a fixture-ingest matrix

[run-ingest-matrix.js](run-ingest-matrix.js) drives each fixture's evidence through
`init → next/record ×N → finalize` and asserts the expectations **read out of**
`parity/execution-report-fixtures/run-tests.js` (that file has no `require.main` guard, so
requiring it would run the suite and chmod the committed fixtures; the `CASES` literal is
extracted textually and evaluated, so upstream changes surface here rather than drifting).
The old matrix's agreement was tautological — `audit` and the CLI shared one `buildReport()`.

```
fixtures: 25   MATCH: 6   ADJUSTED: 1   EXPLAINED: 15   LIMIT: 3   MISMATCH: 0
modes:  DRIVEN=7   HALTED=10   REFUSED=8
```

Two invariants are asserted, both generalisations of the counterexample:

- **I1** — no fixture the harness refuses to promote may come out of the controller as a
  promote. (0 violations.)
- **I2** — every official PROMOTE either reproduces exactly (decision + warn_flag +
  exit_code) or is REFUSED for a **declared** limit. Three are declared: the multi-attempt
  fixtures (`promote_repaired_dissent`, `promote_repaired_critic_fail`,
  `promote_retry_recovered`) need retries, which are step 2. **The step-1 controller cannot
  reproduce 3 of the 9 promote fixtures** — a coverage statement the old name-derived matrix
  could not have made.

`REFUSED=8` is itself a result. Three distinct causes, all reported per row: multi-attempt
(4), a phase with no attempt (3), and one that is more interesting — see below.

## New findings from step 1

1. **My own mock helper was erasing fixture evidence, and the matrix caught it.**
   `mk-risk-trace.js` supplies the FR-12 risk trace the minimal fixtures lack. Its first cut
   wrote unconditionally — and `quarantine_trace_mismatch`, `_inverse` and `_case` each hide
   their entire defect *in that exact file* (a forged wrapper verdict over the validator's
   own output). All three silently turned clean and promoted: three I1 violations from one
   helper. The helper now refuses to overwrite (exit 5) and the driver only injects where no
   trace is recorded. **Same class as the `chmod` copy-fidelity finding from the previous
   round** — a driver that mutates a fixture while claiming to replay it. Two for two: both
   times the harness was wrong before the controller was.
2. **A defect recorded in `gate_result` is not ingestible by construction.**
   `quarantine_phase_gate_fail`'s only defect is `document/attempt_1` recording
   `gate_result: fail`. The controller *derives* that field from raw evidence and writes it
   itself, so replaying the same raw evidence can only reproduce the verdict the evidence
   supports. REFUSED with that reason stated, rather than counted as agreement or as a miss.
3. **Mock effects are measured, not assumed.** Supplying the missing `review-risk-assess`
   trace to `promote_absent_optional` — the fixture that pins tolerance of an absent optional
   subtree — moves the *fixture itself* from PROMOTE/10 to PROMOTE/0, because the injected
   trace turns `skills_clean` from `unverified` to `pass`. The matrix scores the fixture with
   and without the injection on copies, ADJUSTS that row's expectation to the measured value,
   and prints the effect. Where a plain copy fails to reproduce the official expectation at
   all, that is failed as a copy-fidelity defect in the driver.
4. **Open: a halted job flattens two documented non-retriable classes.** Ten halted fixtures
   score RETRY/1 where the completed-tree fixture expects QUARANTINE/2. Most of that gap is
   correct and not a downgrade — the `retry` fixture is *itself* a Critic-fail halt
   (`final_status: failed`, `TEST_GATE_FAILURE`) that the official harness expects at
   RETRY/exit 1, so stopping at the offending gate is the documented shape, and the
   QUARANTINE expectations describe a different tree: one that claimed `completed` anyway.
   The real issue is narrower: `finalize` writes a blanket `PHASE_GATE_FAILURE` for every
   halt, while the scorer's own vocabulary has non-retriable classes — `NO_RETRY_REASONS`
   includes `ADVOCATE_DISSENT`, and `QUARANTINE_REASONS` includes `MISSING_UPSTREAM_ARTIFACT`,
   which artifact-layout.md names as the class of a skill_trace/validator disagreement. For
   those two the flat reason **is** a severity downgrade. It is recorded, not patched:
   classifying it needs a reason mapping the controller can *source* from the scorer, and
   deriving it by parsing gate detail strings is the same partial-reimplementation trap that
   produced the original divergence.
5. **Two limits found by self-review, both left in and stated rather than engineered around.**
   - The completeness check compares the scorer's count against the number of attempt
     *directories* present, not against the index of the phase being recorded. Those are the
     same in this controller's own flow, but the first cut used the index — and a stray or
     pre-existing later-phase directory with complete evidence would then have been counted
     toward the total and masked an incomplete current phase. Fails closed now; planted and
     confirmed (a complete `document/attempt_1` no longer lets an empty `plan` gate `pass`).
   - `finalize` writes `completed` to disk before asking the scorer, because `buildReport()`
     reads `final_status` from the file. A SIGKILL inside that window leaves `completed` on a
     tree that would have been retracted. Deciding without writing would mean substituting a
     gate whose only failing term is the claim being made — the partial-reimplementation trap
     again — so the window stays, and re-running `finalize` corrects it. Idempotency under
     re-invoke is already on the unproven list.
   - Related trust boundary: `record --started-at/--completed-at` accept caller-supplied
     stamps (the fixture-ingest matrix replays each fixture's recorded timings with them).
     Nothing can validate a stamp's truthfulness; in the real design the orchestrator owns
     the live `date -u`, and here `next` takes it.
6. **A previous claim in this file was wrong.** It listed "string-vs-integer `attempt`" among
   the golden fixture's violations. No fixture writes a string `attempt`
   (`grep -rl '"attempt": "'` returns nothing); the check exists and is correct, but it has
   never fired on this corpus.

## STEP 2 — retries and rewinds

Step 1 answered Q2 (evidence compatibility). Step 2 is the plan's §10.2 — "add build + the
test→build rewind, mocked outputs" — and it answers **Q3 (budget-as-code)** and **Q4
(idempotency)**. Q1 and Q5 remain untouched: every dispatch is still MOCKED.

Driven and asserted by [run-step2.sh](run-step2.sh), 103 assertions over twelve jobs, against
the purpose-built [fixtures/](fixtures) the plan asked for in §5.2 and step 1 did not need.

### What step 2 costs, stated first

Step 1 could keep a promise step 2 cannot. Every gate decision came from the scorer's own
evaluators, so there was no hand-rolled gate logic that could diverge — which is exactly the
defect round two found and round three closed. **A retry or a rewind is triggered by
something `execution-report.js` does not read:**

- it has no gate over `test/attempt_n/phase_output.json.checks[]`, so a run whose checks all
  failed scores exactly like one whose checks all passed;
- it never sees `classification`, the field that decides whether a failure routes to `build`
  (`code`), to a check-defect repair (`check`), or to the operator (`environment`).

So the controller now owns a gate the scorer is silent on. That is not a defect in the
scorer — the terminal report certifies a finished tree, and these are mid-run routing
questions — but it does mean "single-sourced from the scorer" is no longer the whole story,
and pretending otherwise would repeat round two. Three things bound it:

1. **The scorer stays authoritative wherever it speaks.** `phaseGate()` asks it FIRST and a
   scorer `fail` is final. The step-2 layer can only ADD failures; nothing in it can clear one.
2. **The added evaluation is keyed to the contract, not to the evidence.** It runs when
   `policy.test_policy` is `required` — the same switch `phase-gates.md` uses to make
   falsifiability always-on — and not when the evidence merely happens to carry a `checks`
   array. A reader that relaxes because the evidence in front of it looks thin is how the
   golden fixtures came to violate the writer floor 66 times with nothing noticing.
3. **A reduced gate is loud.** `test_gate_scope: "full" | "reduced"` is on every `init`,
   `next` and `record` message, and `init` lists the contract's missing required fields. None
   of the 25 corpus contracts declares a `test_policy`, so every ingest-matrix row prints
   `reduced` — the gap is visible in the driver output, not inferable only from this file.

### Q3 — budget-as-code: **yes**, with the accounting asserted

The plan's §3 case, `S1` in the driver: a test attempt whose checks fail and whose tester
classifies them `code` produces exactly one rewind to build, with everything
`phase-gates.md` prescribes and nothing else.

| Claim (phase-gates.md) | Asserted value |
|---|---|
| `cross_phase_rewinds.test` increments | 0 → 1, and stays 1 on a second occurrence |
| it does **not** consume a build retry | `build.retries_used` 0/1 after the rewind attempt |
| a `corrections.json` (classification `code`) lands in the FRESH build attempt | `source_attempt: test/attempt_1`, `regression_check_id: CHK002`, `repro: null` |
| the build attempt escalates one tier | sonnet → opus, `tier_input.source: cross-phase-rewind`, `value: test/attempt_1` |
| the forward re-run is NOT a retry | `test/attempt_2` at the TABLE tier, `tier_input.source: contract.risk_level` |
| a second code failure terminates `TEST_GATE_FAILURE` | attempt annotation `REWIND_BUDGET_EXHAUSTED` → terminal reason `TEST_GATE_FAILURE`, scorer RETRY / exit 1 |

**The F-47 tree, reproduced.** F-47 was opened because "a live run took three build attempts
against that budget [of 1] with no accounting." `S3` builds exactly that tree — a `code`
rewind, then a `check`-classified failure taking the independent check-defect repair — and
asserts the accounting survives it:

```text
build attempts : 3        origins: initial, rewind, rewind
build retries  : 0/1      cross_phase_rewinds.test: 1   check_defect_repairs: 1
test  attempts : 3        retries: 0/2                  -> finalize PROMOTE / exit 0
```

The counting rule is the whole of F-47's answer in code: `retriesUsed()` counts attempt
ORIGINS, not attempt directories. Counting directories is precisely what let that live run
overspend without anything noticing.

**The escalation ladder, checked against recorded evidence rather than its own arithmetic.**
`S4` drives an unclassifiable failure to budget exhaustion and gets sonnet → opus → fable
with `tier_input.source: retry-escalation`, terminating `TEST_GATE_FAILURE`. That is the
ladder the `retry` fixture recorded by hand, and the ingest matrix now **replays that fixture
end to end and reproduces its tiers exactly** (see below) — the only external check on this
logic that is not this spike marking its own homework.

**SC-13/F-76 is enforced on both halves — after two failed attempts at it** (finding 14). The
rewind build attempt must echo each `regression_check_id` in
`phase_output.regression_check_ids` (`S6a`); the forward test re-run must carry a check row
under the correction-scoped id the CONTROLLER minted at rewind time (`S6b`/`S6b2`/`S6b3`); and
a criterion repaired in this job that comes back `gate_weak` fails rather than warns (`S6c`).
The minted id is the load-bearing part: step 3(b) asks for "a NEW row … not a pre-existing row
for the same criterion", and no field the TESTER writes can answer that, because every one of
them is a field the tester can edit.

**The gate requires schema-valid SUCCESS, not merely the absence of failure** (finding 14).
"All derived checks executed and passing" is only checkable if a row says so in the documented
shape, so every row is typed and coherence-checked first — `verdict: "verified"` requires
`pass: true` and `falsifiable: true`, `falsifiable: true` requires a RED pre-change baseline
for the right reason, and a row that cannot be read fails CLOSED. `S5b` is the standing
regression.

**One validator now actually runs.** `criteria-to-checks` is the one that must run BEFORE its
phase agent (SC-7/F-45), so the controller runs it at test-phase entry, checks
`check_specs.length == criteria_count`, writes its `skill_trace.json`, and hands the specs to
the tester in the dispatch action. Every other validator is still fixture-supplied;
generalising is mechanical but is real work, since each has its own input shape.

### Q4 — idempotency: **yes**, and it cost one design change

`S7` asserts three properties: two `next` calls on an unchanged tree are **byte-identical**
(with a second of real time between them), re-recording a recorded attempt is refused
(exit 65), and a second `finalize` leaves `run_manifest.json` byte-identical and returns the
same exit code.

The first of those did not hold in step 1. `next` re-stamped `.dispatch.json` on every call,
so two calls returned two different `started_at` values — no double-advance, but not
idempotent, and the plan calls Q4 critical *because the model may call `next` twice*. The
marker is now write-once per `(phase, attempt)`. The trade is real and worth naming: keeping
the first stamp charges any idle time between the two calls to the dispatch, while
re-stamping would keep the duration tight and lose the property the success criterion asks
for. The criterion decides it.

`finalize` now writes `completed_at` only when it is null, which also honours timestamp
integrity (rule 9): the terminal moment is the first one, not the last time someone asked.

### Where the documents do not settle it — four decisions, marked as decisions

None of these is derivable from `phase-gates.md` or `artifact-layout.md`. Each is a position
taken, implemented, and recorded so a reader can disagree with it.

1. **A forward re-run does not consume the re-running phase's retry budget.** The docs say
   "the forward re-run after a rewind is NOT a retry", but that sentence sits in the section
   about TIER selection, and the accounting table only ever asks whether a *build* retry is
   consumed. Charging it would mean one rewind halves the test budget — the mirror of the
   argument the table itself gives for not charging the build. So: not charged, and both
   halves of the reasoning are here.
2. **Routing precedence is `code` > `check` > `environment`** when one attempt carries several
   classifications. The docs define each route and never say which wins. `code` is the only
   class the pipeline can act on by itself, and nothing is lost: an environment gap is not
   repaired by a build, so it re-surfaces on the forward re-run and routes to the operator
   then, with the code defect already fixed.
3. **An environment/prerequisite gap HALTS.** Here the two documents genuinely disagree:
   the rewind section says the criterion is "recorded and surfaced to the operator as a warn"
   (non-blocking vocabulary), while the per-phase exit criterion requires "all derived checks
   executed and passing" (blocking) — and F-9 says `NOT RUN` is neither a pass nor a valid
   red. The controller emits `action: "operator"`, spends no budget, and refuses to advance
   or auto-retry. It will not guess a route, and this spike has no operator channel to
   resolve one.
4. **Four attempt-level route annotations** — `TEST_REWIND_TO_BUILD`, `CHECK_DEFECT_REPAIR`,
   `ENVIRONMENT_GAP`, `REWIND_BUDGET_EXHAUSTED` — are how `next` reads a routing decision back
   off the tree. They follow the precedent of the documented `CRITIC_FAIL_REPAIRED` /
   `ADVOCATE_DISSENT_REPAIRED` annotations, and `finalize` **asserts** none of them can reach
   `run_manifest.failure_reason` (it exits 70 if one ever does), because phase-gates.md is
   emphatic that attempt annotations never enter the terminal classes.

### New findings from step 2

7. **`corrections.json` is part controller, part model — and that is a result for the thin-SKILL
   sketch (§8 of the plan).** The controller can source the structure, the ids, the
   `source_attempt`, the classification and the `regression_check_id` deterministically. It
   cannot source `guidance` (SC-13/F-75: `invisible_because`, `direction_of_error`,
   `must_not_regress`, `tie_breaking`, `housekeeping`) — every one of those is a judgment
   about the change, and synthesising them from a check row would fabricate exactly the
   content F-75 exists to make real. `path` is the same: the documented test check row has no
   path to transcribe. So the controller writes `guidance` not at all and `path` as `""`, and
   the handshake needs a channel for the model to supply both. F-75 was written because a
   live rewind's guidance went unread; guidance the controller *invents* would be worse.
8. **`repro` is shaped for F-46 Critic findings and does not fit an A3 tester-check rewind.**
   It names an archived corpus under `{phase}/attempt_{n}/consensus/repro/` and is "null only
   when the finding was never reproduced by running anything". A failing tester check *was*
   run, but it has no consensus corpus — its `check_id` is the re-runnable handle. The
   controller writes `repro: null` and this asymmetry is recorded rather than papered over.
9. **`gate_failure_detail` is instructed by one document and absent from the other.**
   `phase-gates.md` line 202 tells writers to record what they ran in the attempt manifest's
   `gate_failure_detail.orchestrator_reproduction`; `artifact-layout.md`'s `phase_manifest`
   shape block does not list the key at all, and rule 8 calls an undocumented key schema
   drift. The controller writes `gate_failure_detail` and the validator types it rather than
   rejecting it. Same class as the `agent` id disagreement above.
10. **The corpus's own `corrections.json` files miss two SC-13/F-76 required fields.** Both
    fixtures that carry one (`promote_repaired_dissent`, `promote_repaired_critic_fail`) omit
    `regression_check_id` and `repro` on a `code` correction — 4 more writer-floor violations,
    found by pointing the extended validator at the real corpus. They predate SC-13; the
    point is that nothing else would have noticed.
11. **Eleven fixtures record `verify: haiku`.** The FR-12 table puts verify at `sonnet` on
    every risk row *and* names an explicit safety floor (`verify ≥ sonnet`, because its
    conditional-suppression rule fails toward a false QUARANTINE and its retry budget is 1).
    The recorded tier is below the floor. Surfaced by the matrix's new tier cross-check, which
    otherwise reports agreement on every attempt it drove.

12. **A defect the review round found in my own F-76 check, and the semantic bug fixing it
    exposed.** The first cut identified a check row by its whole serialized value, so a row was
    "new" if any field of it had changed. But `check_id` is a CRITERION id and one criterion
    may carry several checks — so a pre-existing STRUCTURAL row whose `output` merely changed
    between attempts serialized differently, counted as new, and discharged the regression debt
    while the behavioural assertion never ran. That is the exact substitution F-76 exists to
    catch ("an OLDER row would satisfy [the criterion join] while the new regression assertion
    never ran at all") wearing a different disguise, and my own fixture set could not see it
    because every fixture happened to change the row that mattered. Row identity is now the
    ASSERTION — `(check_id, check)` — and `test_pass_mutated_structural` is the standing
    regression for it.
    Tightening the rule immediately broke `S3`, and the break was correct: comparing against
    *every* earlier attempt meant the regression assertion added for the first excursion was
    "not new" on a second excursion's re-run, failing a job for doing exactly what F-76 asked.
    "Pre-existing" means pre-existing **at the time of the repair**, so the cutoff is each
    correction's own `source_attempt`. A single-excursion fixture set cannot distinguish those
    two readings; a two-excursion one does.
13. **The ship gate is not validated, and that is scope, not an oversight — but it is worth
    stating plainly.** `phaseGate()` has no ship branch and never runs `ship-mode-select` or
    `patch-compose`, so `fixtures/ship/phase_output.json` passes with `pushed: true`, a
    `/pull/0` URL and an all-zero `commit_sha`, though `pr` mode requires a live PR URL. The
    sentinel values are deliberate — a mock that looked like a real PR URL would be worse — and
    the general point is the one already made above: eight of the nine validators are still
    fixture-supplied, so every gate except the test gate's checks layer is exactly as strong as
    the scorer, and no stronger.

14. **Two fail-OPEN defects in the gate this controller owns outright, both found by an
    independent review, neither by me.** They are the same mistake in two places: checking for
    the presence of a failure rather than for the presence of a success.
    - **The test gate accepted rows that said nothing.** Failure was recognised only as
      `pass === false || verdict === "fail"`, so three rows carrying nothing but `{check_id}`
      were neither failing nor malformed, cleared the SC-5/F-31 coverage join, and the gate
      returned `pass`. The exit criterion is "all derived checks EXECUTED and PASSING" and
      the implementation could establish neither. Every row is now typed against the
      documented shape AND checked for internal coherence, and anything unreadable fails
      closed. Fixture `test_bare_ids`.
    - **F-76's row identity was still model-editable.** After the CodeRabbit round moved
      identity from the serialized row to `(check_id, check)`, the review simply RENAMED the
      old structural assertion to the regression check's text: it looked new, and the gate
      passed with the behavioural assertion never having run. Fixture
      `test_pass_renamed_structural`.

    The second one is the more instructive. Three successive identities — serialized row,
    `(check_id, check)`, and before either of them the bare `check_id` — all failed for one
    reason: **every candidate was a field the tester writes, and the tester is the party the
    check constrains.** The id has to come from outside, so the controller now MINTS
    `REG-{source_attempt}-{k}` for every `code` correction and requires the forward attempt to
    carry a row under it. Nothing the tester renames can produce that id, and an id that
    pre-dates its own repair is rejected too.

    **This deviates from the letter of SC-13/F-76** and the deviation is deliberate. The doc
    reserves minted `REG-` ids for findings that no criterion covers, and says a
    criterion-covered finding reuses the criterion's `criteria-to-checks` id. But `check_id`
    names the CRITERION, and one criterion may legitimately carry several checks — so the
    doc's own step 3(b) is not decidable from the id the doc tells you to use. The doc's
    rationale for `REG-` ids carries over unchanged ("outside the criteria namespace by
    construction … never disturb the SC-5/F-31 criterion-coverage join"), the criterion is
    still recorded in the same entry's `check_id`, and the criterion-coverage join is
    untouched. **This is worth raising against the skill itself**: as written, F-76 asks the
    orchestrator to verify a property the evidence schema cannot express.
15. **The shipped CI gate does not execute or syntax-check `spike/`.** `scripts/local-ci/gate.sh`
    validates the shipped paths, which is correct — the spike must not be able to affect them.
    But it means "make ci PASS" was never evidence about this code, and a NUL byte in
    `adws-run.js` (CodeRabbit round) and every defect above lived through several green runs.
    `run-step2.sh` now ends with its own sweep: `node --check` / `bash -n` over every file in
    `spike/adws-controller/`, plus a NUL-byte scan. Reported as a limit of the validation
    claim, not fixed by widening a shipped gate for throwaway code.

### The ingest matrix, re-measured

Step 2 changed how the matrix decides what it can replay, and the change is worth stating
because the first version of it was wrong in an instructive way.

The old driver **predicted** unrunnability: it refused any fixture with more than one attempt
("retries are step 2"), any fixture missing a phase, and any fixture whose `attempt_1`
recorded a non-pass `gate_result`. The first is obsolete. The other two were proxies, and
they refused `retry` and `promote_retry_recovered` sight-unseen — the two fixtures whose
recorded ladders the controller can now replay exactly.

It now **measures** while driving, and the asymmetry is the point. My first cut compared the
derived gate against the recorded one and stopped on any disagreement, which collapsed ten
informative rows into "refused" and lost the halt signal entirely. The two disagreements are
not the same thing:

- **recorded non-pass, derived `pass`** — the controller is WEAKER than the record, so the
  fixture's defect lives in a field the controller computes. Stop before finalize: this is
  the I1 exposure. One fixture (`quarantine_phase_gate_fail`).
- **recorded `pass`, derived `fail`** — the controller is STRICTER: it caught at record time
  what that fixture's recorded gate waved through. Keep driving, and count it. **Ten
  fixtures.** This is not a corpus defect — those fixtures exist to prove the *terminal*
  report catches what a phase gate missed (hard rule 8), so the permissive `gate_result` is
  deliberate. The controller catching them one layer earlier is the result.

```text
fixtures: 25   MATCH: 7   ADJUSTED: 1   ROUTE-DIFF: 2   EXPLAINED: 15   LIMIT: 0   MISMATCH: 0
modes: DRIVEN=10  HALTED=2  REFUSED=13
```

- **LIMIT: 0.** Step 1's three declared limits were all "build has 2 attempts (retries are
  step 2)". All three are gone: `promote_retry_recovered` is now DRIVEN and MATCHes
  PROMOTE/0 by replaying its recorded retry ladder, and the other two reproduce their triple
  by a different route (below).
- **`retry` replays end to end** — HALTED at test with RETRY/exit 1, matching the official
  expectation, having reproduced its recorded sonnet → opus → fable escalation.
- **ROUTE-DIFF: 2.** `promote_repaired_dissent` and `promote_repaired_critic_fail` reproduce
  `PROMOTE/10` exactly, but by RETRYING review where the recorded run rewound to build: those
  are the F-37 operator-directed repair and the F-46 Critic-fail rewind, both out of step-2
  scope. Two recorded attempts each go unused and the tier diverges accordingly
  (review/attempt_2 recorded `opus`, derived `fable`). Counted as its own verdict class so it
  can never be read as a clean replay — the triple reproduced, the run did not.
- The **severity question (finding 4) has not moved** and is still open. It now shows on one
  halted fixture instead of ten, only because the other nine stop earlier for a different
  reason.

## STEP 3 — one live `adws-planner` dispatch

### Q1 — the handshake works in-harness: **yes**

One real `adws-planner` subagent, dispatched through the Agent tool at the tier the
controller advertised, writing into the attempt directory the controller named, gated by
`record` with no fixture behind it.

| | |
|---|---|
| contract | [`fixtures/live_contract.json`](fixtures/live_contract.json) — a real open item in this repo (the terminal `failure_reason` severity split, step-1 finding 4) |
| worktree | a detached `git worktree` of `ba2f9d2`, so the live agent could not reach the working tree; discarded after the run |
| tier | `opus`, from `tier_input: { source: "contract.risk_level", value: "medium" }` |
| gate | **`pass`** — `task-normalize` `rubric_result: pass`, `delta_r` 0.1883 |
| tree | **CANONICAL OK** against the writer floor |
| evidence | archived at [`fixtures/live_plan_attempt/`](fixtures/live_plan_attempt/) and replayed by `run-step3.sh` |

The planner produced a genuine plan — three files, all inside `policy.allowed_paths`, four
criteria mapped — and returned three findings about the repo that no fixture would have
produced, including a pre-existing doc/code disagreement about `PR_DRIFT_SENTINEL_BLOCK`.
That is worth stating because it is the part a mock cannot simulate: the dispatch did real
work against real files, and the handshake carried it.

**What Q1 actually required, and did not have.** Steps 1 and 2 answered everything they
answered against `record --from <dir>` — a replay of evidence someone else wrote. That is
the right oracle for compatibility and budgets, and it cannot answer Q1, because a replay
never exercises the two things a live dispatch needs:

1. **A payload the model can act on.** `next` carried `attempt_dir`, `model_tier` and
   `inputs`. SKILL.md step 1 requires a dispatcher to hand an agent five things: the contract
   path, the worktree path, the attempt directory, the previous phase's `phase_output.json`,
   and an absolute `scratch_root` (SC-13/F-77). Three were missing. Anything the model has to
   re-derive from the tree is state the handshake failed to move, which is the whole §6.2
   claim. `next` now emits all five, `run-step3.sh` asserts each one **exists at the moment
   it is advertised**, and `init` grew `--worktree` so `worktree_path` is real.
2. **A gate with no fixture behind it.** A replayed plan attempt arrives with its validator
   trace already recorded. A live one does not. So `record` now runs `task-normalize` — the
   plan gate's own validator, and the second of nine this controller runs.

### The one gate step 3 adds is single-sourced — unlike step 2's

Step 2's cost was owning a gate the scorer is silent on. Step 3 does not repeat it. The
`task-normalize` trace is written **before** `phaseGate()` runs, so the scorer's own
`skills_clean` evaluator is what turns a validator `fail` into a gate failure. There is no
comparison in controller code to diverge.

`run-step3.sh` S4 asserts this with a negative control that is not contrived: the **golden
fixture's own contract**, which `task-normalize` scores `fail` (it has no
`requested_change`). Same live evidence, different contract → `gate_result: fail`, and the
recorded reason names `skills_clean`, the scorer's gate, rather than any controller check.

### The live/replay split, and why it is keyed to the caller

`--from` now declares which mode a `record` call is in, and it is the **only** thing the
split keys off. Live mode runs the validator; replay mode ingests the trace the fixture
recorded, exactly as it already ingests that fixture's consensus and grader files.

That is keyed to **who authored the attempt** — a fact the caller states on the command
line — and never to how the evidence looks. The distinction is the one step 2 had to learn
twice: a reader that relaxes because the evidence in front of it looks thin is how the golden
fixtures came to violate the writer floor 66 times with nothing noticing.

### New findings from step 3

**16. Every one of the 25 corpus fixtures records a plan verdict its own validator refutes —
and the check built to catch that is inert against all of them.**

Running `task-normalize` on each fixture's contract, which is what the recorded trace claims
to be a transcription of:

| | count |
|---|---|
| fixtures surveyed | 25 |
| whose contract `task-normalize` scores **`fail`** | **25** |
| recording `rubric_result: "pass"` with **no `output` key** | 21 |
| recording no plan trace at all | 4 |

Not one recorded verdict is reproducible. `promote_clean` — the tree this spike has driven
to PROMOTE since step 1 — ships `plan-coherence: pass` over a contract whose required
`requested_change` field is absent, which the validator scores `fail` with `synthetic_risk:
high`.

SC-8/F-55 exists precisely for this: a `skill_trace.json` "WRAPS the validator CLI's stdout —
its `rubric_result` must be exactly what the validator printed, which `output` also carries",
and the scorer fails `skills_clean` on a disagreement. The check is a **tolerant reader**:
"Absent or unrecognized `output.rubric_result` (older traces, crashed validators) leaves the
wrapper untouched." Every corpus trace omits `output`. So the fixtures predate the field that
would convict them, and the mismatch detector — including the four fixtures built *specifically*
to test mismatch detection — cannot see the largest mismatch in the corpus.

**This does not mean the corpus is wrong to score as it does.** These are scorer fixtures:
they exercise `execution-report.js`'s reading of a trace, and for that purpose a hand-authored
`pass` is a legitimate stimulus. It means something narrower and more useful: **the corpus
cannot be used as evidence that a real pipeline run's plan gate ever passed**, and any
controller that recomputes a validator instead of ingesting its trace will disagree with all
25 of them. That is why `record --from` does not recompute. Asserted in `run-step3.sh` S7.

**17. The plan gate has the same silence as the test gate, one phase earlier — and closing it
would reject the entire corpus.**

`phase-gates.md` states the plan gate as "Plan written with **per-criterion file-change
proposal**; validator not `fail`". The validator half is real now. The first half is not
evaluated by anything: `pipeline_completion` checks only that `phase_output.json` is
*readable*, and nothing reads `file_change_proposal` or `criteria_map`.

Zero of the 25 corpus plan outputs carry either field — they carry `{"plan": {"steps": [...],
"coherence_score": 0.94}}`, a shape `adws-planner.md` does not describe. So a controller that
enforces the documented exit criterion rejects the whole recorded corpus.

Deciding which of the two disagreeing sources is the contract — the reference documents or
the recorded evidence — is not a spike-local call, and step 2's `test_gate_scope` precedent
says what to do meanwhile: make the reduced gate **loud** rather than inferable. `planLayer2`
therefore covers only what is decidable without picking a side — `planning_blocked: true`, the
planner's own explicit refusal, which nothing in the scorer reads and which previously gated
`pass` — and every plan handshake message reports
`plan_gate_scope: "refusal-and-validator"`. `run-step3.sh` S6 asserts the refusal **and**
asserts the limit: a plan output with no `file_change_proposal` still passes, recorded as a
DECLARED LIMIT so it cannot be quietly forgotten.

The absence of a declared block is not the presence of a plan. Saying so in the gate's own
scope string is the mitigation; it is not a fix.

**18. The live dispatch went TERMINAL before `record` ever ran — because the agent writes the
file the controller used as its own bookkeeping.**

`record` refused with `the job is at 'terminal'`, on a tree where the planner had just
written a perfectly good plan. `expectedNext` had read `plan/attempt_1/phase_manifest.json`,
found `gate_result: null`, and taken the `undecided is not a verdict` branch →
`QUARANTINE`.

The manifest was the **agent's**. `adws-planner.md` line 21 instructs it: "write
`phase_manifest.json` per `references/artifact-layout.md` — write `"gate_result": null`; the
gate decision is the ORCHESTRATOR'S designated post-hoc field, never yours." The agent did
exactly as told.

The controller had used file **presence** as its marker for "this attempt has been recorded",
and that held for two entire steps for a reason worth naming: `cpDir`'s `NEVER_INGEST` set
refuses to ingest a fixture's `phase_manifest.json`, so in a *replayed* attempt the only
manifest that ever existed was the one the controller wrote. The mock path structurally
could not produce this state. **Two adversarial rounds read this code and neither could have
found it, because the defect only exists when a real agent writes a real file.**

**19. Its mirror image is worse: an agent could grant itself its own gate.**

Found while writing the regression test for 18. An agent that writes `gate_result: "pass"`
into its own manifest — same file, same instruction, one different value — was believed:
`next` walked past the phase and said *dispatch `build/attempt_1`*. `record` would have
refused the plan attempt, but an orchestrator asking `next` what to do would have dispatched
the **builder** against a plan gate the planner granted itself.

The controller and the agent write the same file by instruction, so nothing about the file's
**existence** distinguishes them.

**The first fix was wrong, and the review round that caught it was right.** It keyed
authorship to `provenance` — the orchestrator's to record (SKILL.md step 1, SC-3 B1/F-17),
and written beside every gate decision `record` makes — reasoning that a decided gate and a
complete provenance block therefore travel together in any tree this controller drove. True,
and irrelevant: **every byte of that block lives in a file the agent is told to write.** An
agent that emits five more keys is indistinguishable. A discriminator inside the forgeable
region is not an authorization record, and the write-up shipped it as a known-weak
"discriminator, not a proof" — which is the wrong response to a hole whose fix costs fifteen
lines. Naming a weakness is not a substitute for closing one that is cheap to close.

Authorship now comes from `.decisions.json`, a controller-owned ledger at the **job root** —
a file the agent contracts never mention, at a path they explicitly forbid writing to ("never
write outside your attempt directory"). It answers exactly one question, "did I decide this
attempt?". It is deliberately **not** a cursor: *where* the job is stays derived from the
tree, and a tree that arrives without its ledger reads as wholly undecided and re-runs — the
safe direction.

**The ledger's verdict and the manifest's are BOUND, which the first version of it was not.**
A second review pass caught that: the ledger stored `gate_result` and nothing compared it, so
an agent could flip a recorded `fail` to `pass` in its writable `phase_manifest.json` *after*
recording and `expectedNext` would advance. Reading the verdict from the ledger instead would
be worse — the controller would then promote a tree whose own evidence disagrees — so the two
are compared, and a disagreement is an **evidence-integrity breach**: terminal QUARANTINE, the
same class `evalSkillsClean` gives a trace that contradicts its own validator output.

### The invariant, stated as what it actually is

A review asked for "the concrete permission or process invariant" protecting the ledger.
**There is no permission to give, and that is the finding.** In this runtime the orchestrator
and its subagents are the **same OS principal**. No `chmod` separates them. `.decisions.json`
is defended by a *contract* — the agent specs' "never write outside your attempt directory" —
and a contract is the strongest boundary available to **any** orchestrator here, the prose one
included.

So the ledger does not buy tamper-proofing, and should not be described as if it did. What it
buys is that forging a decision now requires **violating an explicit prohibition** rather than
**following an instruction**. Both defects step 3 found were the latter — an agent doing
exactly as told. That is the class the ledger closes, and it is the class that actually
occurred.

`run-step3.sh` S5 asserts three points on this and declares the fourth:

| | |
|---|---|
| a self-granted `gate_result: "pass"` | not believed |
| the same, plus a complete forged `provenance` block | not believed |
| a recorded `fail` flipped to `pass` post-record | terminal QUARANTINE, naming the disagreement |
| **a consistent forgery of the ledger AND the manifest together** | **not detected — DECLARED LIMIT** |

The fourth is asserted *as a limit* rather than left unstated, because a test claiming
otherwise would be asserting something false. Nothing inside one filesystem tree, written by
one principal, detects a forgery that is internally consistent.

**This is still the second question step 3 raises FOR the skill** (the first being F-76's row
identity), and the spike-local fix does not answer it: the orchestrator's designated field
`gate_result` lives in a file the agent specs instruct the agent to write, so *every*
orchestrator — this controller or the prose one — needs a record outside that file to know
its own decisions. That is a gap in the shipped artifact layout, not in the spike.

**20. `next` advertised an attempt directory that did not exist.**

SKILL.md step 1: hand the agent "its attempt directory `artifacts/{jobId}/{phase}/attempt_{n}/`
(**create it first**)". `next` never did — `cpDir` `mkdir -p`s on the way in, so the mocked
handshake advertised a path that only came into being at `record`. A live agent handed a
non-existent directory either creates it (silently taking on an orchestrator's job) or fails.
Now created at dispatch, which also makes an attempt whose dispatch *died* visible to
`expectedNext` — a state it already knew how to handle and had never been able to reach.
`run-step3.sh` S1 asserts every advertised path exists when advertised.

**21. Two honest durations, and the controller records the right one.**

The agent's own `phase_manifest.json` reports `07:08:50Z → 07:22:21Z` (811 s). The
controller's reports `07:08:17Z → 07:24:23Z` (966 s). Neither is wrong: the agent times
itself, the orchestrator times the dispatch — from the stamp `next` took when it handed the
phase off, to `record`. The 155 s difference is orchestration latency the agent cannot see
and the run genuinely spent. `provenance.started_at` is the dispatch stamp because SKILL.md
requires a live clock **at dispatch**, which is a fact only the dispatcher holds. Worth
recording because a reader comparing the two files will otherwise read it as a discrepancy.

**22. None of finding 19's ledger governed `finalize` — the third verb was never on the
oracle.**

Found by an independent audit after the ledger merged, and it is the same mistake one verb
over. `cmdFinalize` decided terminal readiness by walking the manifests itself —
`PHASES.every(p => man.gate_result === 'pass')` — which is step 1's shape and survived every
round since, because `next` and `record` were both on `expectedNext()` and **nobody asked
whether `finalize` was.** It was not. So the ledger was bypassable by calling one verb
instead of another:

| tree | `next` said | `finalize` did |
|---|---|---|
| seven clean phases, `.decisions.json` **deleted** | `dispatch plan/attempt_1` | exit **0**, `final_status: completed`, scorer **PROMOTE** |
| seven clean phases, ledger says test **failed** | `terminal` / **QUARANTINE** | exit 0, `final_status: **completed**` |

Reading the manifests directly is precisely the authorship error of findings 18 and 19:
`phase_manifest.json` is agent-writable, so "every phase's latest manifest says `pass`" is a
**claim**, not a decision. `finalize` now asks `expectedNext()` and nothing else — it refuses
outright when the oracle still wants a dispatch (writing `failed` there would report an
unfinished job as a failed one, and `completed` would promote evidence nothing gated), and it
takes the oracle's own verdict when there is one, so an integrity halt terminates in the
QUARANTINE class instead of being flattened to a retriable `failed`. `run-step3.sh` S5b drives
a real seven-phase job and asserts both rows above.

**The pattern is now four for four.** Findings 12, 14, 15 (step 2), 18, 19 and this one are
all the same error in different clothes: a check that establishes *something else* and gets
read as establishing the thing that matters. "No failure detected" for "a success was
established"; a manifest's existence for the controller's own act; two verbs on the oracle
for all three. **The recurring defect in this spike is not any particular gate — it is
trusting a proxy for the property.**

### Q5 — half measured, and the half that is measured passes

§6 Q5 is two claims. The round-trip half is now a real number; the token/line half is not.

**Round trips: 2 model turns per phase in steady state**, against the plan's "≤ ~2 model
round-trips/phase" bar. The loop is `next` → dispatch → `record`, three tool calls, but
`record` batches with the following phase's `next` in one turn, so a steady-state phase costs
one turn to dispatch and one turn to record-and-advance. Plus one turn for `init` and one for
`finalize` per job.

**Marginal payload cost, measured on the live run:**

| message | bytes |
|---|---|
| `init` | 173 |
| `next` (plan dispatch) | 740 |
| `record` (plan) | 400 |

≈ 1.1 KB per phase, ~300 tokens. The planner dispatch it carried cost **170,249 tokens**.

**Where that denominator comes from, since it is not in the evidence tree.** It is the Agent
tool's own `subagent_tokens` report for the live dispatch, read from the harness at the time.
It is deliberately **not** recoverable from the archived artifacts: the controller writes
`tokens_in` / `tokens_out` / `cost_usd` as `null` (SC-11/A3 — those are structurally
unavailable to an orchestrator in this runtime and are written as null rather than omitted so
a reader can tell "not captured" from "field dropped"). So the ratio below is a **single
observed measurement, not a reproducible one**, and an audit that checks the archived manifest
will correctly find nulls there. Treating it as anything firmer than an order-of-magnitude
bound would be overreading one dispatch.

On that basis the handshake is not a token regression *at the margin* — it is ~0.2% of the
work it sequences.

**That is not Q5.** Q5 asks whether "X lines of SKILL.md + phase-gates prose are replaced by
Y lines of controller code + Z lines of thin interface" — a line-delta nobody has counted —
and whether the model's *per-phase reasoning* shrinks when it stops hand-executing counters.
The payload measurement bounds one term and says nothing about either of those. **Step 4 is
the deciding step.** It is below.

## STEP 4 — the line delta, and the go/no-go

Step 4 is a measurement, so the work was to make it checkable rather than asserted.

- [`prose-classification.json`](prose-classification.json) assigns **every line of every
  orchestrator-facing document** to one of four classes, as explicit ranges with labels.
- [`measure-delta.js`](measure-delta.js) refuses to print a number unless those ranges tile
  each file exactly — no gap, no overlap, current length matching. A reader who disagrees
  with a range edits the table and re-runs; a reader who deletes one gets an error, not a
  smaller X. Its coverage table is anchored the same way: each row names a regex that must
  still match `adws-run.js`.
- [`run-step4.sh`](run-step4.sh) drives one complete seven-phase run to measure the handshake
  by byte, then asserts the go/no-go's own arithmetic. **34 assertions.** If a later edit
  makes the handshake expensive or the thin interface fat, those assertions fail — the
  verdict is not a sentence in a document.

The classification is a judgment, and every judgment call in it is resolved toward "stays
with the model", so X is a floor. It is published to be argued with.

### Q5, first half — the line delta

| | lines |
|---|---|
| **X** — orchestrator prose the controller takes over, Q5's scope (`SKILL.md` + `phase-gates.md`) | **705** of 1,030 (68.4%) |
| **X** — same, §8's scope (those two + `artifact-layout.md` + `validator-inputs.md`) | **1,300** of 1,643 (79.1%) |
| — of the remainder: agent-facing (belongs in `.claude/agents/`, replaced by nothing) | 36 |
| — of the remainder: kept by the model (intake, dispatch, human decisions, relay) | 307 |
| **Y** — controller code as it stands, covering 11 of 20 rule families | **1,526** |
| **Y** — floor on the finished controller, at the realized 1.31 code-lines-per-prose-line | **1,704** |
| **Z** — the thin interface ([`thin-skill-sketch.md`](thin-skill-sketch.md)) | **151** |

Crediting every SPLIT block to the controller — the optimistic reading — moves X to 1,542 of
1,643 (93.9%). The result does not turn on where the line is drawn.

**So the line delta is a net INCREASE.** 1,643 lines of prose become ~1,704 lines of code
plus 151 lines of interface plus the 343 lines that stay. Anyone selling §6.2 as "less to
maintain" is selling the wrong thing, and Q5 as written invites exactly that sale.

### Q5, second half — the measurement that actually decides

Controller code is **executed, never read**: `adws-run.js` does not enter the model's
context. Prose is loaded and interpreted **every run**. The two sides of Q5 are therefore not
commensurable as line counts, and the comparison that bears on §9's kill criterion is
orchestrator instruction volume per run:

| | bytes |
|---|---|
| before — the five documents `SKILL.md`'s procedure directs the orchestrator into | 124,008 |
| after — the thin interface + `task-contract.md` (intake is still model work) | 17,206 |
| **reduction** | **−106,802 → 13.9% of before** |
| conservative floor — `SKILL.md` alone vs the sketch alone, if the model never opened a reference | 30,012 → 9,362 = **31.2%** |
| handshake added back — one complete seven-phase run, every controller message concatenated | 8,738 |
| **net** | **25,944 = 20.9% of before** |

Token estimates would divide both sides by the same constant, so these ratios are
independent of any tokenizer. Bytes are reported because bytes are what was measured.

**"Would the orchestrator really load all five?"** is the obvious attack on the before
figure, and it is answerable rather than arguable. `SKILL.md` directs the reader into each
one **by name**: `phase-gates.md` ×8, `artifact-layout.md` ×3, `task-contract.md` ×2,
`validator-inputs.md` ×2 — at points spread across intake, the phase loop, ship and the
terminal report, so a run that reaches all seven phases reaches all of them. `runtimes.md`
and `troubleshooting.md` are conditional in **both** worlds and are excluded from both, so
the comparison stays symmetric. And for a reader who rejects the count entirely, the floor
row settles it: even if the model never opens a single reference, the reduction is 69%.

One thing the classification does **not** affect: the C/A boundary is invisible to this
measurement. Whether a line is executed by the controller or belongs to a phase agent, it
leaves the orchestrator's context either way. Only C-versus-K/S moves this number, which is
why every borderline call was resolved toward K/S.

**The kill criterion, as arithmetic.** §9 kills §6.2 if the handshake costs more than it
saves. Break-even is 106,802 bytes per run — 15,257 per phase. Measured: 8,738 per run, 1,248
per phase. **12.2× headroom**, at 2 model turns per phase (16 controller messages: `init` +
7 × (`next` + `record`) + `finalize`), which is the plan's own "≤ ~2" bar met exactly.

### The verdict: **GO**, with three conditions

§6.2 is viable. Both kill criteria are measured and neither fires: the evidence schema was
matched without editing `execution-report.js`, and the handshake costs a twelfth of what it
would need to cost to erase the win. The conditions are not hedges — each is a thing a reader
could otherwise take from this document that it does not say.

1. **The win is relocation, not reduction.** The repository gets bigger. What shrinks is the
   instruction mass a probabilistic model must load and interpret per run, by ~86%. That is
   the §6.1 "prose engine" problem and it is the only thing this measurement establishes.
2. **A go on the architecture is not a clearance to skip live validation.** Six of seven
   phases have never run live, and both defects step 3 found were structurally unreachable
   from the mocked path. The nine unimplemented rule families are in exactly the position the
   plan phase was in before it ran.
3. **Q5's reasoning half stays unmeasured.** It bounds the size of the win, not its sign —
   see finding 25.

### New findings from step 4

**Finding 23 — the plan's own success criterion asks for the wrong measurement, and it is
the same error six earlier findings named.** Q5 says "X lines of prose are replaced by Y
lines of code". Measured, that is 1,300 → ~1,704: a loss. The property that matters is what
the model must interpret per run, and on that measure it is 124,008 → 17,206 bytes: a win by
a factor of seven. Lines are a **proxy**; instruction mass is the property. Findings 12, 14,
15, 18, 19 and 22 were each one error in a different costume — trusting a proxy for the
property — and this is the seventh, sitting in the spike's own plan since it was written.
The reason it matters here and not only rhetorically: a reader who takes Q5 literally reads
this spike's own numbers as a **no-go**.

**Finding 24 — the thin interface was written against a controller that does not exist, and
the checkable half caught it.** The first cut of `thin-skill-sketch.md` had branches for
`consensus` and `reproduce` — actions `adws-run.js` never emits — and **no branch for
`finalize`**, which it does emit. An interface measured against an imagined controller
measures nothing. `run-step4.sh` now asserts the decidable direction: every action string in
`adws-run.js` has a branch in the sketch. The other direction is a **declared limit** — the
sketch's `consensus`, `reproduce` and dissent-resolution branches are extrapolated from prose
the controller has not implemented, and the keyword check that every human-decision boundary
is still *named* is a presence check, not a sufficiency proof. **Nobody has run an
orchestrator from this document.** Z is a measurement of the interface, not of a working
orchestrator, and that is the single largest reason to distrust the 151.

**Finding 25 — the second half of Q5 is not measurable inside the time-box, and it cannot
flip the sign.** "Does the model's per-phase reasoning shrink once it stops hand-executing
counters" needs two live runs of the same contract — one prose-orchestrated, one
controller-orchestrated — compared on orchestrator-side tokens: ~14 subagent dispatches and
two full seven-phase runs. Not done, and named here rather than estimated. What can be said
without it: the controller **removes** decisions from the model (sequencing, budgets, tiers,
gate computation, evidence writing) and adds none, so per-phase reasoning has no mechanism by
which to grow. The one place it could is where the thin interface is thinner than the
original on a KEPT block — the consensus briefing above all — and that is a **quality** risk,
not a token risk. Magnitude unmeasured; sign safe.

**Finding 26 — one shipped reference document is 140 of 140 lines machine work.**
`validator-inputs.md` is the only file in the classification with a unanimous verdict: every
line of it tells a probabilistic model how to assemble nine deterministic function calls,
read two of their outputs by name, and map three exit-code vocabularies. It contains no
judgment, no human decision, and nothing an agent needs. It is the cleanest single datum for
§6.1's claim, because it is not an argument about a mixed document — it is an entire
reference that exists **only** because the assembly it describes was never given to code.

## Canonical conformance — the writer floor, not the golden

The plan asked for a byte-diff against a golden tree
([SPIKE_CONTROLLER_PLAN.md:138](../../docs/SPIKE_CONTROLLER_PLAN.md)). That is the **wrong
oracle**: the golden fixture is deliberately minimal — it exercises the scorer's tolerant
reader — so matching it byte-for-byte would prove the controller is as minimal as a test
stub. [verify-canonical.js](verify-canonical.js) validates against the **writer** contract
instead, and is independent of the scorer, which accepts far less.

- controller-generated tree → **CANONICAL OK** (and every DRIVEN tree in the matrix is
  checked, not just the happy path)
- the minimal golden fixture → **66 violations**: 29 missing floor keys, 7 absent
  `tier_input`, 7 absent `stability_gate`, 7 null `provenance`, 7 bare-role `agent` ids, the `job-` hyphen id, and 8 run_manifest type/enum violations. (Was 59 before this round; the +7 is the `adws-…` agent check.)

That gap is the measured form of "scorer-acceptance ≠ schema conformance."

**The `agent` id is a genuine doc/fixture disagreement, not a controller choice.**
artifact-layout.md:147 shows the writer contract as `"agent": "adws-…"`; every golden fixture
writes the bare role (`"planner"`). The scorer reads neither, so nothing caught it. The
controller and validator follow the **writer contract**, and this is flagged for the skill to
resolve in one direction or the other.

## Where this leaves the spike

**Closed by step 1 (three adversarial rounds):**

- The completed-but-contradicted class is refused at record (completeness), caught at
  finalize (full terminal gate set), and rejected by the validator — verified by an asserted
  regression covering both the no-mutation and post-gate-mutation routes.
- **Controller-generated** evidence conforms to the provenance, agent-id, tier-source and
  phase-output contracts, and the validator enforces all four rather than a plausible subset.
  This says nothing about the fixtures it replays: the golden tree carries 66 writer-floor
  violations and the corpus `corrections.json` files two required-field violations each, both
  measured below. Conformance is a property of what the controller WRITES.
- Fixture agreement is measured by ingestion against the official expectations, with the
  controller's coverage limits declared and counted rather than absorbed.

**Closed by step 2:**

- **Q3 — budget-as-code: yes.** One test→build rewind with the prescribed counters,
  `corrections.json`, tier escalation and forward-re-run tier; a second code failure
  terminates `TEST_GATE_FAILURE`; the rewind and check-defect budgets are independent and
  neither consumes a build retry; the retry ladder escalates and exhausts. The F-47 tree —
  three build attempts against a budget of 1 — is reproduced with the accounting intact, and
  the escalation ladder is checked against a recorded fixture rather than against itself.
- **Q4 — idempotent: yes,** for `next` (byte-identical, dispatch stamp included), `record`
  (a recorded attempt is refused) and `finalize` (`completed_at` written once; a re-run is a
  no-op). Step 1's `next` was not, and the fix is recorded with its cost.
- The three step-1 matrix LIMITs are gone, and `retry` — the corpus's own retry-ladder
  fixture — now replays end to end.

**Closed by step 3:**

- **Q1 — the handshake works in-harness: yes.** One live `adws-planner` dispatch, at the
  advertised tier, into the advertised directory, gated by a validator the controller really
  ran, on a tree that is CANONICAL OK. The evidence is archived and replayed by
  `run-step3.sh` so the result is re-checkable without spending another dispatch.
- The dispatch payload carries all five things SKILL.md requires a dispatcher to hand an
  agent, and every advertised path exists when advertised.
- The plan gate's validator runs, and its verdict reaches the gate **through the scorer's own
  `skills_clean` evaluator** — no controller-side comparison, unlike step 2's test gate.

**Closed by step 4:**

- **Q5 — the win is real and measured: yes.** The orchestrator's instruction mass falls from
  124,008 to 17,206 bytes per run (13.9%), 25,944 with the handshake added back (20.9%), and
  31.2% even on the reading where the model never opens a reference file. The handshake costs
  8,738 bytes for a complete seven-phase run against a 106,802-byte break-even — 12.2×
  headroom — at 2 model turns per phase.
- **The go/no-go: GO**, under the three conditions in the step-4 section. Neither §9 kill
  criterion fired.
- The line delta itself is a net **increase** (1,643 lines of prose → ~1,704 of code + 151 of
  interface + 343 that stay), which is the answer to Q5 as literally written and the reason
  finding 23 exists.

**Explicitly not established:**

- **Q5's reasoning half.** Whether the model's per-phase reasoning shrinks is unmeasured and
  needs two live runs of the same contract (finding 25). It bounds the size of the win, not
  its sign.
- **That the thin interface is sufficient.** Nobody has run an orchestrator from
  `thin-skill-sketch.md`, and three of its branches are extrapolated from prose the
  controller has not implemented (finding 24). Z is the least trustworthy number in step 4.
- **Six of seven phases have never run live.** One plan dispatch is one plan dispatch. It says
  nothing about the consensus pair, the shipper, or any phase whose dispatch payload carries
  more than a contract and a worktree.
- **The other four rewind families.** Only test→build is implemented. The two ROUTE-DIFF rows
  are the measured cost of that: F-37 (operator-directed repair) and F-46 (Critic-fail at the
  review gate) reach the same verdict by a route the controller cannot take.
- **The remaining validators.** Only `criteria-to-checks` runs, because F-45 requires it
  before its agent. The other eight are still fixture-supplied.
- **`resumed_from` / `carry_over` consumer logic** (SC-13), the entropy/stability gate, and
  consensus dispatch.
- **The terminal `failure_reason` vocabulary** (step-1 finding 4) — unchanged and still open:
  a halted job should not flatten `ADVOCATE_DISSENT` or an evidence-integrity breach into a
  retriable reason.

**Step 3's lesson is about oracles, not about care.** Two defects (18, 19), both fail-modes
of the same root, both in code two adversarial rounds had already read closely, both found
within twenty minutes of a real subagent writing a real file. Neither round could have found
them: `NEVER_INGEST` means a replayed attempt structurally cannot contain an agent-written
`phase_manifest.json`, so the state that breaks the oracle did not exist until step 3
created it. The mock was not a weak test of that behaviour — it was **no test of it at all**,
and nothing in the mocked suite could have revealed which.

That generalises past this spike, and it is the argument for step 3 having been worth its
cost even though Q5 remains open: *the six phases that have still never run live are in
exactly the position the plan phase was in yesterday.*

**Three review rounds on step 2, and the score is not flattering.** CodeRabbit found the
F-76 row-identity hole; the independent verification round found two fail-OPEN defects in the
same area plus the fact that `make ci` never covered this code at all. Every one of them was
in the gate the controller owns outright — the one place step 2 removed the scorer as a
backstop — and every one of them was the same error: treating "no failure detected" as "a
success was established". My own fixtures could not catch them, because I wrote the fixtures
from the same understanding that produced the code.

A note on process, since it is now the fourth data point: each of the last three step-1
rounds was overturned by an independent pass, step 1's own driver defect was caught by the
new matrix rather than by me, and step 2's first cut of the derived-gate comparison was wrong
in a way only running it revealed. That pattern is the live argument in
[docs/SIMPLIFICATION_ANALYSIS.md](../../docs/SIMPLIFICATION_ANALYSIS.md) for keeping the
second independent look.

## Reproduce

```bash
bash spike/adws-controller/run-step1.sh          # clean: PROMOTE / exit 0, CANONICAL OK
bash spike/adws-controller/run-step1-negative.sh # failing critic -> retry ladder -> RETRY / exit 1
bash spike/adws-controller/run-counterexample.sh # the counterexample + post-gate mutation, asserted
bash spike/adws-controller/run-step2.sh          # step 2: 103 assertions over twelve jobs
bash spike/adws-controller/run-step3.sh          # step 3: the live dispatch's evidence, replayed
bash spike/adws-controller/run-step4.sh          # step 4: 34 assertions — the delta and the go/no-go
node spike/adws-controller/measure-delta.js      # the X/Y/Z report, re-derived from the tree
node spike/adws-controller/run-ingest-matrix.js  # 25 fixtures through init -> record -> finalize
node spike/adws-controller/verify-canonical.js "$JOB_DIR"  # writer-floor conformance
```

All eight exit 0. The committed fixtures are read-only throughout (`git status` clean under
`parity/` and `adws-pipeline/` after a full run).

`measure-delta.js` is a pure function of the shipped tree plus
[`prose-classification.json`](prose-classification.json): editing a shipped document changes
its numbers, and editing it enough to break the classification's line ranges makes it exit
non-zero rather than print a stale one.

The one thing on that list that is **not** reproducible is the live dispatch itself — it cost
a real subagent run. `run-step3.sh` replays its archived evidence
([`fixtures/live_plan_attempt/`](fixtures/live_plan_attempt/), provenance in that README)
through the same live-mode code path and asserts the same gate. To do it for real again:

```bash
CTRL=spike/adws-controller/adws-run.js
WT=$(mktemp -d)/worktree && git worktree add --detach "$WT" HEAD   # the agent must not reach your checkout
JOB_DIR=$(node "$CTRL" init spike/adws-controller/fixtures/live_contract.json \
            "$EVIDENCE_ROOT" --worktree "$WT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).job_dir')
node "$CTRL" next "$JOB_DIR"          # -> dispatch adws-planner from this payload, verbatim
node "$CTRL" record "$JOB_DIR" plan 1 # no --from: LIVE
git worktree remove --force "$WT"
```

The single check worth re-running against the shipped corpus, which needs no dispatch at all
and is the sharpest thing step 3 found (finding 16):

```bash
node -e 'const t=require("./parity/execution-report-fixtures/promote_clean/artifacts/job-2f8c1a/task_contract_snapshot.json").task;
process.stdout.write(JSON.stringify({title:t.title,requested_change:t.requested_change,problem_statement:t.problem_statement,
acceptance_criteria:t.acceptance_criteria||[],constraints:t.constraints||[],file_hints:t.file_hints||[]}))' \
  | node adws-pipeline/scripts/validators/task-normalize.js -
# rubric_result: "fail" — against a recorded plan-coherence trace of "pass"
```
