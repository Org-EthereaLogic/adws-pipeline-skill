'use strict';
// Parity harness: proves the ported validator scripts in
// adws-pipeline/scripts/validators/ produce results identical to the original
// ADWS_Pro skill packs in ADWS_PRO_source/src/skills/.
//
// For every fixture in parity/fixtures/<pack>/*.json:
//   1. run the ORIGINAL pack's execute(input) in a fresh child process
//   2. run the PORTED script's execute(input) in a fresh child process
//   3. run the PORTED script AGAIN (determinism check, AC-3.3)
//   4. deep-compare the full result objects (all keys, undefined preserved)
//
// Child processes (via exec-one.js) guarantee fresh env + module cache per
// fixture per implementation, since some code reads env at call time
// (canonicalMode, ADWS_GRADIENT_THRESHOLD) and could otherwise be cached.
//
// Also verifies NFR-4 per ported script: only Node built-in requires, and the
// CLI wrapper works end-to-end on a sample fixture (exit 0, valid JSON).
//
// Usage: node parity/run-parity.js   (plain Node, no jest, no npm install)
// Exit 0 when everything matches; exit 1 on any mismatch or NFR-4 failure.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PARITY_DIR = __dirname;
const ROOT = path.resolve(PARITY_DIR, '..');
const FIXTURES_DIR = path.join(PARITY_DIR, 'fixtures');
const EXEC_ONE = path.join(PARITY_DIR, 'exec-one.js');
const ORIGINAL_DIR = path.join(ROOT, 'ADWS_PRO_source', 'src', 'skills');
const PORTED_DIR = path.join(ROOT, 'adws-pipeline', 'scripts', 'validators');
const REPORT_PATH = path.join(PARITY_DIR, 'PARITY_REPORT.md');

// Env vars the implementations read; stripped from the inherited env so only
// the fixture controls them.
const CONTROLLED_ENV = ['ADWS_UMIF_CANONICAL', 'ADWS_GRADIENT_THRESHOLD', 'TRINITY_ENTROPY_GATING', 'ADWS_NATIVE_UMIF'];

function cleanEnv(fixtureEnv) {
  const env = { ...process.env };
  for (const key of CONTROLLED_ENV) delete env[key];
  return { ...env, ...(fixtureEnv || {}) };
}

function runOne(modulePath, fixturePath, fixtureEnv) {
  const proc = spawnSync(process.execPath, [EXEC_ONE, modulePath, fixturePath], {
    env: cleanEnv(fixtureEnv),
    encoding: 'utf8',
    timeout: 30000,
  });
  if (proc.status !== 0) {
    return { error: 'exit ' + proc.status + ': ' + (proc.stderr || '').trim().slice(0, 400) };
  }
  try {
    return { result: JSON.parse(proc.stdout) };
  } catch (err) {
    return { error: 'unparseable output: ' + proc.stdout.slice(0, 200) };
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a === 'number') return Object.is(a, b);
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function firstDiff(a, b, prefix) {
  prefix = prefix || '';
  if (deepEqual(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return prefix + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b);
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!deepEqual(a[k], b[k])) return firstDiff(a[k], b[k], prefix ? prefix + '.' + k : k);
  }
  return prefix + ': structural difference';
}

