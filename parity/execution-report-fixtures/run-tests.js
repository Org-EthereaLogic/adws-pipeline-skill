#!/usr/bin/env node
'use strict';

/**
 * run-tests.js — runs the standalone execution-report CLI against each fixture
 * job tree and asserts decision, warn_flag, and exit code. Each fixture is run
 * twice to confirm deterministic output (generated_at excluded from the
 * comparison).
 *
 * Usage: node run-tests.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', 'adws-pipeline', 'scripts', 'execution-report.js');

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
  },
  {
    name: 'quarantine',
    jobId: 'job-9a6b2e',
    decision: 'QUARANTINE',
    warn_flag: false,
    exit_code: 2,
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
];

function runCli(jobDir) {
  const res = spawnSync(process.execPath, [CLI, jobDir], { encoding: 'utf8' });
  if (res.error) throw res.error;
  return res;
}

function readOutputs(jobDir) {
  const json = JSON.parse(fs.readFileSync(path.join(jobDir, 'execution_report.json'), 'utf8'));
  const md = fs.readFileSync(path.join(jobDir, 'execution_report.md'), 'utf8');
  return { json, md };
}

function stripVolatile({ json, md }) {
  const j = { ...json, generated_at: '<generated_at>' };
  const m = md
    .split('\n')
    .map((line) => (line.startsWith('- **Generated at:**') ? '- **Generated at:** <generated_at>' : line))
    .join('\n');
  return { json: JSON.stringify(j, null, 2), md: m };
}

let failures = 0;
const results = [];

function check(label, condition, actual, expected) {
  if (!condition) {
    failures += 1;
    results.push(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

for (const testCase of CASES) {
  const jobDir = path.join(__dirname, testCase.name, 'artifacts', testCase.jobId);
  const before = results.length + failures;

  const run1 = runCli(jobDir);
  check(`${testCase.name} exit code`, run1.status === testCase.exit_code, run1.status, testCase.exit_code);

  let out1 = null;
  try {
    out1 = readOutputs(jobDir);
  } catch (err) {
    failures += 1;
    results.push(`  FAIL ${testCase.name} report files: ${err.message}`);
  }

  if (out1) {
    check(`${testCase.name} decision`, out1.json.decision === testCase.decision, out1.json.decision, testCase.decision);
    check(`${testCase.name} warn_flag`, out1.json.warn_flag === testCase.warn_flag, out1.json.warn_flag, testCase.warn_flag);
    check(`${testCase.name} json exit_code`, out1.json.exit_code === testCase.exit_code, out1.json.exit_code, testCase.exit_code);
    check(
      `${testCase.name} schema_version`,
      out1.json.schema_version === '1.2.0',
      out1.json.schema_version,
      '1.2.0'
    );
    // expectGate accepts one {key, result} or an array of them.
    for (const expected of [].concat(testCase.expectGate || [])) {
      const gate = out1.json.gates.find((g) => g.gate === expected.key);
      check(
        `${testCase.name} gate ${expected.key}`,
        gate && gate.result === expected.result,
        gate && gate.result,
        expected.result
      );
    }
    if (testCase.expectWarning) {
      const found =
        Array.isArray(out1.json.warnings) &&
        out1.json.warnings.some((w) => typeof w === 'string' && w.includes(testCase.expectWarning));
      check(
        `${testCase.name} warning contains "${testCase.expectWarning}"`,
        found,
        out1.json.warnings,
        `a warning containing "${testCase.expectWarning}"`
      );
    }

    // Determinism: re-run against the same tree (which now also contains the
    // previously written reports) and compare everything except generated_at.
    const run2 = runCli(jobDir);
    check(`${testCase.name} rerun exit code`, run2.status === testCase.exit_code, run2.status, testCase.exit_code);
    const out2 = readOutputs(jobDir);
    const s1 = stripVolatile(out1);
    const s2 = stripVolatile(out2);
    check(`${testCase.name} deterministic json`, s1.json === s2.json, 'diff', 'identical (ignoring generated_at)');
    check(`${testCase.name} deterministic md`, s1.md === s2.md, 'diff', 'identical (ignoring generated_at)');
  }

  const passed = results.length + failures === before;
  console.log(
    `${passed ? 'PASS' : 'FAIL'} ${testCase.name} — expected ${testCase.decision} warn_flag=${testCase.warn_flag} exit=${testCase.exit_code}, cli exit=${run1.status}`
  );
  for (const line of results.splice(0)) console.log(line);
}

// CLI error path: missing directory must exit 3.
{
  const res = runCli(path.join(__dirname, 'no_such_fixture', 'artifacts', 'job-none'));
  const ok = res.status === 3;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} cli_error_missing_dir — expected exit=3, cli exit=${res.status}`);
}

if (failures > 0) {
  console.log(`\n${failures} assertion(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll fixtures passed (${CASES.length}/${CASES.length} verdicts + CLI error path), deterministic across re-runs.`);
}
