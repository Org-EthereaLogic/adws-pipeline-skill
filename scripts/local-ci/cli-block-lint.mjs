#!/usr/bin/env node
'use strict';

/**
 * cli-block-lint.mjs — asserts the duplicated CLI wrapper cannot DRIFT (M-5a/A3).
 *
 * Each of the nine validators ends with the same 31-line CLI wrapper: 279 lines of
 * deliberate copy-paste. Extracting it to a shared `./_cli.js` was considered and
 * rejected — it breaks `checkRequires` in parity/run-parity.js (whose builtins set
 * is exactly {fs, path, node:fs, node:path}), and that two-line check is what
 * produces the NFR-4 acceptance evidence; the only non-weakening fix is a recursive
 * allowlisted scan, which adds subtlety to the check that ASSERTS the guarantee.
 * Extraction would also silently revoke the single-file-standalone property every
 * validator's own USAGE header advertises.
 *
 * Duplication is only safe if it cannot diverge. This lint is what makes that true:
 * a fix applied to one copy is a fix applied to all nine, or CI goes red. Without
 * it, SC-9's input-size cap would be a ten-file edit that could half-land — nine
 * files hardened, one forgotten, and no existing test able to tell.
 *
 * Scope: the EXECUTABLE block only, from `if (require.main === module)` to EOF.
 * The comment header immediately above it is excluded because it legitimately
 * differs — drift-sentinel.js names itself in its USAGE line and documents the
 * ADWS_UMIF_CANONICAL env var it reads. That is per-file documentation, not shared
 * logic. Verified at the time of writing: all nine executable blocks hash to
 * d044bfb48f75a9ad1a977e5e86cee3c9.
 *
 * Usage: node scripts/local-ci/cli-block-lint.mjs
 * Exit 0 when all nine copies match parity/cli-wrapper.expected.txt; exit 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const VALIDATOR_DIR = path.join(ROOT, 'adws-pipeline', 'scripts', 'validators');
const CANONICAL_PATH = path.join(ROOT, 'parity', 'cli-wrapper.expected.txt');

const MARKER = 'if (require.main === module)';

function extractBlock(source) {
  const idx = source.indexOf(MARKER);
  if (idx === -1) return null;
  return source.slice(idx);
}

function firstDifference(actual, expected) {
  const a = actual.split('\n');
  const b = expected.split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return {
        line: i + 1,
        actual: a[i] === undefined ? '<end of block>' : a[i],
        expected: b[i] === undefined ? '<end of block>' : b[i],
      };
    }
  }
  return null;
}

if (!fs.existsSync(CANONICAL_PATH)) {
  console.error(`[cli-block-lint] FAIL — canonical block missing: ${path.relative(ROOT, CANONICAL_PATH)}`);
  process.exit(1);
}
const canonical = fs.readFileSync(CANONICAL_PATH, 'utf8');
const canonicalLines = canonical.split('\n').filter((l) => l.length > 0).length;

const validators = fs
  .readdirSync(VALIDATOR_DIR)
  .filter((f) => f.endsWith('.js'))
  .sort();

let failures = 0;

for (const file of validators) {
  const source = fs.readFileSync(path.join(VALIDATOR_DIR, file), 'utf8');
  const block = extractBlock(source);

  if (block === null) {
    failures += 1;
    console.error(`[cli-block-lint] FAIL ${file} — no CLI wrapper found (missing "${MARKER}")`);
    continue;
  }

  if (block !== canonical) {
    failures += 1;
    const diff = firstDifference(block, canonical);
    console.error(`[cli-block-lint] FAIL ${file} — CLI wrapper differs from parity/cli-wrapper.expected.txt`);
    if (diff) {
      console.error(`    first difference at wrapper line ${diff.line}:`);
      console.error(`      expected: ${diff.expected}`);
      console.error(`      actual:   ${diff.actual}`);
    }
    console.error('    Apply the change to ALL nine validators and to parity/cli-wrapper.expected.txt.');
  }
}

if (validators.length === 0) {
  failures += 1;
  console.error('[cli-block-lint] FAIL — no validators found; the lint would pass vacuously.');
}

if (failures > 0) {
  console.error(`[cli-block-lint] ${failures} validator(s) failed.`);
  process.exit(1);
}

console.log(
  `[cli-block-lint] OK — ${validators.length} validator(s) carry a byte-identical ${canonicalLines}-line CLI wrapper.`
);
