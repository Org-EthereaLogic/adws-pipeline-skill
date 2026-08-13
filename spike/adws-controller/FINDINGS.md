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
  by byte, then asserts the go/no-go's own arithmetic. **40 assertions.** If a later edit
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
| **Y** — finished controller, LINEAR PROJECTION at the realized 1.31 code-lines-per-prose-line | **~1,704** |
| **Z** — the thin interface ([`thin-skill-sketch.md`](thin-skill-sketch.md)) | **151** |

Crediting every SPLIT block to the controller — the optimistic reading — moves X to 1,542 of
1,643 (93.9%). The result does not turn on where the line is drawn.

**~1,704 is a projection, not a floor.** It assumes per-family code cost scales with the
prose each family owns. Two things push it down (shared prose blocks are credited to the
implemented side; the absent set holds the two most branching families, ship modes and
resume) and one pushes it up (fixed plumbing — io helpers, CLI, argument parsing — is already
paid for and does not recur). Which dominates is unknown. It was labelled a "floor" until an
audit rejected the label, correctly.

**So the line delta is a net INCREASE:**

```
before   1,643 lines of orchestrator prose
after    1,704 controller (projected) + 151 interface = 1,855
         plus 36 agent-facing lines that relocate into .claude/agents/*.md
net      +212 lines (+248 counting the relocated agent lines)
```

The 307 KEPT+SPLIT lines are **inside** the 151-line interface, not additional to it. An
earlier draft of this section wrote "1,704 + 151 + the 343 lines that stay" and overstated
the increase by 307 lines; the same audit caught that. Anyone selling §6.2 as "less to
maintain" is still selling the wrong thing — Q5 as written invites exactly that sale — but
the increase is ~212 lines, not ~555.

### Q5, second half — the measurement that actually decides

Controller code is **executed, never read**: `adws-run.js` does not enter the model's
context. Prose is loaded and interpreted **every run**. The two sides of Q5 are therefore not
commensurable as line counts, and the comparison that bears on §9's kill criterion is
orchestrator instruction volume per run:

**Nobody has instrumented a real run's context**, so the honest output is a bracket, not a
point — and the handshake is added back on **both** ends of it:

| scenario | before | after | + handshake | of before | headroom |
|---|---|---|---|---|---|
| **full-document** — each reference read once | 124,008 | 17,206 | 25,944 | **20.9%** | **12.22×** |
| **no-reference** — `SKILL.md` only, ever | 30,012 | 9,362 | 18,100 | **60.3%** | **2.36×** |

"Headroom" is how many times larger the handshake would have to be to erase that scenario's
reduction — §9's kill criterion as arithmetic. **A reduction on both readings**, but the
margin ranges from comfortable to thin, and the true per-run context was not observed.

An earlier draft published the full-document scenario's 12.2× beside the no-reference
scenario's 31.2%, which took the favourable half of each; an independent audit caught it.
The correct pessimistic figure is 60.3% at 2.36×, and that end of the bracket is what the
verdict has to survive.

These are **bytes**. No tokenizer was run, and JSON and English prose do not share a
bytes-per-token ratio, so they must not be read as token ratios. (An earlier draft claimed
tokenizer-independence "because both sides divide by the same constant" — they do not.)

**"Would the orchestrator really load all five?"** is the obvious attack on the 124,008, and
it is not fully answerable. What can be shown: `SKILL.md` directs the reader into each one
**by name** — `phase-gates.md` ×8, `artifact-layout.md` ×3, `task-contract.md` ×2,
`validator-inputs.md` ×2 — at points spread across intake, the phase loop, ship and the
terminal report. What cannot: that a directive is followed, or that a whole file enters
context when it is. The shipped text says references are read "when needed, not all
upfront", so **124,008 is a full-document scenario, not a measurement of per-run context.**
That is why both ends of the bracket are published and why the verdict is argued from the
pessimistic one. `runtimes.md` and `troubleshooting.md` are conditional in both worlds and
excluded from both, so the comparison stays symmetric.

One thing the classification does **not** affect: the C/A boundary is invisible to this
measurement. Whether a line is executed by the controller or belongs to a phase agent, it
leaves the orchestrator's context either way. Only C-versus-K/S moves this number, which is
why every borderline call was resolved toward K/S.

**The handshake: 8,738 bytes, 16 controller messages — measured. 2 model turns per phase —
inferred.** The messages and bytes come from a real seven-phase run. The *turn* accounting
does not: step 4 drove that run from a shell over canned phase outputs, so **no model was in
the loop**, and 2/phase is carried from step 3's live plan dispatch (`record` batching into
the following `next`) rather than observed here. Break-even is 106,802 bytes per run on the
full-document reading and 20,650 on the no-reference one.

### The verdict: **GO** on the architecture, with four conditions

§6.2 is viable. Both §9 kill criteria are measured and neither fires on either reading: the
evidence schema was matched without editing `execution-report.js`, and the handshake costs
between a twelfth and a half of what it would need to cost to erase the reduction. The
conditions are not hedges — each is a thing a reader could otherwise take from this document
that it does not say.

1. **The win is relocation, not reduction.** The repository gets bigger by ~212 lines. What
   shrinks is the instruction mass a probabilistic model must load and interpret per run —
   by 79% on the full-document reading and **40% on the pessimistic one**. That is the §6.1
   "prose engine" problem, and it is the only thing this measurement establishes.
2. **The margin is a bracket, not a point: 2.36×–12.22×.** The verdict is argued from 2.36×,
   because the true per-run context was never observed. §9 kills §6.2 above roughly 2–3 model
   round trips per phase, so the pessimistic end sits close to the bar rather than far above
   it.
3. **A go on the architecture is not a clearance to skip live validation.** Six of seven
   phases have never run live, and both defects step 3 found were structurally unreachable
   from the mocked path. The nine unimplemented rule families are in exactly the position the
   plan phase was in before it ran.
4. **Q5's reasoning half stays unmeasured, and condition 2 makes it load-bearing.** With
   12.2× headroom it would only have bounded the size of the win. At 2.36× a modest growth in
   per-phase reasoning could consume the pessimistic margin, so the argument in finding 25 is
   carrying more weight than an argument should. **Measure it before building the real
   thing** — it is now the highest-value experiment left, ahead of any unimplemented family.

### New findings from step 4

**Finding 23 — the plan's own success criterion asks for the wrong measurement, and it is
the same error six earlier findings named.** Q5 says "X lines of prose are replaced by Y
lines of code". Measured, that is 1,643 → ~1,855: a loss of 212 lines. The property that
matters is what the model must interpret per run, and on that measure it is a 40–79%
reduction depending on the reading. Lines are a **proxy**; instruction mass is the property.
Findings 12, 14, 15, 18, 19 and 22 were each one error in a different costume — trusting a
proxy for the property — and this is the seventh, sitting in the spike's own plan since it
was written. The reason it matters here and not only rhetorically: a reader who takes Q5
literally reads this spike's own numbers as a **no-go**.

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

**Finding 25 — the second half of Q5 is not measurable inside the time-box, and the argument
that it is safe is an argument, not a result.** "Does the model's per-phase reasoning shrink
once it stops hand-executing counters" needs two live runs of the same contract — one
prose-orchestrated, one controller-orchestrated — compared on orchestrator-side tokens: ~14
subagent dispatches and two full seven-phase runs. Not done, and named here rather than
estimated. The argument for it being safe: the controller **removes** decisions from the
model (sequencing, budgets, tiers, gate computation, evidence writing) and adds none, so
per-phase reasoning has no obvious mechanism by which to grow; the one place it could is
where the thin interface is thinner than the original on a KEPT block — the consensus
briefing above all — and that is a quality risk more than a token risk.

**An earlier draft of this finding said the reasoning half "cannot flip the sign". That
overstates it and an audit was right to reject it.** The mechanism argument is not a
measurement, and at the pessimistic 2.36× margin it does not have the room the 12.2× figure
appeared to give it. What the evidence supports is narrower: no mechanism for growth has been
identified, and none was looked for empirically. Treat the sign as *unconfirmed at the
pessimistic end*, not as established.

**Finding 26 — one shipped reference document is 140 of 140 lines machine work.**
`validator-inputs.md` is the only file in the classification with a unanimous verdict: every
line of it tells a probabilistic model how to assemble nine deterministic function calls,
read two of their outputs by name, and map three exit-code vocabularies. It contains no
judgment, no human decision, and nothing an agent needs. It is the cleanest single datum for
§6.1's claim, because it is not an argument about a mixed document — it is an entire
reference that exists **only** because the assembly it describes was never given to code.

**Finding 27 — the freshness stamp compared file SIZE, which is a proxy for file content.
That is finding 23's error, committed in the commit that named finding 23.** The
`.step4-handshake.json` record carried `controller_bytes` and `measure-delta.js` compared it,
described in its own commit message as making the measurement "self-invalidating". It was
not. CodeRabbit and an independent audit each found the hole within a day of each other, with
the same probe:

```
action: 'finalize'  ->  action: 'terminal'      # same length, byte-for-byte
```

