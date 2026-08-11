#!/usr/bin/env node
/*
 * mk-risk-trace.js — SPIKE mock helper. THROWAWAY.
 *
 * Usage: node mk-risk-trace.js <build/attempt_1/phase_output.json> <reviewAttemptDir>
 * Exit 0 = trace written; exit 4 = the validator could not assess this build output;
 * exit 5 = the review attempt ALREADY records one, so there is nothing to supply.
 *
 * Exit 5 is not a nicety. The first cut wrote unconditionally, and the ingest matrix caught
 * it overwriting the review-risk-assess traces of quarantine_trace_mismatch{,_inverse,_case}
 * — whose whole defect IS a forged verdict in that exact file. Three fixtures silently
 * turned clean and promoted. A helper that supplies missing evidence must never be able to
 * replace recorded evidence.
 *
 * WHY THIS EXISTS. FR-12 keys the document/ship/verify tiers to the risk_level that
 * `review-risk-assess` recomputes from the actual change set, and phase-gates.md line 33
 * makes "risk recorded" part of the review gate itself. The controller reads that risk from
 * the review attempt's recorded skill_trace and REFUSES to substitute contract risk (that
 * would mislabel tier_input.source). The scorer fixtures are minimal — none records the
 * trace — so a driver that replays fixture evidence has to supply what a real review phase
 * would have produced.
 *
 * It is NOT a fabricated verdict: this runs the REAL
 * adws-pipeline/scripts/validators/review-risk-assess.js on the real build output and
 * TRANSCRIBES its stdout, per the artifact-layout.md rule that a skill_trace wraps the
 * validator CLI's stdout and that `rubric_result` is exactly the value the validator
 * printed. Producing this evidence is the orchestrator's step-2 job in the real design
 * (SKILL.md "Validate"); the step-1 controller does not run validators, so the driver does.
 *
 * The one adaptation: the validator's documented input names each entry `file_path` while
 * the fixtures' build outputs use `path`. The key is translated, the values are not.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VALIDATOR = path.resolve(__dirname, '../../adws-pipeline/scripts/validators/review-risk-assess.js');
const SKILL_DIR = 'review-risk-assess';

const [buildOutputPath, reviewAttemptDir] = process.argv.slice(2);
if (!buildOutputPath || !reviewAttemptDir) {
  process.stderr.write('Usage: node mk-risk-trace.js <build phase_output.json> <reviewAttemptDir>\n');
  process.exit(2);
}

function nowUtc() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }

const destTrace = path.join(reviewAttemptDir, 'skills', SKILL_DIR, 'skill_trace.json');
if (fs.existsSync(destTrace)) {
  process.stderr.write(`mk-risk-trace: ${destTrace} already exists — recorded evidence is never overwritten\n`);
  process.exit(5);
}

let build;
try { build = JSON.parse(fs.readFileSync(buildOutputPath, 'utf8')); } catch (e) {
  process.stderr.write(`mk-risk-trace: unreadable build output: ${e.message}\n`);
  process.exit(4);
}
const files = Array.isArray(build && build.files_changed) ? build.files_changed : null;
if (!files) {
  process.stderr.write('mk-risk-trace: build output has no files_changed array\n');
  process.exit(4);
}
const input = {
  build_output: {
    files_changed: files.map((f) => ({ file_path: (f && (f.file_path || f.path)) || undefined, action: f && f.action })),
  },
};

const startedAt = nowUtc();
const res = spawnSync('node', [VALIDATOR, '-'], { input: JSON.stringify(input), encoding: 'utf8' });
if (res.status !== 0) {
  process.stderr.write(`mk-risk-trace: validator exited ${res.status}: ${res.stderr}`);
  process.exit(4);
}
let output;
try { output = JSON.parse(res.stdout); } catch (e) {
  process.stderr.write(`mk-risk-trace: validator stdout was not JSON: ${e.message}\n`);
  process.exit(4);
}
if (!['low', 'medium', 'high'].includes(output.risk_level)) {
  // Not assessable -> no risk to record -> a conformant review gate cannot pass. Callers
  // treat exit 4 as "this fixture cannot be driven through a conformant review gate".
  process.stderr.write(`mk-risk-trace: validator recomputed no usable risk_level (rubric_result=${output.rubric_result})\n`);
  process.exit(4);
}

const trace = {
  skill_id: 'review.risk_assess', // the validator's own manifest id
  version: '2.0.0',
  started_at: startedAt,
  completed_at: nowUtc(),
  rubric_result: output.rubric_result, // TRANSCRIBED, never retyped (SC-8/F-55)
  latency_ms: 0,
  error: null,
  output,
};
fs.mkdirSync(path.dirname(destTrace), { recursive: true });
fs.writeFileSync(destTrace, JSON.stringify(trace, null, 2) + '\n');
process.stdout.write(JSON.stringify({ risk_level: output.risk_level, rubric_result: output.rubric_result }) + '\n');
