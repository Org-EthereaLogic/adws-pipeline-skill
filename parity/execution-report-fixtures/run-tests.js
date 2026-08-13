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
const { assertFixtureCoverage } = require('../_harness.js');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', 'adws-pipeline', 'scripts', 'execution-report.js');

const { CASES } = require('./cases.js');

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

// M-3a: the suite must not be able to SHRINK silently. `CASES` above and the fixture
// directories on disk are two independent sources for the same fact — cross-check them
// in BOTH directions, so deleting a fixture dir, or dropping its CASES entry, fails here
// instead of passing quietly with fewer tests. The banner counts printed by this file and
// by scripts/local-ci are narration; this is the assertion. (Same defect class as SC-5's
// F-27: a count no consumer compares is not a control. It cost the pipeline a criterion
// once; there is no reason to leave the identical hole in the harness that guards it.)
{
  const onDisk = fs.readdirSync(__dirname, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const declared = CASES.map((c) => c.name).sort();
  failures += assertFixtureCoverage({ declared, onDisk, unit: 'fixture dir' });
}

function check(label, condition, actual, expected) {
  if (!condition) {
    failures += 1;
    results.push(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

for (const testCase of CASES) {
  const jobDir = path.join(__dirname, testCase.name, 'artifacts', testCase.jobId);
  const before = results.length + failures;

  if (testCase.skipIfRoot && IS_ROOT) {
    console.log(`SKIP ${testCase.name} — running as root; mode 000 is readable`);
    continue;
  }

  // SC-11/A1: apply fixture-declared modes, and ALWAYS revert them. A crash between
  // here and the finally would leave an unreadable file in the working tree.
  const restoreModes = [];
  if (testCase.chmod) {
    for (const [rel, mode] of Object.entries(testCase.chmod)) {
      const target = path.join(jobDir, rel);
      restoreModes.push([target, fs.statSync(target).mode & 0o777]);
      fs.chmodSync(target, mode);
    }
  }
  try {

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
      out1.json.schema_version === '1.4.0',
      out1.json.schema_version,
      '1.4.0'
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
    // SC-16/F-88b: a decision alone under-specifies. Two different defects can both be
    // QUARANTINE / exit 2 while telling the operator opposite things about their run, so
    // where the WORDS are the deliverable, pin the words.
    if (testCase.expectReason) {
      check(
        `${testCase.name} decision_reason contains "${testCase.expectReason}"`,
        typeof out1.json.decision_reason === 'string' &&
          out1.json.decision_reason.includes(testCase.expectReason),
        out1.json.decision_reason,
        `a reason containing "${testCase.expectReason}"`
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

  } finally {
    for (const [target, mode] of restoreModes) fs.chmodSync(target, mode);
  }
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