Size unchanged at 88,913; the check passed; a stale 8,738 was reported for a controller that
no longer produced it. Reproduced before fixing. It is now a SHA-256 comparison, an absent
digest reads as stale rather than fresh, and `run-step4.sh` S5 runs that exact probe as a
regression — asserting the mutation applied, that it preserved byte length, that STALE is
reported, that no figure is quoted while stale, and that the controller is restored
byte-for-byte afterwards.

**Two things are worth keeping from this beyond the fix.** First: the pattern is not one a
writer catches by resolving to be careful, because I wrote finding 23 and this defect in the
same sitting. Second: **two independent reviewers found it independently, and neither was
me.** That is the fourth consecutive round where the decisive catch came from outside — the
live argument in [SIMPLIFICATION_ANALYSIS](../../docs/SIMPLIFICATION_ANALYSIS.md) for keeping
the second independent look, now with a data point where the author had just finished writing
the rule he broke.

## STEP 5, part 1 — the two actions (the prerequisite)

Step 5 asks whether an orchestrator can RUN from `thin-skill-sketch.md`
([SPIKE_CONTROLLER_PLAN.md §12](../../docs/SPIKE_CONTROLLER_PLAN.md)). Three of the sketch's
five branches — `consensus`, `reproduce`, and the dissent-resolution half of `operator` —
described a controller that did not exist, so they could not be exercised at all. This section
covers the prerequisite (§12.3), and **only** the prerequisite: the controller now emits all
three and every route they open is asserted. Whether the sketch's PROSE for those branches is
sufficient to orchestrate from is untouched by any of it — that needs a model reading the
document, and no model was in this loop.

`run-step5.sh`: **133 assertions, 0 failed.** The six earlier shell drivers and the ingest
matrix still pass (25 fixtures ingested, 0 MISMATCH; 10 driven end to end, the rest halted or
refused with a recorded reason), and `git status` is clean under `parity/` and
`adws-pipeline/`.

**The first cut of this section claimed the routes worked. An independent audit found two
fail-OPEN defects in them within a day, and findings 33 and 34 are those.** The claim is now
narrower and the regressions are in the driver.

### What was implemented, against which rule

| Rule | What the controller now does |
|---|---|
| FR-7 / F-35 | emits `consensus` at test and review: the pair as ONE parallel set, `parallel: "required"`, fresh-context terms stated, the barrier named, an output path and scratch root per role |
| F-46 rules 1–5 | a Critic `fail` emits `reproduce` before it routes; reproduced+code rewinds with `CRITIC_FAIL_REPAIRED` and `cross_phase_rewinds.{phase}`; reproduced+check/environment takes the tester's own routes; **not** reproduced takes the ordinary retry and records what was run; the cap terminates |
| F-3 | `override` writes the resolution the scorer reads, creates no attempt, burns no retry |
| rule 2 / rule 5 | `uphold` terminates on `ADVOCATE_DISSENT` — quarantine class, not the phase's blanket gate failure |
| F-6 | `re-review` opens a fresh attempt at the escalated tier recording `operator-resolution`, and burns the phase's retry |
| F-37 | `repair` rewinds with `ADVOCATE_DISSENT_REPAIRED` on its own `operator_directed_rewinds` budget — and is the one rewind that also consumes a build retry |

Two of these are the DOCUMENTED attempt annotations `CRITIC_FAIL_REPAIRED` and
`ADVOCATE_DISSENT_REPAIRED`, which no earlier step could write because no earlier step ran a
round. Both are asserted to stay attempt-level, by the same `finalize` invariant that already
guarded the other four.

### The severity split, taken where it was cheap and sourced rather than derived

The open item at the head of this file says the terminal `failure_reason` vocabulary flattens
`ADVOCATE_DISSENT` into a blanket gate failure, and that fixing it "needs a classification the
controller can *source* from the scorer, not re-derive by parsing gate detail strings". An
upheld dissent is the one case step 5 makes reachable, and `execution-report.js` **exports**
`NO_RETRY_REASONS`. So the controller `require()`s it and asserts at load that
`ADVOCATE_DISSENT` is in it — if the scorer ever reclassifies, this controller refuses to
start rather than asserting a severity the authority does not hold. The rest of the vocabulary
is untouched: this is one reason, sourced, not a rewrite of the enum.

### Where the design refused a proxy, and what it cost

`expectedNext` now has to tell four states of one unrecorded attempt apart — the phase agent
has not run, a round is owed, a reproduction is owed, a resolution is owed. The obvious
discriminator is "does `phase_output.json` exist yet", and it is wrong twice over: it is a
proxy for "the agent finished" (findings 12, 14, 15, 18, 19, 22, 23, 27 in eight costumes), and
it is the *specific* proxy F-35 forbids — the consensus agents read a worktree the phase agent
may still be writing, and "the failure is silent by construction".

So the controller does not guess. **The model declares the phase agent finished by calling
`record`**, and `record` writes the round request into `.rounds.json`, the second
controller-owned file. The cost is one extra handshake message per consensus phase: the first
`record` decides nothing — no manifest, no gate, no ledger entry — and an attempt with an
outstanding round is indistinguishable from one never recorded, which is exactly what it is.

### New findings from step 5

**Finding 28 — `resolution` is finding 19 one file over, and this time the SCORER believes
it.** `advocate.json` is written by the Advocate; `resolution` inside it is the orchestrator's
designated post-hoc field, and artifact-layout.md says outright that "the Advocate never writes
it". That is the same shape as `gate_result` inside `phase_manifest.json` — and it is strictly
worse, because `evalConsensus` **reads this field**: `action: "override"` downgrades a blocking
dissent to a WARN. An Advocate that wrote its own resolution would clear its own dissent,
through the scorer, and the gate would pass with no operator ever seeing it.

`run-step5.sh` S5(a) asserts both halves: the controller refuses such an attempt, **and** that
the scorer would have returned `warn` on the very same tree — the refusal is shown to be
load-bearing rather than asserted to be. The fix is the same one finding 19 reached: the
controller's own ledger is authoritative for routing, the file carries the copy the scorer
reads, and a disagreement between them is an evidence-integrity breach rather than a choice
between two readings.

**The generalisation is now a pattern with two instances and no permission behind either.**
Every orchestrator-owned field the shipped layout places inside an agent-written file has this
hole, and the count is two of two — `gate_result` and `resolution` — with the second found by
implementing it rather than by reading harder. **This is a gap in the shipped artifact layout,
not in this controller**, and it is the same question for the skill that finding 19 raised,
now with a second data point and a scorer that acts on the forged value.

**Finding 29 — the origin oracle disagreed with itself, and only a new route made it
visible.** `expectedNext` returned `origin: 'retry'` as a LITERAL in its retry branch, while
`tierFor` asked `attemptOrigin`. For every route that existed before step 5 the two agreed, so
nothing could tell them apart. An F-6 operator re-review is opened by that same retry branch —
it does burn the phase's retry — but its origin is `operator-rereview`, and the result was a
dispatch payload advertising `origin: "retry"` with `tier_input.source: "operator-resolution"`
in the same message. Both from the same controller, about the same attempt.

That is finding 22's shape exactly (`finalize` deciding the terminal question by walking the
tree while `next` and `record` asked the oracle), one question over: **a second answerer for a
question that already had an oracle, harmless until something made the two answers differ.**
`expectedNext` now asks `attemptOrigin` in both branches. Anyone extending this controller
should treat a hardcoded value that "obviously" matches a derived one as the same defect
waiting for a new case — that is now four from this cause.

**Finding 30 — an absent consensus round was never neutral, and every live attempt before
step 5 was in it.** `evalConsensus` scores a phase with no `consensus/` files `UNVERIFIED`, and
`decideLifecycle` promotes an UNVERIFIED gate **with warnings** — exit 10, never a clean
promote. So the controller's real position before step 5 was not "consensus is out of scope"
but "every live run silently promotes with a warning it never reported". The mocked runs hid
it completely: every fixture ships its own consensus files, so the replayed path scored clean
and the state was unreachable from it — the third time the mock has been *no* test of a thing
rather than a weak one. `consensus_round` (`ran` | `ingested` | `incomplete` | `none`) is now on
every handshake message of a consensus phase, on the same principle as `test_gate_scope`: a
reduced gate is loud, or it is invisible.

**Finding 31 — the margin moved the wrong way before a single consensus message was counted.**
Two things grew, by almost exactly the same amount, and both eat the same margin:

```
handshake, replayed seven-phase run   8,738 -> 9,146 B   (+408, the fields added to `record`)
Z, the thin interface                 9,362 -> 9,700 B   (+338, the status table only)
no-reference headroom                  2.36x -> 2.22x    (11.64x on the full-document reading)
of before                              60.3% -> 62.8%
```

Isolated, each costs about the same: the handshake alone would give 2.33×, the sketch alone
2.32×. Neither is close to §9's bar and the reduction holds on both readings — but the
direction is the one condition 2 warns about, and it moved for a prerequisite that added no
capability to the run being measured.

**The number that matters is not this one.** The replayed path emits no `consensus`,
`reproduce` or `operator` message at all, so 9,146 is the cost of a run with the round
*implemented* and not *taken*. A run that actually takes it costs more, and **nobody has
measured that**. It is part of §12.4's live run, recorded here as a prediction rather than
offered afterwards as an estimate.

