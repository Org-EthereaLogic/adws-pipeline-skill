#!/usr/bin/env node
// requires-lint.mjs — Tier-1 extended NFR-4 built-ins-only scan (zero deps).
//
// run-parity.js already asserts the 9 validators require only {fs, path} — but NOT
// entropy-gate.js or execution-report.js. This closes that gap: those two must import
// only Node built-ins or INTRA-REPO RELATIVE modules (e.g. ./validators/drift-sentinel.js),
// never an external npm package (the repo ships no package.json / node_modules).
// Run from repo root: `node scripts/local-ci/requires-lint.mjs`. Exit 0 pass, 1 fail.
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

const TARGETS = [
  'adws-pipeline/scripts/entropy-gate.js',
  'adws-pipeline/scripts/execution-report.js',
];
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const problems = [];

// Matches: require('x') / require("x") and import ... from 'x'
const specRe = /(?:require\(\s*|from\s+)['"]([^'"]+)['"]/g;

for (const file of TARGETS) {
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch (e) {
    problems.push(`${file}: cannot read (${e.message})`);
    continue;
  }
  let mm;
  const spent = new Set();
  while ((mm = specRe.exec(src)) !== null) {
    const spec = mm[1];
    if (spent.has(spec)) continue;
    spent.add(spec);
    const relative = spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
    const builtin = BUILTINS.has(spec) || BUILTINS.has(spec.replace(/^node:/, ''));
    if (!relative && !builtin) {
      problems.push(`${file}: imports non-builtin, non-relative module "${spec}" (external deps are forbidden — NFR-4)`);
    }
  }
}

if (problems.length) {
  console.error(`[requires-lint] FAIL (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[requires-lint] OK — ${TARGETS.length} scripts import only Node built-ins + intra-repo relative modules`);
