'use strict';
// Parity harness: proves the ported validator scripts in
// adws-pipeline/scripts/validators/ produce results identical to the original
// ADWS_Pro skill packs in ADWS_PRO_source/src/skills/ — except for packs
// listed in DIVERGED_PACKS below, which deliberately diverge under an approved
// scope change and are verified against their frozen `expected` baselines only.
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
// ADWS_PRO_source/ is a local, gitignored reference copy of the original
// ADWS_Pro repo (not distributed here — see .gitignore) used to extract and
// verify the ports. Each fixture also carries a frozen `expected` field
// (the original's exact execute() result, captured via --freeze) so parity
// can be verified from a fresh clone WITHOUT ADWS_PRO_source: this script
// falls back to comparing the ported output against that frozen baseline.
// Reviewers/CI therefore get real, reproducible evidence either way — this
// closes the "trust-me" gap where PARITY_REPORT.md could claim parity that
// nobody but the original author could reproduce.
//
// Usage:
//   node parity/run-parity.js            verify (live originals if
//                                         ADWS_PRO_source/ present, else
//                                         frozen `expected` fixtures)
//   node parity/run-parity.js --freeze   (requires ADWS_PRO_source/) run
//                                         every fixture against the live
//                                         original and rewrite its `expected`
//                                         field — run this after touching
//                                         fixtures or re-syncing the source
//   node parity/run-parity.js --freeze-diverged
//                                         refreeze ONLY the DIVERGED_PACKS, from
//                                         the PORT (which is their reference by
//                                         definition), so a scope change can land
//                                         without ADWS_PRO_source/ present. It
//                                         refuses to touch a non-diverged pack.
//
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

// Packs that DELIBERATELY diverge from the ADWS_Pro original (approved scope
// changes). For these packs the ported script is the reference implementation:
// verification compares the port ONLY against each fixture's frozen `expected`
// baseline (never against the live original, even when ADWS_PRO_source/ is
// present), and --freeze captures the PORT's output instead of the original's.
// Map value = 'scope-change id, ported version' shown in the report.
const DIVERGED_PACKS = {
  'criteria-to-checks': 'SC-1 + SC-5, v2.0.0',
  'review-risk-assess': 'SC-8, v2.0.0',
  // SC-9. All three gained output keys, and deepEqual compares key sets exactly,
  // so every pre-existing fixture in these packs would mismatch a live original
  // regardless of verdict — the same situation that moved review-risk-assess under
  // SC-8. repo-context-scan additionally CRASHED on the F-63 input, so the original
  // cannot produce a baseline for it at all.
  'repo-context-scan': 'SC-9, v2.0.0',
  'patch-compose': 'SC-9, v2.0.0',
  'ship-mode-select': 'SC-9, v2.0.0',
};