**Finding 32 — a residue event, predicted BEFORE the run that is supposed to find it.**
`thin-skill-sketch.md` tells the orchestrator to dispatch and then `record`, and describes
`consensus` as an action `next` returns. It does **not** say that `record` may come back with
`awaiting` instead of a gate result — which is what the deferral above makes it do. A model
following the sketch literally will still converge, because its loop calls `next` every
iteration and `next` does say `consensus`; but it will meet one message the document did not
prepare it for.

This is recorded here, now, and **the sketch is deliberately not patched** — §12.7 freezes it,
and patching a gap I found by writing the code would convert the sufficiency test into a
drafting exercise and destroy the measurement. The prediction is falsifiable in both
directions: if the live run trips on it, finding 32 is a residue event with a known byte cost;
if the orchestrator absorbs it without asking, that is evidence the sketch is more robust than
its author expected. Either way it was written down first.

**Finding 33 — the precedence comment was a claim about code three lines away that I had not
read closely enough to copy.** `consensusRoute` and `consensusPending` both said they followed
`evalConsensus`'s precedence and both tested `dissent`. The scorer tests `dissent && NOT
overridden` — it has a separate, LATER case for an overridden one. So an attempt carrying BOTH
an Advocate dissent and a Critic fail, with the dissent overridden, behaved like this:

```
scorer:      dissent overridden -> moves on -> FAILS on the Critic
controller:  "there is a dissent" -> answers the dissent -> sees the ledger and file agree
             -> "the scorer still fails, so the override did not register" -> integrity breach
reproduce:   never requested. The Critic finding was never reproduced, never routed.
```

The route the Critic was owed does not exist for that tree, and the failure presents as an
accusation against the operator's own override. **The fail-open direction:** an evidence-
integrity annotation the job then RETRIED (finding 34), so a Critic fail plus an overridden
dissent produced an ordinary test retry — the exact outcome F-46 was written to remove.

Worth keeping: I asserted the precedence in a comment, in the same commit, next to the code
that disagreed with it — and `run-step5.sh` had 98 assertions across every single-finding case
without one MIXED case among them. **A per-branch test suite written by the author of the
branches tests the branches he thought of.**

**Finding 34 — `route: 'terminal'` never terminated, and it is the same cause as findings 22
and 29.** `gateFail(..., 'terminal')` sets a route, but `expectedNext` does not read `route` —
it reads the ANNOTATION. Three of step 5's integrity breaches returned
`route: 'terminal'` with a plain `{PHASE}_GATE_FAILURE` annotation, fell past every annotation
branch, and landed in the ordinary retry. The `record` message said `"route":"terminal"` and
the next `next` dispatched a retry, from the same controller, about the same attempt.

`ROUTE_SPENT` and `ADVOCATE_DISSENT` worked only because they happen to be annotations
`expectedNext` matches. So the terminal routes that existed before step 5 were correct by
coincidence of vocabulary, not by mechanism. The fix reuses `MISSING_UPSTREAM_ARTIFACT` — the
QUARANTINE-class reason the tampered-ledger path already terminates on, asked of the scorer's
exported `QUARANTINE_REASONS` rather than assumed.

**This is the fifth instance of one cause**: two places answering one question, agreeing until
a new case makes them differ. Findings 22 (`finalize` walked the tree while `next` and `record`
asked the oracle), 29 (`expectedNext`'s literal origin vs `attemptOrigin`), and now the route
field vs the annotation field. The rule that would have caught all three: **if a value is
derivable, never also state it — and if two fields can express the same decision, only one of
them may be read.**

**Finding 35 — a third scorer silence, in the shape of findings 16 and 17.**
`collectConsensus` builds a consensus row from EITHER `critic.json` or `advocate.json`, and
`evalConsensus` never asks whether both roles reported. So a one-voter round scores exactly
like a unanimous one, and a replayed attempt carrying only `critic.json` gated `pass` while the
controller's own message read `consensus_round: "incomplete: missing advocate"` — **naming the
defect and promoting anyway**, which is the one behaviour the rest of this file exists to
refuse. FR-7 rule 1 is explicit that the parallel set is exactly {Critic, Advocate}.

The controller now gates completeness in BOTH modes, because completeness is a property of the
evidence rather than of who produced it — unlike the round REQUEST, which stays live-only since
a replay has no one to dispatch. All 56 consensus directories in the 25-fixture corpus carry
both roles, so no recorded evidence disagrees and the matrix is unchanged.

**It deliberately does not fire on a wholly ABSENT round**, and the asymmetry is the finding: an
absent round scores UNVERIFIED and promotes with a warning (finding 30) — a gap that announces
itself. A one-voter round scores as a clean round. The first is honest; the second is a false
unanimity. Whether the SCORER should require both roles is not a spike-local call and belongs
with findings 16 and 17 as a question for the skill.

**Finding 36 — the fix for finding 33 was unreachable for the case it was written for, and
reachable only for the three where it was wrong.** Finding 33's fix made `consensusPending`
fall through from a RESOLVED dissent to the Critic, so an attempt carrying both could still get
its reproduction. Trace which resolutions actually reach that line:

```
override   -> applyResolution writes `resolution` to advocate.json
              -> overriddenOf() is true -> the dissent block is SKIPPED ENTIRELY
              -> the fallthrough is never executed for the one case it exists for
uphold     -> reaches it. Job is about to end on ADVOCATE_DISSENT.
repair     -> reaches it. Dissent already routes to a build rewind.
re-review  -> reaches it. Dissent already routes to a fresh attempt.
```

In all three the DISSENT owns the route, and `consensusRoute` takes the dissent branch
regardless — so the reproduce round was requested, answered by the orchestrator, and then
discarded. Against step 5's hard cap of 10 dispatches (`SPIKE_CONTROLLER_PLAN.md` §12.7),
that is a wasted dispatch in the three most likely dissent outcomes. `consensusPending` now
returns null on any resolved dissent; the four-resolution matrix with a Critic fail present is
asserted, which is the test that would have caught it.

**Why this one is worth more than its size.** Finding 33 was found by an independent audit and
fixed in a hurry; the fix went in **unreviewed** and merged that way (PR #70's own sync entry
says so). It was then caught by a review requested *before* spending dispatches on the live
run — the cheapest possible place to catch it, and the reason the operator's "review first"
call was right. But the review that caught it was **mine, of my own code**, which is the weak
form this file has argued against five times. It found a mechanical defect (a branch reachable
only in the wrong cases) and it should not be assumed to have found a conceptual one.

### What step 5 part 1 does NOT establish

- **That the sketch is sufficient.** Unchanged from finding 24. The branch prose for
  `consensus`, `reproduce` and dissent resolution is exactly as it was when it was written
  against an imagined controller; all step 5 has done is make it possible to test.
- **That any of this works live.** Every assertion above runs against staged files. A "live"
  arm in `run-step5.sh` means the controller's live-mode code path with no `--from`, not a
  dispatched subagent. Six of seven phases have still never run live and the consensus pair has
  never run at all — condition 3 is untouched, and step 3's lesson says the defects that matter
  here are the ones this harness structurally cannot reach.
- **The remaining seven rule families**, the ship-approval operator branch, resume/`carry_over`,
  and the entropy gate. Still out, per §12.7's creep guard.

## STEP 5, part 2 — the run, and the answer to the question that could flip the sign

One live orchestrator run of `plan → build → test` with a consensus round, from a **fresh
Claude Code session in an isolated VM with no `adws-pipeline` skill installed**, reading
`thin-skill-sketch.md` and nothing else from the shipped tree except the one reference the
sketch mandates. Five dispatches of a cap of ten. The isolation is the load-bearing part: the
skill is a USER-level install on the development machine, so every session there has the
429-line `SKILL.md` in its skill list — the very document the after arm is measured against.
A fresh session alone would not have been isolation.

**Verdict: Z CONFIRMED.** `run-step5.sh` S9 asserts it rather than stating it.

```
Z at run time          9,700 B / 155 lines
Z' after patching       11,400 B / 176 lines     (+1,700 B, +21 lines)
ceiling (§12.1)         21,274 B                 -> 1.87x headroom, 9,874 B of room left
§12.7 band              < 14,000 B               -> Z confirmed; not the kill band, not A/B-mandatory
```

**The GO's pessimistic floor holds.** The number the whole margin rested on, and the one this
spike trusted least (finding 24), survived a real orchestrator running from it.

### The affirmative result, stated precisely

Zero forbidden reads. Zero blocking residue events. Three phases and a consensus round in five
dispatches. The orchestrator never needed `SKILL.md`, `phase-gates.md`, `artifact-layout.md` or
`validator-inputs.md`, and reported three near-misses where it *would* have (an unregistered
agent type → `runtimes.md`; a transient subagent failure → `troubleshooting.md`; and
`agent-shared-blocks.md`, which it judged unnecessary by inference the sketch does not state).

**But sufficiency is yes-with-an-asterisk, and the asterisk is ten residue events** — one of
which forced a knowing departure from frozen text at the consensus gate. The honest statement:
the sketch is sufficient to RUN from, and not sufficient to run from correctly WITHOUT
judgment. A less careful orchestrator would have relayed the false preamble.

### New findings from step 5 part 2

**Finding 37 — one wrong argument in one line produced four of the ten residue events.** The
sketch said `init <contract.json> <target_repo>`; the controller's second positional is
`evidenceRoot`. So the evidence tree landed INSIDE the worktree, and from that single
substitution:

```
(a) artifacts/{jobId} does not exist          -> the literal command crashed
(d) "evidence lives in the primary checkout's artifacts/, never in the worktree"
                                              -> FALSE for this run, in a MANDATED briefing
