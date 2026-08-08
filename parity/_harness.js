'use strict';

/**
 * _harness.js — shared primitives for the parity/* test runners (M-5b/B1).
 *
 * Extracted because `check()` was written four times and the M-3a coverage cross-check
 * three. A helper duplicated N times is N places a fix can miss —
 * the same argument that put `cli-block-lint.mjs` and `agent-blocks-lint.mjs` in the gate,
 * applied to the harness that gates everything else.
 *
 * INVARIANT: adopting this module changes no suite's printed output. The extraction was
 * verified by capturing all six runners' stdout before and after and diffing.
 *
 * Not subject to NFR-4: `checkRequires` in run-parity.js scans only
 * adws-pipeline/scripts/validators/*.js, and requires-lint.mjs targets only entropy-gate.js
 * and execution-report.js. This file is dev-only harness code and never ships with the
 * skill — but it is covered by `node --check` in the gate's syntax floor.
 *
 * Deliberately NOT extracted: the per-suite epilogue. All five copies look alike but each
 * names what it tested ("21/21 verdicts + CLI error path", "invalid shapes rejected",
 * "deterministic across re-runs"). Routing them through one helper would either change
 * those messages — breaking this module's own invariant — or need enough parameters to
 * stop being a simplification. Same for the `runCli` wrappers, which now differ in
 * meaningful ways (stdin, env scrubbing, maxBuffer).
 */

const fs = require('fs');

/**
 * A failure counter plus the deferred-note buffer every runner had written by hand.
 * `check()` records a failure and queues a message; `drain()` returns and clears the
 * queued messages so a runner can print them under its own per-case heading.
 */
function makeRecorder() {
  const state = { failures: 0, assertions: 0, notes: [] };
  return {
    state,
    get failures() {
      return state.failures;
    },
    check(label, condition, actual, expected) {
      state.assertions += 1;
      if (!condition) {
        state.failures += 1;
        state.notes.push(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        return false;
      }
      return true;
    },
    /** Record a failure whose message is already composed. */
    fail(message) {
      state.assertions += 1;
      state.failures += 1;
      state.notes.push(message);
    },
    drain() {
      return state.notes.splice(0);
    },
  };
}

/**
 * M-3a, both directions: a declared CASES list and the files on disk must agree, so that
 * neither an unrun fixture nor a fixtureless case can hide. Returns the number of
 * discrepancies (0 when they agree) and prints one line per discrepancy.
 *
 * This is the check F-41 added after suite sizes were narrated but never asserted. It was
 * then copy-pasted into three runners, two of which say so in a comment.
 */
function assertFixtureCoverage({ declared, onDisk, unit = 'fixture file', declaredUnit = 'CASES entr(ies)' }) {
  let problems = 0;
  for (const name of onDisk) {
    if (!declared.includes(name)) {
      problems += 1;
      console.log(`FAIL fixture coverage: "${name}" exists but no CASES entry runs it`);
    }
  }
  for (const name of declared) {
    if (!onDisk.includes(name)) {
      problems += 1;
      console.log(`FAIL fixture coverage: CASES entry "${name}" has no ${unit}`);
    }
  }
  if (problems === 0) {
    console.log(`PASS fixture coverage — ${onDisk.length} ${unit}(s) ↔ ${declared.length} ${declaredUnit}`);
  }
  return problems;
}

/** Read a directory's entries matching a suffix, sorted — the shape every runner wants. */
function listBySuffix(dir, suffix) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .sort();
}

/**
 * Create a scratch directory with mkdtempSync and always remove it. Never a predictable
 * os.tmpdir() path: `adws-parity-cli-input-<pid>.json` was a symlink-overwrite vector at
 * the privilege of whoever ran the gate (F-67).
 */
function withScratchDir(prefix, fn) {
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { makeRecorder, assertFixtureCoverage, listBySuffix, withScratchDir };
