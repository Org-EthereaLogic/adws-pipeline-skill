#!/usr/bin/env node
'use strict';

/**
 * run-tests.js — asserts the CLI CONTRACT of every standalone script this skill
 * ships: the 9 validators, entropy-gate.js, and execution-report.js.
 *
 * Why this suite exists (M-5a/A1).
 * The CLI wrapper at the foot of each validator is byte-identical across all nine
 * files. Before this suite it was covered by exactly one assertion per pack:
 * parity/run-parity.js runs `checkCli` on fixtureFiles[0] only, happy path only,
 * asserting exit 0 and that `rubric_result` is a string. That left EVERY
 * input-rejection path untested: missing argv, unreadable path, invalid JSON,
 * non-object JSON, and execute() throwing. It also left stdin ('-') mode — the
 * interface SKILL.md documents — with no coverage at all, because all the parity
 * fixtures bypass the CLI and call execute() directly through exec-one.js.
 *
 * A prototype-pollution crash in repo-context-scan.js sat precisely in that
 * untested band, as did an unbounded Math.max spread in drift-sentinel.js. Both
 * were pinned here as `pending_sc9` hostile cases asserting the defect, and SC-9
 * flipped them to assert the fix. The flip was the regression pin.
 *
 * The three tools use three different stderr prefixes and two different exit
 * vocabularies. That is deliberate (they name three different things) but it was
 * nowhere asserted; this suite is where those contracts become checkable.
 *
 * Usage: node run-tests.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { assertFixtureCoverage, listBySuffix } = require('../_harness.js');

const ROOT = path.resolve(__dirname, '..', '..');
const VALIDATOR_DIR = path.join(ROOT, 'adws-pipeline', 'scripts', 'validators');
const SCRIPTS_DIR = path.join(ROOT, 'adws-pipeline', 'scripts');
const FIXTURES_DIR = path.join(ROOT, 'parity', 'fixtures');
const HOSTILE_DIR = path.join(__dirname, 'hostile');

// The nine deterministic validators. Cross-checked against disk below (M-3a), so
// adding a tenth validator without adding it here is a hard failure, not a silent gap.
const VALIDATORS = [
  'criteria-to-checks',
  'document-coverage-map',
  'drift-sentinel',
  'patch-compose',
  'repo-context-scan',
  'review-risk-assess',
  'ship-mode-select',
  'task-normalize',
  'verify-evidence-map',
];

// mode-000 is readable by root, so the unreadable-file case cannot be asserted there.
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

let failures = 0;
let assertions = 0;
let skipped = 0;
const notes = [];

function check(label, condition, actual, expected) {
  assertions += 1;
  if (!condition) {
    failures += 1;
    notes.push(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function runCli(scriptPath, argv, stdin) {
  return spawnSync(process.execPath, [scriptPath, ...argv], {
    encoding: 'utf8',
    input: stdin === undefined ? '' : stdin,
    timeout: 60000,
    maxBuffer: 64 * 1024 * 1024,
    // Strip the env vars drift-sentinel reads at call time so the ambient shell
    // cannot change a verdict (same discipline as run-parity.js's cleanEnv).
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !['ADWS_UMIF_CANONICAL', 'ADWS_GRADIENT_THRESHOLD', 'TRINITY_ENTROPY_GATING', 'ADWS_NATIVE_UMIF'].includes(k)
      )
    ),
  });
}

function firstLine(s) {
  return String(s || '').split('\n')[0];
}

// --- scratch dir (mkdtempSync only — never a predictable os.tmpdir() path) ------
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'adws-cli-contract-'));
process.on('exit', () => {
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (_err) {
    /* best effort */
  }
});

const MISSING_PATH = path.join(scratch, 'does-not-exist.json');
const DIR_PATH = path.join(scratch, 'a-directory');
fs.mkdirSync(DIR_PATH);
const UNREADABLE_PATH = path.join(scratch, 'unreadable.json');
fs.writeFileSync(UNREADABLE_PATH, '{}');
if (!IS_ROOT) fs.chmodSync(UNREADABLE_PATH, 0o000);

// -----------------------------------------------------------------------------
// PART 1 — the nine validators share one wrapper, so they share one contract.
// -----------------------------------------------------------------------------

