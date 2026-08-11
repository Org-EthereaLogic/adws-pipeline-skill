#!/usr/bin/env node
/*
 * adws-run.js — SPIKE controller (§6.2). THROWAWAY quality.
 *
 * STEP 1 (shipped, PR #60): sequencing, a single-sourced gate, evidence generation, and a
 * terminal report the UNMODIFIED adws-pipeline/scripts/execution-report.js scores.
 * STEP 2 (this file): RETRIES AND REWINDS — the budget-as-code question (plan Q3) and
 * idempotency (Q4).
 *
 * The model (not this script) does the LLM dispatches; here they are MOCKED via
 * `record --from <dir>`, standing in for a real subagent's output files.
 *
 * ---------------------------------------------------------------------------
 * WHAT STEP 2 ADDS, and the one thing it costs.
 *
 * Step 1 could keep a promise step 2 cannot: EVERY gate decision came from the scorer's own
 * evaluators, so there was no hand-rolled gate logic to diverge (the defect the second
 * adversarial round found and the third round closed). A retry or a rewind is triggered by
 * something `execution-report.js` DOES NOT READ:
 *
 *   - it has no gate over `test/attempt_n/phase_output.json.checks[]`, so a run whose checks
 *     all failed scores exactly like one whose checks all passed;
 *   - it never sees `classification`, which is the field that decides whether a failure
 *     routes to `build` (code), to a check-defect repair (check), or to the operator
 *     (environment/prerequisite).
 *
 * So the controller now owns a gate the scorer is SILENT on. The mitigation is not to trust
 * that silence:
 *   1. The scorer stays authoritative wherever it speaks. `phaseGate()` asks it FIRST and a
 *      scorer `fail` is final — the step-2 evaluation can only ADD failures, never clear one.
 *   2. The added evaluation is keyed to the contract's own declared `policy.test_policy`,
 *      not to the shape of the evidence in front of it. A tolerant reader that relaxes when
 *      the evidence looks thin is how the golden fixtures came to violate the writer floor
 *      66 times without anything noticing.
 *   3. `test_gate_scope` is reported on every `next`/`record`, so a REDUCED gate is loud on
 *      the handshake channel instead of being inferable only by reading this file.
 *
 * The budget model implemented here is `references/phase-gates.md` "Rewind budget accounting
 * (SC-7/F-47)": the gate-automatic rewind to build and the check-defect repair are each
 * capped at 1 and consume NO ordinary build retry, which is why `retriesUsed()` counts
 * attempt ORIGINS rather than attempt directories. F-47 exists because a live run took three
 * build attempts against a budget of 1 with no accounting; `run-step2.sh` reproduces exactly
 * that tree and asserts the accounting holds.
 *
 * Attempt-level route annotations (`TEST_REWIND_TO_BUILD`, `CHECK_DEFECT_REPAIR`,
 * `ENVIRONMENT_GAP`, `REWIND_BUDGET_EXHAUSTED`) follow the precedent of the documented
 * `CRITIC_FAIL_REPAIRED` / `ADVOCATE_DISSENT_REPAIRED` annotations: they live on the ATTEMPT
 * manifest, they are how `next` reads the route back off the tree, and they NEVER reach
 * `run_manifest.failure_reason`, the terminal classes, or `decideLifecycle`. `finalize`
 * maps them to the documented terminal vocabulary and asserts the leak cannot happen.
 *
 * ---------------------------------------------------------------------------
 * Retained from step 1:
 *   - Sequencing is ENFORCED by one oracle, `expectedNext()`, backing `next` and `record`.
 *   - Tier selection is likewise one oracle, `tierFor()`, so what `next` advertises at
 *     dispatch is what `record` writes and what provenance records.
 *   - `record` REJECTS a phase that wrote no readable `phase_output.json` before it writes
 *     `gate_result: pass` (FIX 1), `finalize` derives readiness from the scorer's full
 *     terminal gate set and RETRACTS a completion claim the scorer contradicts (FIX 2), and
 *     the evidence is reconciled with the real writer contracts (FIX 3).
 *
 * Verbs:
 *   init   <contract.json> <evidenceRoot>            -> creates job dir + run_manifest, prints jobId
 *   next   <jobDir>                                   -> emits the next ACTION as JSON; stamps dispatch
 *   record <jobDir> <phase> <attempt> --from <dir>    -> ingests mock output, gates, writes phase_manifest
 *            [--started-at <utc>] [--completed-at <utc>]
 *   finalize <jobDir> [--report <execution-report.js>]-> sets terminal status, runs the scorer CLI
 *   audit  <jobDir>                                    -> read-only single-source gate audit
 *
 * Dependency-light: fs, path, child_process, plus a require() of the UNMODIFIED scorer
 * (its main() is require.main-guarded, so requiring it runs no CLI).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCORER_PATH = path.resolve(__dirname, '../../adws-pipeline/scripts/execution-report.js');
// Single-source of gate truth wherever the scorer speaks. buildReport() is read-only (only
// generateExecutionReport() writes files), so calling it mid-run mutates nothing.
const scorer = require(SCORER_PATH);

// The one validator this controller RUNS. `references/validator-inputs.md` lines 75-81:
// "criteria-to-checks is the one validator that runs BEFORE its phase agent … run it at
// test-phase entry, confirm check_specs.length == criteria_count, hand the specs to
// adws-tester in its dispatch, and write its skill_trace.json at that point." Every other
// validator runs after its phase agent and is still fixture-supplied in this spike.
const CRITERIA_TO_CHECKS = path.resolve(__dirname, '../../adws-pipeline/scripts/validators/criteria-to-checks.js');
const CRITERIA_SKILL_DIR = 'criteria-to-checks';

const PHASES = ['plan', 'build', 'test', 'review', 'document', 'ship', 'verify'];

// references/phase-gates.md per-phase table. "the budget counts retries beyond the first
// attempt (budget 1 = at most 2 attempts; test's budget 2 = at most 3 attempts)."
const RETRY_BUDGET = { plan: 1, build: 1, test: 2, review: 1, document: 1, ship: 1, verify: 1 };

// FR-12 escalation ladder, ascending capability. Escalating off the top is SATURATION: the
// tier is unchanged, the retry is consumed as usual, and the source records the no-op so a
// real escalation stays distinguishable from one that did nothing.
const LADDER = ['haiku', 'sonnet', 'opus', 'fable'];

// Rewind budget accounting (SC-7/F-47). Each capped at 1; neither consumes a build retry.
const REWIND_CAP = { test: 1 };      // run_manifest.cross_phase_rewinds.test
const CHECK_REPAIR_CAP = 1;          // run_manifest.check_defect_repairs

// A loop bound, not a rule. Every real budget above already terminates the job; this exists
// so that a bug in the accounting fails LOUDLY instead of spinning. run-step2.sh asserts it
// is never the thing that stopped a run.
const MAX_ATTEMPTS_PER_PHASE = 6;

// ATTEMPT-level failure_reason annotations. These are how `next` reads a routing decision
// back off the tree. None is a terminal reason; `finalize` maps them (see TERMINAL_OF).
const ROUTE_REWIND = 'TEST_REWIND_TO_BUILD';
const ROUTE_REPAIR = 'CHECK_DEFECT_REPAIR';
const ROUTE_GAP = 'ENVIRONMENT_GAP';
const ROUTE_SPENT = 'REWIND_BUDGET_EXHAUSTED';
const ATTEMPT_ANNOTATIONS = new Set([ROUTE_REWIND, ROUTE_REPAIR, ROUTE_GAP, ROUTE_SPENT]);

// Risk -> per-phase tier table (references/phase-gates.md FR-12 "Risk -> tier table").
const TIER_TABLE = {
  low:    { plan: 'opus', build: 'sonnet', test: 'sonnet', review: 'sonnet', document: 'haiku',  ship: 'sonnet', verify: 'sonnet' },
  medium: { plan: 'opus', build: 'sonnet', test: 'sonnet', review: 'opus',   document: 'haiku',  ship: 'sonnet', verify: 'sonnet' },
  high:   { plan: 'opus', build: 'opus',   test: 'opus',   review: 'opus',   document: 'sonnet', ship: 'sonnet', verify: 'sonnet' },
};

// references/artifact-layout.md:147 shows the WRITER contract as `"agent": "adws-…"`.
// The golden fixture writes the bare role (`"planner"`), so the reference tree and the
// writer contract disagree; the scorer reads neither, so nothing caught it.
const AGENT_OF = {
  plan: 'adws-planner', build: 'adws-builder', test: 'adws-tester', review: 'adws-reviewer',
  document: 'adws-documenter', ship: 'adws-shipper', verify: 'adws-verifier',
};

// FR-12: plan/build/test/review are keyed to the CONTRACT risk; document/ship/verify to the
// risk `review-risk-assess` recomputed from the actual change set.
const RECOMPUTED_TIER_PHASES = new Set(['document', 'ship', 'verify']);
const RISK_LEVELS = new Set(['low', 'medium', 'high']);

// The tester's own attribution of a failing check (artifact-layout.md test phase_output).
// The orchestrator ROUTES on it; it never overrides it.
const CLASS_CODE = 'code';
const CLASS_CHECK = 'check';
const CLASS_ENV = new Set(['environment', 'prerequisite']);

// SC-11/A3 (artifact-layout.md F-17 disposition; parity/provenance-fixtures/run-tests.js).
// The obtainable half is MANDATORY and non-null; the structurally-unavailable half is
// present and null so a reader can tell "not captured" from "field dropped".
function provenanceFor({ startedAt, completedAt, wallClockS, agent, tierRequested }) {
  return {
    started_at: startedAt,
    completed_at: completedAt,
    wall_clock_s: wallClockS,
    agent,
    model_tier_requested: tierRequested,
    model_id: null, cost_usd: null, tokens_in: null, tokens_out: null, tool_call_count: null,
    elapsed_ms: null, timeout: null, cancel: null,
  };
}

function nowUtc() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); } // real wall-clock, second precision
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_e) { return null; } }
function writeJson(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
function exists(p) { return fs.existsSync(p); }
function attemptDir(jobDir, phase, attempt) { return path.join(jobDir, phase, `attempt_${attempt}`); }
function fail(msg, code) { process.stderr.write(msg + '\n'); process.exit(code || 65); }
const UTC_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// Synchronous sleep with no dependencies. See waitForWholeSecond().
function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// The provenance contract requires `wall_clock_s > 0` AND exact agreement with two
// SECOND-PRECISION stamps (parity/provenance-fixtures/run-tests.js:55,105). A MOCKED
// dispatch returns in microseconds, so the honest options are to fabricate a duration or
// to let one really elapse. This blocks until a whole second has genuinely passed since
// the dispatch stamp. A real dispatch never reaches the sleep.
function waitForWholeSecond(startedAt) {
  const startMs = Date.parse(startedAt);
  for (;;) {
    const now = nowUtc();
    if ((Date.parse(now) - startMs) / 1000 >= 1) return now;
    sleepSync(Math.max(50, 1000 - (Date.now() - startMs)));
  }
}

// --- attempt topology --------------------------------------------------------
//
// Everything the state machine needs is derived from the tree. Nothing about "where we are"
// is cached in run_manifest: a resumed or hand-edited tree must produce the same answer as
// one this process wrote, and a cached cursor is the first thing to disagree with reality.

function listAttempts(jobDir, phase) {
  let entries;
  try { entries = fs.readdirSync(path.join(jobDir, phase), { withFileTypes: true }); } catch (_e) { return []; }
  return entries
    .filter((e) => e.isDirectory() && /^attempt_\d+$/.test(e.name))
    .map((e) => Number(e.name.slice('attempt_'.length)))
    .sort((a, b) => a - b);
}
function latestAttempt(jobDir, phase) {
  const a = listAttempts(jobDir, phase);
  return a.length ? a[a.length - 1] : 0;
}
function manifestOf(jobDir, phase, attempt) {
  return readJsonSafe(path.join(attemptDir(jobDir, phase, attempt), 'phase_manifest.json'));
}
function correctionsOf(jobDir, attempt) {
  return readJsonSafe(path.join(attemptDir(jobDir, 'build', attempt), 'corrections.json'));
}
function phaseOutputOf(jobDir, phase, attempt) {
  return readJsonSafe(path.join(attemptDir(jobDir, phase, attempt), 'phase_output.json'));
}

// The build attempt a rewind opened FROM `{phase}/attempt_{n}`, or null. corrections.json is
// written once into the fresh build attempt and never edited, so its `source_attempt` is a
// permanent, self-describing record of which failure sent the job back.
function rewindTargetFor(jobDir, phase, attempt) {
  for (const m of listAttempts(jobDir, 'build')) {
    const c = correctionsOf(jobDir, m);
    if (c && c.source_attempt === `${phase}/attempt_${attempt}`) return m;
  }
  return null;
}

// Why this attempt exists. The budget accounting turns on this and nothing else.
//   initial  the phase's first attempt
//   rewind   a build attempt opened by a gate-automatic rewind or a check-defect repair
//            (it carries the corrections.json the orchestrator authored as its input)
//   forward  a re-run of a phase whose previous attempt sent the job back to build.
//            phase-gates.md: "The forward re-run after a rewind is NOT a retry."
//   retry    rule 4 — a fresh attempt of the same phase after its own gate failed
function attemptOrigin(jobDir, phase, attempt) {
  if (attempt <= 1) return 'initial';
  if (phase === 'build' && correctionsOf(jobDir, attempt)) return 'rewind';
  const prior = listAttempts(jobDir, phase).filter((n) => n < attempt);
  const prev = prior.length ? prior[prior.length - 1] : null;
  if (prev !== null && rewindTargetFor(jobDir, phase, prev) !== null) return 'forward';
  return 'retry';
}

// Only 'retry' attempts draw on the budget. This is the whole of F-47's answer, in code:
// counting DIRECTORIES is what let a live run take three build attempts against a budget of
// 1 without anything noticing, because two of the three were rewind destinations.
function retriesUsed(jobDir, phase) {
  return listAttempts(jobDir, phase).filter((n) => attemptOrigin(jobDir, phase, n) === 'retry').length;
}

function escalateFrom(tier) {
  const i = LADDER.indexOf(tier);
  if (i < 0) return { tier: LADDER[1], saturated: false }; // unknown tier -> the sonnet default
  if (i === LADDER.length - 1) return { tier, saturated: true };
  return { tier: LADDER[i + 1], saturated: false };
}

// deterministic jobId: job_YYYYMMDD_NNNN (underscore — references/artifact-layout.md line 19)
function allocJobId(evidenceRoot) {
  const stamp = nowUtc().slice(0, 10).replace(/-/g, '');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  let n = 1;
  while (exists(path.join(evidenceRoot, `job_${stamp}_${String(n).padStart(4, '0')}`))) n++;
  return `job_${stamp}_${String(n).padStart(4, '0')}`;
}

// Controller scratch, NOT evidence: the dispatch stamp `next` takes when it hands a phase
// off, which `record` turns into provenance.started_at. SKILL.md:192 requires that stamp to
// come from a live clock AT DISPATCH, which is a fact only the dispatcher holds.
//
// STEP 2 / Q4: the marker is WRITE-ONCE per (phase, attempt). Step 1 re-stamped it on every
// call, so two `next` calls on an unchanged tree returned two different `started_at` values —
// no double-advance, but not idempotent either, and the plan calls Q4 critical because the
// model may call `next` twice. Keeping the first stamp costs the idle time between the two
// calls; re-stamping costs idempotency. The success criterion decides it.
function dispatchMarkerPath(jobDir) { return path.join(jobDir, '.dispatch.json'); }
function stampDispatch(jobDir, phase, attempt) {
  const p = dispatchMarkerPath(jobDir);
  const m = readJsonSafe(p);
  if (m && m.phase === phase && m.attempt === attempt && UTC_STAMP.test(m.started_at || '')) return m.started_at;
  const startedAt = nowUtc();
  writeJson(p, { phase, attempt, started_at: startedAt });
  return startedAt;
}

// --- the contract ------------------------------------------------------------

function contractOf(jobDir) { return readJsonSafe(path.join(jobDir, 'task_contract_snapshot.json')) || {}; }
function acceptanceCriteria(contract) {
  return (contract.task && Array.isArray(contract.task.acceptance_criteria)) ? contract.task.acceptance_criteria : [];
}
// task-contract.md marks `policy.test_policy` REQUIRED (`required | best-effort | skip`).
// A contract that declares none is not a valid contract, and the controller will not invent
// a policy for it — it reports a REDUCED test gate rather than silently applying either the
// strict or the lax reading.
function testPolicyOf(contract) {
  const v = contract.policy && contract.policy.test_policy;
  return ['required', 'best-effort', 'skip'].includes(v) ? v : null;
}
function testGateScope(contract) { return testPolicyOf(contract) === 'required' ? 'full' : 'reduced'; }
function contractWarnings(contract) {
  const w = [];
  if (!testPolicyOf(contract)) w.push('policy.test_policy is absent or not one of required|best-effort|skip (task-contract.md marks it REQUIRED) — the test gate runs in REDUCED scope: no SC-5/F-31 coverage join, no falsifiability, no classification routing');
  if (acceptanceCriteria(contract).length === 0) w.push('task.acceptance_criteria is empty (task-contract.md requires >= 1) — criteria-to-checks would fail');
  return w;
}

// --- criteria-to-checks (F-45: the one validator that runs BEFORE its agent) --

function runCriteriaToChecks(contract) {
  const res = spawnSync('node', [CRITERIA_TO_CHECKS, '-'], {
    input: JSON.stringify({ acceptance_criteria: acceptanceCriteria(contract) }),
    encoding: 'utf8',
  });
  if (res.status !== 0) return { error: `criteria-to-checks exited ${res.status}: ${(res.stderr || '').trim()}` };
  try { return { output: JSON.parse(res.stdout) }; } catch (e) { return { error: `criteria-to-checks stdout was not JSON: ${e.message}` }; }
}

function criteriaTracePath(jobDir, attempt) {
  return path.join(attemptDir(jobDir, 'test', attempt), 'skills', CRITERIA_SKILL_DIR, 'skill_trace.json');
}

// Written at TEST-PHASE ENTRY, before the tester is dispatched, so the specs exist to be
// handed to it (F-45). Idempotent: an existing trace is returned untouched — the validator is
// a pure function of the frozen criteria, so a second `next` would only rewrite identical
// bytes, and rewriting recorded evidence is exactly what mk-risk-trace.js was fixed not to do.
function ensureCriteriaTrace(jobDir, attempt, contract) {
  const dest = criteriaTracePath(jobDir, attempt);
  const existing = readJsonSafe(dest);
  if (existing && existing.output) return existing.output;
  const startedAt = nowUtc();
  const { output, error } = runCriteriaToChecks(contract);
  if (error) fail(`test entry: ${error}`);
  // F-45/SC-5 F-27: "confirm check_specs.length == criteria_count … a disagreement is a
  // defect, never an expected narrowing."
  const specs = Array.isArray(output.check_specs) ? output.check_specs : [];
  if (specs.length !== output.criteria_count) {
    fail(`test entry: criteria-to-checks emitted ${specs.length} check_specs for ${output.criteria_count} criteria (SC-5/F-27: a disagreement is a defect)`);
  }
  writeJson(dest, {
    skill_id: 'criteria.to_checks', // the validator's own manifest id
    version: '2.0.0',
    started_at: startedAt,
    completed_at: nowUtc(),
    rubric_result: output.rubric_result, // TRANSCRIBED, never retyped (SC-8/F-55)
    latency_ms: 0,
    error: null,
    output,
  });
  return output;
}

// --- the gate ---------------------------------------------------------------
//
// Two layers, in this order and never the other way round:
//   (1) the SCORER's own evaluators over the tree so far — authoritative, and a `fail` here
//       is final. Step 1's whole argument.
//   (2) the per-phase exit criteria the scorer does not evaluate. These can only ADD a
//       failure. Nothing in layer 2 can clear a layer-1 fail.
const OWN_SEQUENCING_GATES = new Set(['pipeline_completion', 'phase_gates']);

function scorerGate(jobDir) {
  let report;
  try {
    report = scorer.buildReport(jobDir).report;
  } catch (e) {
    // e.g. an unreadable run_manifest — the scorer would exit 3; fail the gate closed.
    return { gate: 'fail', reason: `scorer could not read evidence: ${e.message}` };
  }
  // (a) completeness of the phases reached so far. `pipeline_completion` counts the phases
  // whose LATEST attempt produced BOTH a readable phase_manifest.json and a readable
  // phase_output.json, and reports it as "N/7" at the head of `detail`. The comparison is
  // against the number of phases that have ANY attempt directory, so a tree that arrived
  // with evidence this controller did not write fails closed.
  const present = PHASES.filter((p) => listAttempts(jobDir, p).length > 0).length;
  const pc = report.gates.find((g) => g.gate === 'pipeline_completion');
  if (!pc) return { gate: 'fail', reason: 'scorer reported no pipeline_completion gate' };
  const counted = /^(\d+)\/(\d+)\b/.exec(pc.detail || '');
  if (!counted) return { gate: 'fail', reason: `could not read the completeness count from "${pc.detail}"` };
  if (Number(counted[1]) < present) return { gate: 'fail', reason: `pipeline_completion: ${pc.detail}` };
  // (b) raw-evidence gates: skills_clean, consensus, grader_verdict, drift_verdict,
  // verify_structural. `phase_gates` is excluded because it reads the gate_result we are
  // about to write (circular).
  const failing = report.gates.filter((g) => !OWN_SEQUENCING_GATES.has(g.gate)).find((g) => g.result === 'fail');
  return failing
    ? { gate: 'fail', reason: `${failing.gate}: ${failing.detail || 'fail'}` }
    : { gate: 'pass', reason: null };
}

const PASS = { gate: 'pass', annotation: null, detail: null, route: null, failing: [] };
function gateFail(annotation, detail, route, failing) {
  return { gate: 'fail', annotation, detail, route: route || 'retry', failing: failing || [] };
}
function terminalReasonFor(phase) { return `${phase.toUpperCase()}_GATE_FAILURE`; }

// SC-13/F-76. Every `code` correction this job has written owes a permanent regression check.
// Returns [{ id, criterion, source_attempt, build_attempt }].
function regressionDebt(jobDir) {
  const owed = [];
  for (const m of listAttempts(jobDir, 'build')) {
    const c = correctionsOf(jobDir, m);
    if (!c || !Array.isArray(c.corrections)) continue;
    for (const e of c.corrections) {
      if (e && e.classification === CLASS_CODE && e.regression_check_id) {
        owed.push({ id: e.regression_check_id, criterion: e.criterion, source_attempt: c.source_attempt, build_attempt: m });
      }
    }
  }
  return owed;
}

// BUILD, layer 2. SC-13/F-76 step 2: an attempt that followed a `code` rewind must echo each
// `regression_check_id` in `phase_output.regression_check_ids` — the builder's declaration
// that it added the permanent check the repair owes. Without this the rewind repairs the
// defect and leaves nothing behind to catch it again, which is the exact failure F-76 was
// written from (ten repairs across two jobs, zero permanent checks, the eleventh defect being
// the ninth's class resurfacing through the ninth's own fix).
function buildLayer2(jobDir, attempt) {
  const c = correctionsOf(jobDir, attempt);
  if (!c || !Array.isArray(c.corrections)) return PASS;
  const need = c.corrections.filter((e) => e && e.classification === CLASS_CODE && e.regression_check_id).map((e) => e.regression_check_id);
  if (need.length === 0) return PASS;
  const out = phaseOutputOf(jobDir, 'build', attempt) || {};
  const echoed = Array.isArray(out.regression_check_ids) ? out.regression_check_ids : [];
  const missing = need.filter((id) => !echoed.includes(id));
  if (missing.length) {
    return gateFail(terminalReasonFor('build'),
      `SC-13/F-76: build/attempt_${attempt} followed a code rewind from ${c.source_attempt} but phase_output.regression_check_ids does not echo ${missing.join(', ')} (echoed: ${echoed.length ? echoed.join(', ') : 'nothing'})`);
  }
  return PASS;
}

// TEST, layer 2 — the exit criterion `execution-report.js` has no gate for.
//
// SCOPE. Everything here is keyed to `policy.test_policy: required`, the same switch
// phase-gates.md uses to make falsifiability always-on. A contract that declares no
// test_policy gets layer 1 only, and `test_gate_scope: "reduced"` is reported on every
// handshake message so that is never a silent difference.
function testLayer2(jobDir, attempt, contract) {
  if (testGateScope(contract) !== 'full') return PASS;

  const trace = readJsonSafe(criteriaTracePath(jobDir, attempt));
  if (!trace || !trace.output || !Array.isArray(trace.output.check_specs)) {
    return gateFail(terminalReasonFor('test'),
      `no criteria-to-checks skill_trace recorded in test/attempt_${attempt} — F-45 requires it at phase entry, before the tester is dispatched`);
  }
  const specs = trace.output.check_specs;
  const out = phaseOutputOf(jobDir, 'test', attempt) || {};
  const checks = Array.isArray(out.checks) ? out.checks.filter((c) => c && typeof c === 'object') : [];

  // SC-5/F-31 coverage, BY ID. "Full emission (F-27) guarantees the criterion reaches the
  // tester; the id join is what proves it was answered." An output with no `checks` array at
  // all lands here as 0/N answered — a decision, not an inability to decide.
  const covered = new Set(checks.map((c) => c.check_id));
  const missing = specs.filter((s) => !covered.has(s.check_id)).map((s) => s.check_id);
  if (missing.length) {
    return gateFail(terminalReasonFor('test'),
      `SC-5/F-31 coverage: ${specs.length - missing.length}/${specs.length} emitted check ids answered in phase_output.checks; missing ${missing.join(', ')}`);
  }

  // SC-13/F-76 step 3, the tester's half. Every id a `code` correction owes must appear on a
  // row of THIS attempt that is not simply the row the previous attempt already had. The
  // SC-5/F-31 join above does NOT establish this and the doc says so explicitly: it asks
  // whether SOME check answered each criterion, and one criterion may carry several checks,
  // so an older row satisfies it while the new regression assertion never ran.
  const debt = regressionDebt(jobDir);
  if (debt.length) {
    const priorRows = new Set();
    for (const n of listAttempts(jobDir, 'test').filter((n) => n < attempt)) {
      for (const c of (phaseOutputOf(jobDir, 'test', n) || {}).checks || []) priorRows.add(JSON.stringify(c));
    }
    for (const owed of debt) {
      const rows = checks.filter((c) => c.check_id === owed.id);
      if (!rows.length) {
        return gateFail(terminalReasonFor('test'),
          `SC-13/F-76: the repair of ${owed.source_attempt} owes a regression check carrying id ${owed.id}; test/attempt_${attempt} has no check row with that id`);
      }
      if (!rows.some((c) => !priorRows.has(JSON.stringify(c)))) {
        return gateFail(terminalReasonFor('test'),
          `SC-13/F-76: every check row carrying ${owed.id} in test/attempt_${attempt} is identical to one a superseded attempt already recorded — a pre-existing row for the criterion is not the new regression assertion`);
      }
    }
    // "A criterion repaired in THIS job that comes back gate_weak fails the gate rather than
    // warning — gate_weak means unverified, and unverified is not an acceptable answer for
    // the defect the job just stopped to fix."
    const repaired = new Set(debt.map((d) => d.criterion));
    const weakRepaired = checks.filter((c) => c.verdict === 'gate_weak' && (repaired.has(c.criterion) || debt.some((d) => d.id === c.check_id)));
    if (weakRepaired.length) {
      return gateFail(terminalReasonFor('test'),
        `SC-13/F-76: ${weakRepaired.map((c) => c.check_id).join(', ')} came back gate_weak on a criterion this job repaired — unverified is not an answer for the defect the job stopped to fix`);
    }
  }

  // Failing checks, and the ROUTE their classification selects.
  const failing = checks.filter((c) => c.pass === false || c.verdict === 'fail');
  if (!failing.length) return PASS;

  const classes = new Set(failing.map((c) => c.classification));
  // PRECEDENCE code > check > environment. This is a DECISION, not a derivation: the docs
  // define each route but never say which wins when one attempt carries several. `code` wins
  // because it is the only class the pipeline can act on by itself, and nothing is lost — an
  // environment gap is not repaired by a build, so it re-surfaces on the forward re-run and
  // routes to the operator then, with the code defect already fixed.
  if (classes.has(CLASS_CODE)) {
    const rows = failing.filter((c) => c.classification === CLASS_CODE);
    const spent = (readJsonSafe(path.join(jobDir, 'run_manifest.json')) || {}).cross_phase_rewinds || {};
    if ((spent.test || 0) >= REWIND_CAP.test) {
      // "At most ONE test rewind per job … a second such failure terminates with
      // TEST_GATE_FAILURE." Terminal regardless of any remaining test retry budget.
      return gateFail(ROUTE_SPENT,
        `a second code-classified test failure (${rows.map((c) => c.check_id).join(', ')}) with cross_phase_rewinds.test already at ${spent.test || 0}/${REWIND_CAP.test}`,
        'terminal', rows);
    }
    return gateFail(ROUTE_REWIND, `checks ${rows.map((c) => c.check_id).join(', ')} failed and the tester classified them "code"`, 'rewind', rows);
  }
  if (classes.has(CLASS_CHECK)) {
    const rows = failing.filter((c) => c.classification === CLASS_CHECK);
    const spent = (readJsonSafe(path.join(jobDir, 'run_manifest.json')) || {}).check_defect_repairs || 0;
    if (spent >= CHECK_REPAIR_CAP) {
      return gateFail(ROUTE_SPENT,
        `a second check-classified test failure (${rows.map((c) => c.check_id).join(', ')}) with check_defect_repairs already at ${spent}/${CHECK_REPAIR_CAP}`,
        'terminal', rows);
    }
    return gateFail(ROUTE_REPAIR, `checks ${rows.map((c) => c.check_id).join(', ')} failed and the tester classified them "check" (SC-3 A4)`, 'repair', rows);
  }
  if ([...classes].some((c) => CLASS_ENV.has(c))) {
    const rows = failing.filter((c) => CLASS_ENV.has(c.classification));
    // "This is a GAP, not an auto-retry … it consumes no rewind or check-defect budget; it
    // never silently passes." So it neither retries nor rewinds: it stops and asks.
    return gateFail(ROUTE_GAP,
      `checks ${rows.map((c) => c.check_id).join(', ')} failed on ${[...new Set(rows.map((c) => c.classification))].join('/')} — the criterion is UNVERIFIED and routes to the operator, consuming no budget`,
      'operator', rows);
  }
  return gateFail(terminalReasonFor('test'),
    `checks ${failing.map((c) => c.check_id).join(', ')} failed with no usable classification (${[...classes].map((c) => JSON.stringify(c)).join(', ')}) — nothing to route on, so the ordinary retry path applies`);
}

function phaseGate(jobDir, phase, attempt, contract) {
  const s = scorerGate(jobDir);
  if (s.gate === 'fail') return gateFail(terminalReasonFor(phase), s.reason);
  if (phase === 'build') return buildLayer2(jobDir, attempt);
  if (phase === 'test') return testLayer2(jobDir, attempt, contract);
  return PASS;
}

// --- Tier sourcing (FR-12) ---------------------------------------------------

// The risk `review-risk-assess` recomputed from the actual change set, read from the review
// attempt's own recorded validator trace. Returns null when review recorded no such trace —
// the controller refuses to invent one.
function recomputedRisk(jobDir) {
  const n = latestAttempt(jobDir, 'review');
  if (!n) return null;
  const skillsDir = path.join(attemptDir(jobDir, 'review', n), 'skills');
  let entries;
  try { entries = fs.readdirSync(skillsDir, { withFileTypes: true }); } catch (_e) { return null; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const trace = readJsonSafe(path.join(skillsDir, e.name, 'skill_trace.json'));
    if (!trace) continue;
    const isRiskAssess = trace.skill_id === 'review.risk_assess' || /^review[-.]risk[-_]assess$/.test(e.name);
    const risk = trace.output && trace.output.risk_level;
    if (isRiskAssess && RISK_LEVELS.has(risk)) return risk;
  }
  return null;
}

// The ORDINARY (non-escalated) tier and its FR-12 source.
function ordinaryTier(jobDir, phase, run) {
  if (!RECOMPUTED_TIER_PHASES.has(phase)) {
    const risk = RISK_LEVELS.has(run.risk_level) ? run.risk_level : 'medium';
    return { tier_input: { source: 'contract.risk_level', value: risk }, model_tier: TIER_TABLE[risk][phase] };
  }
  const risk = recomputedRisk(jobDir);
  if (!risk) {
    fail(
      `record refused: FR-12 keys the ${phase} tier to the risk_level recomputed by ` +
      'review-risk-assess, and the review attempt recorded no review-risk-assess skill_trace ' +
      'carrying one. The controller will not substitute contract risk and mislabel its source.'
    );
  }
  return { tier_input: { source: 'review-risk-assess', value: risk }, model_tier: TIER_TABLE[risk][phase] };
}

// THE tier oracle. `next` advertises what this returns; `record` writes it; provenance
// records it as model_tier_requested. One function so the three cannot disagree.
function tierFor(jobDir, phase, attempt, run) {
  const origin = attemptOrigin(jobDir, phase, attempt);
  const prior = listAttempts(jobDir, phase).filter((n) => n < attempt);
  const prevTier = prior.length ? (manifestOf(jobDir, phase, prior[prior.length - 1]) || {}).model_tier : null;
  const base = prevTier || ordinaryTier(jobDir, phase, run).model_tier;

  if (origin === 'rewind') {
    // SC-7/F-48. "A rewind's destination build attempt escalates one tier on the same ladder,
    // recording tier_input: { source: cross-phase-rewind, value: <origin attempt> }" — the
    // rationale being F-6's and F-37's: the previous tier produced work an executed check
    // faulted, so the fix attempt is worth more capability.
    const c = correctionsOf(jobDir, attempt) || {};
    const { tier, saturated } = escalateFrom(base);
    return {
      model_tier: tier,
      tier_input: { source: saturated ? 'cross-phase-rewind-saturated' : 'cross-phase-rewind', value: c.source_attempt || '' },
    };
  }
  if (origin === 'retry') {
    // Rule 4 — "a new attempt of the same phase, escalating the phase agent's model one
    // tier". `value` records the resulting tier, following the only worked example in the
    // corpus (parity/execution-report-fixtures/retry, which escalates sonnet -> opus -> fable).
    const { tier, saturated } = escalateFrom(base);
    return { model_tier: tier, tier_input: { source: saturated ? 'retry-escalation-saturated' : 'retry-escalation', value: tier } };
  }
  // initial | forward. "The forward re-run after a rewind is NOT a retry. Each downstream
  // phase opens an ordinary fresh attempt at the TABLE tier … recording the ordinary
  // contract.risk_level / review-risk-assess source — not retry-escalation."
  return ordinaryTier(jobDir, phase, run);
}

// --- init --------------------------------------------------------------------

function cmdInit(contractPath, evidenceRoot) {
  const contract = readJson(contractPath);
  const risk = (contract.risk && contract.risk.risk_level) || 'medium';
  const tiers = TIER_TABLE[risk] || TIER_TABLE.medium;
  const jobId = allocJobId(evidenceRoot);
  const jobDir = path.join(evidenceRoot, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  writeJson(path.join(jobDir, 'task_contract_snapshot.json'), contract);
  // run_manifest floor — references/artifact-layout.md lines 51-58. final_status is null
  // while running (line 67). This spike creates no real worktree, so worktree_path and
  // branch_name are the documented empty-string default.
  writeJson(path.join(jobDir, 'run_manifest.json'), {
    schema_version: '1.0.0',
    job_id: jobId,
    task_id: contract.task_id,
    started_at: nowUtc(),
    completed_at: null,
    final_status: null,
    failure_reason: null,
    current_phase: PHASES[0],
    output_mode: (contract.execution && contract.execution.output_mode) || 'pr',
    isolation_mode: (contract.execution && contract.execution.isolation_mode) || 'worktree',
    worktree_path: '',
    branch_name: '',
    model_tiers: { ...tiers },
    cross_phase_rewinds: { test: 0, verify: 0, review: 0 },
    check_defect_repairs: 0,
    operator_directed_rewinds: { test: 0, review: 0 },
    carry_over: null,
    resumed_from: null,
    risk_level: risk,               // legitimate extra bookkeeping (artifact-layout.md line 63)
    recomputed_risk_level: null,    // filled from review-risk-assess at the review gate
  });
  process.stdout.write(JSON.stringify({
    job_id: jobId,
    job_dir: jobDir,
    test_gate_scope: testGateScope(contract),
    contract_warnings: contractWarnings(contract),
  }) + '\n');
}

// --- the sequencing oracle ---------------------------------------------------
//
// A pure function of the evidence tree, backing both `next` and `record`. Returns exactly
// one of:
//   { action: 'dispatch', phase, attempt, origin }   — this attempt is next to run
//   { action: 'operator', phase, attempt, kind }     — a decision the controller will not make
//   { action: 'terminal', verdict, phase, failure_reason }
//   { action: 'finalize' }
function expectedNext(jobDir) {
  for (const phase of PHASES) {
    const attempts = listAttempts(jobDir, phase);
    if (attempts.length === 0) return { action: 'dispatch', phase, attempt: 1, origin: 'initial' };
    const n = attempts[attempts.length - 1];
    const man = manifestOf(jobDir, phase, n);
    // An attempt directory with no manifest is one the controller OPENED and has not yet
    // recorded — a rewind destination awaiting its builder, or a dispatch that died. Either
    // way the next action is to run it, not to invent a verdict for it.
    if (!man) return { action: 'dispatch', phase, attempt: n, origin: attemptOrigin(jobDir, phase, n) };
    const gate = man.gate_result;
    if (gate === 'pass') continue;
    const reason = typeof man.failure_reason === 'string' ? man.failure_reason : null;

    if (reason === ROUTE_GAP) {
      return {
        action: 'operator', phase, attempt: n, kind: 'environment_gap',
        note: 'a check failed on environment/prerequisite: the criterion is UNVERIFIED, consumes no budget, and routes to the operator (phase-gates.md). This spike has no operator channel, so the job stops here rather than guessing a route.',
      };
    }
    if (reason === ROUTE_SPENT) {
      return { action: 'terminal', verdict: 'RETRY', phase, failure_reason: terminalReasonFor(phase), note: 'the rewind budget for this origin is spent; a second occurrence terminates on that rewind\'s own recorded reason' };
    }
    if (reason === ROUTE_REWIND || reason === ROUTE_REPAIR) {
      // The rewind's build attempt exists (record opened it). Reaching this phase in the walk
      // means every earlier phase — build included — passed its latest gate, so the repair
      // landed and this phase re-runs forward.
      if (n + 1 > MAX_ATTEMPTS_PER_PHASE) return { action: 'terminal', verdict: 'RETRY', phase, failure_reason: terminalReasonFor(phase), note: `attempt bound ${MAX_ATTEMPTS_PER_PHASE} reached — this is a loop guard, not a budget` };
      return { action: 'dispatch', phase, attempt: n + 1, origin: 'forward', because: `${reason} from ${phase}/attempt_${n}` };
    }
    if (gate === 'deferred') {
      return { action: 'operator', phase, attempt: n, kind: 'ship_delegation', note: 'F-5 delegated push — out of scope for this spike' };
    }
    if (gate !== 'fail') {
      return { action: 'terminal', verdict: 'QUARANTINE', phase, failure_reason: 'MISSING_UPSTREAM_ARTIFACT', note: `${phase}/attempt_${n} records gate_result=${JSON.stringify(gate)} — undecided is not a verdict` };
    }
    // Rule 4/5: ordinary retry while the budget lasts, then terminate on the recorded reason.
    if (retriesUsed(jobDir, phase) < RETRY_BUDGET[phase]) {
      if (n + 1 > MAX_ATTEMPTS_PER_PHASE) return { action: 'terminal', verdict: 'RETRY', phase, failure_reason: terminalReasonFor(phase), note: `attempt bound ${MAX_ATTEMPTS_PER_PHASE} reached — this is a loop guard, not a budget` };
      return {
        action: 'dispatch', phase, attempt: n + 1, origin: 'retry',
        because: `${phase}/attempt_${n} gate_result=fail; retries used ${retriesUsed(jobDir, phase)}/${RETRY_BUDGET[phase]}`,
      };
    }
    return {
      action: 'terminal', verdict: 'RETRY', phase, failure_reason: terminalReasonFor(phase),
      note: `retry budget exhausted (${retriesUsed(jobDir, phase)}/${RETRY_BUDGET[phase]} used across ${attempts.length} attempts)`,
    };
  }
  return { action: 'finalize', note: 'every phase gate passed on its latest attempt; call finalize' };
}

function cmdNext(jobDir) {
  const run = readJson(path.join(jobDir, 'run_manifest.json'));
  const contract = contractOf(jobDir);
  const nx = expectedNext(jobDir);
  if (nx.action !== 'dispatch') {
    process.stdout.write(JSON.stringify({ ...nx, test_gate_scope: testGateScope(contract) }) + '\n');
    return;
  }
  const dir = attemptDir(jobDir, nx.phase, nx.attempt);
  const { model_tier, tier_input } = tierFor(jobDir, nx.phase, nx.attempt, run);
  const inputs = {};
  // F-45: criteria-to-checks runs at TEST-PHASE ENTRY and its specs are handed to the tester
  // in its dispatch. This is the only place the controller writes into an attempt directory
  // before the agent does, apart from the corrections.json a rewind authors.
  if (nx.phase === 'test' && testGateScope(contract) === 'full') {
    inputs.check_specs = ensureCriteriaTrace(jobDir, nx.attempt, contract).check_specs;
  }
  // A rewind destination is dispatched WITH its corrections. An ordinary retry of a rewind
  // build attempt gets the same pointer: corrections.json is a write-once rule-1 artifact
  // that belongs to the attempt it was authored into, so the retry is told where to read it
  // rather than being handed a second copy.
  if (nx.phase === 'build') {
    const withCorrections = listAttempts(jobDir, 'build').filter((m) => correctionsOf(jobDir, m));
    if (withCorrections.length) {
      const m = withCorrections[withCorrections.length - 1];
      inputs.corrections = path.join('build', `attempt_${m}`, 'corrections.json');
    }
  }
  const startedAt = stampDispatch(jobDir, nx.phase, nx.attempt);
  process.stdout.write(JSON.stringify({
    action: 'dispatch',
    phase: nx.phase,
    agent: AGENT_OF[nx.phase],
    attempt: nx.attempt,
    origin: nx.origin,
    because: nx.because || null,
    attempt_dir: dir,
    model_tier,
    tier_input,
    inputs,
    started_at: startedAt,
    test_gate_scope: testGateScope(contract),
  }) + '\n');
}

// --- record ------------------------------------------------------------------

// Copy the mock dispatch output in. Two files are never ingested: `phase_manifest.json`
// (the controller computes and writes the gate decision) and `corrections.json` (a rewind
// input the ORCHESTRATOR authors — a dispatch that supplied its own would be writing its own
// instructions). Nothing already on disk is overwritten: `next` may have written the
// criteria-to-checks trace into this directory, and a helper that can replace recorded
// evidence is the defect mk-risk-trace.js was fixed for.
const NEVER_INGEST = new Set(['phase_manifest.json', 'corrections.json']);
function cpDir(src, dst, top) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (top && NEVER_INGEST.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { cpDir(s, d, false); continue; }
    if (exists(d)) fail(`record refused: ingesting ${s} would overwrite ${d}, which the controller already wrote`);
    fs.copyFileSync(s, d);
  }
}

// A rewind opens a FRESH build attempt and authors its corrections.json BEFORE the builder
// is dispatched (artifact-layout.md rule 2, "Orchestrator-authored input"). Written once,
// never edited.
function openRewind(jobDir, sourcePhase, sourceAttempt, rows, classification) {
  const m = latestAttempt(jobDir, 'build') + 1;
  const dir = attemptDir(jobDir, 'build', m);
  if (exists(dir)) fail(`rewind refused: ${dir} already exists`);
  const sourceRef = `${sourcePhase}/attempt_${sourceAttempt}`;
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'corrections.json'), {
    source_attempt: sourceRef,
    corrections: rows.map((c) => ({
      check_id: c.check_id,
      criterion: c.criterion,
      // The criterion IS the expectation; `output` is what the tester observed. Neither is
      // composed here — both are transcribed from the check row.
      expected: c.criterion,
      actual: typeof c.output === 'string' ? c.output : JSON.stringify(c.output === undefined ? null : c.output),
      // The documented test check row carries no path, so the controller has none to record.
      // Empty string, never a guess: `path` is one of the two fields on this file that are
      // model work, not controller work (see `guidance` below).
      path: typeof c.path === 'string' ? c.path : '',
      classification,
      // SC-13/F-76: "Where an acceptance criterion covers the finding it is that criterion's
      // criteria-to-checks id, the same value as check_id." A tester-originated correction
      // always has one, so no REG- id is ever minted here.
      regression_check_id: c.check_id,
      // "null only when the finding was never reproduced by running anything." The check WAS
      // run, but `repro` names an archived corpus under the attempt's consensus/repro/, and a
      // tester check has none — its check_id is the re-runnable handle. Recorded in
      // FINDINGS.md as a shape written for F-46 Critic findings being applied to A3 rewinds.
      repro: null,
    })),
    // `guidance` (SC-13/F-75) is OPTIONAL and is deliberately absent: every one of its five
    // fields (invisible_because, direction_of_error, must_not_regress, tie_breaking,
    // housekeeping) is a judgment about the change, and a controller that synthesised them
    // from a check row would be fabricating the exact content F-75 exists to make real.
  });
  return m;
}

function cmdRecord(jobDir, phase, attemptArg, opts) {
  const attempt = Number(attemptArg);
  if (!Number.isInteger(attempt) || attempt < 1) fail(`record: attempt must be a positive integer, got ${attemptArg}`);
  if (!PHASES.includes(phase)) fail(`record: unknown phase "${phase}"`);
  // ENFORCE sequencing: record only what `next` would dispatch, never past a terminal gate.
  const nx = expectedNext(jobDir);
  if (nx.action !== 'dispatch') {
    fail(`record refused: the job is at '${nx.action}'${nx.phase ? ` (last runnable phase ${nx.phase})` : ''}, not accepting a '${phase}' record`);
  }
  if (nx.phase !== phase || nx.attempt !== attempt) {
    fail(`record refused: out of order — next dispatch is ${nx.phase}/attempt_${nx.attempt}, got ${phase}/attempt_${attempt}`);
  }
  const runP = path.join(jobDir, 'run_manifest.json');
  const run = readJson(runP);
  const contract = contractOf(jobDir);
  const dir = attemptDir(jobDir, phase, attempt);
  // F-45 again: if the model called `record` without an intervening `next`, the test entry
  // validator has still not run. Run it here rather than gate on evidence that was never
  // produced — the trace write is idempotent, so a preceding `next` is not re-done.
  if (phase === 'test' && testGateScope(contract) === 'full') ensureCriteriaTrace(jobDir, attempt, contract);
  cpDir(opts.from, dir, true);

  // tier + its documented source (may refuse: FR-12 has no fallback worth mislabelling)
  const { tier_input, model_tier } = tierFor(jobDir, phase, attempt, run);

  // provenance stamps. started_at is the DISPATCH stamp `next` took; --started-at /
  // --completed-at let a caller replay a recorded run's real timings instead.
  const marker = readJsonSafe(dispatchMarkerPath(jobDir));
  const startedAt = opts.startedAt
    || (marker && marker.phase === phase && marker.attempt === attempt ? marker.started_at : null)
    || nowUtc();
  if (!UTC_STAMP.test(startedAt)) fail(`record: started_at "${startedAt}" is not YYYY-MM-DDTHH:MM:SSZ`);
  const completedAt = opts.completedAt || waitForWholeSecond(startedAt);
  if (!UTC_STAMP.test(completedAt)) fail(`record: completed_at "${completedAt}" is not YYYY-MM-DDTHH:MM:SSZ`);
  const wallClockS = (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;
  if (!(wallClockS > 0)) fail(`record: wall_clock_s must be > 0 (started_at ${startedAt}, completed_at ${completedAt})`);

  // canonical phase_manifest — references/artifact-layout.md lines 146-150. Written FIRST
  // with the gate undecided, so the scorer sees a structurally complete entry for this phase
  // and its pipeline_completion count answers the completeness question honestly.
  const manPath = path.join(dir, 'phase_manifest.json');
  const manifest = {
    phase,
    attempt, // integer
    job_id: run.job_id,
    started_at: startedAt,
    completed_at: completedAt,
    agent: AGENT_OF[phase],
    model_tier,
    tier_input,
    gate_result: null,
    failure_reason: null,
    gate_failure_detail: null,
    stability_gate: null,
    provenance: provenanceFor({ startedAt, completedAt, wallClockS, agent: AGENT_OF[phase], tierRequested: model_tier }),
  };
  writeJson(manPath, manifest);

  const v = phaseGate(jobDir, phase, attempt, contract);
  manifest.gate_result = v.gate;
  manifest.failure_reason = v.gate === 'pass' ? null : v.annotation;
  // phase-gates.md line 202 instructs writers to record gate detail in the attempt manifest's
  // `gate_failure_detail`; artifact-layout.md's phase_manifest shape omits the key entirely.
  // Following the instruction and recording the disagreement (FINDINGS.md).
  manifest.gate_failure_detail = v.gate === 'pass' ? null : { summary: v.detail };
  writeJson(manPath, manifest);

  // run_manifest is the one mutable file (rule 4). The counters move HERE, once, beside the
  // attempt that caused them — never in `next`, which must stay a pure read (Q4).
  run.current_phase = phase;
  let rewindAttempt = null;
  if (v.route === 'rewind') {
    rewindAttempt = openRewind(jobDir, phase, attempt, v.failing, CLASS_CODE);
    run.cross_phase_rewinds.test = (run.cross_phase_rewinds.test || 0) + 1;
  } else if (v.route === 'repair') {
    rewindAttempt = openRewind(jobDir, phase, attempt, v.failing, CLASS_CHECK);
    run.check_defect_repairs = (run.check_defect_repairs || 0) + 1;
  }
  if (phase === 'review' && v.gate === 'pass') {
    // FR-12: from document onward the table is re-keyed to the recomputed risk.
    const risk = recomputedRisk(jobDir);
    if (risk) {
      run.recomputed_risk_level = risk;
      for (const p of RECOMPUTED_TIER_PHASES) run.model_tiers[p] = TIER_TABLE[risk][p];
    }
  }
  run.model_tiers[phase] = model_tier;
  writeJson(runP, run);
  process.stdout.write(JSON.stringify({
    recorded: `${phase}/attempt_${attempt}`,
    origin: attemptOrigin(jobDir, phase, attempt),
    gate_result: v.gate,
    reason: v.gate === 'pass' ? null : v.detail,
    annotation: v.gate === 'pass' ? null : v.annotation,
    route: v.route,
    rewind_opened: rewindAttempt ? `build/attempt_${rewindAttempt}` : null,
    model_tier,
    tier_source: tier_input.source,
    wall_clock_s: wallClockS,
    retries_used: `${retriesUsed(jobDir, phase)}/${RETRY_BUDGET[phase]}`,
    cross_phase_rewinds: run.cross_phase_rewinds,
    check_defect_repairs: run.check_defect_repairs,
    test_gate_scope: testGateScope(contract),
  }) + '\n');
}

// --- finalize ----------------------------------------------------------------

// Readiness is the SCORER's verdict on the finished tree, not manifest presence. The
// controller asserts the structural claim it owns (did every phase's LATEST gate pass?), then
// asks the authority; if the scorer does not PROMOTE, the claim is RETRACTED before the file
// is left on disk. `quarantined` when the scorer quarantines — writing `failed` there would
// downgrade a quarantine to a retriable failure, since decideLifecycle maps a `failed` job
// with a retriable reason to RETRY/exit 1.
//
// STEP 2 additions: the terminal failure_reason comes from the documented vocabulary, never
// from an attempt-level route annotation; and `completed_at` is written once, so a second
// finalize is a no-op rather than a fresh terminal timestamp (Q4, and rule 9 — the terminal
// moment is the first one).
function terminalReasonFrom(jobDir) {
  for (const phase of PHASES) {
    const n = latestAttempt(jobDir, phase);
    if (!n) return { reason: terminalReasonFor(phase), where: `${phase} (no attempt)` };
    const man = manifestOf(jobDir, phase, n);
    if (!man) return { reason: terminalReasonFor(phase), where: `${phase}/attempt_${n} (no manifest)` };
    if (man.gate_result === 'pass') continue;
    // Every route annotation maps to the phase's documented gate-failure class. phase-gates.md
    // is emphatic that the attempt annotations "never enter the terminal failure-reason
    // classes"; a second test rewind, a second check defect, and an unresolved environment gap
    // all terminate on TEST_GATE_FAILURE, which decideLifecycle reads as the RETRY class.
    return { reason: terminalReasonFor(phase), where: `${phase}/attempt_${n}`, annotation: man.failure_reason || null };
  }
  return { reason: 'PHASE_GATE_FAILURE', where: 'unknown' };
}

function cmdFinalize(jobDir, reportScript) {
  const runP = path.join(jobDir, 'run_manifest.json');
  const run = readJson(runP);
  const allPass = PHASES.every((p) => {
    const n = latestAttempt(jobDir, p);
    const man = n ? manifestOf(jobDir, p, n) : null;
    return !!man && man.gate_result === 'pass';
  });
  if (!run.completed_at) run.completed_at = nowUtc(); // written once — a re-finalize is a no-op
  let retracted = null;
  if (!allPass) {
    const t = terminalReasonFrom(jobDir);
    run.final_status = 'failed';
    run.failure_reason = t.reason;
  } else {
    run.final_status = 'completed';
    run.failure_reason = null;
    writeJson(runP, run); // the scorer reads final_status off disk
    let decision = null, failingGate = null;
    try {
      const report = scorer.buildReport(jobDir).report;
      decision = report.decision;
      const bad = report.gates.find((g) => g.result === 'fail');
      failingGate = bad ? `${bad.gate}: ${bad.detail || 'fail'}` : null;
    } catch (e) {
      decision = 'QUARANTINE';
      failingGate = `scorer could not read evidence: ${e.message}`;
    }
    if (decision !== 'PROMOTE') {
      retracted = { from: 'completed', because: failingGate || `scorer decision ${decision}` };
      run.final_status = decision === 'QUARANTINE' ? 'quarantined' : 'failed';
      run.failure_reason = failingGate || `SCORER_${decision}`;
    }
  }
  // The invariant, asserted rather than assumed: an ATTEMPT annotation must never become the
  // job's terminal reason. If this ever fires it is a controller bug, not a job outcome.
  if (ATTEMPT_ANNOTATIONS.has(run.failure_reason)) {
    fail(`finalize: attempt-level annotation "${run.failure_reason}" leaked into run_manifest.failure_reason — it is never a terminal class (phase-gates.md F-46 step 2, F-37 step 2)`, 70);
  }
  writeJson(runP, run);
  if (retracted) {
    process.stdout.write(JSON.stringify({ completion_claim_retracted: retracted, final_status: run.final_status }) + '\n');
  }
  if (reportScript) {
    const r = spawnSync('node', [reportScript, jobDir], { encoding: 'utf8' });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    process.stdout.write(JSON.stringify({ scorer_exit_code: r.status }) + '\n');
    process.exit(r.status);
  }
}

// --- audit -------------------------------------------------------------------

// Read-only single-source audit. Emits, for ANY evidence tree, what the scorer decides
// overall and how the controller's gate classifies it, plus the step-2 budget ledger.
function cmdAudit(jobDir) {
  const budgets = {};
  for (const p of PHASES) {
    const attempts = listAttempts(jobDir, p);
    if (!attempts.length) continue;
    budgets[p] = {
      attempts: attempts.length,
      origins: attempts.map((n) => attemptOrigin(jobDir, p, n)),
      retries_used: retriesUsed(jobDir, p),
      retry_budget: RETRY_BUDGET[p],
    };
  }
  const run = readJsonSafe(path.join(jobDir, 'run_manifest.json')) || {};
  let report;
  try {
    report = scorer.buildReport(jobDir).report;
  } catch (e) {
    process.stdout.write(JSON.stringify({ jobDir, error: 'scorer_threw', message: e.message, layer: 'manifest-integrity', budgets }) + '\n');
    return;
  }
  const gates = report.gates;
  const rawFailing = gates.filter((x) => !OWN_SEQUENCING_GATES.has(x.gate) && x.result === 'fail').map((x) => x.gate);
  const structuralFailing = gates.filter((x) => OWN_SEQUENCING_GATES.has(x.gate) && x.result === 'fail').map((x) => x.gate);
  let layer = 'clean';
  if (rawFailing.length) layer = 'raw-evidence';
  else if (structuralFailing.length) layer = 'structural';
  else if (report.decision !== 'PROMOTE') layer = 'other';
  process.stdout.write(JSON.stringify({
    jobDir,
    scorer_decision: report.decision,
    scorer_exit: report.exit_code,
    layer,
    raw_failing: rawFailing,
    structural_failing: structuralFailing,
    gates: gates.map((x) => `${x.gate}=${x.result}`),
    single_source_gate: rawFailing.length ? 'fail' : 'pass',
    budgets,
    cross_phase_rewinds: run.cross_phase_rewinds,
    check_defect_repairs: run.check_defect_repairs,
    next: expectedNext(jobDir),
  }) + '\n');
}

function flagValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

function main() {
  const [verb, ...a] = process.argv.slice(2);
  if (verb === 'init') return cmdInit(a[0], a[1]);
  if (verb === 'next') return cmdNext(a[0]);
  if (verb === 'record') {
    const from = flagValue(a, '--from');
    if (!from) fail('record: missing --from <dir>');
    return cmdRecord(a[0], a[1], a[2], {
      from,
      startedAt: flagValue(a, '--started-at'),
      completedAt: flagValue(a, '--completed-at'),
    });
  }
  if (verb === 'finalize') return cmdFinalize(a[0], flagValue(a, '--report'));
  if (verb === 'audit') return cmdAudit(a[0]);
  process.stderr.write(`unknown verb: ${verb}\n`);
  process.exit(64);
}
main();