// NFR-4a: requires must be Node built-ins only.
function checkRequires(portedPath) {
  const src = fs.readFileSync(portedPath, 'utf8');
  const matches = [...src.matchAll(/require\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map((m) => m[2]);
  const builtins = new Set(['fs', 'path', 'node:fs', 'node:path']);
  const bad = matches.filter((m) => !builtins.has(m));
  return { requires: matches, ok: bad.length === 0, bad };
}

// NFR-4b: CLI wrapper runs a sample fixture end-to-end.
function checkCli(portedPath, fixturePath, fixtureEnv) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const tmp = path.join(os.tmpdir(), 'adws-parity-cli-input-' + process.pid + '.json');
  fs.writeFileSync(tmp, JSON.stringify(fixture.input));
  try {
    const proc = spawnSync(process.execPath, [portedPath, tmp], {
      env: cleanEnv(fixtureEnv),
      encoding: 'utf8',
      timeout: 30000,
    });
    if (proc.status !== 0) return { ok: false, detail: 'exit ' + proc.status + ' ' + (proc.stderr || '').slice(0, 200) };
    try {
      const parsed = JSON.parse(proc.stdout);
      if (!parsed || typeof parsed.rubric_result !== 'string') {
        return { ok: false, detail: 'no rubric_result in CLI output' };
      }
      return { ok: true, detail: 'exit 0, rubric_result=' + parsed.rubric_result };
    } catch (err) {
      return { ok: false, detail: 'CLI printed unparseable JSON' };
    }
  } finally {
    fs.unlinkSync(tmp);
  }
}

function main() {
  const packs = fs
    .readdirSync(FIXTURES_DIR)
    .filter((d) => fs.statSync(path.join(FIXTURES_DIR, d)).isDirectory())
    .sort();

  const rows = [];
  let total = 0;
  let matches = 0;
  let mismatches = 0;
  const nfr4 = [];

  for (const pack of packs) {
    const originalPath = path.join(ORIGINAL_DIR, pack, pack + '.js');
    const portedPath = path.join(PORTED_DIR, pack + '.js');
    const fixtureFiles = fs
      .readdirSync(path.join(FIXTURES_DIR, pack))
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const file of fixtureFiles) {
      const fixturePath = path.join(FIXTURES_DIR, pack, file);
      const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      const caseName = file.replace(/\.json$/, '');
      total += 1;

      const orig = runOne(originalPath, fixturePath, fixture.env);
      const port1 = runOne(portedPath, fixturePath, fixture.env);
      const port2 = runOne(portedPath, fixturePath, fixture.env);

      const row = {
        pack,
        caseName,
        env: fixture.env ? Object.entries(fixture.env).map(([k, v]) => k + '=' + v).join(' ') : '',
        origVerdict: orig.result ? orig.result.rubric_result : 'ERROR',
        portVerdict: port1.result ? port1.result.rubric_result : 'ERROR',
        match: false,
        deterministic: false,
        diff: null,
      };

      if (orig.error || port1.error || port2.error) {
        row.diff = orig.error || port1.error || port2.error;
      } else {
        row.match = deepEqual(orig.result, port1.result);
        row.deterministic = deepEqual(port1.result, port2.result);
        if (!row.match) row.diff = firstDiff(orig.result, port1.result);
        else if (!row.deterministic) row.diff = 'non-deterministic: ' + firstDiff(port1.result, port2.result);
      }

      if (row.match && row.deterministic) matches += 1;
      else mismatches += 1;
      rows.push(row);
      const flag = row.match && row.deterministic ? 'OK  ' : 'FAIL';
      console.log(
        flag + ' ' + pack + '/' + caseName + '  orig=' + row.origVerdict + ' port=' + row.portVerdict +
          (row.diff ? '  diff: ' + row.diff : '')
      );
    }

    // NFR-4 per pack (requires scan + one CLI smoke run on the first fixture)
    const req = checkRequires(portedPath);
    const firstFixture = path.join(FIXTURES_DIR, pack, fixtureFiles[0]);
    const firstEnv = JSON.parse(fs.readFileSync(firstFixture, 'utf8')).env;
    const cli = checkCli(portedPath, firstFixture, firstEnv);
    nfr4.push({ pack, requires: req.requires, requiresOk: req.ok, bad: req.bad, cliOk: cli.ok, cliDetail: cli.detail, cliFixture: fixtureFiles[0] });
    if (!req.ok || !cli.ok) mismatches += 1;
  }

  // ---- report ----
  const lines = [];
  lines.push('# ADWS Validator Parity Report');
  lines.push('');
  lines.push('Generated by `parity/run-parity.js` on ' + new Date().toISOString() + ' (node ' + process.version + ').');
  lines.push('');
  lines.push('Original: `ADWS_PRO_source/src/skills/<pack>/<pack>.js` — Ported: `adws-pipeline/scripts/validators/<pack>.js`.');
  lines.push('Each fixture runs in a fresh child process per implementation (fresh env + module cache).');
  lines.push('"Full match" deep-compares every key of the execute() result (undefined values preserved via sentinel).');
  lines.push('"Deterministic" deep-compares two independent runs of the ported script on the same input (AC-3.3).');
  lines.push('');
  for (const pack of packs) {
    lines.push('## ' + pack);
    lines.push('');
    lines.push('| Fixture | Env | Original verdict | Ported verdict | Full-object match | Deterministic |');
    lines.push('|---|---|---|---|---|---|');
    for (const row of rows.filter((r) => r.pack === pack)) {
      lines.push(
        '| ' + row.caseName + ' | ' + (row.env || '—') + ' | ' + row.origVerdict + ' | ' + row.portVerdict +
          ' | ' + (row.match ? 'yes' : 'NO — ' + row.diff) + ' | ' + (row.deterministic ? 'yes' : 'NO') + ' |'
      );
    }
    lines.push('');
  }
  lines.push('## NFR-4 — standalone + CLI checks');
  lines.push('');
  lines.push('| Ported script | require() targets | Built-ins only | CLI smoke run (exit 0, JSON verdict) |');
  lines.push('|---|---|---|---|');
  for (const n of nfr4) {
    lines.push(
      '| ' + n.pack + '.js | ' + (n.requires.length ? n.requires.map((r) => '`' + r + '`').join(', ') : 'none') +
        ' | ' + (n.requiresOk ? 'yes' : 'NO: ' + n.bad.join(', ')) + ' | ' + (n.cliOk ? 'ok (' + n.cliFixture + ': ' + n.cliDetail + ')' : 'FAIL: ' + n.cliDetail) + ' |'
    );
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('- Total fixtures: ' + total);
  lines.push('- Full-object matches (and deterministic): ' + matches);
  lines.push('- Mismatches/failures (incl. NFR-4): ' + mismatches);
  lines.push('- Result: ' + (mismatches === 0 ? 'ALL ' + total + '/' + total + ' FIXTURES IDENTICAL — parity holds.' : 'PARITY FAILED'));
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'));

  console.log('\nSummary: ' + matches + '/' + total + ' fixtures identical, ' + mismatches + ' failures.');
  console.log('Report: ' + REPORT_PATH);
  process.exit(mismatches === 0 ? 0 : 1);
}

main();