// Exit 0 means "execute ran"; the verdict is `rubric_result` INSIDE the JSON,
// including when that verdict is `fail`. Exit 3 means the input was rejected or
// execute() threw — i.e. no verdict was produced at all. Conflating the two is
// the category error documented in references/validator-inputs.md.
const VALIDATOR_CASES = [
  {
    id: 'no-argv',
    argv: () => [],
    stdin: '',
    exit: 3,
    stderrPrefix: 'adws-validator: cannot read input: missing input path',
  },
  { id: 'missing-file', argv: () => [MISSING_PATH], stdin: '', exit: 3, stderrPrefix: 'adws-validator: cannot read input:' },
  { id: 'dir-as-input', argv: () => [DIR_PATH], stdin: '', exit: 3, stderrPrefix: 'adws-validator: cannot read input:' },
  {
    id: 'unreadable-file',
    argv: () => [UNREADABLE_PATH],
    stdin: '',
    exit: 3,
    stderrPrefix: 'adws-validator: cannot read input:',
    skip: IS_ROOT,
    skipReason: 'running as root — mode 000 is readable',
  },
  { id: 'invalid-json', argv: () => ['-'], stdin: '{ not json', exit: 3, stderrPrefix: 'adws-validator: invalid JSON:' },
  { id: 'empty-stdin', argv: () => ['-'], stdin: '', exit: 3, stderrPrefix: 'adws-validator: invalid JSON:' },
  { id: 'json-array', argv: () => ['-'], stdin: '[]', exit: 3, stderrPrefix: 'adws-validator: input must be a JSON object' },
  { id: 'json-null', argv: () => ['-'], stdin: 'null', exit: 3, stderrPrefix: 'adws-validator: input must be a JSON object' },
  { id: 'json-scalar', argv: () => ['-'], stdin: '42', exit: 3, stderrPrefix: 'adws-validator: input must be a JSON object' },
  { id: 'json-string', argv: () => ['-'], stdin: '"hello"', exit: 3, stderrPrefix: 'adws-validator: input must be a JSON object' },
];

function firstFixtureInput(pack) {
  const dir = path.join(FIXTURES_DIR, pack);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`no fixtures for pack ${pack}`);
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  return { name: files[0], input: fixture.input };
}

console.log('=== validators: input-rejection contract (exit 3) ===');
for (const pack of VALIDATORS) {
  const scriptPath = path.join(VALIDATOR_DIR, pack + '.js');
  const before = failures;
  let packSkipped = 0;

  for (const testCase of VALIDATOR_CASES) {
    if (testCase.skip) {
      packSkipped += 1;
      skipped += 1;
      continue;
    }
    const run = runCli(scriptPath, testCase.argv(), testCase.stdin);
    check(`${pack}/${testCase.id} exit`, run.status === testCase.exit, run.status, testCase.exit);
    check(`${pack}/${testCase.id} no stdout`, run.stdout === '', run.stdout, '');
    check(
      `${pack}/${testCase.id} stderr`,
      firstLine(run.stderr).startsWith(testCase.stderrPrefix),
      firstLine(run.stderr),
      testCase.stderrPrefix + ' ...'
    );
  }

  const passed = failures === before;
  console.log(
    `${passed ? 'PASS' : 'FAIL'} ${pack} — ${VALIDATOR_CASES.length - packSkipped} rejection case(s)` +
      (packSkipped ? `, ${packSkipped} skipped` : '')
  );
  for (const line of notes.splice(0)) console.log(line);
}

