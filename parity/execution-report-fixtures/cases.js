'use strict';

/**
 * cases.js — the declared fixture corpus for the execution-report suite.
 *
 * Extracted from run-tests.js (SC-17/F-90) because it now has TWO consumers: this
 * suite, which asserts each verdict, and scripts/local-ci/guard-ablation.mjs, which
 * mutates execution-report.js and re-runs every fixture to find rules no case pins.
 *
 * The ablation sweep needs the same two operational facts this file already carries —
 * which job id lives in which directory, and that quarantine_unreadable_manifest is a
 * chmod applied by the runner rather than content on disk. Copying those into the
 * ablation script would have made one fact answerable from two places, which is the
 * defect this repo has now recorded four times (findings 22/29/34/51). One declaration,
 * two readers.
 */

const CASES = [
  {
    name: 'promote_clean',
    jobId: 'job-2f8c1a',
    decision: 'PROMOTE',
    warn_flag: false,
    exit_code: 0,
  },
  {
    name: 'promote_warn',
    jobId: 'job-7d4e9b',
    decision: 'PROMOTE',
    warn_flag: true,
    exit_code: 10,
  },
  {
    name: 'retry',
    jobId: 'job-c31f57',
    decision: 'RETRY',
    warn_flag: false,
    exit_code: 1,
    // SC-13/F-78: this is the ordinary shape of a job that stopped at the test gate —
    // review/document/ship/verify have no attempt because the job never got there. Those
    // four must read "not reached", not "no attempt recorded": the latter is the SKIPPED
    // phase shape (see quarantine_skipped_phase), and printing it four times above the one
    // line that says why the job stopped made a routine RETRY wear the QUARANTINE face.
    // Assert the WHOLE list, not one phase: a partial assertion would still pass if some
    // of the four kept the old wording.
    expectWarning:
      'Missing phase evidence: review (not reached — job terminated at test), ' +
      'document (not reached — job terminated at test), ' +
      'ship (not reached — job terminated at test), ' +
      'verify (not reached — job terminated at test)',
  },
  {
    name: 'quarantine',
    jobId: 'job-9a6b2e',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
  },
  {
    // SC-16/F-88. The operator stopped a healthy run: test gate PASSED, the next step
    // was determined ("proceed-to-review") and never taken. Before `halted` existed this
    // had to be recorded as `canceled`, whose branch answers QUARANTINE / "human
    // investigation required" about a run with nothing to investigate — three live arm A
    // runs hit exactly this and all three recorded that the vocabulary had no honest
    // member. RETRY is the honest verdict: resuming is the expected next step, and
    // `carry_over.resumable: true` (unreachable before this change) says the tree can
    // carry forward.
    name: 'retry_operator_halt',
    jobId: 'job-h41ta7',
    decision: 'RETRY',
    warn_flag: false,
    exit_code: 1,
  },
  {
    // The other half, and the one that keeps `halted` from being a laundering route: a
    // halt does NOT clear a gate that failed. Same lifecycle value, same OPERATOR_HALT
    // reason, test gate `fail` — QUARANTINE.
    //
    // This trio is also the anti-vacuity check on the guard itself. The guard cannot be
    // the plain `gateFail` the `completed` branch uses, because `pipeline_completion`
    // returns FAIL for EVERY non-completed run by construction — so a naive guard sends
    // 100% of halts here and this fixture would pass while `retry_operator_halt` failed.
    // All three cases must hold at once or the state is decorative in one direction and
    // useless in another.
    name: 'quarantine_halt_with_failed_gate',
    jobId: 'job-h9f41d',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // Pin WHICH gate the operator is told about. The guard reports the first failed gate
    // that actually evaluated something; a regression that quarantined on the premise gate
    // instead would still be QUARANTINE / exit 2 and would still pass the line above.
    expectReason: 'the "phase_gates" gate recorded fail',
  },
  {
    // SC-16/F-88b, finding 56 — the third leg, and the one the original pair could not
    // hold up. The first guard excluded `pipeline_completion` WHOLESALE, and that gate
    // answers two questions in one status: "did this run finish?" (the premise of every
    // halt) and "did this run lose a phase?" (a finding). Excluding it excluded both.
    //
    // This tree is `quarantine_skipped_phase` with `final_status: "halted"`: `review` has
    // no attempt while `document` — a LATER phase — does, so a phase was genuinely skipped
    // and the trailing ship/verify were merely never reached. Under the shipped guard this
    // returned RETRY / exit 1 with the words "nothing is wrong with the run", which is a
    // halt laundering a lost phase. It must QUARANTINE, and the reason must name the gap
    // rather than claim a gate failed — no gate other than the premise one did.
    //
    // Neither original halt fixture had an intermediate hole, which is why both passed a
    // guard that could not tell a premise from a finding. The fixture that CAN tell them
    // apart is the one that has both kinds of gap in a single tree.
    name: 'quarantine_halt_skipped_phase',
    jobId: 'job-h5k1pd',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    expectGate: { key: 'pipeline_completion', result: 'fail' },
    expectReason: 'missing in a way the stop does not explain (review (no attempt recorded))',
    // The trailing pair must still read "not reached" — the halt DOES explain those, and a
    // fix that quarantined on the tail would make every halt a quarantine again.
    expectWarning:
      'Missing phase evidence: review (no attempt recorded), ' +
      'ship (not reached — job terminated at document), ' +
      'verify (not reached — job terminated at document)',
  },
  {
    name: 'promote_unverified',
    jobId: 'job-4b7e1c',
    decision: 'PROMOTE',
    warn_flag: true,
    exit_code: 10,
    // Regression for the crashed-skill-trace bug: a skill_trace.json with no
    // rubric_result (execute() threw) must surface as an `unverified` gate,
    // never get silently folded into "N pass".
    expectGate: { key: 'skills_clean', result: 'unverified' },
  },
  {
    name: 'quarantine_grader_fail',
    jobId: 'job-5c9a2d',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // Regression: a `completed` job whose grader_verdict.json recorded
    // rubric_result=fail must never report clean PROMOTE — the report
    // decides from evidence, not the narrative final_status (SKILL.md hard
    // rule 8, FR-6, FR-10).
    expectGate: { key: 'grader_verdict', result: 'fail' },
  },
  {
    name: 'quarantine_drift_block',
    jobId: 'job-8e1f4a',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // Regression: a `completed` job whose verify phase_output.json recorded
    // drift_verdict=BLOCK must never report clean PROMOTE.
    expectGate: { key: 'drift_verdict', result: 'fail' },
  },
  {
    name: 'quarantine_advocate_dissent',
    jobId: 'job-3f2b8c',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // Regression (AC-4.2): a `completed` job with a recorded Advocate dissent in
    // consensus evidence must QUARANTINE — the report DERIVES the block from the
    // consensus evidence, NOT from run_manifest.failure_reason (which here is null).
    // Pre-fix this returned clean PROMOTE / exit 0 (consensus collected but never gated).
    expectGate: { key: 'consensus', result: 'fail' },
  },
  {
    name: 'quarantine_critic_fail',
    jobId: 'job-6d4a1e',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // Regression: a `completed` job whose latest test-gate Critic verdict is `fail`
    // must QUARANTINE via the consensus gate (the gate should never have passed).
    expectGate: { key: 'consensus', result: 'fail' },
  },
  {
    name: 'quarantine_trace_mismatch',
    jobId: 'job-9b2e14',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // SC-8/F-55 regression: skill_trace.json TRANSCRIBES the validator CLI's stdout, so
    // its rubric_result must equal its own output.rubric_result. This fixture is the
    // shape a live run actually wrote — wrapper "warn" over an output of "fail", with the
    // override rationale in `error` — to route around a validator fail it judged a false
    // positive. The validator's verdict is authoritative: the row scores `fail`,
    // skills_clean fails, and the job QUARANTINEs as an evidence-integrity breach rather
    // than promoting on a warn nothing could distinguish from an honest one.
    expectGate: { key: 'skills_clean', result: 'fail' },
    expectWarning: 'EVIDENCE INTEGRITY',
  },
  {
    name: 'quarantine_trace_mismatch_inverse',
    jobId: 'job-3e7c05',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // SC-8/F-58 regression: the mismatch pointing the OTHER way — wrapper "warn" over an
    // output of "pass". Substituting the validator's verdict makes the row CLEAN here, so
    // scoring alone let this promote at exit 0 with an evidence-integrity warning nobody
    // was gated on; the first cut of SC-8 shipped that hole because its only fixture was
    // the direction where substitution happened to fail the gate by itself. The
    // disagreement is the breach regardless of direction, so skills_clean fails on the
    // mismatch term and the job QUARANTINEs. Paired with quarantine_trace_mismatch, the
    // two fixtures cover both directions.
    expectGate: { key: 'skills_clean', result: 'fail' },
    expectWarning: 'EVIDENCE INTEGRITY',
  },
  {
    name: 'quarantine_trace_mismatch_case',
    jobId: 'job-5f1d73',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // SC-8/F-60 regression: wrapper "PASS" over an output of "pass". The verdicts AGREE
    // semantically, so comparing normalized values let this through at exit 0 — but every
    // validator prints lowercase, so a wrapper reading "PASS" was retyped rather than
    // transcribed, which is the thing the rule forbids. Comparison is now on the raw
    // strings; normalization still governs scoring only.
    expectGate: { key: 'skills_clean', result: 'fail' },
    expectWarning: 'EVIDENCE INTEGRITY',
  },
  {
    name: 'quarantine_trace_mismatch_superseded',
    jobId: 'job-8c4a19',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // SC-8/F-61 regression: the mismatch sits in a SUPERSEDED build/attempt_1 while every
    // latest attempt is clean, so collectSkillVerdicts (latest-only, by design) never saw
    // it and the job promoted at exit 10. SC-6/F-38 and SC-7/F-52 keep superseded FAILURES
    // out of the gate because a later attempt fixed them; that reasoning does not extend to
    // a forged verdict, which a rewind cannot un-write. Superseded mismatches now fail the
    // gate and are named in Warnings.
    expectGate: { key: 'skills_clean', result: 'fail' },
    expectWarning: 'SUPERSEDED attempt',
  },
  {
    name: 'promote_resolved_dissent',
    jobId: 'job-1b2c3d',
    decision: 'PROMOTE',
    warn_flag: true,
    exit_code: 10,
    // B1 (F-3, SC-2): a review-gate Advocate dissent the operator resolved as a
    // false positive (`resolution.action: "override"` on advocate.json) must NOT
    // quarantine — it promotes with a PERMANENT warning (a resolved dissent is never
    // silent). The consensus gate evaluates to `warn`, never `fail` or `pass`
    // (FR-7 / SC2_PLAN invariant #4).
    expectGate: { key: 'consensus', result: 'warn' },
  },
  {
    name: 'promote_repaired_dissent',
    jobId: 'job-7c3e91',
    decision: 'PROMOTE',
    warn_flag: true,
    exit_code: 10,
    // SC-6 (F-37/F-38): the operator judged a review-gate dissent CORRECT and rewound
    // to build to fix the deliverable (`resolution.action: "repair"`); build/test/review
    // re-ran and attempt_2 came back clean. Pre-fix this reported
    // `consensus: pass — "2 round(s) clean"` and a CLEAN promote at exit 0, because the
    // gate reads latest attempts only and the repaired dissent lived on a superseded
    // one — so the pipeline hid the resolution that CHANGED the shipped artifact while
    // still surfacing `override`, which changes nothing. A dissent recorded anywhere in
    // a job's evidence must never yield a clean promote (FR-7).
    expectGate: { key: 'consensus', result: 'warn' },
    expectWarning: 'review/attempt_1 (superseded)',
  },
  {
    name: 'promote_repaired_critic_fail',
    jobId: 'job-3d5f82',
    decision: 'PROMOTE',
    warn_flag: true,
    exit_code: 10,
    // SC-7 (F-46/F-52): the CRITIC's side of the fixture above. A Critic fail at the
    // review gate is now a rewind origin in its own right — the orchestrator reproduced
    // the finding, rewound to build (`cross_phase_rewinds.review`), and re-ran forward
    // to a clean attempt_2. That clean round is exactly what used to hide it:
    // `collectSupersededDissents` read only `advocate.json`, so a superseded Critic fail
    // was invisible and this job promoted CLEAN at exit 0. A live run did precisely
    // that, reporting `consensus: pass — "2 round(s) clean"` after two independent
    // Critics caught two real defects that changed the shipped artifact. F-38's rule
    // holds for both halves of consensus or it holds for neither.
    expectGate: { key: 'consensus', result: 'warn' },
    expectWarning: 'Critic fail in review/attempt_1 (superseded)',
  },
  {
    name: 'quarantine_upheld_dissent',
    jobId: 'job-4e5f6a',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // B1 (F-3, SC-2): a dissent the operator explicitly UPHELD
    // (`resolution.action: "uphold"`) behaves exactly as an unresolved dissent —
    // consensus gate `fail` → QUARANTINE. Only `override` clears the block.
    expectGate: { key: 'consensus', result: 'fail' },
  },
  {
    name: 'promote_delegated_push',
    jobId: 'job-de1e6a',
    decision: 'PROMOTE',
    warn_flag: false,
    exit_code: 0,
    // B2 (F-5, SC-2): a `pr`-mode push that failed on missing credentials was
    // operator-delegated — the ship attempt recorded delegation.status
    // "pending-operator" (gate `deferred`, no retry burned), then the orchestrator
    // closed the SAME attempt with delegation.status "completed" + pr_url and the gate
    // flipped to pass. A completed delegated push is a clean PROMOTE (exit 0) carrying
    // an informational warning; deferred-then-pass is ONE attempt (ship has a single
    // attempt_dir), so it must NOT trip the multi-attempt warning or consume a retry.
    expectWarning: 'operator-delegated',
  },
  {
    name: 'promote_retry_recovered',
    jobId: 'job-2a6d9f',
    decision: 'PROMOTE',
    warn_flag: false,
    exit_code: 0,
    // Regression: build attempt_1's skill trace failed, attempt_2 (the one
    // that actually shipped) passed. The terminal report must certify the
    // job's final recorded state, not permanently fail on a superseded
    // attempt — a successful retry must be able to reach clean PROMOTE.
    expectGate: { key: 'skills_clean', result: 'pass' },
    // B3 (F-8, SC-2): the multi-attempt warning now reports the gate outcome
    // ("passed on attempt N, earlier gate-failed"), not the false "required N
    // attempts before producing output" (build attempt_1 DID produce output; its
    // gate failed). build here: attempt_1 gate-failed (BUILD_GATE_FAILURE) → attempt_2 passed.
    expectWarning: 'Phase "build" passed on attempt 2 (attempt(s) 1..1 gate-failed',
  },
  {
    name: 'quarantine_missing_phase_evidence',
    jobId: 'job-0e5b73',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // Regression: an `attempt_n` DIRECTORY is not evidence. document/attempt_1 here
    // holds only a phase_log.md — the F-12 shape where a dispatch dies before writing
    // anything structured. `pipeline_completion` must not certify that as "produced an
    // attempt" (pre-fix it did, and the job reported clean PROMOTE / exit 0 with zero
    // warnings), and `phase_gates` has no recorded gate decision to read.
    expectGate: [
      { key: 'pipeline_completion', result: 'fail' },
      { key: 'phase_gates', result: 'unverified' },
    ],
  },
  {
    name: 'quarantine_skipped_phase',
    jobId: 'job-sk1p13',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // SC-13/F-78, the other half of the `retry` case: `review` has no attempt while
    // `document` — a LATER phase — does. That is a phase genuinely skipped, and it must
    // keep saying so. The same fixture pins both branches at once: review reads "no
    // attempt recorded" and the trailing ship/verify read "not reached", from one tree.
    // Without this the new wording would be free to swallow the skip it was never meant
    // to excuse.
    expectGate: { key: 'pipeline_completion', result: 'fail' },
    expectWarning:
      'Missing phase evidence: review (no attempt recorded), ' +
      'ship (not reached — job terminated at document), ' +
      'verify (not reached — job terminated at document)',
  },
  {
    // SC-17/F-90, and the first survivor this repo's ablation sweep turned into a kill.
    // `skills_clean` has three FAIL branches; the corpus reached two of them. Six fixtures
    // score `skills_clean: fail` and every one arrives via the SC-8/F-58 trace-mismatch
    // return or the SC-11 unreadable-evidence return, both of which sit ABOVE the plainest
    // rule in the gate — "a skill invocation failed, so the gate fails". Exactly one
    // fixture carried a `rubric_result: fail` row at all (quarantine_trace_mismatch), and
    // it also carries the mismatch, so it returns before reaching the branch it looks like
    // it covers. The rule was shadowed, not tested.
    //
    // This tree is promote_clean with plan-coherence's trace recording an HONEST fail:
    // wrapper and `output.rubric_result` agree, so no mismatch fires and nothing is
    // unreadable. It is the only fixture whose skills_clean verdict comes from the
    // failure count itself. Reverting `if (failures > 0)` flips it to PROMOTE / exit 0.
    name: 'quarantine_skill_fail',
    jobId: 'job-skf001',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    expectGate: { key: 'skills_clean', result: 'fail' },
    // Pin the REASON, not just the verdict: the two branches above this one also produce
    // skills_clean=fail, so a verdict-only assertion would pass on any of the three and
    // leave the shadowing exactly as it was.
    expectWarning: '1 skill invocation(s) failed',
  },
  {
    name: 'quarantine_phase_gate_fail',
    jobId: 'job-b41d8e',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // Regression (hard rule 8 / FR-10): a `completed` job whose latest document
    // attempt recorded `gate_result: "fail"` must QUARANTINE. Pre-fix the per-phase
    // gate decisions were rendered in the Phases table but never evaluated, so the
    // narrative final_status alone carried the job to clean PROMOTE / exit 0.
    expectGate: { key: 'phase_gates', result: 'fail' },
    expectWarning: 'recorded gate_result=fail on its latest attempt (DOCUMENT_GATE_FAILURE)',
  },

  // --- SC-11/A1 (F-69): evidence that EXISTS but cannot be read ---------------
  {
    name: 'quarantine_unreadable_manifest',
    jobId: 'job-unr001',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
    // A permission, not a content, is what this fixture tests, and git stores only the
    // exec bit — so the mode is applied by the runner and reverted in a finally. Skipped
    // as root, where mode 000 is still readable.
    //
    // The target is deliberately a file whose ABSENCE is tolerated. A first cut chmod'd
    // build/attempt_1/phase_manifest.json, and that fixture was VACUOUS: missing phase
    // evidence already fails pipeline_completion, so the job quarantined with the fix
    // fully reverted. Same defect class as the field record's "deleting the guard left
    // both fixtures green" — caught here only by hand-falsification, since guard-ablation
    // does not cover execution-report.js.
    chmod: { 'test/attempt_1/consensus/advocate.json': 0o000 },
    skipIfRoot: true,
  },
  {
    name: 'quarantine_malformed_output',
    jobId: 'job-mal001',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
  },
  {
    // The TOLERANCE pin. A1's obvious over-correction is to turn every missing file into
    // a quarantine; this job is missing an optional subtree entirely and must still
    // promote. Absence routes through unverified -> warn (exit 10); only evidence that
    // exists and cannot be read routes to QUARANTINE (exit 2).
    name: 'promote_absent_optional',
    jobId: 'job-abs001',
    decision: 'PROMOTE',
    warn_flag: true,
    exit_code: 10,
  },
];

module.exports = { CASES };