(e) git status --porcelain -uall              -> returns the whole evidence tree as untracked,
                                                 poisoning the preamble's own enumeration method
(i) hard rule 2 names artifacts/              -> a "never violate" rule naming a nonexistent path
```

(d) is the one that matters. The preamble is frozen text the run was supposed to MEASURE, and
it measured false — so the orchestrator had to choose between relaying a statement it knew to
be wrong into two fresh-context agents, or correcting it. Relaying would have sent both
assessors hunting evidence that was not there and invited them to report the real evidence tree
as a stray untracked artifact: **manufacturing false defects at the one gate whose entire value
is independence.** It corrected the clause and flagged the correction. That was right, and the
sketch gave it nothing to base the decision on.

**The transferable lesson is about interfaces, not about this line.** The cost of one wrong
argument in an interface is not one error — it is every downstream statement that assumed the
argument was right, and here that included a rule labelled "never violate" and a briefing
labelled "include or they will report expected pipeline state as defects".

**Finding 38 — finding 25's named risk occurred, in the block finding 25 named.** Finding 25
said the one place per-phase quality could degrade is "where the thin interface is thinner than
the original on a KEPT block — **the consensus briefing above all**." That is exactly what
happened. `phase-gates.md` rule 1 gives the consensus agents "the task contract and the change
set (**diff + check results**)"; the sketch compressed that to "the contract and the change
set" and separately says "never the phase agent's reasoning". The controller's payload then
offered `prev_output` — the tester's `phase_output.json` — and the orchestrator, reading the
two clauses together, withheld it as reasoning.

It is not reasoning. `phase_output.json` is the check RESULTS, which the source document names
as part of what they assess; `phase_log.md` is the reasoning. Both assessors re-derived what
the tester had already established — one of them rebuilt the baseline tree and re-ran every
check — which is not independence, only expense.

**A predicted mechanism failing in its predicted location is much stronger evidence than a
generic gap.** Finding 25 argued the controller "removes decisions from the model and adds
none, so per-phase reasoning has no obvious mechanism by which to grow", and named this single
exception. The exception is now observed. Treat that as the shape of the risk in the other
KEPT blocks, not as a one-off.

**Finding 39 — the documented check row cannot express the primary documented `gate_weak`
case, and a deterministic validator found it where two fresh-context assessors did not.** The
test gate failed on `checks[4]`: `baseline_reason: null` is not in the enum. The tester was
being *honest* — the row is a no-regression parity guard, correctly marked `falsifiable: false`
/ `verdict: "gate_weak"`, and a no-regression check has no red baseline by construction.

The documents disagree with each other:

```
artifact-layout.md:234   baseline_reason: "assertion-failed-runtime-present | collection-error | not-run"
phase-gates.md:248       gate_weak case 1 is "passes pre-change (no red baseline)"
                         -> the enum has NO value for it