console.log('\n=== validators: happy path via BOTH file and stdin ===');
for (const pack of VALIDATORS) {
  const scriptPath = path.join(VALIDATOR_DIR, pack + '.js');
  const before = failures;
  const { name, input } = firstFixtureInput(pack);
  const inputPath = path.join(scratch, pack + '.input.json');
  fs.writeFileSync(inputPath, JSON.stringify(input));

  const viaFile = runCli(scriptPath, [inputPath], '');
  check(`${pack}/file-happy exit`, viaFile.status === 0, viaFile.status, 0);

  const viaStdin = runCli(scriptPath, ['-'], JSON.stringify(input));
  check(`${pack}/stdin-happy exit`, viaStdin.status === 0, viaStdin.status, 0);

  // The documented equivalence: `-` and a file path are the same interface.
  check(`${pack}/stdin-eq-file`, viaStdin.stdout === viaFile.stdout, 'differing stdout', 'byte-identical');

  let parsed = null;
  try {
    parsed = JSON.parse(viaFile.stdout);
  } catch (err) {
    failures += 1;
    assertions += 1;
    notes.push(`  FAIL ${pack}/file-happy stdout: not valid JSON: ${err.message}`);
  }
  if (parsed) {
    check(
      `${pack}/file-happy rubric_result`,
      typeof parsed.rubric_result === 'string',
      typeof parsed.rubric_result,
      'string'
    );
  }

  const passed = failures === before;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${pack} — file/stdin/equivalence on ${name}`);
  for (const line of notes.splice(0)) console.log(line);
}

// -----------------------------------------------------------------------------
// PART 2 — hostile inputs. The M-5a pins for the SC-9 defects.
//
// Each records the pre-SC-9 behaviour (`today`) and the behaviour SC-9 produces
// (`after_sc9`). While `pending_sc9` was true this suite asserted `today`, so each
// defect was documented and frozen rather than merely described; SC-9 flipped the
// flag and the assertion moved to `after_sc9`. The flip could not be forgotten:
// leaving the flag set after fixing the defect turns the suite red, and clearing
// it before fixing turns it red too. Both `today` and `after_sc9` are retained so
// the record of what the defect DID survives the fix.
// -----------------------------------------------------------------------------

const GENERATED_HOSTILE = [
  {
    id: 'drift-sentinel-unbounded-history',
    cli: 'drift-sentinel',
    note:
      'Math.max(...abs) at drift-sentinel.js:244 spreads an unbounded array into argv. ' +
      'Reproduced: 50k entries OK, 200k throws RangeError. Reachable from entropy-gate.js ' +
      'over an append-only entropy_history.jsonl that nothing truncates. Generated in memory ' +
      '(~2 MB) rather than committed, so drift-sentinel need not join DIVERGED_PACKS for a ' +
      'fix that changes no output on any input the original survives.',
    pending_sc9: false,
    build: () => ({
      entropy_history: Array.from({ length: 200000 }, (_v, i) => ({ parseFailureScore: i % 3 })),
    }),
    today: { exit: 3, stderrPrefix: 'adws-validator: execute failed:' },
    after_sc9: { exit: 0, rubric_result: 'pass' },
  },
];

function loadHostileFixtures() {
  if (!fs.existsSync(HOSTILE_DIR)) return [];
  return fs
    .readdirSync(HOSTILE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const spec = JSON.parse(fs.readFileSync(path.join(HOSTILE_DIR, f), 'utf8'));
      spec.id = f.replace(/\.json$/, '');
      spec.build = () => spec.input;
      return spec;
    });
}

const HOSTILE = [...loadHostileFixtures(), ...GENERATED_HOSTILE];

console.log('\n=== hostile inputs (SC-9 pins) ===');
for (const spec of HOSTILE) {
  const before = failures;
  const scriptPath = path.join(VALIDATOR_DIR, spec.cli + '.js');
  const expect = spec.pending_sc9 ? spec.today : spec.after_sc9;
  const run = runCli(scriptPath, ['-'], JSON.stringify(spec.build()));

  check(`${spec.id} exit`, run.status === expect.exit, run.status, expect.exit);

  if (expect.exit === 3) {
    check(`${spec.id} no stdout`, run.stdout === '', run.stdout, '');
    check(
      `${spec.id} stderr`,
      firstLine(run.stderr).startsWith(expect.stderrPrefix),
      firstLine(run.stderr),
      expect.stderrPrefix + ' ...'
    );
  } else {
    let parsed = null;
    try {
      parsed = JSON.parse(run.stdout);
    } catch (err) {
      failures += 1;
      assertions += 1;
      notes.push(`  FAIL ${spec.id} stdout: not valid JSON: ${err.message}`);
    }
    if (parsed) {
      check(`${spec.id} rubric_result`, parsed.rubric_result === expect.rubric_result, parsed.rubric_result, expect.rubric_result);
    }
  }

  const passed = failures === before;
  console.log(
    `${passed ? 'PASS' : 'FAIL'} ${spec.id} [${spec.cli}] — ` +
      (spec.pending_sc9 ? `PENDING SC-9: asserting today's behaviour (exit ${expect.exit})` : `fixed: exit ${expect.exit}`)
  );
  for (const line of notes.splice(0)) console.log(line);
}

// -----------------------------------------------------------------------------
// PART 3 — the two non-validator CLIs. Different prefixes, different exit sets.
// -----------------------------------------------------------------------------

