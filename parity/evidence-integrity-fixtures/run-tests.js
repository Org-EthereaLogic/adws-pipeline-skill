#!/usr/bin/env node
'use strict';

/**
 * run-tests.js — runs the standalone evidence-integrity CLI (SC-15/F-84b) against each
 * JSON fixture and asserts the verdict, the counts, and the exact violation reasons.
 * Every fixture is run twice and stdout compared byte-for-byte (determinism, AC-3.3).
 *
 * The suite exists because `references/artifact-layout.md` rule 9 was prose from SC-13
 * until a live run wrote `"performed_at": "--"` into a reproduction record and the tree
 * passed every gate the skill has. `placeholder_dash.json` is that record's shape.
 *
 * Usage: node run-tests.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { assertFixtureCoverage, listBySuffix, withScratchDir } = require('../_harness.js');

const CLI = path.join(__dirname, '..', '..', 'adws-pipeline', 'scripts', 'evidence-integrity.js');

const CASES = [
  {
    name: 'clean.json', // (a) every stamp real, nested and in arrays — the healthy tree
    exit_code: 0,
    rubric_result: 'pass',
    fields_checked: 4,
    reasons: [],
    warn_reasons: [],
  },
  {
    name: 'null_is_honest.json', // (b) null is an absence, not a claim: never a violation
    exit_code: 0,
    rubric_result: 'pass',
    fields_checked: 3,
    reasons: [],
    warn_reasons: [],
  },
  {
    name: 'midnight_warn.json', // (c) rule 9 says T00:00:00Z "reads as fabricated" —
    // reading-as is a heuristic, so warn (SC-8 house rule), and the run still proceeds
    exit_code: 0,
    rubric_result: 'warn',
    fields_checked: 2,
    reasons: [],
    warn_reasons: ['midnight_stamp'],
  },
  {
    name: 'placeholder_dash.json', // (d) THE LIVE DEFECT: job_20260812_0001's "--",
    // nested two levels below the manifest root where no top-level check would see it
    exit_code: 1,
    rubric_result: 'fail',
    fields_checked: 2,
    reasons: ['placeholder'],
    warn_reasons: [],
  },
  {
    name: 'placeholder_tokens.json', // (e) the rest of the family, trimmed and case-folded
    exit_code: 1,
    rubric_result: 'fail',
    fields_checked: 4,
    reasons: ['placeholder', 'placeholder', 'placeholder', 'placeholder'],
    warn_reasons: [],
  },
  {
    name: 'malformed_shape.json', // (f) valid ISO-8601, NOT rule 9's shape. The rule
    // mandates one command's output; accepting the standard's other spellings would let
    // a stamp from some other source read as compliant
    exit_code: 1,
    rubric_result: 'fail',
    fields_checked: 4,
    reasons: ['malformed', 'malformed', 'malformed', 'malformed'],
    warn_reasons: [],
  },
  {
    name: 'wrong_type.json', // (g) a number, a boolean, an object — a fact, so fail
    exit_code: 1,
    rubric_result: 'fail',
    fields_checked: 3,
    reasons: ['wrong_type', 'wrong_type', 'wrong_type'],
    warn_reasons: [],
  },
  {
    name: 'not_a_real_instant.json', // (h) right shape, impossible date. Feb 31 and hour
    // 25 both match the regex; only the round-trip catches them
    exit_code: 1,
    rubric_result: 'fail',
    fields_checked: 2,
    reasons: ['not_a_real_instant', 'not_a_real_instant'],
    warn_reasons: [],
  },
  {
    name: 'completed_before_started.json', // (i) both stamps well-formed, the pair is not
    exit_code: 1,
    rubric_result: 'fail',
    fields_checked: 2,
    reasons: ['completed_before_started'],
    warn_reasons: [],
  },
];

function runCli(target) {
  const res = spawnSync(process.execPath, [CLI, target], { encoding: 'utf8' });
  if (res.error) throw res.error;
  return res;
}

let failures = 0;
const notes = [];

function check(label, condition, actual, expected) {
  if (!condition) {
    failures += 1;
    notes.push(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// M-3a: cross-check the declared CASES against the fixtures on disk in both directions,
// so the suite cannot shrink silently.
{
  const onDisk = listBySuffix(__dirname, '.json');
  const declared = CASES.map((c) => c.name).sort();
  failures += assertFixtureCoverage({ declared, onDisk, unit: 'fixture file' });
}

for (const testCase of CASES) {
  const before = failures;
  const target = path.join(__dirname, testCase.name);

  const run1 = runCli(target);
  check(`${testCase.name} exit code`, run1.status === testCase.exit_code, run1.status, testCase.exit_code);

  let out = null;
  try {
    out = JSON.parse(run1.stdout);
  } catch (err) {
    failures += 1;
    notes.push(`  FAIL ${testCase.name} stdout: not valid JSON: ${err.message}`);
  }
  if (out) {
    check(`${testCase.name} rubric_result`, out.rubric_result === testCase.rubric_result, out.rubric_result, testCase.rubric_result);
    check(`${testCase.name} files_scanned`, out.files_scanned === 1, out.files_scanned, 1);
    check(`${testCase.name} fields_checked`, out.fields_checked === testCase.fields_checked, out.fields_checked, testCase.fields_checked);

    const reasons = out.violations.map((v) => v.reason).sort();
    const expectedReasons = testCase.reasons.slice().sort();
    check(`${testCase.name} violation reasons`, JSON.stringify(reasons) === JSON.stringify(expectedReasons), reasons, expectedReasons);

    const warnReasons = out.warnings.map((w) => w.reason).sort();
    const expectedWarnReasons = testCase.warn_reasons.slice().sort();
    check(`${testCase.name} warning reasons`, JSON.stringify(warnReasons) === JSON.stringify(expectedWarnReasons), warnReasons, expectedWarnReasons);

    // Every violation must name where it is. A report that says a tree is dirty without
    // saying which field is not actionable evidence.
    const located = out.violations.every((v) => typeof v.pointer === 'string' && v.pointer.length > 0);
    check(`${testCase.name} every violation carries a pointer`, located, out.violations.map((v) => v.pointer), 'non-empty pointers');

    const expectedKeys = ['rubric_result', 'files_scanned', 'fields_checked', 'violations', 'warnings'];
    check(
      `${testCase.name} output keys`,
      JSON.stringify(Object.keys(out)) === JSON.stringify(expectedKeys),
      Object.keys(out),
      expectedKeys
    );
  }

  const run2 = runCli(target);
  check(`${testCase.name} deterministic stdout`, run2.stdout === run1.stdout, 'differs', 'byte-identical');

  console.log(`${failures === before ? 'PASS' : 'FAIL'} ${testCase.name}`);
  for (const note of notes.splice(0)) console.log(note);
}

// Directory walk: the CLI's real invocation is against artifacts/{jobId}/, so the
// recursion, the unparseable-file path and the stable file ordering need their own case.
// Built in a scratch dir rather than committed, because a deliberately-broken .json in
// the repo is a trap for every other tool that globs for JSON.
{
  const before = failures;
  withScratchDir('adws-evidence-integrity-', (dir) => {
    fs.mkdirSync(path.join(dir, 'test', 'attempt_1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'run_manifest.json'), JSON.stringify({ started_at: '2026-08-12T04:00:00Z' }));
    fs.writeFileSync(path.join(dir, 'test', 'attempt_1', 'phase_manifest.json'), JSON.stringify({ performed_at: '--' }));
    fs.writeFileSync(path.join(dir, 'test', 'attempt_1', 'broken.json'), '{ not json');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored: not a .json file');

    const run = runCli(dir);
    check('directory walk exit code', run.status === 1, run.status, 1);
    const out = JSON.parse(run.stdout);
    check('directory walk files_scanned', out.files_scanned === 3, out.files_scanned, 3);
    const reasons = out.violations.map((v) => v.reason).sort();
    check(
      'directory walk finds both the placeholder and the unparseable file',
      JSON.stringify(reasons) === JSON.stringify(['placeholder', 'unparseable_json']),
      reasons,
      ['placeholder', 'unparseable_json']
    );
    const files = out.violations.map((v) => v.file);
    check(
      'directory walk reports repo-relative paths',
      files.every((f) => !path.isAbsolute(f)),
      files,
      'relative paths'
    );
    check('directory walk deterministic', runCli(dir).stdout === run.stdout, 'differs', 'byte-identical');
  });
  console.log(`${failures === before ? 'PASS' : 'FAIL'} directory walk (scratch)`);
  for (const note of notes.splice(0)) console.log(note);
}

// CLI error path: no argument, and a path that does not exist. Both are input errors
// (exit 3), distinct from "scanned it and it was dirty" (exit 1). A caller that cannot
// tell those apart will read a typo as a clean tree.
{
  const before = failures;
  const noArg = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  check('no argument exits 3', noArg.status === 3, noArg.status, 3);
  check('no argument prints nothing on stdout', noArg.stdout === '', noArg.stdout, '');

  const missing = runCli(path.join(__dirname, 'does-not-exist'));
  check('missing path exits 3', missing.status === 3, missing.status, 3);
  check('missing path prints nothing on stdout', missing.stdout === '', missing.stdout, '');

  console.log(`${failures === before ? 'PASS' : 'FAIL'} CLI error path`);
  for (const note of notes.splice(0)) console.log(note);
}

if (failures > 0) {
  console.log(`\nFAILED — ${failures} assertion(s) across ${CASES.length} fixtures + directory walk + CLI error path`);
  process.exit(1);
}
console.log(`\nOK — ${CASES.length} verdicts + directory walk + CLI error path, deterministic across re-runs`);