// M-3a: the declared size of the corpus. Unlike the report/entropy/provenance suites —
// which cross-check a CASES list against the files on disk — this harness DISCOVERS its
// fixtures, so disk is its only source and a deleted fixture would simply reduce the
// total with every assertion still green. This constant is the second source: it must be
// changed deliberately, by a human, in the same commit that adds or removes a fixture.
// Bump it when the corpus legitimately grows (84 → 88 under SC-5, four new
// criteria-to-checks cases; 88 → 93 under SC-8, five new review-risk-assess pins: two for
// the security-matching halves, two for unassessable entries, one for the deliberate
// non-enforcement of an `action` enum; 93 → 108 under SC-9, fifteen new pins: six for
// repo-context-scan (prototype-key path, traversal escape, prefix-substring evasion, empty policy
// prefix, absolute paths, malformed entries) and
// nine across the two ship packs — one per branch-name rule per pack, one
// non-over-rejection pass per pack, and one for the docs_delta union). A mismatch is a
// hard failure, never a warning.
// SC-14/A4b (F-86): 108 -> 109. One drift-sentinel case added to pin the legacy YELLOW
// band, which no fixture reached — the sibling named legacy-yellow-zone.json lands in the
// RED band, so guard-ablation's `drift-sentinel:guard-off:#22` survived. No existing
// expectation was rewritten.
const EXPECTED_FIXTURE_TOTAL = 109;

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
// (Deep coverage of the wrapper — every exit-3 path, both input modes — lives in
// parity/cli-contract/run-tests.js. This stays a smoke check.)
function checkCli(portedPath, fixturePath, fixtureEnv) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  // M-5a/A4: mkdtempSync, never a predictable os.tmpdir() path. The previous name
  // was 'adws-parity-cli-input-<pid>.json' — deterministic, in a world-writable
  // directory, created with writeFileSync (which follows symlinks and does not use
  // O_EXCL). A local attacker who pre-created that path as a symlink got an
  // arbitrary-file overwrite and unlink at the privilege of whoever ran `make ci`.
  // parity/sc3-micro-drill/run-tests.js:68 already used mkdtempSync correctly.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adws-parity-cli-'));
  const tmp = path.join(tmpDir, 'input.json');
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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  const freezeAll = process.argv.includes('--freeze');
  // --freeze-diverged: refreeze ONLY the DIVERGED_PACKS, from the port. For a
  // diverged pack the port IS the reference by definition, so no original is
  // needed — which matters because ADWS_PRO_source/ is gitignored and usually
  // absent, and a scope change that adds output keys cannot land without a
  // refreeze. It REFUSES to touch a non-diverged pack, so it cannot be used to
  // launder a baseline that is supposed to come from the original.
  const freezeDiverged = process.argv.includes('--freeze-diverged');
  const freeze = freezeAll || freezeDiverged;
  const hasOriginal = fs.existsSync(ORIGINAL_DIR);
  if (freezeAll && !hasOriginal) {
    console.error('--freeze requires a local ADWS_PRO_source/ checkout (not found at ' + ORIGINAL_DIR + ').');
    console.error('To refreeze only the diverged packs (which reference the PORT, not the original), use --freeze-diverged.');
    process.exit(3);
  }
  const baselineSource = hasOriginal ? 'live-original' : 'frozen-expected';

  const packs = fs
    .readdirSync(FIXTURES_DIR)
    .filter((d) => fs.statSync(path.join(FIXTURES_DIR, d)).isDirectory())
    .sort();

  const rows = [];
  let total = 0;
  let matches = 0;
  let mismatches = 0;
  let frozen = 0;
  const nfr4 = [];

  for (const pack of packs) {
    const diverged = Object.prototype.hasOwnProperty.call(DIVERGED_PACKS, pack);
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

      const orig = hasOriginal && !diverged ? runOne(originalPath, fixturePath, fixture.env) : null;

      if (freeze) {
        if (freezeDiverged && !diverged) continue; // never launder a non-diverged baseline
        // Diverged packs freeze from the PORT (the reference implementation
        // for the approved scope change); everything else from the original.
        const ref = diverged ? runOne(portedPath, fixturePath, fixture.env) : orig;
        if (ref.error) {
          mismatches += 1;
          console.log('FAIL ' + pack + '/' + caseName + '  freeze: ' + (diverged ? 'port' : 'original') + ' errored: ' + ref.error);
          continue;
        }
        fixture.expected = ref.result;
        // M-5b/B4. A fixture frozen from the port and one frozen from the original are
        // otherwise INDISTINGUISHABLE on disk, so PARITY_REPORT.md could report "identical"
        // for a pack whose baseline was only ever the port's own output. Stamping the
        // source makes the difference detectable; the verify path asserts it below.
        fixture.expected_source = diverged ? 'port@' + DIVERGED_PACKS[pack] : 'original@ADWS_PRO_source';
        fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n');
        frozen += 1;
        matches += 1;
        console.log('FROZE ' + pack + '/' + caseName + (diverged ? '  (from port — diverged-by-design, ' + DIVERGED_PACKS[pack] + ')' : ''));
        continue;
      }

      // M-5b/B4: a NON-diverged pack whose baseline came from the port is the
      // "validated against itself" trap. It is a hard failure, not a note.
      const src = fixture.expected_source;
      if (typeof src === 'string' && src.startsWith('port@') && !diverged) {
        mismatches += 1;
        console.log(
          'FAIL ' + pack + '/' + caseName + '  expected_source is ' + src +
            ' but ' + pack + ' is not in DIVERGED_PACKS — a non-diverged baseline must come from the original'
        );
        continue;
      }

      const port1 = runOne(portedPath, fixturePath, fixture.env);
      const port2 = runOne(portedPath, fixturePath, fixture.env);

      const baseline = hasOriginal && !diverged
        ? { result: orig.result, error: orig.error }
        : {
            result: Object.prototype.hasOwnProperty.call(fixture, 'expected') ? fixture.expected : null,
            error: Object.prototype.hasOwnProperty.call(fixture, 'expected')
              ? null
              : 'no frozen `expected` in fixture and ADWS_PRO_source/ not present — run --freeze once with the source checked out',
          };

      const row = {
        pack,
        diverged,
        caseName,
        env: fixture.env ? Object.entries(fixture.env).map(([k, v]) => k + '=' + v).join(' ') : '',
        origVerdict: baseline.result ? baseline.result.rubric_result : 'ERROR',
        portVerdict: port1.result ? port1.result.rubric_result : 'ERROR',
        match: false,
        deterministic: false,
        diff: null,
      };

      if (baseline.error || port1.error || port2.error) {
        row.diff = baseline.error || port1.error || port2.error;
      } else {
        row.match = deepEqual(baseline.result, port1.result);
        row.deterministic = deepEqual(port1.result, port2.result);
        if (!row.match) row.diff = firstDiff(baseline.result, port1.result);
        else if (!row.deterministic) row.diff = 'non-deterministic: ' + firstDiff(port1.result, port2.result);
      }

      if (row.match && row.deterministic) matches += 1;
      else mismatches += 1;
      rows.push(row);
      const flag = row.match && row.deterministic ? 'OK  ' : 'FAIL';
      console.log(
        flag + ' ' + pack + '/' + caseName + '  ' + (diverged ? 'frozen=' : 'orig=') + row.origVerdict + ' port=' + row.portVerdict +
          (row.diff ? '  diff: ' + row.diff : '')
      );
    }

    if (freeze) continue;

    // NFR-4 per pack (requires scan + one CLI smoke run on the first fixture)
    const req = checkRequires(portedPath);
    const firstFixture = path.join(FIXTURES_DIR, pack, fixtureFiles[0]);
    const firstEnv = JSON.parse(fs.readFileSync(firstFixture, 'utf8')).env;
    const cli = checkCli(portedPath, firstFixture, firstEnv);
    nfr4.push({ pack, requires: req.requires, requiresOk: req.ok, bad: req.bad, cliOk: cli.ok, cliDetail: cli.detail, cliFixture: fixtureFiles[0] });
    if (!req.ok || !cli.ok) mismatches += 1;
  }

  if (freeze) {
    console.log(
      freezeDiverged
        ? '\nFroze ' + frozen + ' fixture(s) in the ' + Object.keys(DIVERGED_PACKS).length +
            ' diverged pack(s) against the PORT. Non-diverged packs were not touched.'
        : '\nFroze ' + frozen + '/' + total + ' fixtures against the live ADWS_PRO_source originals.'
    );
    process.exit(mismatches === 0 ? 0 : 1);
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
  lines.push(
    baselineSource === 'live-original'
      ? '**Baseline: live original.** `ADWS_PRO_source/` was present on this machine, so every fixture ran against the actual original `execute()` in a fresh child process.'
      : '**Baseline: frozen `expected`.** `ADWS_PRO_source/` (gitignored, not distributed in this repo) was not present, so every fixture compared the ported script against the `expected` field frozen into the fixture JSON via `node parity/run-parity.js --freeze` — this is what a fresh clone or CI reproduces without the original source.'
  );
  const divergedPacks = packs.filter((p) => Object.prototype.hasOwnProperty.call(DIVERGED_PACKS, p));
  if (divergedPacks.length) {
    lines.push('');
    lines.push(
      '**Exception — diverged-by-design packs** (' +
        divergedPacks.map((p) => '`' + p + '`: ' + DIVERGED_PACKS[p]).join('; ') +
        '): these implement approved scope changes, so they are NOT original-parity packs. Their fixtures always compare the port against the frozen `expected` baseline (captured from the port via `--freeze`), never against the live original.'
    );
  }
  lines.push('');
  for (const pack of packs) {
    const packDiverged = Object.prototype.hasOwnProperty.call(DIVERGED_PACKS, pack);
    lines.push('## ' + pack + (packDiverged ? ' — diverged-by-design (' + DIVERGED_PACKS[pack] + ')' : ''));
    lines.push('');
    if (packDiverged) {
      lines.push('Baseline for this pack is the frozen `expected` field (port is the reference), not the ADWS_Pro original.');
      lines.push('');
    }
    lines.push('| Fixture | Env | ' + (packDiverged ? 'Frozen baseline verdict' : 'Original verdict') + ' | Ported verdict | Full-object match | Deterministic |');
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
  lines.push(
    '- Packs: ' + (packs.length - divergedPacks.length) + ' original-parity, ' + divergedPacks.length +
      ' diverged-by-design' + (divergedPacks.length ? ' (' + divergedPacks.map((p) => p + ': ' + DIVERGED_PACKS[p]).join('; ') + ')' : '')
  );
  // M-5b/B4: split the corpus by where each baseline actually came from. A single
  // "N/N identical" line conflates two very different claims — "matches the original" and
  // "matches a snapshot of itself" — and only the first is parity.
  const originalBaselined = rows.filter((r) => !Object.prototype.hasOwnProperty.call(DIVERGED_PACKS, r.pack)).length;
  const portBaselined = total - originalBaselined;
  lines.push('- Baselines: ' + originalBaselined + ' fixture(s) original-parity, ' + portBaselined +
    ' fixture(s) frozen-baseline regression (the port is its own reference under an approved scope change)');
  lines.push('- Full-object matches (and deterministic): ' + matches);
  lines.push('- Mismatches/failures (incl. NFR-4): ' + mismatches);
  // M-5b/B4. The result line used to read "ALL N/N FIXTURES IDENTICAL — original parity
  // holds", which conflated the two populations the Baselines line above separates and
  // asserted original parity for fixtures that never had it. The two claims are now
  // reported apart, and each says what it actually rests on.
  lines.push(
    '- Result: ' +
      (mismatches === 0
        ? 'ALL ' + total + '/' + total + ' fixtures match their recorded baseline. Of those, ' +
          originalBaselined + ' are original-parity (compared against the ADWS_Pro original' +
          (baselineSource === 'live-original' ? ', live' : ' via a frozen capture of it') + ')' +
          (portBaselined
            ? ' and ' + portBaselined +
              ' are frozen-baseline regression only — the port is its own reference in the diverged packs, so those fixtures assert no original parity.'
            : '.')
        : 'PARITY FAILED')
  );
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'));

  // M-3a: fail loudly if the corpus changed size without the constant being updated.
  if (total !== EXPECTED_FIXTURE_TOTAL) {
    console.error(
      '\nFIXTURE COVERAGE FAILURE: discovered ' + total + ' fixtures, expected ' +
        EXPECTED_FIXTURE_TOTAL + '. A suite that silently shrinks is not a suite — if this ' +
        'change is intentional, update EXPECTED_FIXTURE_TOTAL in run-parity.js in the same commit.'
    );
    process.exit(1);
  }

  console.log(
    '\nSummary: ' + matches + '/' + total + ' fixtures identical, ' + mismatches + ' failures.' +
      (divergedPacks.length
        ? ' Diverged-by-design: ' + divergedPacks.map((p) => p + ' (' + DIVERGED_PACKS[p] + ')').join(', ') + ' — verified against frozen baseline.'
        : '')
  );
  console.log('Report: ' + REPORT_PATH);
  process.exit(mismatches === 0 ? 0 : 1);
}

main();
