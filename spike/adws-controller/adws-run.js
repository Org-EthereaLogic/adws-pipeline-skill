#!/usr/bin/env node
/*
 * adws-run.js — SPIKE controller (§6.2), STEP 1 slice. THROWAWAY quality.
 *
 * Proves: a Node controller can own the deterministic state machine (sequencing,
 * per-phase gate decision, evidence-file generation, terminal report) and produce an
 * evidence tree the UNMODIFIED adws-pipeline/scripts/execution-report.js scores.
 *
 * The model (not this script) does the LLM dispatches; here they are MOCKED via
 * `record --from <goldenAttemptDir>`, standing in for a real subagent's output files.
 *
 * ---------------------------------------------------------------------------
 * SECOND-REVIEW FIXES (the counterexample in FINDINGS.md: an EMPTY plan dispatch was
 * gated `pass`, the job reached `final_status: completed`, and the untouched scorer
 * QUARANTINEd it — with no post-gate mutation anywhere):
 *
 *   FIX 1. `record` REJECTS a phase that wrote no readable `phase_output.json` before
 *          it writes `gate_result: pass`. The old rawGateVerdict() excluded
 *          `pipeline_completion` WHOLESALE, and that gate does double duty: (a)
 *          phases-not-reached, correctly ignored mid-run, and (b) a phase that WAS
 *          reached but wrote nothing readable — a real completeness check that went out
 *          with (a). Now the current-phase slice of (b) is consulted, single-sourced
 *          from the scorer's own count of complete phases.
 *   FIX 2. `finalize` derives readiness from the scorer's FULL terminal gate set: it
 *          asserts `completed`, asks the scorer, and RETRACTS to `quarantined`/`failed`
 *          if the scorer does not PROMOTE. Manifest presence alone is not readiness.
 *   FIX 3. Evidence is reconciled with the REAL contracts, not a plausible subset:
 *          - `provenance` carries the MANDATORY half (`started_at`, `completed_at`,
 *            derived `wall_clock_s`, `agent`, `model_tier_requested` — SKILL.md:192,
 *            artifact-layout.md F-17 disposition, parity/provenance-fixtures) with the
 *            structurally-unavailable half present and null.
 *          - `agent` is the full `adws-…` id (artifact-layout.md:147 writer contract).
 *          - `tier_input.source` is `contract.risk_level` for plan/build/test/review and
 *            `review-risk-assess` from document onward (phase-gates.md FR-12), read from
 *            the review attempt's own recorded validator trace.
 *
 * Retained from the first hardening pass:
 *   - Sequencing is ENFORCED by one oracle, `expectedNext()`, backing `next` and `record`.
 *   - The gate is SINGLE-SOURCED: there is no hand-rolled gate reimplementation; the
 *     per-phase verdict comes from the scorer's own exported buildReport() over the
 *     tree-so-far. buildReport() writes nothing (only generateExecutionReport() does),
 *     so it is a safe read-only oracle mid-run.
 *
 * Verbs:
 *   init   <contract.json> <evidenceRoot>            -> creates job dir + run_manifest, prints jobId
 *   next   <jobDir>                                   -> emits the next ACTION as JSON; stamps dispatch
 *   record <jobDir> <phase> <attempt> --from <dir>    -> ingests mock output, gates via scorer, writes phase_manifest
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
// Single-source of gate truth: the scorer's own evaluators. buildReport() is read-only
// (only generateExecutionReport() writes files), so calling it mid-run mutates nothing.
const scorer = require(SCORER_PATH);

const PHASES = ['plan', 'build', 'test', 'review', 'document', 'ship', 'verify'];

// Risk -> per-phase tier table (references/phase-gates.md FR-12 "Risk -> tier table").
const TIER_TABLE = {
  low:    { plan: 'opus', build: 'sonnet', test: 'sonnet', review: 'sonnet', document: 'haiku',  ship: 'sonnet', verify: 'sonnet' },
  medium: { plan: 'opus', build: 'sonnet', test: 'sonnet', review: 'opus',   document: 'haiku',  ship: 'sonnet', verify: 'sonnet' },
  high:   { plan: 'opus', build: 'opus',   test: 'opus',   review: 'opus',   document: 'sonnet', ship: 'sonnet', verify: 'sonnet' },
};

// FIX 3. references/artifact-layout.md:147 shows the WRITER contract as `"agent": "adws-…"`.
// The golden fixture writes the bare role (`"planner"`), so the reference tree and the
// writer contract disagree; the scorer reads neither, so nothing caught it. A conformant
// WRITER follows the writer contract — recorded in FINDINGS.md as a real doc/fixture
// inconsistency rather than silently split.
const AGENT_OF = {
  plan: 'adws-planner', build: 'adws-builder', test: 'adws-tester', review: 'adws-reviewer',
  document: 'adws-documenter', ship: 'adws-shipper', verify: 'adws-verifier',
};

// FR-12: plan/build/test/review are keyed to the CONTRACT risk; document/ship/verify to the
// risk `review-risk-assess` recomputed from the actual change set. `review-risk-assess` is a
// review-gate VALIDATOR, so it runs after the review agent — the reviewer's own tier still
// comes from contract risk.
const RECOMPUTED_TIER_PHASES = new Set(['document', 'ship', 'verify']);
const RISK_LEVELS = new Set(['low', 'medium', 'high']);

// FIX 3 / SC-11/A3 (artifact-layout.md F-17 disposition; parity/provenance-fixtures/run-tests.js).
// The obtainable half is MANDATORY and non-null; the structurally-unavailable half is
// present and null so a reader can tell "not captured" from "field dropped". `elapsed_ms`,
// `timeout` and `cancel` are allowed-but-unrequired: this runtime observes none of them for
// a mocked dispatch, so they are null rather than a fabricated zero/false.
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

// deterministic jobId: job_YYYYMMDD_NNNN (underscore — references/artifact-layout.md line 19),
// next free sequence under evidenceRoot
function allocJobId(evidenceRoot) {
  const stamp = nowUtc().slice(0, 10).replace(/-/g, '');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  let n = 1;
  while (exists(path.join(evidenceRoot, `job_${stamp}_${String(n).padStart(4, '0')}`))) n++;
  return `job_${stamp}_${String(n).padStart(4, '0')}`;
}

// Controller scratch, NOT evidence: the dispatch stamp `next` takes when it hands a phase
// off, which `record` turns into provenance.started_at. SKILL.md:192 requires that stamp to
// come from a live clock AT DISPATCH, which is a fact only the dispatcher holds. Dotfile at
// the job root: the scorer ignores unknown files and verify-canonical.js reads only the
// documented paths.
function dispatchMarkerPath(jobDir) { return path.join(jobDir, '.dispatch.json'); }

function cmdInit(contractPath, evidenceRoot) {
  const contract = readJson(contractPath);
  const risk = (contract.risk && contract.risk.risk_level) || 'medium';
  const tiers = TIER_TABLE[risk] || TIER_TABLE.medium;
  const jobId = allocJobId(evidenceRoot);
  const jobDir = path.join(evidenceRoot, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  writeJson(path.join(jobDir, 'task_contract_snapshot.json'), contract);
  // run_manifest floor — references/artifact-layout.md lines 51-58. final_status is null
  // while running (line 67); the scorer reads only job_id/task_id/final_status/failure_reason
  // but a conformant WRITER emits the whole floor. This spike creates no real worktree, so
  // worktree_path/branch_name are the documented empty-string default.
  //
  // model_tiers starts fully keyed to contract risk and is RE-KEYED for document/ship/verify
  // once review records the recomputed risk (FR-12) — which is why artifact-layout.md calls
  // the map legitimately HETEROGENEOUS.
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
  process.stdout.write(JSON.stringify({ job_id: jobId, job_dir: jobDir }) + '\n');
}

// The SINGLE sequencing oracle backing both `next` and `record`.
// A phase is "recorded" once its attempt_1 phase_manifest.json exists. Returns exactly one of:
//   { action: 'dispatch', phase, attempt }         — this phase is next to run
//   { action: 'terminal', verdict: 'RETRY', phase } — an earlier phase gate failed; stop
//   { action: 'finalize' }                          — all seven gates passed
function expectedNext(jobDir) {
  for (const phase of PHASES) {
    const man = path.join(attemptDir(jobDir, phase, 1), 'phase_manifest.json');
    if (!exists(man)) return { action: 'dispatch', phase, attempt: 1 };
    const gate = readJson(man).gate_result;
    if (gate !== 'pass') {
      // step-1 slice: no retry/rewind yet (that is step 2). A failed gate is terminal.
      return { action: 'terminal', verdict: 'RETRY', phase, note: `gate_result=${gate} at ${phase}; retry/rewind is step 2` };
    }
  }
  return { action: 'finalize', note: 'all 7 phase gates passed; call finalize' };
}

function cmdNext(jobDir) {
  const run = readJson(path.join(jobDir, 'run_manifest.json'));
  const nx = expectedNext(jobDir);
  if (nx.action === 'dispatch') {
    const startedAt = nowUtc();
    // Stamp the dispatch NOW: provenance.started_at is "from a live date -u at dispatch"
    // (SKILL.md:192), which is this moment, not the moment record() happens to be called.
    writeJson(dispatchMarkerPath(jobDir), { phase: nx.phase, attempt: nx.attempt, started_at: startedAt });
    process.stdout.write(JSON.stringify({
      action: 'dispatch',
      phase: nx.phase,
      agent: AGENT_OF[nx.phase],
      attempt: nx.attempt,
      attempt_dir: attemptDir(jobDir, nx.phase, nx.attempt),
      model_tier: run.model_tiers[nx.phase],
      started_at: startedAt,
    }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify(nx) + '\n');
}

// --- The gate ---------------------------------------------------------------
//
// SINGLE-SOURCED: ask the scorer's own evaluators about the tree so far. Two questions,
// both answered from the same buildReport():
//
//   (a) COMPLETENESS of the phase just recorded (FIX 1). `pipeline_completion` counts the
//       phases that produced an attempt with BOTH a readable phase_manifest.json and a
//       readable phase_output.json, and reports it as "N/7" at the head of `detail`. After
//       recording phase index i, exactly i+1 phases have been reached, so N < i+1 means the
//       phase just recorded (or an earlier one — impossible here, since every earlier phase
//       already cleared this same check) wrote no readable evidence. The gate's OTHER duty —
//       phases not yet reached, and the final_status term — cannot contaminate this, because
//       the count is taken from the value, not the pass/fail status.
//   (b) RAW-EVIDENCE gates: skills_clean, consensus, grader_verdict, drift_verdict,
//       verify_structural. Authoritative as-is. `phase_gates` is excluded because it reads
//       the gate_result we are about to write (circular).
const OWN_SEQUENCING_GATES = new Set(['pipeline_completion', 'phase_gates']);

function gateVerdict(jobDir, phase) {
  let report;
  try {
    report = scorer.buildReport(jobDir).report;
  } catch (e) {
    // e.g. an unreadable run_manifest — the scorer would exit 3; fail the gate closed.
    return { gate: 'fail', reason: `scorer could not read evidence: ${e.message}` };
  }
  // (a) completeness of the phases reached so far. The comparison is against the number of
  // attempt DIRECTORIES that exist, not the index of the phase being recorded: those are
  // the same in this controller's own flow, but counting directories also fails closed on a
  // tree that arrived with evidence the controller did not write (a stray or pre-existing
  // later-phase directory would otherwise be counted as complete and could mask an
  // incomplete current phase).
  const present = PHASES.filter((p) => exists(attemptDir(jobDir, p, 1))).length;
  const pc = report.gates.find((g) => g.gate === 'pipeline_completion');
  if (!pc) return { gate: 'fail', reason: 'scorer reported no pipeline_completion gate' };
  const counted = /^(\d+)\/(\d+)\b/.exec(pc.detail || '');
  if (!counted) return { gate: 'fail', reason: `could not read the completeness count from "${pc.detail}"` };
  if (Number(counted[1]) < present) {
    return { gate: 'fail', reason: `pipeline_completion: ${pc.detail}` };
  }
  // (b) raw-evidence gates
  const failing = report.gates.filter((g) => !OWN_SEQUENCING_GATES.has(g.gate)).find((g) => g.result === 'fail');
  return failing
    ? { gate: 'fail', reason: `${failing.gate}: ${failing.detail || 'fail'}` }
    : { gate: 'pass', reason: null };
}

// --- Tier sourcing (FIX 3 / FR-12) ------------------------------------------

// The risk `review-risk-assess` recomputed from the actual change set, read from the review
// attempt's own recorded validator trace (artifact-layout.md: skill_trace wraps the
// validator's stdout in `output`). Returns null when review recorded no such trace — the
// controller refuses to invent one.
function recomputedRisk(jobDir) {
  const skillsDir = path.join(attemptDir(jobDir, 'review', 1), 'skills');
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

// { source, value } per FR-12, plus the tier that risk selects for this phase.
function resolveTier(jobDir, phase, run) {
  if (!RECOMPUTED_TIER_PHASES.has(phase)) {
    const risk = RISK_LEVELS.has(run.risk_level) ? run.risk_level : 'medium';
    return { tier_input: { source: 'contract.risk_level', value: risk }, model_tier: TIER_TABLE[risk][phase] };
  }
  const risk = recomputedRisk(jobDir);
  if (!risk) {
    fail(
      `record refused: FR-12 keys the ${phase} tier to the risk_level recomputed by ` +
      'review-risk-assess, and review/attempt_1 recorded no review-risk-assess skill_trace ' +
      'carrying one. The controller will not substitute contract risk and mislabel its source.'
    );
  }
  return { tier_input: { source: 'review-risk-assess', value: risk }, model_tier: TIER_TABLE[risk][phase] };
}

function cpDir(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip && skip.has(e.name)) continue; // the controller OWNS the manifest; agents don't write it
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) cpDir(s, d, skip); else fs.copyFileSync(s, d);
  }
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
  const dir = attemptDir(jobDir, phase, attempt);
  // ingest the mock dispatch output (a real subagent would have written these);
  // NEVER ingest phase_manifest.json — the controller computes and writes that below.
  cpDir(opts.from, dir, new Set(['phase_manifest.json']));

  // tier + its documented source (may refuse: FR-12 has no fallback worth mislabelling)
  const { tier_input, model_tier } = resolveTier(jobDir, phase, run);

  // provenance stamps. started_at is the DISPATCH stamp `next` took; --started-at /
  // --completed-at let a caller replay a recorded run's real timings instead (used by the
  // fixture-ingest matrix, which is replaying evidence, not dispatching).
  const marker = readJsonSafe(dispatchMarkerPath(jobDir));
  const startedAt = opts.startedAt
    || (marker && marker.phase === phase && marker.attempt === attempt ? marker.started_at : null)
    || nowUtc();
  if (!UTC_STAMP.test(startedAt)) fail(`record: started_at "${startedAt}" is not YYYY-MM-DDTHH:MM:SSZ`);
  const completedAt = opts.completedAt || waitForWholeSecond(startedAt);
  if (!UTC_STAMP.test(completedAt)) fail(`record: completed_at "${completedAt}" is not YYYY-MM-DDTHH:MM:SSZ`);
  const wallClockS = (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;
  if (!(wallClockS > 0)) {
    fail(`record: wall_clock_s must be > 0 (started_at ${startedAt}, completed_at ${completedAt})`);
  }

  // canonical phase_manifest — references/artifact-layout.md lines 146-150. Written FIRST
  // with the gate undecided, so the scorer sees a structurally complete entry for this phase
  // and its pipeline_completion count answers the completeness question honestly (FIX 1).
  // `gate_result: null` cannot contaminate that read: the only gate that consumes it,
  // phase_gates, is excluded from the verdict as circular.
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
    stability_gate: null,
    provenance: provenanceFor({ startedAt, completedAt, wallClockS, agent: AGENT_OF[phase], tierRequested: model_tier }),
  };
  writeJson(manPath, manifest);

  const { gate, reason } = gateVerdict(jobDir, phase);
  manifest.gate_result = gate;
  manifest.failure_reason = reason;
  writeJson(manPath, manifest);

  // run_manifest is the one mutable file (rule 4).
  run.current_phase = phase;
  if (phase === 'review' && gate === 'pass') {
    // FR-12: from document onward the table is re-keyed to the recomputed risk. Doing it
    // here is what makes `next` advertise the right tier at dispatch, which is what
    // provenance.model_tier_requested then records.
    const risk = recomputedRisk(jobDir);
    if (risk) {
      run.recomputed_risk_level = risk;
      for (const p of RECOMPUTED_TIER_PHASES) run.model_tiers[p] = TIER_TABLE[risk][p];
    }
  }
  writeJson(runP, run);
  process.stdout.write(JSON.stringify({
    recorded: `${phase}/attempt_${attempt}`, gate_result: gate, reason,
    model_tier, tier_source: tier_input.source, wall_clock_s: wallClockS,
  }) + '\n');
}

// FIX 2. Readiness is the SCORER's verdict on the finished tree, not manifest presence.
//
// The controller asserts the structural claim it owns (did all seven gates pass?), then
// asks the authority. If the scorer does not PROMOTE, the claim is RETRACTED before the
// file is left on disk: `quarantined` when the scorer quarantines (writing `failed` there
// would downgrade a quarantine to a retriable failure — decideLifecycle maps a `failed`
// job with a retriable reason to RETRY/exit 1), `failed` otherwise. A controller that
// cannot be contradicted by the scorer is the whole point; the empty-plan counterexample
// reached `completed` precisely because nothing here consulted the terminal gate set.
function cmdFinalize(jobDir, reportScript) {
  const runP = path.join(jobDir, 'run_manifest.json');
  const run = readJson(runP);
  const allPass = PHASES.every((p) => {
    const man = path.join(attemptDir(jobDir, p, 1), 'phase_manifest.json');
    return exists(man) && readJsonSafe(man) && readJsonSafe(man).gate_result === 'pass';
  });
  run.completed_at = nowUtc();
  let retracted = null;
  if (!allPass) {
    run.final_status = 'failed';
    run.failure_reason = run.failure_reason || 'PHASE_GATE_FAILURE';
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
  writeJson(runP, run);
  if (retracted) {
    process.stdout.write(JSON.stringify({
      completion_claim_retracted: retracted, final_status: run.final_status,
    }) + '\n');
  }
  if (reportScript) {
    const r = spawnSync('node', [reportScript, jobDir], { encoding: 'utf8' });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    process.stdout.write(JSON.stringify({ scorer_exit_code: r.status }) + '\n');
    process.exit(r.status);
  }
}

// Read-only single-source audit. Emits, for ANY evidence tree, what the scorer decides
// overall and how the controller's gate classifies it: which raw-evidence gate (if any)
// fails, vs a structural cause the controller handles in its sequencing/completeness layer,
// vs a manifest-integrity breach the scorer throws on.
function cmdAudit(jobDir) {
  let report;
  try {
    report = scorer.buildReport(jobDir).report;
  } catch (e) {
    process.stdout.write(JSON.stringify({ jobDir, error: 'scorer_threw', message: e.message, layer: 'manifest-integrity' }) + '\n');
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