```

So a check that legitimately passes pre-change cannot state why in the documented vocabulary,
and the strict reader step 2 built — which fails CLOSED on an unreadable row, correctly — gates
the tester for candour. **This is a fourth member of the findings 16/17 family**: the reference
documents and the recorded evidence disagree, and which is the contract is not a spike-local
call. Filed as its own question for the skill.

Two things worth keeping. First, the layered design worked exactly as argued: **a deterministic
schema validator caught what two independent LLM assessors missed**, and the Critic had gone as
far as rebuilding the baseline tree. Second, what it caught was a **schema gap, not a defect** —
so the same layering that makes the gate strong also makes a vocabulary hole indistinguishable
from a real failure, and the job's annotation was `TEST_GATE_FAILURE`: the exact blanket reason
the contract under test exists to split. The run failed into the vocabulary it was repairing.

**Finding 40 — two controller defects the mocked path could not surface.** The literal sketch
command crashed with an **uncaught `ENOENT` stack trace** rather than a controlled error —
notable for a component whose defining property is "the controller's word is the state", and it
leaked four `adws-run.js` line numbers into a context explicitly instructed not to read that
file (291, 1545, 2361, 2384 — this entry first said *five*, and an independent audit of the
merged record caught the miscount; the crash reproduces, so `run-step5.sh` S9b now derives the
number from the stack and requires this sentence to agree with it). And `worktree_path` was
emitted as `""` on all four dispatch payloads: never populated,
never an error, **silently empty on the one field that enforces isolation**. Every driver passes
a worktree or does not care, so neither was reachable from the harness.

### Against §12.6's four criteria

| | |
|---|---|
| 1. Sufficiency | **yes, with judgment** — 0 forbidden reads, 0 blocking events, slice completed; 10 residue events and one knowing departure from frozen text |
| 2. Z′ measured | **11,400 B / 176 lines**, 1.87× under the ceiling — **Z CONFIRMED** |
| 3. The after end on a measurement | **half**. Instruction mass is a measured point (17,544 B at run time: sketch + `task-contract.md`; 19,244 B patched) against a full-document before of 124,008. The live **handshake was never counted**, so finding 31's prediction stays unmeasured |
| 4. The controller arm of the reasoning A/B | **not done** — no per-phase orchestrator token counts were captured |

**The run also settled which reading applies to the after arm.** The orchestrator obeyed its one
mandated reference read, so obeying-vs-obeying is the fair comparison and the strict
no-reference reading is now known to be **counterfactual for the after arm** — a thing §12.2
could only flag as a trap and this run answers.

### What step 5 does not establish

- ~~**The live handshake cost.** Not counted.~~ **Counted after the fact** — see STEP 6 below.
  Step 5's transcript held the datum all along; only the instrument was missing.
- ~~**The reasoning A/B**, either arm.~~ **Arm B is now measured**, from the same transcript.
  Arm A is pre-registered and unrun; condition 4 is half-closed and still the top of the list.
- **Four phases and every rewind family.** The run stopped at the test gate by design; review,
  document, ship and verify have still never been orchestrated from this document.
- **That the patched sketch is now sufficient.** Z′ is a measurement of the interface after one
  run found ten gaps in it. A second run would find more; the claim is that the FIRST run's
  gaps cost 1,700 bytes, not that no gaps remain.

## STEP 6 — the reasoning A/B: arm B measured, arm A pre-registered

**Status (2026-08-11): the controller arm is MEASURED; the prose arm is pre-registered and has not
run.** Condition 4 asked for "two live runs of the same contract, one under each orchestrator."
One of them already happened — step 5 was a live run under the controller — and its transcript
survived in the VM with per-message `usage` on every turn. **No dispatch was spent to measure it.**
The protocol, the frozen numbers and the measurement script are in `ab/`; `run-ab.sh` re-derives
every figure below from the committed transcript (42 assertions) rather than restating it.

### The controller arm, measured

| | |
|---|---|
| Per-phase context growth `P_B` | **5,589 tokens/phase** (plan 5,605 / build 5,485 / test 5,676) |
| Round trips per phase | **3.00 exactly** — 3 / 3 / 3 |
| Output tokens per phase | 3,564 / 2,946 / 3,157 |
| Intake mass `I_net` | 20,379 tokens, of which instruction reads are **7,294 tok / 17,544 B** |
| Live handshake, as run | 11 calls, **12,695 B** inbound |
| Live handshake, pure | 9 calls, **7,493 chars** inbound |

### New findings from step 6

**Finding 41 — an assistant row is not a model turn, and the naive fix is wrong in the other
direction.** The transcript writes one row per content block and repeats the same `usage` object on
each: 61 assistant rows are **26** model turns. Summing per row inflates output tokens **2.71×**
(83,651 vs 30,863). The obvious correction — one row per `message.id`, first wins — is *also* wrong,
and only on the other files: in the SUBAGENT transcripts the rows of a turn carry **different**
partial usage, so first-wins reports the advocate at 3,217 output tokens against a true 31,927, a
**10× undercount**, while row-summing there is accurate to 0.6%. The rule used everywhere here is
**the record with the maximum `output_tokens` within each `message.id`** — the final streaming
state. An audit checked whether that rule is *uniquely* right and it is not: **last-record-per-id
returns the identical total on all six observed transcripts**, with zero non-monotonic rows. Max is
chosen because it stays correct if a row ever arrives out of order, not because it is the only rule
that reproduces these numbers — the earlier phrasing here overstated that and is corrected.

This is findings 22/29/34's shape inside the instrument itself: two ways of counting that agree on
one file and diverge on the next, and whichever you checked first is the one you would have
shipped. Every number in this section is max-per-id; `run-ab.sh` asserts the row/turn ratio so a
future reader cannot silently regress to rows.

**Finding 42 — the controller's measured steady state is 3.00 round trips per phase, not the
inferred 2, and §9's kill band is "~2–3".** Q5's answer said "2 model turns per phase in steady
state." That was an inference from step 3's mocked path. The only live controller run shows
`next` and `record` as **separate turns at every one of the three phases** — T11/T12, T14/T15,
T17/T18 — never batched. The controller therefore sits **at the ceiling of §9's band, not under
it**. This is published independently of arm A because it is a fact about the controller, not a
comparison: nothing arm A does can move it.

**Finding 43 — finding 31's prediction closes, and it closes in two halves that point opposite
ways.** The live handshake for a partial three-phase slice was **12,695 B over 11 calls**, which
exceeds step 4's replayed seven-phase estimate of 9,146 B — the prediction confirmed. But 2 of
those 11 calls bundle non-handshake work into the same Bash invocation (a `git worktree list` and
a `find` riding along with the ENOENT probe; a `node -e` dump of `checks[4]`). **Pure handshake is
9 calls / 7,493 chars — under 9,146 B for three phases where step 4 estimated seven.** So the
interface is cheaper than step 4 guessed and the *run* was more expensive, because the orchestrator
put diagnostics through the same channel. Both numbers are published; only the pure one describes
the interface, and only the as-run one describes what a run costs.

**Finding 44 — the orchestrator is 14.8% of the run's output tokens.** 30,863 against 177,047 from
the five subagents (planner 34,273 / builder 48,741 / tester 41,592 / critic 20,514 / advocate
31,927), recovered from the VM's own sidechain transcripts — which the harness does **not** expose
for the two async consensus dispatches, so `toolUseResult.totalTokens` reports them as unrecoverable
and only the archived JSONL has them. Condition 4 argues about the smaller share. That does not make
it the wrong argument — instruction mass is the orchestrator's cost and nobody else's — but it
bounds what any A/B result can claim about what a run costs.

**Finding 45 — a hand-copied install fails its own integrity gate, and the failure is
end-of-run-shaped.** `skill-check.js` finds the agents directory at `<skill>/../../agents` or
`<skill>/../.claude/agents`. Copying `adws-pipeline/` alone into `~/.claude/skills/` satisfies
neither: `intact: false`, `agents_dir: null`, exit 1, ten `agent/*.md` reported missing — and
SKILL.md §0.3 says **do not start the job**. Arm A's setup did exactly this and would have aborted
at zero dispatches. The shipped `install.sh --global` does the right thing and was used instead.
Recorded because the check behaves correctly and the *setup* was wrong: a reviewer preparing an
isolated environment reaches for `cp -R` before they reach for the installer, and the gate that
catches it fires at intake of the first job rather than at install time. **Predicted before the run
by a design agent reading `skill-check.js`, then confirmed by running it** — the cheapest defect in
this spike's history, found for the price of reading the code that was about to run.

### Arm A ran, and the pre-registration voided it

**The pair is not a verdict, and the document said in advance which rule would say so.** Arm A
completed the slice on 2026-08-12 — test gate **PASS**, 4/4 criteria with genuine RED baselines,
five dispatches, zero forbidden reads, zero contamination hits, the installed skill byte-identical
before and after. Then §7.4 fired:

**Finding 46 — the arms ran on different models, and the cause was a saved setting rather than a
decision.** Arm B ran on `claude-opus-5`. Arm A ran on **`claude-fable-5`**, because a `/model`
command in an earlier session in that VM had saved Fable 5 as the default *for new sessions*. §7.4
froze the harness config as "a single value per arm **and equal across arms**", consequence
**VOID** — and that check is independent of the outcome, so it was declared from the config alone,
before the comparison was computed. Effort (`high`) and version (`2.1.228`) did match. The
frozen-list entry that caught this was written because a *design agent* asked what would happen if
the two arms' harnesses drifted; nothing in the run itself would have surfaced it, and every number
below would otherwise have been published as a result.

**The pair fails three more ways that have nothing to do with the model**, each pre-registered:

| Rule | What happened |
|---|---|
| §4.11, binding | S1 returns **CONFIRM-AT-FLOOR**, S2 returns **CONFIRM**. Different bands → INDETERMINATE, replicate forced |
| §6.3, leave-one-out | Dropping the **build** phase flips `Δ_P` to **−128.5**. One of three phases decides the direction, at n=1 |
| §5, resolution floor | `Δ_P` = **996** under S1 — **four tokens** under the pre-registered 1,000-token floor |
| §10.7 | Instrument 2 is a **3.00 vs 3.00 tie**. A tie does not discriminate, and the protocol says to say so |

The numbers, published as an observation and not as a comparison: `P_A` 6,585 (S1) / 7,814 (S2)
against `P_B` 5,589 / 6,112; round trips 4 / 4 / 1 against 3 / 3 / 3; `I_net` 63,504 against 20,379.

**Finding 47 — the prose orchestrator opened every reference, and that settles §12.2's open
question about which "before" a real run resembles.** Given a free choice — the prompt deliberately
did not steer it — arm A read `SKILL.md` (via the Skill tool) plus **all four** references it
names: `task-contract.md`, `phase-gates.md`, `artifact-layout.md`, `validator-inputs.md`.
**124,008 bytes**, which is exactly the full-document reading §11 has always carried as the
optimistic end of the bracket. It declined `runtimes.md`, `troubleshooting.md` and
`agent-shared-blocks.md`, each for a stated reason, and never opened a validator script header.
Against arm B's 17,544 B that is **7.07×**, and bytes-read is the one cross-arm quantity here that
is not a token count and so is least disturbed by the model mismatch. **The pessimistic before —
30,012 B, a model that opens no reference — is now known to be counterfactual for a real prose
run**, at n=1, on a different model, which is exactly as much as one observation is worth.

**Finding 48 — the human-turns veto counts a proxy, and it fired on nothing.** §5's veto 6 trips
when `HUMAN_TURNS(A) > 1`; the metric counts plain-string `type:"user"` rows, and arm A has three —
one instruction and **two local-command wrappers for `/clear`**. The run was not steered. The
defect is recorded and **deliberately not amended**: amendments A1–A8 were made while arm A did not
exist, and this one was found afterwards. §10.4 is about exactly that difference, so it is fixed
before the re-run and labelled post-data, not folded in silently.

### The second arm A run: the model was fixed, and the drift moved to the next frozen key

**Finding 49 — two runs, two harness drifts, the same cause both times.** After the model VOID I
reset the VM, pinned `model: claude-opus-5` in `settings.json`, and handed over a launch command
carrying `--model claude-opus-5`. The model was then correct on every turn. **Effort drifted to
`xhigh`** — because a `/effort` command in the session saved xhigh as the new default, exactly as
`/model` had saved Fable 5. §7.4 froze three keys and fixing one moved the failure to the next.

The drift is not cosmetic. **Effort sets the thinking budget, and thinking is a large share of what
the primary metric measures**: arm A2's per-phase thinking is 2,240 / 1,380 / 1,793 against arm B's
1,513 / 89 / 270. So the uncontrolled variable inflates the arm that was *predicted* to be more
expensive — a confound pointing directly at the expected answer, which is the least defensible kind
to accept.

**And this pair is the one where everything else worked.** Recorded as an observation about the
instrument, under a VOID that forbids reading it as an observation about the controller:

| | arm A2 | arm B |
|---|---|---|
| `P` (S1) | 8,656 | 5,589 |
| `P` (S2) | 9,437 | 6,112 |
| Round trips / phase | 3.67 (4 / 4 / 3) | 3.00 |
| Terminal state | **test gate FAIL** (Critic fail, reproduced, rewind determined) | test gate FAIL |

Both segmentations returned the same band. Leave-one-out was sign-stable **and** band-stable.
Both instruments agreed in direction. The terminal states finally matched, which arm A1's PASS did
not. Every stability check the protocol asks for passed — on a pair whose treatment was
contaminated. **`PROTOCOL.md` §10.13 stands: a void pair may not re-price anything**, and the
numbers above are in this document so that no later reader can quote them as the answer without
also reading this sentence.

**Finding 47 reproduces.** Arm A2 opened **six** reference documents plus the skill body —
`task-contract`, `phase-gates`, `validator-inputs`, `artifact-layout`, and `agent-shared-blocks`,
one more than arm A1 — and additionally grepped four validator scripts hunting the `version`
constant that `skill_trace.version` requires and no validator prints. It declined `runtimes.md` and
`troubleshooting.md`, each for a stated reason, on both runs. Two runs, two models: the prose
orchestrator reads essentially the whole reference set.

### The pre-registered predictions, scored

Recorded in `ab/PREREGISTRATION.json` before arm A existed. Scored against a void pair, so this is
about the predictions and not about the controller.

| Prediction | Outcome |
|---|---|
| Arm A uses **more** round trips per phase than 3.00 | **Wrong.** A 3.00–3.00 tie (arm A 4/4/1) |
| Arm A's per-phase growth exceeds arm B's, by 1.3×–2.5× | **Direction right, magnitude below range** — 1.18× |
| Arm A's intake mass is 1.5×–6× arm B's | **Above range** — 11.4× in tokens, 7.07× in bytes |
| The sign is not uniform across phases | **Right.** Plan and build favour the controller; **test favours prose** (3,786 vs 5,676) |

Two of four missed their stated ranges, in opposite directions, which is the argument for stating
ranges in advance rather than describing the result afterwards as roughly what one expected.

### What arm A found in the SHIPPED skill, which the void does not touch

Arm A is step 5's mirror: ten residue events against the sketch, six against `SKILL.md` on the
first run and eight on the second. These are gaps in the **shipped** document, reported by an
orchestrator following it for the first time, and the second run is the evidence that they are
model-independent. Arm A1's six:

1. **Where the pre-git `ship-mode-select` trace lives.** §1 requires running it *before* the first
   git command that consumes the branch name, but traces are defined only under an attempt's
   `skills/{skill_id}/` — and no ship attempt exists at worktree-creation time. Improvised as
   `artifacts/{jobId}/pregate/ship-mode-select/skill_trace.json`.
2. **Which date the jobId uses.** "next free `job_YYYYMMDD_NNNN`" with local date Aug 11 and UTC
   Aug 12. Every timestamp rule in the skill mandates UTC, so UTC was chosen — the skill never says.
3. **The worktree-mechanism contradiction.** §1 prefers the Agent tool's `isolation: "worktree"`,
   but build, test and both assessors must see one persistent tree recorded once as
   `run_manifest.worktree_path`, and per-dispatch worktrees are per-agent and auto-cleaned. The two
   are never reconciled.
4. **No vocabulary for an operator-directed partial run.** Mapped to `canceled` / `OPERATOR_CANCEL`
   with a carry-over record — the closest documented enum. **This is findings 16/17/39's family
   again**: the reason vocabulary has no member for a thing that happened.
   **CLOSED by SC-16/F-88** — `final_status: "halted"` / `OPERATOR_HALT`, with gap 8 and gap 12.
5. **`skill_trace.version` has no documented content.**
6. **The Advocate omitted its `resolution: null` key** despite being told to write it. Schema drift,
   semantics unaffected, correctly not gated.

And four surprises, one of which is a real quality signal:

- **The parity corpus goes red post-change.** `parity/execution-report-fixtures/run-tests.js` exits
  1 with 25/25 failures — all from the corpus's own hardcoded `schema_version === '1.4.0'`, staled
  by the build's bump to 1.5.0. Every decision, exit code, warn flag and determinism assertion still
  passes; the tester and the Critic each ran it independently and agree. The tester recorded it
  **`gate_weak`** (baseline already green, so not falsifiable) rather than laundering it into a
  pass. `parity/` is write-blocked by the contract, so the branch would ship with a red runner.
- **The runtime is less telemetry-blind than the skill claims.** SKILL.md asserts model id, cost,
  tokens and tool-call count are "structurally unavailable in this runtime and are written as
  null". The Agent tool returned total tokens, tool-use counts and durations. **F-17's claim is
  outdated for this runtime** — and it is the same fact that made arm B's subagent accounting
  possible at all (finding 44).
- `criteria-to-checks` typed two concrete criteria `unclassified` because its lexical classifier
  found no outcome verb in "terminates on". Changed nothing under SC-5; shows a narrow verb list.
- `task-normalize` emitted analytic fields (`delta_r`, `coherence_score`, `synthetic_risk`) that
  `validator-inputs.md` never documents.

**Arm A2's eight, and five of arm A1's six reproduced on a different model.** The jobId timezone,
the pre-git `ship-mode-select` trace location, the undocumented `skill_trace.version`, the
worktree-mechanism contradiction, and the missing vocabulary for an operator-directed partial run
all recurred, independently, under `claude-opus-5` where arm A1 hit them under `claude-fable-5`.
**The union across both runs is nine distinct gaps, not fourteen** — an earlier count added the
two lists rather than merging them, and is corrected here. The three that are new:

7. **`provenance` defines two disjoint key sets.** `artifact-layout.md` gives the shape as
   `{model_id, cost_usd, tokens_in, tokens_out, elapsed_ms, tool_call_count, timeout, cancel}`
   and then, below it, names `started_at`, `completed_at`, the derived `wall_clock_s`, `agent`
   and `model_tier_requested` **obtainable and therefore mandatory**. Not one mandatory field
   appears in the shape. Arm A2 wrote the union because nothing told it which list won. This is
   findings 22/29/34's family again: two places answering one question.
8. **No attempt-level reason for a route determined but not executed.** F-46 step 2 closes the
   failing attempt with `failure_reason: "CRITIC_FAIL_REPAIRED"`, which presupposes the rewind
   ran. Under an operator stop that value asserts a repair that never happened, and
   `TEST_GATE_FAILURE` asserts a budget exhaustion that did not occur (test budget 2, this was
   attempt 1). Both documented values are false, so arm A2 wrote `null` and recorded why —
   **the attempt-level twin of gap 4**, which was the job-level version of the same hole.
   **CLOSED by SC-16/F-88** — the attempt-level `ROUTE_NOT_EXECUTED` with `route_determined`.
9. **`NO_DOC_PATH_IN_SCOPE` is a judgment call wearing a rule's clothes.** "No `allowed_paths`
   entry admits a documentation location (README\*, CHANGELOG\*, `docs/`, or the repo's
   equivalent)" — and `adws-pipeline/references/` is this repo's equivalent, which the
   orchestrator had to decide for itself and recorded rather than raised.

Five further surprises, the first of which is the largest single defect either arm A run found:

- **`repo-context-scan` validates the plan, not the build.** Its input is
  `plan_output.file_change_proposal`; the build gate's only validator never inspects what the
  builder actually changed. Arm A2 checked the real change set itself (`git status --porcelain
  -uall` against `allowed_paths`) and recorded that nothing in the skill told it to. A builder
  writing outside `allowed_paths` passes the build gate on the plan's good intentions. **Fixed
  in this PR** — see finding 51 for why neither half of it was wrong.
- **The mandated `resolveWithinRoot` check rejected all three of the Critic's `reproduction.files`**
  because they were recorded job-relative instead of attempt-relative. The corpus was present and
  legitimate. An honest evidence-drift bug is indistinguishable, at the check, from a path-escape
  attempt — the check reports a security shape for a clerical cause.
- **`decideLifecycle` answered a mistyped probe confidently.** Passed `{final_status,
  failure_reason}` (the manifest's field names) instead of `{status, failureReason}`, it fell
  through to the unknown-state branch and returned QUARANTINE: a wrong call that looked exactly
  like a right one. A function that cannot tell a wrong key from a wrong state is one whose
  agreement is not evidence.
- **`repo-context-scan` echoes the whole ~4 KB `plan_summary` into its verdict**, so the build-gate
  trace is mostly plan prose.
- **`skill-check.js` also verifies the ten installed agent files** (`agents_checked: 10`), more
  than SKILL.md's "installed-copy integrity + version" advertises. Finding 45's mechanism, seen
  from the other side.

**Finding 50 — a stated integrity rule with nothing behind it, found in the evidence a run
produced to satisfy it.** `artifact-layout.md` rule 9 says every `*_at` field is a real UTC value
captured at the moment of writing, "never estimated, copied from another file, or a placeholder,"
and that a midnight `T00:00:00Z` stamp "reads as fabricated evidence." Arm A2's test attempt wrote
[`"performed_at": "--"`](fixtures/live_armA2_run/test/attempt_1/phase_manifest.json). That tree
then passed every gate the skill has, was committed here as a fixture, and was caught by an audit
reading files by hand. **No validator inspects any `*_at` field** — a grep for `_at` across all
nine scripts in `adws-pipeline/scripts/validators/` returns nothing. Rule 9 has been prose since
SC-13.

The bug is one character wide; the class is not. The skill states integrity rules in prose and
enforces a subset in code, and the unenforced subset stays invisible until a human reads the
evidence — which is exactly the audit path the dual-evidence bar exists to avoid depending on.
Rules 8 (strict writer) and the write-once discipline of FR-4 are in the same position. Closed in
this PR by `evidence-integrity.js`, which makes rule 9 executable.

**Finding 51 — a gate can be declared in one file, implemented in another, correct in both, and
still not gate.** Two instances, in unrelated codebases, found in the same week:

- **`repo-context-scan`.** SKILL.md's validator→phase map declares it the **build** gate's
  validator. The script's own header declares its input `plan_output.file_change_proposal`. Both
  statements are accurate. The composition validates the plan at the build gate, and neither file
  contains the error.
- **TAC-7's PreToolUse hook.** `pre_tool_use.py:99` exits 2 under a comment reading "Exit code 2
  blocks tool call and shows error to Claude" — correct, and the documented mechanism.
  `.claude/settings.json` wires it as `uv run …/pre_tool_use.py || true`, which is a correct way
  to keep a *logging* hook from breaking a session. **All 7 of 7 hook commands carry `|| true`.**
  The composition is a blocking hook that cannot block. Neither file contains the error.

This is the mechanism underneath findings 12/14/15/18/19/23/27 ("trusting a proxy for the
property"), stated at the level that predicts where to look: **when a gate is a declaration in one
file and an implementation in another, the composition is a third artifact that nothing reviews.**
Reading either half confirms the gate. Reading both, adjacently, is the only thing that finds it —
which is why this is recorded as a review rule and not only as two bugs.

**And the fixes for findings 50 and 51 collide with the pending measurement, which `run-ab.sh` §A5
caught rather than a reviewer.** Both fixes edit `adws-pipeline/`, and the live A/B contract's
`allowed_paths` are `adws-pipeline/references/` and `adws-pipeline/scripts/execution-report.js` —
so merging them replaces the document arm A3 would read. A5 exists to assert that "the tree arm A
reads is unchanged since pre-registration"; it now fails with
`d17cca5a…` against the frozen `fe1657c8…`, and it was written weeks before the change that tripped
it. The assertion is not defeated here and the digest is not updated: **the fix branch waits for arm
A3.** Two frozen keys have already drifted out from under this experiment; a third drift caused by
the experimenter's own repairs would be the least excusable of them. This is also the first time a
guard in this spike has fired on its author rather than on a hypothetical.

One decision follows from that constraint and is worth stating, because it is the kind normally
made silently. The receipt-binding failure has no good member in the reason vocabulary, and adding
one would have meant editing `execution-report.js` — the file the pending contract targets, in the
exact area (`QUARANTINE_REASONS` / `NO_RETRY_REASONS`) the arm A2 Critic's finding lives in.
So verify's receipt mismatch terminates `failed` / `VERIFY_GATE_FAILURE`, a member that already
exists and is already reachable, with `resumable: false` carrying the fact that an artifact is
live. Whether it deserves quarantine-class is a real question and it is deferred, on the record,
rather than answered by inventing an enum member mid-experiment. Gaps 4 and 8 are about a
vocabulary with no member for what happened; the response to that is not to mint members casually.

### The third arm A run: both operator keys were fixed, and the harness moved underneath

**Finding 52 — three runs, three VOIDs, one per frozen key, and the third one nobody controls.**
Arm A3 ran on 2026-08-12 with `--model claude-opus-5 --effort high` on the command line and both
values pinned in `settings.json`. Model: correct on all 81 assistant rows, and **equal to arm B's**.
Effort: `high` on all 81 rows, and **equal to arm B's**. §7.4 freezes three keys. The third is
`version`, and arm A3 ran on Claude Code **2.1.229** against arm B's **2.1.228** — the CLI updated
itself between 2026-08-11 and 2026-08-12.

| run | key that drifted | cause |
|---|---|---|
| A1 | model — `claude-fable-5` vs `claude-opus-5` | a `/model` command had saved a new default |
| A2 | effort — `xhigh` vs `high` | a `/effort` command had saved a new default |
| A3 | **version — `2.1.229` vs `2.1.228`** | **the harness updated itself overnight** |

The first two were operator error, and pinning fixed them — each time, exactly, and each time the
failure moved to the next key. The third is different in kind. §7.4 names the literal string
`version == "2.1.228"`, and **2.1.228 no longer exists to run against**. The protocol saw this
coming: confound 18 is "model-serving drift between the two run dates", direction **UNKNOWN**,
mitigated only by "run arm A as soon as possible; assert §7.4". That mitigation failed for a reason
the protocol could not have priced — arm A took three attempts across two days, and every attempt
spent to fix one drift bought time for the next.

**So the pre-registered remedy is not another arm A run.** §7.4 row 4 says: *mismatch → VOID,
**re-run both arms inside the same window***. Not re-run arm A. Both. Arm B is a recording from
2026-08-11 on a version that is gone, so **no arm-A-only run can ever close condition 4 again** —
the incremental path this spike has been walking for three runs is closed, and was closed the
moment the CLI updated. That is a structural fact about the design, not about this run: **the
frozen list contains a key the experimenter does not control, and its drift probability rises with
every day between the arms.**

**Finding 53 — and the analyzer said CONFIRM.** Before the amendment recorded below,
`measure-ab.js` returned `verdict: "CONFIRM"` on this pair, with **zero vetoes fired**. It checked
that each arm's harness config was *single-valued within that arm* (line ~849) and never compared
the two arms to each other. §7.4's other half — "**and equal across arms**" — lived in
`run-ab.sh`, as an assertion hand-written once per arm-A run, and for arm A3 that assertion did
not exist yet. Both halves were correct. The analyzer held both transcripts, had every byte needed
to decide the question, and never asked it.

**This is finding 51's shape inside the instrument written to police it** — the third instance in
a week, after `repo-context-scan` and TAC-7's `|| true` hooks, and the first one that was mine.
The composition is a third artifact that nothing reviews, and here the composition's failure mode
was to publish a result. Fixed: `measure-ab.js` now compares all three keys across arms and routes
any mismatch into veto 7, which §5 already maps to VOID.

**The amendment is post-data, and §10.4 normally forbids that.** It is permitted here on a
directional test: it can only **add** voids. It cannot turn a VOID into a verdict, move a band, or
change a number — verified by recomputing both arms under the new script and diffing the full arm
blocks, which are byte-identical. It moved this pair from CONFIRM to VOID: **away** from the
outcome the experimenter wants. An amendment that can only cost you the answer is not a
rationalization. The `measure_ab_js` digest changed with it, which is the freeze working, and
`run-ab.sh` now runs 91 assertions where it ran 68.

**And this is the pair that passed everything.** Recorded under §10.13, which forbids a void pair
from re-pricing anything:

| | arm A3 | arm B |
|---|---|---|
| `P` (S1) | 10,398.67 | 5,588.67 |
| `P` (S2) | 12,370 | 6,111.67 |
| Band, S1 / S2 | **CONFIRM / CONFIRM — they agree** | — |
| Round trips / phase | 5.33 | 3.00 |
| `I_net` | 65,514 | 20,379 |
| Terminal state | test gate **PASS** | test gate FAIL |

Both segmentations returned the same band — the first pair to do so and the rule §4.11 made
binding. Leave-one-out was sign- **and** band-stable across all six drops. Both instruments agreed.
Baseline drift was 253 against a 2,000 tolerance. Attempts were matched at 1/1/1, the first pair
with matched attempt counts. **Four of §6's five n=1-sufficiency conditions hold, and the fifth
fails for exactly one reason: veto 7, the harness void.** Every stability check the protocol asks
for passed, on a pair whose harness was uncontrolled.

That is the argument for freezing the harness in a section *separate* from the stability checks,
and it is worth stating plainly because the temptation runs the other way: **stability is not
validity.** A pair can be perfectly self-consistent, reproduce under both segmentations, survive
every ablation, and still not be a comparison — because self-consistency is a property of the
measurement and validity is a property of what was held fixed. Nothing inside the data can tell
you which you have.

### What arm A3 found in the shipped skill

Arm A3 raised **seven** places the document does not say what to do. Four reproduce (the pre-git
`ship-mode-select` trace — now three for three; `skill_trace.version`; the `provenance`
contradiction; `NO_DOC_PATH_IN_SCOPE`), which takes the union to **twelve distinct gaps**. Three
are new, and the last of them blocks rather than merely requiring improvisation:

10. **The canonical skill ids are DOTTED, and nothing says so.** `skill_trace.json` needs a
    `skill_id`, and the ids are `task.normalize`, `repo.context_scan`, `criteria.to_checks` — not
    the filenames. An orchestrator that guessed from `task-normalize.js` would build
    `skills/task-normalize/` and get the directory name wrong on **every trace in the tree**. Arm
    A3 read three validator sources to find them. This sharpens gap 5 from a missing version
    string to a missing id map.
11. **A criterion carrying both a `verified` and a `gate_weak` check row has no defined verdict.**
    SC-5/F-31 explicitly permits several checks to share one `check_id`, and `verdict` is
    per-check — but the gate is stated per *criterion*. Arm A3's tester returned exactly this: 4
    verified rows plus 4 supplementary `gate_weak` rows. It ruled that ≥1 verified row makes the
    criterion verified and surfaced the rest as warns. Nothing in the skill says that.
12. **A halted run can never be resumed, by the skill's own rules.** §0 step 5 admits
    `execution.resume_from_job` only when the predecessor recorded `carry_over.resumable: true`,
    and `carry_over` is written **only at a terminal state**. An operator-halted run never reaches
    one. So the deliberately-truncated run — the exact shape every arm A run has taken — is
    unresumable by construction. **This is gap 4's family reaching its conclusion**: the
    vocabulary had no member for a halted run, and now the *mechanism* has no path for one either.
    **CLOSED by SC-16/F-88** — `halted` IS a terminal state, so `SKILL.md` §5 step 4 runs and the
    existing shipped/not-shipped rule decides `resumable` without being changed at all. The hole
    was never a policy; it was a record written at a terminal state and a stop that produced none.

And the surprises, of which one is a near-miss on the evidence itself:

- **The scratch root has an owner but not a fresh identity, and it nearly poisoned the
  falsifiability evidence.** F-77's convention `${TMPDIR:-/tmp}/adws-{jobId}/{phase}/attempt_{n}/{agent}/`
  is a pure function of four values with **no run nonce**, so a re-run under the same job id
  silently inherits the previous run's scratch. Arm A3's tester found a stale check script there
  from 2026-08-11 asserting against a non-existent API, refused to reuse it, wrote a fresh one, and
  logged the discrepancy — verified independently by the orchestrator. **Had it reused that script,
  the pre-change baseline would have gone red for the wrong reason and the falsifiability evidence
  would have looked green while proving nothing.** That is SC-3's whole apparatus defeated by a
  path template.
- **`repo-context-scan` validates the plan, not the build — found independently a second time**
  (arm A2 first). Two of three arm A runs found it without being told to look. Fixed in the SC-15
  branch.
- **`task-normalize` reported `has_policy: false, has_risk: false` on a contract that has both**,
  because the assembly table sends only `task.*` fields. The validator faithfully reports the
  absence of fields it was never given; it reads at a glance as a contract defect.
- `criteria-to-checks` typed the two most concretely testable criteria `unclassified` — the third
  run in a row, and the same inverse-to-importance pattern arm A2 recorded.
- The haiku Advocate again omitted `resolution: null` (arm A1's gap 6, reproduced).
- Telemetry the layout calls structurally unavailable was again returned by the runtime (arm A1's
  surprise, reproduced) — arm A3 recorded the real values rather than writing a mandated `null`
  over data it had, and left `tokens_in`/`tokens_out` null because the runtime returns a combined
  count and a split would have been fabricated.

**Arm A3's evidence tree is rule-9 clean**: 13 JSON files, 24 `*_at` fields, zero violations and
zero warnings under `scripts/evidence-integrity.js`. Arm A2's carried the placeholder that produced
finding 50. Three trees clean, one dirty, and the check separates them.

**Finding 54 — the gap count was wrong, and a claim about which gaps were FIXED was wrong in the
same sentence, in three files.** The union after arm A2 was nine; arm A3 added three; the numbered
list runs 1 through 12. Three documents nonetheless read **eleven**, and two of them —
[`docs/SPIKE_CONTROLLER_PLAN.md`](../../docs/SPIKE_CONTROLLER_PLAN.md) §13.5 and
[`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) — went further and said "three of the eleven
documented gaps are fixed in SC-15." **Zero of the twelve were.** What SC-15 fixed was a *surprise*
(`repo-context-scan` reading the plan, arm A2 and arm A3 both, never on any gap list), an ordering
defect found by reading `SKILL.md` rather than by any arm A run, and finding 50. All three are real
fixes; none of them is a numbered gap, and the sentence that bundled them under one count was
written without re-reading the list it was counting.

Two things make this worth a finding rather than an erratum. First, **it is finding 51's shape in
prose**: the gap list is correct, the SC-15 changelog is correct, and the defect is entirely in the
composition — a summary that joined two accurate records on a relation neither of them asserts.
Second, **the false half was load-bearing**. §13.5 uses the number to argue that the arm A re-run
must read the corrected skill. That argument survives — the three fixes are real and one of them is
the largest defect either arm found — but it was resting on a premise that would not have held if
anyone had checked it, which is the failure mode this document has now catalogued fourteen times
against other people's artifacts.

The correction is applied in place, and the superseded wording is named here rather than only
overwritten: an amendment that erases what it amends is the thing §10.4 exists to prevent.

**Finding 55 — the fix for gaps 4/8/12 nearly shipped finding 51 a fourth time, and the fixture
would not have caught it.** `halted` needs a guard, or it is a laundering route: an orchestrator
that can write `halted` could otherwise walk a failed gate out of QUARANTINE. The obvious guard is
the one the `completed` branch already uses — `gateFail`, "did any gate evaluate to fail" — and it
is wrong here for a reason neither file states.

`evalPipelineCompletion` returns **FAIL whenever `final_status !== "completed"`**, and again when
any phase lacks evidence. Both are true of every deliberate stop *by construction*. So the obvious
guard sends **100% of halts to QUARANTINE** — the exact verdict the state exists to avoid — and the
new lifecycle value becomes decorative. Neither half is wrong: `evalPipelineCompletion` correctly
reports that a halted run did not complete, and the guard correctly refuses to bury a failed gate.
**The composition asks a question neither was answering**: it reads "this run did not finish", which
is the halt's premise, as if it were a finding about the run's contents.

The corrected guard skips `pipeline_completion` and reads only gates that evaluated something.

Two things about how this was caught are worth more than the fix. **First, it was found by reading
the gate builder, not by running the test.** The QUARANTINE fixture passes under BOTH guards — it
has a genuinely failed phase gate — so a suite containing only the anti-laundering case would have
gone green on a guard that broke the feature. Only the pair distinguishes them, which is
guard-ablation's argument arriving in a place nobody had run guard-ablation. Verified by ablating
the exclusion and re-running: `retry_operator_halt` flips to QUARANTINE/exit 2 while
`quarantine_halt_with_failed_gate` stays green.

**Second, it is the fourth instance of finding 51 and the first one authored here.** The other
three were found in shipped artifacts — `repo-context-scan`, TAC-7's hooks, `measure-ab.js`. This
one was written while holding the finding in mind, in the commit that closes three gaps *about*
vocabulary holes, by someone who had just corrected a claim (finding 54) that failed the same way.
That is the honest measure of how weak "be careful about composition" is as a control: the defect
class survives full knowledge of itself, and what actually caught it was reading the callee.

**Nothing downstream moves.** No count feeds a gate, a metric, or a void; the twelve gaps are prose
findings against a shipped document. The corrected statement is: **twelve documented gaps, zero
fixed**, and the two closed by the work that follows this finding are gaps 4/8/12 (one lifecycle
state) and gaps 5/10 (one validator envelope).

**Running total as of this commit: twelve documented, three closed** — 4, 8 and 12, all by
SC-16/F-88, because all three were one root cause. Nine remain open: 1, 2, 3, 5, 6, 7, 9, 10, 11.
Stated as a number here so the next reader can check it against the list rather than inherit it —
which is the whole lesson of the finding above.

### What step 6 does not establish, and it is most of it

**The comparison.** Arm A ran **three** times and all three pairs are void — model, then effort,
then version. `Δ_P`, `n*` and the verdict bands are defined, computed three times, and **not
usable**. Condition 4 no longer needs "one more arm A run": §7.4's pre-registered remedy is to
**re-run both arms inside the same window**, and arm B's 2.1.228 recording cannot be reproduced,
so an arm-A-only run cannot close it however carefully the operator pins things (finding 52). The
protocol was
written before arm A existed, amended five times where running it against arm B proved a clause
wrong (`ab/PROTOCOL.md` §0), and committed with a SHA-256 that `run-ab.sh` asserts, so a later edit
reads as an edit rather than as the original.

The protocol also records, before the data exists, the four ways this result could be spun and the
prediction being tested. The one worth repeating here: **every orchestrator-side metric rewards
under-briefing.** Arm B's consensus pair re-derived what the tester had already established
(finding 38), and an interface that briefs badly wins this experiment while gating worse. That is
why the primary excludes the consensus segment, and why the exclusion is a limit on the answer
rather than a tidying-up.

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

- **Q5 — the win is real and measured: yes, as a bracket.** The orchestrator's instruction
  mass falls to 20.9% of before if each reference is read once, and to 60.3% if the model
  never opens one — handshake included on both. The handshake costs 8,738 bytes for a
  complete seven-phase run, against break-evens of 106,802 and 20,650: **2.36×–12.22×**
  headroom. 16 controller messages measured; 2 model turns per phase inferred from step 3.
- **The go/no-go: GO** on the architecture, under the four conditions in the step-4 section,
  argued from the pessimistic end of that bracket. Neither §9 kill criterion fired on either
  reading.
- The line delta itself is a net **increase** of ~212 lines (1,643 of prose → ~1,704 of code
  + 151 of interface, the kept lines being inside the 151), which is the answer to Q5 as
  literally written and the reason finding 23 exists.

**Explicitly not established:**

- **Q5's reasoning half.** Whether the model's per-phase reasoning shrinks is unmeasured and
  needs two live runs of the same contract (finding 25). At the pessimistic end of the margin
  bracket it is load-bearing, not merely qualifying — the highest-value experiment left.
- **The per-run context itself was never observed.** 124,008 and 30,012 are the two ends of a
  scenario bracket, not instrumented measurements of what a real orchestrator loads.
- **Two model turns per phase is inferred**, carried from step 3's live plan dispatch. No
  model was in the loop for step 4's run.
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
bash spike/adws-controller/run-step4.sh          # step 4: 42 assertions — the delta and the go/no-go
bash spike/adws-controller/run-step5.sh          # step 5 part 1: 133 assertions — consensus, reproduce, the four resolutions
node spike/adws-controller/measure-delta.js      # the X/Y/Z report, re-derived from the tree
node spike/adws-controller/run-ingest-matrix.js  # 25 fixtures through init -> record -> finalize
node spike/adws-controller/verify-canonical.js "$JOB_DIR"  # writer-floor conformance
```

All nine exit 0. The committed fixtures are read-only throughout (`git status` clean under
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
