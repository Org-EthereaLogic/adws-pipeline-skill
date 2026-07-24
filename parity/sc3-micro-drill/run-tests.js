#!/usr/bin/env node
'use strict';

/**
 * Reproducible SC-3 A1/A2/A3 contract micro-drill.
 *
 * Uses a real temporary Git repository and executable check to demonstrate:
 * 1. a valid pre-change RED for the right reason;
 * 2. a missing-runtime baseline becoming gate_weak, never verified;
 * 3. a code-classified failure producing a fresh immutable corrections.json;
 * 4. a corrected build passing while the corrections artifact stays unchanged.
 *
 * This is a deterministic contract drill, not a seven-phase autonomous ADWS run.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let failures = 0;

function check(label, condition, actual, expected) {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function runScratchGit(args, cwd) {
  const env = { ...process.env };
  [
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_CONFIG',
    'GIT_CONFIG_COUNT',
    'GIT_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_PREFIX',
    'GIT_QUARANTINE_PATH',
    'GIT_WORK_TREE',
  ].forEach((name) => delete env[name]);
  return spawnSync('git', args, { cwd, encoding: 'utf8', env });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function resolveFalsifiabilityPolicy(testPolicy, falsifiability) {
  if (testPolicy === 'required' && falsifiability === false) {
    return { accepted: false, runBaseline: false };
  }
  return {
    accepted: true,
    runBaseline: testPolicy === 'required' || falsifiability === true,
  };
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'adws-sc3-drill-'));

try {
  const requiredOptOut = resolveFalsifiabilityPolicy('required', false);
  const requiredDefault = resolveFalsifiabilityPolicy('required', undefined);
  const bestEffortOptIn = resolveFalsifiabilityPolicy('best-effort', true);
  const bestEffortDefault = resolveFalsifiabilityPolicy('best-effort', false);
  check('required + false rejected at intake', requiredOptOut.accepted === false, requiredOptOut, {
    accepted: false,
  });
  check('required default runs baseline', requiredDefault.runBaseline === true, requiredDefault, {
    runBaseline: true,
  });
  check('best-effort + true runs baseline', bestEffortOptIn.runBaseline === true, bestEffortOptIn, {
    runBaseline: true,
  });
  check('best-effort + false does not force baseline', bestEffortDefault.runBaseline === false, bestEffortDefault, {
    runBaseline: false,
  });

  const artifacts = path.join(scratch, 'artifacts', 'job_sc3_micro');
  const correctionsPath = path.join(artifacts, 'build', 'attempt_2', 'corrections.json');
  fs.mkdirSync(path.dirname(correctionsPath), { recursive: true });

  fs.writeFileSync(path.join(scratch, 'feature.txt'), 'legacy\n');
  fs.writeFileSync(
    path.join(scratch, 'check.js'),
    [
      "'use strict';",
      "const fs = require('fs');",
      "const actual = fs.readFileSync('feature.txt', 'utf8').trim();",
      "if (actual !== 'target') {",
      "  console.error(`assertion failed: expected target, got ${actual}`);",
      '  process.exit(1);',
      '}',
      '',
    ].join('\n')
  );

  check('scratch git init', runScratchGit(['init', '-q'], scratch).status === 0, 'git init failed', 0);
  runScratchGit(['config', 'user.name', 'SC3 Drill'], scratch);
  runScratchGit(['config', 'user.email', 'sc3-drill@example.invalid'], scratch);
  runScratchGit(['config', 'commit.gpgsign', 'false'], scratch);
  runScratchGit(['add', 'feature.txt', 'check.js'], scratch);
  check(
    'baseline commit',
    runScratchGit(['commit', '-q', '-m', 'baseline'], scratch).status === 0,
    'git commit failed',
    0
  );

  const baseline = run(process.execPath, ['check.js'], scratch);
  const baselineReason =
    baseline.status === 1 && baseline.stderr.includes('assertion failed')
      ? 'assertion-failed-runtime-present'
      : 'collection-error';
  check('valid pre-change RED', baselineReason === 'assertion-failed-runtime-present', baselineReason, 'assertion-failed-runtime-present');

  const missingRuntime = run('__adws_sc3_missing_runtime__', [], scratch);
  const missingReason = missingRuntime.error && missingRuntime.error.code === 'ENOENT' ? 'not-run' : 'collection-error';
  const missingVerdict = missingReason === 'not-run' ? 'gate_weak' : 'verified';
  check('NOT-RUN baseline is gate_weak', missingVerdict === 'gate_weak', missingVerdict, 'gate_weak');

  fs.writeFileSync(path.join(scratch, 'feature.txt'), 'wrong\n');
  const firstPostChange = run(process.execPath, ['check.js'], scratch);
  check('first build fails post-change check', firstPostChange.status === 1, firstPostChange.status, 1);

  const corrections = {
    source_attempt: 'test/attempt_1',
    corrections: [
      {
        check_id: 'feature-target',
        criterion: 'feature.txt contains target',
        expected: 'target',
        actual: 'wrong',
        path: 'feature.txt',
        classification: 'code',
      },
    ],
  };
  fs.writeFileSync(correctionsPath, `${JSON.stringify(corrections, null, 2)}\n`);
  const beforeHash = sha256(correctionsPath);

  fs.writeFileSync(path.join(scratch, 'feature.txt'), 'target\n');
  const correctedPostChange = run(process.execPath, ['check.js'], scratch);
  const afterHash = sha256(correctionsPath);

  check('corrected build passes', correctedPostChange.status === 0, correctedPostChange.status, 0);
  check('corrections.json remains immutable', afterHash === beforeHash, afterHash, beforeHash);
  check(
    'corrections.json is fresh attempt input',
    correctionsPath.endsWith(path.join('build', 'attempt_2', 'corrections.json')),
    correctionsPath,
    'build/attempt_2/corrections.json'
  );
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (failures > 0) {
  console.log(`\n${failures} SC-3 micro-drill assertion(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nSC-3 micro-drill passed (valid RED, gate_weak, correction round, immutable evidence).');
}
