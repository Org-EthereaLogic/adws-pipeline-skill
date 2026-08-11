# Spike FINDINGS — `adws-run.js` controller (§6.2)

Tracks [docs/SPIKE_CONTROLLER_PLAN.md](../../docs/SPIKE_CONTROLLER_PLAN.md). Throwaway code;
the findings are the deliverable. **No shipped code was modified** — `adws-pipeline/` and
`parity/` are untouched; everything here lives under `spike/`.

> **Status: the four fixes the second adversarial review required are implemented and
> verified.** The counterexample that refuted the previous version is now a standing
> regression test and is refused at three independent layers. That closes the specific
> defect class; it does not re-open the broader claims this file has already retracted
> twice. What is established and what is still unproven are both listed at the bottom.

## History (why this file has been rewritten four times)

1. The first step-1 report overclaimed: a "decisive GO", "Q2 answered decisively", and a
   completed-but-contradicted → QUARANTINE class that was "structurally unreachable."
2. Adversarial review refuted two of three. Root cause: the controller's gate was a
   **partial reimplementation** of the scorer (`computeGate()` read only the top-level
   `rubric_result`), so the two could disagree. Verdict: NO-GO, plus a 6-item checklist.
3. That checklist was implemented and this file claimed it complete. **A second independent
   pass produced a decisive counterexample and refuted the completion claim.**
4. **This version records the four fixes that review required, now implemented and
   verified** — plus six new findings the work itself surfaced, two of them defects in my
   own code (one caught by the new matrix, one by self-review).

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

## The four required fixes

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

## New findings from this round

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

**Closed by this round:**

- The completed-but-contradicted class is refused at record (completeness), caught at
  finalize (full terminal gate set), and rejected by the validator — verified by an asserted
  regression covering both the no-mutation and post-gate-mutation routes.
- Evidence conforms to the provenance, agent-id, tier-source and phase-output contracts, and
  the validator enforces all four rather than a plausible subset.
- Fixture agreement is measured by ingestion against the official expectations, with the
  controller's coverage limits declared and counted rather than absorbed.

**Explicitly not established (unchanged, plus one new):**

- Retries & rewinds (step 2): five independent budgets, cross-phase rewinds,
  `corrections.json`. The matrix quantifies what this costs today — 3 of 9 promote fixtures
  are unreachable without it.
- Live-dispatch handshake cost (step 3 / Q5): every dispatch here is still MOCKED.
- Idempotency under re-invoke; `resumed_from` / `carry_over` consumer logic.
- **New:** the terminal `failure_reason` vocabulary (finding 4) — a halted job should not
  flatten `ADVOCATE_DISSENT` or an evidence-integrity breach into a retriable reason.

A note on process, since it is the third data point this session: each of the last three
rounds was overturned by an independent pass, and this round's own driver defect (finding 1)
was caught by the new matrix rather than by me. That pattern is the live argument in
[docs/SIMPLIFICATION_ANALYSIS.md](../../docs/SIMPLIFICATION_ANALYSIS.md) for keeping the
second independent look.

## Reproduce

```bash
bash spike/adws-controller/run-step1.sh          # clean: PROMOTE / exit 0, CANONICAL OK
bash spike/adws-controller/run-step1-negative.sh # failing critic: 13 assertions, RETRY / exit 1
bash spike/adws-controller/run-counterexample.sh # the counterexample + post-gate mutation, asserted
node spike/adws-controller/run-ingest-matrix.js  # 25 fixtures through init -> record -> finalize
node spike/adws-controller/verify-canonical.js <jobDir>   # writer-floor conformance
```

All four exit 0. The committed fixtures are read-only throughout (`git status` clean under
`parity/` and `adws-pipeline/` after a full run).
