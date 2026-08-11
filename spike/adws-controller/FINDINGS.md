# Spike FINDINGS — `adws-run.js` controller (§6.2)

Tracks [docs/SPIKE_CONTROLLER_PLAN.md](../../docs/SPIKE_CONTROLLER_PLAN.md). Throwaway code;
the findings are the deliverable. **No shipped code was modified** — `adws-pipeline/` and
`parity/` are untouched; everything here lives under `spike/`.

> **Status: step 1 is closed (three adversarial rounds) and step 2 — retries and rewinds —
> is implemented and asserted.** Q3 and Q4 are answered; Q1 and Q5 are untouched, and Q5 is
> the one that decides §6.2. Step 2 also breaks a promise step 1 could keep, and the
> "What step 2 costs" section states it before anything else.
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

Driven and asserted by [run-step2.sh](run-step2.sh), 93 assertions over nine jobs, against
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

```
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

**SC-13/F-76 is enforced on both halves**, so a rewind means a repair with a permanent check
behind it rather than a counter increment: the rewind build attempt must echo each
`regression_check_id` in `phase_output.regression_check_ids` (`S6a`), the forward test re-run
must carry a check row for it that is not simply the row a superseded attempt already had
(`S6b` — the doc is explicit that the SC-5/F-31 criterion join does *not* establish this),
and a criterion repaired in this job that comes back `gate_weak` fails rather than warns
(`S6c`).

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

```
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
- Evidence conforms to the provenance, agent-id, tier-source and phase-output contracts, and
  the validator enforces all four rather than a plausible subset.
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

**Explicitly not established:**

- **Live-dispatch handshake cost (step 3 / Q1 and Q5).** Every dispatch is still MOCKED. Q5
  is the go/no-go and nothing in step 2 moves it: no round-trip count, no token estimate, no
  SKILL.md line-delta.
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
bash spike/adws-controller/run-step2.sh          # step 2: 93 assertions over nine jobs
node spike/adws-controller/run-ingest-matrix.js  # 25 fixtures through init -> record -> finalize
node spike/adws-controller/verify-canonical.js <jobDir>   # writer-floor conformance
```

All five exit 0. The committed fixtures are read-only throughout (`git status` clean under
`parity/` and `adws-pipeline/` after a full run).