console.log('\n=== entropy-gate.js (prefix "adws-entropy-gate:", exits 0/3) ===');
{
  const scriptPath = path.join(SCRIPTS_DIR, 'entropy-gate.js');
  const before = failures;

  const noArgv = runCli(scriptPath, [], '');
  check('entropy-gate/no-argv exit', noArgv.status === 3, noArgv.status, 3);
  check(
    'entropy-gate/no-argv stderr',
    firstLine(noArgv.stderr).startsWith('adws-entropy-gate: cannot read input: missing input path'),
    firstLine(noArgv.stderr),
    'adws-entropy-gate: cannot read input: missing input path ...'
  );

  const missing = runCli(scriptPath, [MISSING_PATH], '');
  check('entropy-gate/missing-file exit', missing.status === 3, missing.status, 3);

  const malformed = runCli(scriptPath, ['-'], 'not jsonl\n');
  check('entropy-gate/malformed-line exit', malformed.status === 3, malformed.status, 3);
  check(
    'entropy-gate/malformed-line stderr',
    firstLine(malformed.stderr).startsWith('adws-entropy-gate:'),
    firstLine(malformed.stderr),
    'adws-entropy-gate: ...'
  );

  // Contract difference worth pinning: empty input is exit 3 for a validator
  // (no JSON object) but exit 0 for the gate (zero lines = no signal, gate open).
  const empty = runCli(scriptPath, ['-'], '');
  check('entropy-gate/empty-stdin exit', empty.status === 0, empty.status, 0);
  let emptyOut = null;
  try {
    emptyOut = JSON.parse(empty.stdout);
  } catch (_err) {
    /* asserted below via null */
  }
  check('entropy-gate/empty-stdin action', emptyOut && emptyOut.action === 'proceed', emptyOut && emptyOut.action, 'proceed');
  check(
    'entropy-gate/empty-stdin verdict field',
    emptyOut && !('rubric_result' in emptyOut),
    emptyOut && 'rubric_result' in emptyOut,
    'no rubric_result — this CLI reports `action`, not a rubric'
  );

  console.log(`${failures === before ? 'PASS' : 'FAIL'} entropy-gate — 5 contract case(s)`);
  for (const line of notes.splice(0)) console.log(line);
}

console.log('\n=== execution-report.js (bare "Error:"/"Usage:", exits 0/10/1/2/3) ===');
{
  const scriptPath = path.join(SCRIPTS_DIR, 'execution-report.js');
  const before = failures;

  const noArgv = runCli(scriptPath, [], '');
  check('execution-report/no-argv exit', noArgv.status === 3, noArgv.status, 3);
  check(
    'execution-report/no-argv stderr',
    firstLine(noArgv.stderr).startsWith('Usage: node execution-report.js'),
    firstLine(noArgv.stderr),
    'Usage: node execution-report.js ...'
  );

  const twoArgs = runCli(scriptPath, [scratch, scratch], '');
  check('execution-report/two-args exit', twoArgs.status === 3, twoArgs.status, 3);

  const missingDir = runCli(scriptPath, [MISSING_PATH], '');
  check('execution-report/missing-dir exit', missingDir.status === 3, missingDir.status, 3);
  check(
    'execution-report/missing-dir stderr',
    firstLine(missingDir.stderr).startsWith('Error: job directory not found:'),
    firstLine(missingDir.stderr),
    'Error: job directory not found: ...'
  );

  const notDirPath = path.join(scratch, 'a-file.txt');
  fs.writeFileSync(notDirPath, 'x');
  const notDir = runCli(scriptPath, [notDirPath], '');
  check('execution-report/not-a-directory exit', notDir.status === 3, notDir.status, 3);
  check(
    'execution-report/not-a-directory stderr',
    firstLine(notDir.stderr).startsWith('Error: not a directory:'),
    firstLine(notDir.stderr),
    'Error: not a directory: ...'
  );

  // SKILL.md:21 documented this CLI's exits as "0/10/1/2" and omitted 3 entirely.
  // Exit 3 is reachable four ways above; SC-11/A2 corrects the documentation.
  console.log(`${failures === before ? 'PASS' : 'FAIL'} execution-report — 5 contract case(s), all exit 3`);
  for (const line of notes.splice(0)) console.log(line);
}

// -----------------------------------------------------------------------------
// M-3a coverage cross-check: the declared list and disk must agree BOTH ways.
// Without this, adding a tenth validator leaves it silently uncovered — the
// exact class of gap this whole suite exists to close.
// -----------------------------------------------------------------------------

console.log('\n=== coverage cross-check ===');
{
  const onDisk = listBySuffix(VALIDATOR_DIR, '.js').map((f) => f.replace(/\.js$/, ''));
  const declared = [...VALIDATORS].sort();
  assertions += 1;
  failures += assertFixtureCoverage({ declared, onDisk, unit: 'validator', declaredUnit: 'declared' });
}

const pending = HOSTILE.filter((h) => h.pending_sc9).length;
if (failures > 0) {
  console.log(`\n${failures} assertion(s) failed out of ${assertions}.`);
  process.exitCode = 1;
} else {
  console.log(
    `\nAll CLI-contract assertions passed (${assertions} assertion(s) across ${VALIDATORS.length} validators + 2 scripts` +
      (skipped ? `, ${skipped} skipped` : '') +
      `).\n${pending} hostile case(s) still PENDING SC-9 — each asserts the defect's current behaviour and must be flipped by SC-9.`
  );
}
