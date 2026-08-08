#!/usr/bin/env node
'use strict';

/**
 * run-tests.js — runs the standalone entropy-gate CLI (X-2 port) against each
 * JSONL fixture and asserts action, band, watch flag, and exit code. Each
 * fixture is run twice and the full stdout compared byte-for-byte to confirm
 * deterministic output.
 *
 * Band-probing provenance (drift-sentinel canonical mode, integer
 * parse_failures counts): [0,0,0] → SAFE, [1,2,3] → WATCH, [1,2,4] → WARN,
 * [0,1,2,3] → COLLAPSE.
 *
 * Usage: node run-tests.js
 */

const fs = require('fs');
const path = require('path');
const { assertFixtureCoverage, listBySuffix } = require('../_harness.js');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', 'adws-pipeline', 'scripts', 'entropy-gate.js');

const CASES = [
  {
    name: 'empty.jsonl', // (a) zero lines → no signal, gate stands open
    exit_code: 0,
    action: 'proceed',
    band: null,
    watch: false,
    history_length: 0,
  },
  {
    name: 'safe_all_zero.jsonl', // (b) every attempt parsed clean → SAFE
    exit_code: 0,
    action: 'proceed',
    band: 'SAFE',
    watch: false,
    history_length: 3,
  },
  {
    name: 'watch_rising.jsonl', // (c) steady linear rise 1,2,3 → WATCH
    exit_code: 0,
    action: 'proceed',
    band: 'WATCH',
    watch: true,
    history_length: 3,
  },
  {
    name: 'warn_accelerating.jsonl', // (d) accelerating 1,2,4 → WARN → escalate one tier
    exit_code: 0,
    action: 'escalate',
    band: 'WARN',
    watch: false,
    history_length: 3,
  },
  {
    name: 'collapse_runaway.jsonl', // (e) runaway from zero 0,1,2,3 → COLLAPSE → halt
    // NOTE: zero-anchored history — forbidden by the SC-1.b recording rule, kept as
    // a fail-safe robustness case (the gate must still halt on it if ever recorded).
    exit_code: 0,
    action: 'halt',
    band: 'COLLAPSE',
    watch: false,
    history_length: 4,
  },
  {
    name: 'collapse_compliant.jsonl', // (e2) recording-rule-compliant 1,2,8 → COLLAPSE → halt
    exit_code: 0,
    action: 'halt',
    band: 'COLLAPSE',
    watch: false,
    history_length: 3,
  },
  {
    name: 'malformed_line.jsonl', // (f) broken JSON on line 2 → input error
    exit_code: 3,
  },
];

function runCli(fixture) {
  const res = spawnSync(process.execPath, [CLI, path.join(__dirname, fixture)], { encoding: 'utf8' });
  if (res.error) throw res.error;
  return res;
}

let failures = 0;
const notes = [];

// M-3a: cross-check the declared CASES against the fixtures on disk in both directions,
// so the suite cannot shrink silently. See the same block in
// parity/execution-report-fixtures/run-tests.js for the reasoning.
{
  const onDisk = listBySuffix(__dirname, '.jsonl');
  const declared = CASES.map((c) => c.name).sort();
  failures += assertFixtureCoverage({ declared, onDisk, unit: 'fixture file' });
}

function check(label, condition, actual, expected) {
  if (!condition) {
    failures += 1;
    notes.push(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

for (const testCase of CASES) {
  const before = failures;

  const run1 = runCli(testCase.name);
  check(`${testCase.name} exit code`, run1.status === testCase.exit_code, run1.status, testCase.exit_code);

  if (testCase.exit_code === 0) {
    let out = null;
    try {
      out = JSON.parse(run1.stdout);
    } catch (err) {
      failures += 1;
      notes.push(`  FAIL ${testCase.name} stdout: not valid JSON: ${err.message}`);
    }
    if (out) {
      check(`${testCase.name} action`, out.action === testCase.action, out.action, testCase.action);
      check(`${testCase.name} band`, out.band === testCase.band, out.band, testCase.band);
      check(`${testCase.name} watch`, out.watch === testCase.watch, out.watch, testCase.watch);
      check(
        `${testCase.name} history_length`,
        out.history_length === testCase.history_length,
        out.history_length,
        testCase.history_length
      );
      // Output-shape contract: exactly these keys, in this order.
      const expectedKeys = ['action', 'band', 'ctm', 'xi', 'rate', 'accel', 'history_length', 'watch'];
      check(
        `${testCase.name} output keys`,
        JSON.stringify(Object.keys(out)) === JSON.stringify(expectedKeys),
        Object.keys(out),
        expectedKeys
      );
    }
  } else {
    check(`${testCase.name} no stdout on error`, run1.stdout === '', run1.stdout, '');
    check(
      `${testCase.name} stderr names gate`,
      run1.stderr.startsWith('adws-entropy-gate:'),
      run1.stderr.split('\n')[0],
      'adws-entropy-gate: ...'
    );
  }

  // Determinism: run the same fixture again and compare stdout byte-for-byte.
  const run2 = runCli(testCase.name);
  check(`${testCase.name} rerun exit code`, run2.status === run1.status, run2.status, run1.status);
  check(`${testCase.name} deterministic stdout`, run2.stdout === run1.stdout, 'diff', 'identical stdout');

  const passed = failures === before;
  console.log(
    `${passed ? 'PASS' : 'FAIL'} ${testCase.name} — expected exit=${testCase.exit_code}` +
      (testCase.exit_code === 0 ? ` action=${testCase.action} band=${testCase.band} watch=${testCase.watch}` : '') +
      `, cli exit=${run1.status}`
  );
  for (const line of notes.splice(0)) console.log(line);
}

if (failures > 0) {
  console.log(`\n${failures} assertion(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll fixtures passed (${CASES.length}/${CASES.length}), deterministic across re-runs.`);
}
