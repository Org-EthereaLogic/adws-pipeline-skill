#!/usr/bin/env node
/*
 * verify-canonical.js — SPIKE schema/type conformance check. THROWAWAY.
 *
 * The plan (SPIKE_CONTROLLER_PLAN.md:138) asked for a byte-diff against a golden tree. A
 * byte-diff against the GOLDEN FIXTURE is the wrong oracle: the fixture is deliberately
 * MINIMAL (it exercises the scorer's tolerant reader — it omits tier_input, stability_gate,
 * provenance, and the run_manifest run-state floor), so matching it byte-for-byte would
 * prove the controller is as minimal as a test stub, not that it is a CONFORMANT WRITER.
 *
 * The correct oracle is the WRITER contract: the floor of keys and types a real
 * orchestrator must emit. Sources, all of them normative and none of them the scorer:
 *   - references/artifact-layout.md — run_manifest floor (51-58), phase_manifest floor
 *     (146-150), `agent: "adws-…"` (147), job-id shape (19), the F-17 disposition that
 *     splits provenance into a MANDATORY obtainable half and a written-null unavailable half
 *   - SKILL.md:192 — the same mandatory half, from a live `date -u`
 *   - parity/provenance-fixtures/run-tests.js — the executable form of that split, including
 *     `wall_clock_s > 0` and `wall_clock_s == completed_at - started_at`
 *   - references/phase-gates.md FR-12 — tier_input.source is contract.risk_level for
 *     plan/build/test/review and review-risk-assess from document onward
 *   - the scorer's own completeness rule — an attempt with no readable phase_output.json is
 *     not evidence (execution-report.js missingPhaseEvidence)
 *
 * SECOND-REVIEW FIX 3. The previous version green-lit the counterexample tree (a `completed`
 * job whose plan attempt wrote no phase_output.json) and enforced only the ADVISORY half of
 * provenance, so "CANONICAL OK" meant "clears the checks written", not "conforms". The four
 * gaps it had — no required phase_output.json, no mandatory provenance half, no adws-… id,
 * no post-review tier source — are now checks.
 *
 * It is INDEPENDENT of the scorer: the scorer is a tolerant reader and accepts far less
 * than this. That independence is the point — scorer-acceptance never proved conformance.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PHASES = ['plan', 'build', 'test', 'review', 'document', 'ship', 'verify'];
const TIERS = new Set(['haiku', 'sonnet', 'opus', 'fable']);
const FINAL_STATUSES = new Set(['completed', 'failed', 'quarantined', 'canceled']);
const ISOLATION = new Set(['worktree', 'worktree-resumed']);
const GATE_RESULTS = new Set([null, 'pass', 'fail', 'deferred']);
const TIER_SOURCES = new Set([
  'contract.risk_level', 'review-risk-assess', 'retry-escalation', 'entropy-gate',
  'operator-resolution', 'cross-phase-rewind', 'operator-tier-override',
  'retry-escalation-saturated', 'entropy-gate-saturated', 'operator-resolution-saturated',
  'cross-phase-rewind-saturated',
]);
// FR-12: the ordinary (non-retry, non-rewind) source for each phase. A retry or rewind
// legitimately records an escalation source instead, so this is checked as "the ordinary
// source is the RIGHT ordinary source", never as the only admissible value.
const ORDINARY_TIER_SOURCE = {
  plan: 'contract.risk_level', build: 'contract.risk_level', test: 'contract.risk_level',
  review: 'contract.risk_level', document: 'review-risk-assess', ship: 'review-risk-assess',
  verify: 'review-risk-assess',
};
const CONTRACT_RISK_SOURCES = new Set(['contract.risk_level']);
// The writer contract's agent id (artifact-layout.md:147). NOTE: the golden fixture writes
// the bare role (`"planner"`), so the reference tree contradicts the writer contract; this
// validator follows the contract and the disagreement is recorded in FINDINGS.md.
const AGENT_OF = {
  plan: 'adws-planner', build: 'adws-builder', test: 'adws-tester', review: 'adws-reviewer',
  document: 'adws-documenter', ship: 'adws-shipper', verify: 'adws-verifier',
};

// SC-11/A3 (artifact-layout.md F-17 disposition; parity/provenance-fixtures/run-tests.js:17).
const PROV_MANDATORY = ['started_at', 'completed_at', 'wall_clock_s', 'agent', 'model_tier_requested'];
const PROV_UNAVAILABLE = ['model_id', 'cost_usd', 'tokens_in', 'tokens_out', 'tool_call_count'];
const PROV_OPTIONAL = ['elapsed_ms', 'timeout', 'cancel'];
const PROV_ALLOWED = new Set([...PROV_MANDATORY, ...PROV_UNAVAILABLE, ...PROV_OPTIONAL]);
const JOB_ID_RE = /^job_\d{8}_\d{4}$/;

const problems = [];
const flag = (where, msg) => problems.push(`${where}: ${msg}`);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v);
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { __err: e.message }; } }

// The MANDATORY half must be present and non-null; the structurally-unavailable half must be
// present and null (a dropped key and an uncaptured one must stay distinguishable); and
// wall_clock_s must be the real derivation of the two stamps, not an independent number.
function checkProvenance(where, prov, manifest) {
  if (prov === null || prov === undefined) {
    return flag(where, 'provenance is null — the obtainable half (started_at, completed_at, wall_clock_s, agent, model_tier_requested) is MANDATORY since SC-11/A3 (SKILL.md:192)');
  }
  if (!isObj(prov)) return flag(where, `provenance must be an object, got ${typeof prov}`);

  for (const k of Object.keys(prov)) {
    if (!PROV_ALLOWED.has(k)) flag(where, `provenance has non-canonical key "${k}"`);
  }
  for (const k of PROV_MANDATORY) {
    if (!Object.hasOwn(prov, k)) flag(where, `provenance is missing MANDATORY key "${k}"`);
    else if (prov[k] === null) flag(where, `provenance.${k} is null, but the obtainable half is MANDATORY and non-null`);
  }
  for (const k of PROV_UNAVAILABLE) {
    if (!Object.hasOwn(prov, k)) flag(where, `provenance omits "${k}" — unavailable fields are written null, never dropped`);
    else if (prov[k] !== null) flag(where, `provenance.${k} must be null in this runtime (structurally unavailable)`);
  }
  // types on the obtainable half
  if (Object.hasOwn(prov, 'started_at') && prov.started_at !== null && !isIso(prov.started_at)) flag(where, `provenance.started_at "${prov.started_at}" is not UTC YYYY-MM-DDTHH:MM:SSZ`);
  if (Object.hasOwn(prov, 'completed_at') && prov.completed_at !== null && !isIso(prov.completed_at)) flag(where, `provenance.completed_at "${prov.completed_at}" is not UTC YYYY-MM-DDTHH:MM:SSZ`);
  if (Object.hasOwn(prov, 'agent') && prov.agent !== null && (typeof prov.agent !== 'string' || !prov.agent)) flag(where, 'provenance.agent must be a non-empty string');
  if (Object.hasOwn(prov, 'model_tier_requested') && prov.model_tier_requested !== null && !TIERS.has(prov.model_tier_requested)) flag(where, `provenance.model_tier_requested "${prov.model_tier_requested}" is not a canonical tier`);
  if (Object.hasOwn(prov, 'wall_clock_s') && prov.wall_clock_s !== null) {
    if (!(Number.isFinite(prov.wall_clock_s) && prov.wall_clock_s > 0)) {
      flag(where, `provenance.wall_clock_s must be a finite number > 0, got ${JSON.stringify(prov.wall_clock_s)}`);
    } else if (isIso(prov.started_at) && isIso(prov.completed_at)) {
      const derived = (Date.parse(prov.completed_at) - Date.parse(prov.started_at)) / 1000;
      if (derived !== prov.wall_clock_s) flag(where, `provenance.wall_clock_s ${prov.wall_clock_s} != completed_at - started_at (${derived})`);
    }
  }
  for (const k of PROV_OPTIONAL) {
    if (!Object.hasOwn(prov, k) || prov[k] === null) continue;
    if (k === 'elapsed_ms' && !isNonNegInt(prov[k])) flag(where, 'provenance.elapsed_ms must be null|non-negative integer');
    if ((k === 'timeout' || k === 'cancel') && typeof prov[k] !== 'boolean') flag(where, `provenance.${k} must be null|boolean`);
  }
  // The manifest's own stamps and provenance's describe ONE dispatch. A writer that lets
  // them disagree has recorded two different runs in one file.
  if (manifest && isIso(manifest.started_at) && isIso(prov.started_at) && manifest.started_at !== prov.started_at) {
    flag(where, `provenance.started_at "${prov.started_at}" != phase_manifest.started_at "${manifest.started_at}"`);
  }
  if (manifest && isIso(manifest.completed_at) && isIso(prov.completed_at) && manifest.completed_at !== prov.completed_at) {
    flag(where, `provenance.completed_at "${prov.completed_at}" != phase_manifest.completed_at "${manifest.completed_at}"`);
  }
  if (manifest && typeof manifest.agent === 'string' && typeof prov.agent === 'string' && manifest.agent !== prov.agent) {
    flag(where, `provenance.agent "${prov.agent}" != phase_manifest.agent "${manifest.agent}"`);
  }
}

function checkRunManifest(jobDir, jobId) {
  const p = path.join(jobDir, 'run_manifest.json');
  const m = readJson(p);
  const w = 'run_manifest';
  if (m.__err) { flag(w, `unreadable: ${m.__err}`); return null; }
  const floor = ['schema_version', 'job_id', 'task_id', 'started_at', 'completed_at', 'final_status',
    'failure_reason', 'current_phase', 'output_mode', 'isolation_mode', 'worktree_path', 'branch_name',
    'model_tiers', 'cross_phase_rewinds', 'check_defect_repairs', 'operator_directed_rewinds',
    'carry_over', 'resumed_from'];
  for (const k of floor) if (!(k in m)) flag(w, `missing floor key "${k}" (artifact-layout.md lines 51-58)`);
  if (typeof m.schema_version !== 'string') flag(w, 'schema_version must be a string');
  if (m.job_id !== jobId) flag(w, `job_id "${m.job_id}" != dir basename "${jobId}"`);
  if (typeof m.task_id !== 'string' || !m.task_id) flag(w, 'task_id must be a non-empty string');
  if (!isIso(m.started_at)) flag(w, `started_at "${m.started_at}" not UTC YYYY-MM-DDTHH:MM:SSZ`);
  if (!(m.completed_at === null || isIso(m.completed_at))) flag(w, 'completed_at must be null or a UTC timestamp');
  if (!(m.final_status === null || FINAL_STATUSES.has(m.final_status))) flag(w, `final_status "${m.final_status}" not null|completed|failed|quarantined|canceled`);
  if (!(m.failure_reason === null || typeof m.failure_reason === 'string')) flag(w, 'failure_reason must be null|string');
  if (!PHASES.includes(m.current_phase)) flag(w, `current_phase "${m.current_phase}" not a phase name`);
  if (!ISOLATION.has(m.isolation_mode)) flag(w, `isolation_mode "${m.isolation_mode}" not worktree|worktree-resumed`);
  if (typeof m.worktree_path !== 'string') flag(w, 'worktree_path must be a string');
  if (typeof m.branch_name !== 'string') flag(w, 'branch_name must be a string');
  if (!isObj(m.model_tiers)) flag(w, 'model_tiers must be an object');
  else for (const ph of PHASES) {
    if (!(ph in m.model_tiers)) flag(w, `model_tiers missing "${ph}"`);
    else if (!TIERS.has(m.model_tiers[ph])) flag(w, `model_tiers.${ph} "${m.model_tiers[ph]}" not a canonical tier`);
  }
  if (!isObj(m.cross_phase_rewinds)) flag(w, 'cross_phase_rewinds must be an object');
  else for (const k of ['test', 'verify', 'review']) if (typeof m.cross_phase_rewinds[k] !== 'number') flag(w, `cross_phase_rewinds.${k} must be a number`);
  if (typeof m.check_defect_repairs !== 'number') flag(w, 'check_defect_repairs must be a number');
  if (!isObj(m.operator_directed_rewinds)) flag(w, 'operator_directed_rewinds must be an object');
  else for (const k of ['test', 'review']) if (typeof m.operator_directed_rewinds[k] !== 'number') flag(w, `operator_directed_rewinds.${k} must be a number`);
  if (!(m.carry_over === null || isObj(m.carry_over))) flag(w, 'carry_over must be null|object');
  if (!(m.resumed_from === null || isObj(m.resumed_from))) flag(w, 'resumed_from must be null|object');
  return m;
}

// An `attempt_n` DIRECTORY is not evidence. The scorer's own completeness rule requires a
// readable phase_output.json alongside the manifest (execution-report.js
// missingPhaseEvidence); a validator that certifies a tree missing one is certifying the
// exact shape that reached `completed` and was quarantined.
function checkPhaseOutput(jobDir, phase, attempt) {
  const p = path.join(jobDir, phase, `attempt_${attempt}`, 'phase_output.json');
  const w = `${phase}/attempt_${attempt}`;
  if (!fs.existsSync(p)) return flag(w, 'no phase_output.json — an attempt directory alone is not evidence');
  const o = readJson(p);
  if (o.__err) flag(w, `phase_output.json unreadable: ${o.__err}`);
}

function checkPhaseManifest(jobDir, phase, attempt, jobId) {
  const p = path.join(jobDir, phase, `attempt_${attempt}`, 'phase_manifest.json');
  const m = readJson(p);
  const w = `${phase}/attempt_${attempt}/phase_manifest`;
  if (m.__err) return flag(w, `unreadable: ${m.__err}`);
  const floor = ['phase', 'attempt', 'job_id', 'started_at', 'completed_at', 'agent', 'model_tier',
    'tier_input', 'gate_result', 'failure_reason', 'stability_gate', 'provenance'];
  for (const k of floor) if (!(k in m)) flag(w, `missing floor key "${k}" (artifact-layout.md lines 146-150)`);
  if (m.phase !== phase) flag(w, `phase "${m.phase}" != dir "${phase}"`);
  if (!Number.isInteger(m.attempt)) flag(w, `attempt must be an INTEGER, got ${JSON.stringify(m.attempt)} (${typeof m.attempt})`);
  else if (m.attempt !== attempt) flag(w, `attempt ${m.attempt} != dir attempt_${attempt}`);
  if (m.job_id !== jobId) flag(w, `job_id "${m.job_id}" != "${jobId}"`);
  if (!isIso(m.started_at)) flag(w, `started_at "${m.started_at}" not a UTC timestamp`);
  if (!isIso(m.completed_at)) flag(w, `completed_at "${m.completed_at}" not a UTC timestamp`);
  if (m.agent !== AGENT_OF[phase]) flag(w, `agent "${m.agent}" != "${AGENT_OF[phase]}" (artifact-layout.md:147 writes the full adws-… id)`);
  if (!TIERS.has(m.model_tier)) flag(w, `model_tier "${m.model_tier}" not a canonical tier`);
  if (!isObj(m.tier_input)) flag(w, 'tier_input must be an object {source, value}');
  else {
    if (!TIER_SOURCES.has(m.tier_input.source)) flag(w, `tier_input.source "${m.tier_input.source}" not in the documented enum`);
    else {
      // FR-12: an ORDINARY (non-escalated) attempt must name the right ordinary source for
      // its phase. Escalation sources are legitimate on a retry/rewind and are left alone;
      // naming contract risk where the contract says recomputed risk is the error this
      // catches, and vice versa.
      const ordinary = ORDINARY_TIER_SOURCE[phase];
      const isOrdinary = m.tier_input.source === 'contract.risk_level' || m.tier_input.source === 'review-risk-assess';
      if (isOrdinary && m.tier_input.source !== ordinary) {
        flag(w, `tier_input.source "${m.tier_input.source}" — FR-12 keys ${phase} to "${ordinary}"`);
      }
      if (CONTRACT_RISK_SOURCES.has(m.tier_input.source) && !['low', 'medium', 'high'].includes(m.tier_input.value)) {
        flag(w, `tier_input.value "${m.tier_input.value}" is not a risk level`);
      }
    }
    if (typeof m.tier_input.value !== 'string') flag(w, 'tier_input.value must be a string');
  }
  if (!GATE_RESULTS.has(m.gate_result)) flag(w, `gate_result "${m.gate_result}" not null|pass|fail|deferred`);
  if (!(m.failure_reason === null || typeof m.failure_reason === 'string')) flag(w, 'failure_reason must be null|string');
  if (!(m.stability_gate === null || isObj(m.stability_gate))) flag(w, 'stability_gate must be null|object');
  checkProvenance(w, m.provenance, m);
}

function main(argv) {
  const jobDir = argv[2] ? path.resolve(argv[2]) : null;
  if (!jobDir || !fs.existsSync(jobDir)) { process.stderr.write('Usage: node verify-canonical.js <jobDir>\n'); return 2; }
  const jobId = path.basename(jobDir);
  if (!JOB_ID_RE.test(jobId)) flag('job_id', `dir basename "${jobId}" does not match job_YYYYMMDD_NNNN (artifact-layout.md line 19)`);
  const run = checkRunManifest(jobDir, jobId);
  for (const phase of PHASES) {
    const pdir = path.join(jobDir, phase);
    if (!fs.existsSync(pdir)) continue; // validate whatever phases exist
    for (const ent of fs.readdirSync(pdir)) {
      const mm = /^attempt_(\d+)$/.exec(ent);
      if (mm) {
        checkPhaseManifest(jobDir, phase, Number(mm[1]), jobId);
        checkPhaseOutput(jobDir, phase, Number(mm[1]));
      }
    }
  }
  // A tree claiming completion must HAVE the seven phases it claims to have completed. The
  // per-phase loop above validates whatever exists and would otherwise say nothing about
  // what is absent — which is how the counterexample tree passed.
  if (run && run.final_status === 'completed') {
    for (const phase of PHASES) {
      if (!fs.existsSync(path.join(jobDir, phase, 'attempt_1'))) {
        flag('completion', `final_status is "completed" but ${phase} has no attempt_1`);
      }
    }
  }
  if (problems.length === 0) {
    process.stdout.write(`CANONICAL OK — ${jobId} conforms to the writer floor.\n`);
    return 0;
  }
  process.stdout.write(`CANONICAL FAIL — ${problems.length} violation(s) in ${jobId}:\n`);
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  return 1;
}
process.exitCode = main(process.argv);
