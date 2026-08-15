#!/usr/bin/env node
'use strict';

/**
 * run-tests.js — runs the standalone secret-scan CLI (SC-19/F-96) against a synthesized
 * evidence tree per case and asserts the verdict, the exact rule ids, and the one property
 * that matters more than any of them: THE REPORT NEVER CONTAINS THE SECRET.
 *
 * WHY THERE ARE NO FIXTURE FILES ON DISK. Every other suite in `parity/` commits its
 * inputs. This one cannot: a committed file holding a well-formed `ghp_…` or `AKIA…` is a
 * string that GitHub's own push protection blocks, that every credential scanner in CI
 * reports, and that a reader grepping the repo for leaked keys has to triage by hand
 * forever. So each case builds its tree in a scratch directory and composes the credential
 * from fragments at runtime — no literal token exists in this file either. The precedent is
 * `evidence-integrity-fixtures/run-tests.js`, which builds its deliberately-unparseable
 * JSON in a scratch dir for the same class of reason ("a deliberately-broken .json in the
 * repo is a trap for every other tool that globs for JSON").
 *
 * The cost is that `assertFixtureCoverage`'s declared-vs-on-disk check has nothing to
 * compare. It is replaced by the assertion that actually matters for an anti-vacuity
 * suite, and it runs in both directions too: every rule in secret-scan.js must be fired by
 * at least one case, and every rule a case claims to cover must exist. A rule added without
 * a case fails here, which is the guard-ablation lesson applied at the suite level.
 *
 * Usage: node run-tests.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { withScratchDir } = require('../_harness.js');
const { RULE_IDS } = require('../../adws-pipeline/scripts/secret-scan.js');

const CLI = path.join(__dirname, '..', '..', 'adws-pipeline', 'scripts', 'secret-scan.js');

// Deterministic filler of an exact length. The fact rules are length-sensitive by design
// (a GitHub token is 36 characters after the prefix, not "about 36"), so a case that fires
// a rule with the wrong length would be testing a different rule than it claims to.
function filler(n, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  let s = '';
  while (s.length < n) s += alphabet;
  return s.slice(0, n);
}
const UPPER36 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Every credential below is assembled from pieces at runtime. Concatenation, not a literal:
// the point is that grepping this file for a token prefix finds a fragment, not a token.
const SECRETS = {
  aws: 'AKI' + 'A' + filler(16, UPPER36),
  github: 'gh' + 'p_' + filler(36),
  privateKey: '-----BEGIN RSA PRIVATE ' + 'KEY-----',
  slack: 'xox' + 'b-' + '1234567890-' + filler(24),
  google: 'AIz' + 'a' + filler(35),
  stripe: 'sk' + '_live_' + filler(24),
  openai: 'sk' + '-' + filler(40),
  npm: 'npm' + '_' + filler(36),
  pypi: 'pypi' + '-AgEIcHlwaS5vcmc' + filler(56),
  jwt: b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ sub: 'job-2f8c1a', iat: 1 }) + '.' + filler(43),
  // Three dotted base64url segments whose first decodes to a JSON ARRAY, not an object
  // with `alg`. Structurally a lookalike; the rule's verifier is the only thing that can
  // tell them apart, and without it this string would fail a run.
  jwtLookalike: b64url([1, 2, 3]) + '.' + b64url([4, 5, 6]) + '.' + filler(43),
  password: 'hunter2-correct-horse',
};

const CASES = [
  {
    name: 'clean tree',
    covers: [],
    exit_code: 0,
    rubric_result: 'pass',
    rules: [],
    warn_rules: [],
    files: {
      'run_manifest.json': JSON.stringify({ job_id: 'job-2f8c1a', final_status: 'completed' }),
      'plan/attempt_1/phase_log.md': '# plan\n\nRead 4 files, proposed 3 changes.\n',
    },
  },
  {
    // (b) THE TRAP: rule 7 demands `[REDACTED]`, and a scanner that warns on a redacted
    // value punishes the behaviour it exists to produce. `secret_policy: no-new-secrets`
    // is in EVERY task contract this pipeline writes — an earlier cut of the inference
    // rule used `\b` and fired on all of them.
    name: 'compliance is not a finding',
    covers: [],
    exit_code: 0,
    rubric_result: 'pass',
    rules: [],
    warn_rules: [],
    files: {
      'task_contract_snapshot.json': JSON.stringify({
        policy: { secret_policy: 'no-new-secrets', token_budget: 40000, auth_mode: 'ssh' },
      }),
      'test/attempt_1/phase_log.md':
        '$ deploy --check\npassword: [REDACTED]\nGITHUB_TOKEN=[REDACTED]\napi_key: ***\n' +
        'export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY\nbearer: <redacted>\ntoken: null\n',
    },
  },
  {
    name: 'aws access key id',
    covers: ['aws_access_key_id'],
    exit_code: 1,
    rubric_result: 'fail',
    rules: ['aws_access_key_id'],
    warn_rules: [],
    files: { 'build/attempt_1/phase_log.md': `$ aws sts get-caller-identity\nUsing ${SECRETS.aws}\n` },
  },
  {
    name: 'github token',
    covers: ['github_token'],
    exit_code: 1,
    rubric_result: 'fail',
    rules: ['github_token'],
    warn_rules: [],
    files: { 'ship/attempt_1/phase_log.md': `remote: token ${SECRETS.github} rejected\n` },
  },
  {
    // (e) A private key BLOCK header, in a `consensus/repro/` copy — the SC-13/F-77 path
    // that widened F-81's radius: verbatim copies of an untrusted repository's files.
    name: 'private key block in a repro copy',
    covers: ['private_key_block'],
    exit_code: 1,
    rubric_result: 'fail',
    rules: ['private_key_block'],
    warn_rules: [],
    files: { 'consensus/repro/id_rsa': `${SECRETS.privateKey}\n${filler(64)}\n` },
  },
  {
    name: 'slack, google, stripe, openai, npm, pypi',
    covers: ['slack_token', 'google_api_key', 'stripe_secret_key', 'openai_api_key', 'npm_token', 'pypi_token'],
    exit_code: 1,
    rubric_result: 'fail',
    rules: ['slack_token', 'google_api_key', 'stripe_secret_key', 'openai_api_key', 'npm_token', 'pypi_token'],
    warn_rules: [],
    files: {
      'review/attempt_1/phase_log.md': [
        SECRETS.slack, SECRETS.google, SECRETS.stripe, SECRETS.openai, SECRETS.npm, SECRETS.pypi,
      ].join('\n') + '\n',
    },
  },
  {
    // (g) A real JWT fails; a structural lookalike in the SAME tree does not. Both in one
    // case on purpose: separate cases would let the rule pass by matching neither.
    name: 'jwt fails, lookalike does not',
    covers: ['jwt'],
    exit_code: 1,
    rubric_result: 'fail',
    rules: ['jwt'],
    warn_rules: [],
    files: {
      'verify/attempt_1/phase_log.md': `Authorization: Bearer ${SECRETS.jwt}\ncache-key: ${SECRETS.jwtLookalike}\n`,
    },
  },
  {
    // (h) An inference WARNS: the run continues, the operator is told. The value is a real
    // password and the rule still cannot know that — which is the entire argument.
    name: 'sensitive assignment warns, never fails',
    covers: ['sensitive_assignment'],
    exit_code: 0,
    rubric_result: 'warn',
    rules: [],
    warn_rules: ['sensitive_assignment'],
    files: { 'document/attempt_1/phase_log.md': `db password = ${SECRETS.password}\n` },
  },
  {
    // (i) The difference from evidence-integrity.js, asserted: that script reads `.json`
    // only, and rule 7 names `phase_log.md` — the file that captures command output
    // VERBATIM and is therefore the likeliest carrier in the tree.
    name: 'non-JSON files are scanned',
    covers: ['aws_access_key_id'],
    exit_code: 1,
    rubric_result: 'fail',
    rules: ['aws_access_key_id'],
    warn_rules: [],
    files: {
      'run_manifest.json': JSON.stringify({ job_id: 'job-2f8c1a' }),
      'build/attempt_1/notes.txt': `key ${SECRETS.aws}\n`,
    },
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

// Anti-vacuity, both directions. Replaces assertFixtureCoverage for a suite with no files
// on disk: a rule nothing fires is a rule pinned by nothing, and a case naming a rule that
// does not exist is a case testing nothing.
{
  const covered = new Set(CASES.flatMap((c) => c.covers));
  const known = new Set(RULE_IDS);
  for (const id of RULE_IDS) {
    check(`rule coverage: ${id} is fired by some case`, covered.has(id), 'no case covers it', 'covered');
  }
  for (const id of covered) {
    check(`rule coverage: case names a real rule (${id})`, known.has(id), id, `one of ${RULE_IDS.join(', ')}`);
  }
  for (const note of notes.splice(0)) console.log(note);
  console.log(`${failures === 0 ? 'PASS' : 'FAIL'} rule coverage — ${RULE_IDS.length} rules, both directions`);
}

for (const testCase of CASES) {
  const before = failures;
  withScratchDir('adws-secret-scan-', (dir) => {
    for (const [rel, content] of Object.entries(testCase.files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }

    const run = runCli(dir);
    check(`${testCase.name} exit code`, run.status === testCase.exit_code, run.status, testCase.exit_code);

    let out = null;
    try {
      out = JSON.parse(run.stdout);
    } catch (err) {
      failures += 1;
      notes.push(`  FAIL ${testCase.name} stdout: not valid JSON: ${err.message}`);
    }
    if (out) {
      check(`${testCase.name} rubric_result`, out.rubric_result === testCase.rubric_result, out.rubric_result, testCase.rubric_result);

      const rules = [...new Set(out.findings.map((f) => f.rule))].sort();
      const expectedRules = [...new Set(testCase.rules)].sort();
      check(`${testCase.name} finding rules`, JSON.stringify(rules) === JSON.stringify(expectedRules), rules, expectedRules);

      const warnRules = [...new Set(out.warnings.map((w) => w.rule))].sort();
      const expectedWarnRules = [...new Set(testCase.warn_rules)].sort();
      check(`${testCase.name} warning rules`, JSON.stringify(warnRules) === JSON.stringify(expectedWarnRules), warnRules, expectedWarnRules);

      // Every finding must say where it is. A report that says a tree is dirty without
      // saying which line is not actionable evidence — and here it is the ONLY way to act,
      // because the report deliberately does not carry the string itself.
      const located = [...out.findings, ...out.warnings]
        .filter((f) => f.rule !== 'no_files_scanned' && f.rule !== 'unreadable_file')
        .every((f) => typeof f.file === 'string' && f.line >= 1 && f.column >= 1 && f.fingerprint);
      check(`${testCase.name} every finding is located and fingerprinted`, located, [...out.findings, ...out.warnings], 'file+line+column+fingerprint');

      const expectedKeys = ['rubric_result', 'files_scanned', 'files_skipped_binary', 'rules_applied', 'findings', 'warnings'];
      check(
        `${testCase.name} output keys`,
        JSON.stringify(Object.keys(out)) === JSON.stringify(expectedKeys),
        Object.keys(out),
        expectedKeys
      );
    }

    // THE PROPERTY THIS SUITE EXISTS FOR. The report is itself evidence and lands in the
    // same archive; a scanner that echoes its match writes a second copy of the secret
    // into the tree it was run to clean. Asserted against stdout AND stderr, for every
    // planted value in the case, on every case — including the ones expected to be clean.
    for (const [label, value] of Object.entries(SECRETS)) {
      const planted = Object.values(testCase.files).some((c) => c.includes(value));
      if (!planted) continue;
      check(`${testCase.name}: report does not echo ${label}`, !run.stdout.includes(value) && !run.stderr.includes(value), 'echoed', 'absent');
    }

    check(`${testCase.name} deterministic`, runCli(dir).stdout === run.stdout, 'differs', 'byte-identical');
  });
  console.log(`${failures === before ? 'PASS' : 'FAIL'} ${testCase.name}`);
  for (const note of notes.splice(0)) console.log(note);
}

// Binary files are skipped, not decoded as text and not crashed on. `artifacts/` holds
// `.tar.gz` siblings and a run can capture a compiled artifact; a scanner that dies on the
// first one covers nothing after it.
{
  const before = failures;
  withScratchDir('adws-secret-scan-binary-', (dir) => {
    fs.writeFileSync(path.join(dir, 'run_manifest.json'), JSON.stringify({ job_id: 'job-2f8c1a' }));
    fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.concat([Buffer.from('AKI'), Buffer.from([0]), Buffer.from(filler(64))]));
    const run = runCli(dir);
    check('binary skipped: exit 0', run.status === 0, run.status, 0);
    const out = JSON.parse(run.stdout);
    check('binary skipped: counted', out.files_skipped_binary === 1, out.files_skipped_binary, 1);
    check('binary skipped: text file still scanned', out.files_scanned === 1, out.files_scanned, 1);
  });
  console.log(`${failures === before ? 'PASS' : 'FAIL'} binary files are skipped and counted`);
  for (const note of notes.splice(0)) console.log(note);
}

// An EMPTY tree must not read as clean — the same branch evidence-integrity.js grew after
// its own suite pointed at a directory that had failed to copy and got back `pass`.
{
  const before = failures;
  withScratchDir('adws-secret-scan-empty-', (dir) => {
    const run = runCli(dir);
    check('empty tree exits 1, not 0', run.status === 1, run.status, 1);
    const out = JSON.parse(run.stdout);
    check('empty tree is a fail, not a pass', out.rubric_result === 'fail', out.rubric_result, 'fail');
    check(
      'empty tree names the reason',
      JSON.stringify(out.findings.map((f) => f.rule)) === JSON.stringify(['no_files_scanned']),
      out.findings.map((f) => f.rule),
      ['no_files_scanned']
    );

    // ...and a tree holding ONLY binary files is the same case: nothing was scanned.
    fs.writeFileSync(path.join(dir, 'only.bin'), Buffer.from([0, 1, 2, 3]));
    const run2 = runCli(dir);
    check('a tree of only binary files also fails', run2.status === 1, run2.status, 1);
  });
  console.log(`${failures === before ? 'PASS' : 'FAIL'} empty tree (scratch)`);
  for (const note of notes.splice(0)) console.log(note);
}

// CLI error path: no argument, and a path that does not exist. Both are input errors
// (exit 3), distinct from "scanned it and it was dirty" (exit 1). A caller that cannot tell
// those apart reads a typo as a clean tree — which for THIS script means reading a typo as
// "no secrets in the evidence".
{
  const before = failures;
  const noArg = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  check('no argument exits 3', noArg.status === 3, noArg.status, 3);
  check('no argument prints nothing on stdout', noArg.stdout === '', noArg.stdout, '');
  check(
    'no argument names the script on stderr',
    noArg.stderr.startsWith('adws-secret-scan: cannot read input:'),
    noArg.stderr.split('\n')[0],
    'adws-secret-scan: cannot read input: ...'
  );

  const missing = runCli(path.join(__dirname, 'does-not-exist'));
  check('missing path exits 3', missing.status === 3, missing.status, 3);
  check('missing path prints nothing on stdout', missing.stdout === '', missing.stdout, '');

  console.log(`${failures === before ? 'PASS' : 'FAIL'} CLI error path`);
  for (const note of notes.splice(0)) console.log(note);
}

if (failures > 0) {
  console.log(`\nFAILED — ${failures} assertion(s) across ${CASES.length} cases + rule coverage + binary + empty tree + CLI error path`);
  process.exit(1);
}
console.log(`\nOK — ${CASES.length} verdicts over ${RULE_IDS.length} rules + binary + empty tree + CLI error path, deterministic across re-runs, no report echoes its match`);
