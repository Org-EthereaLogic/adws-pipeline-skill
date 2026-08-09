#!/usr/bin/env node
'use strict';

/**
 * no-eval-lint.mjs — asserts that agent-authored evidence strings are never executed
 * (SC-14/A2, F-82).
 *
 * SC-13's review classified `reproduction.command` as Critical: a free-form shell string
 * composed by an agent that has just read an untrusted repository, recorded in a schema
 * with no handling rule. The rule was then written into references/artifact-layout.md and
 * nowhere else — not a SKILL.md hard rule, not in the agents' security block, and asserted
 * by nothing. That is F-55 (a rule nothing asserts is a rule nothing enforces) inside the
 * scope change that fixed F-55's sibling. SC-14 puts the rule in all three places; this is
 * the assertion.
 *
 * Nothing in the shipped tree executes such a string today. That is precisely when the
 * check is cheap: it costs nothing now and it fails the day someone adds the convenience
 * replay that would make it live.
 *
 * WHAT IT CHECKS — two rules over two different scopes, because they are different claims:
 *
 *   1. SINKS, in the SHIPPED tree only (adws-pipeline/scripts/). No `child_process`,
 *      `execSync`, `spawn*`, `exec(`, `eval(`, `new Function`, or `vm`. This is the tree
 *      that runs on an operator's machine against an untrusted repository, and it has no
 *      business executing anything. `requires-lint` already proves the IMPORT half; this
 *      widens it to the call half, so a dynamic `await import('node:child_process')`
 *      cannot slip past.
 *
 *      The harness (parity/, scripts/local-ci/) is deliberately NOT scanned for sinks: it
 *      spawns `process.execPath` on fixed script paths to run the validators under test,
 *      and `guard-ablation.mjs` instantiates mutated validator source with `new Function`
 *      by design. Those are the harness doing its job on inputs it controls. Banning them
 *      would be a rule the project would have to break on its first use, which is worse
 *      than no rule.
 *
 *   2. `command` READS, EVERYWHERE (shipped tree and harness both). The field exists only
 *      in agent-authored evidence. No code in this repository has any legitimate reason to
 *      read it, so the read itself is the tripwire — not read-plus-sink. That keeps the
 *      check a simple lexical fact rather than a dataflow claim it cannot honestly make,
 *      and it fires in the harness too, which is where a convenience replay would most
 *      plausibly be added.
 *
 * This is a lexical check, not a proof. It cannot see through a computed property name.
 * It is a tripwire on the obvious path, which is the path a convenience feature takes.
 *
 * Usage: node scripts/local-ci/no-eval-lint.mjs
 * Exit 0 when the tree is clean; exit 1 with the file, line and matched text otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Rule 1 scope: the tree that ships and runs against an untrusted repository.
const SINK_DIRS = [path.join(ROOT, 'adws-pipeline', 'scripts')];

// Rule 2 scope: everywhere. No code here has a reason to read the agent-authored field.
const COMMAND_DIRS = [
  path.join(ROOT, 'adws-pipeline', 'scripts'),
  path.join(ROOT, 'scripts', 'local-ci'),
  path.join(ROOT, 'parity'),
];

const SINKS = [
  { id: 'child_process', re: /\bchild_process\b/ },
  { id: 'execSync', re: /\bexecSync\s*\(/ },
  { id: 'execFileSync', re: /\bexecFileSync\s*\(/ },
  { id: 'spawnSync', re: /\bspawnSync\s*\(/ },
  { id: 'spawn', re: /\bspawn\s*\(/ },
  { id: 'exec', re: /(?<![A-Za-z0-9_.])exec\s*\(/ },
  { id: 'eval', re: /(?<![A-Za-z0-9_.])eval\s*\(/ },
  { id: 'new Function', re: /\bnew\s+Function\s*\(/ },
  // Review follow-up: the first cut matched `node:vm` and `require('vm')` and missed the
  // bare dynamic form `await import('vm')`. Match the module specifier in every spelling
  // — static import, dynamic import, and require — with or without the `node:` prefix.
  { id: 'vm module', re: /\bfrom\s*['"](?:node:)?vm['"]|\b(?:import|require)\s*\(\s*['"](?:node:)?vm['"]\s*\)/ },
];

// The evidence field itself, in the spellings that actually occur in JS:
//   repro.command            property read
//   repro['command']         computed read, the same thing spelled to dodge a naive grep
//   const { command } = ...  destructuring — an ORDINARY form, missed by the first cut
//   { command: cmd }         renamed destructuring
// This stays lexical and cannot see through a fully computed key (`repro[k]`), which is
// stated rather than papered over: it is a tripwire on the obvious path, and the obvious
// path is the one a convenience feature takes.
const COMMAND_READ = [
  /\.command\b/,
  /\[\s*['"]command['"]\s*\]/,
  /\{[^{}]*\bcommand\b[^{}]*\}\s*=/,
];

// This lint describes the very patterns it forbids, so its own source would match. Files
// may opt out of a scan of their prose — never of their code — with this marker, and the
// marker only suppresses lines inside block comments.
const SELF = path.resolve(__dirname, 'no-eval-lint.mjs');

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Strip comments so an explanatory sentence is not a finding. requires-lint and
// bash32-scan both learned this the same way — their first cut flagged their own prose.
function stripComments(src) {
  let out = '';
  let i = 0;
  let state = 'code'; // code | line | block | sq | dq | tpl
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { state = 'sq'; }
      else if (c === '"') { state = 'dq'; }
      else if (c === '`') { state = 'tpl'; }
      out += c; i += 1; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; } else { out += ' '; }
      i += 1; continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' ';
      i += 1; continue;
    }
    // inside a string literal: copy through, honouring escapes
    if (c === '\\') { out += '  '; i += 2; continue; }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
      state = 'code';
    }
    out += c; i += 1; continue;
  }
  return out;
}

const findings = [];

function scan(dirs, check) {
  const seen = new Set();
  for (const dir of dirs) {
    for (const file of listFiles(dir)) {
      if (path.resolve(file) === SELF) continue; // this file documents the patterns it bans
      if (seen.has(file)) continue;
      seen.add(file);
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, idx) => check(file, idx + 1, line));
    }
  }
  return seen.size;
}

// Rule 1 — no execution sink in the shipped tree.
const shippedCount = scan(SINK_DIRS, (file, line, text) => {
  for (const sink of SINKS) {
    if (sink.re.test(text)) {
      findings.push({ file, line, rule: `execution sink: ${sink.id}`, text: text.trim() });
    }
  }
});

// Rule 2 — nothing anywhere reads the agent-authored `command` field.
const commandCount = scan(COMMAND_DIRS, (file, line, text) => {
  if (COMMAND_READ.some((re) => re.test(text))) {
    findings.push({ file, line, rule: 'reads the agent-authored `command` field', text: text.trim() });
  }
});

if (findings.length > 0) {
  console.error('[no-eval-lint] FAIL — agent-authored evidence must never reach an execution sink (F-82).');
  for (const f of findings) {
    console.error(`  ${path.relative(ROOT, f.file)}:${f.line}  ${f.rule}`);
    console.error(`    ${f.text.slice(0, 120)}`);
  }
  console.error(
    '\n  A `reproduction.command` is a human-readable RECORD. Reproduce a finding by reading it\n' +
      '  and deciding, per SKILL.md hard rule 9 — automated replay goes through an allowlisted\n' +
      '  runner keyed by `check_id`, never through the string.'
  );
  process.exit(1);
}

console.log(
  `[no-eval-lint] OK — ${shippedCount} shipped script(s) carry no execution sink; ` +
    `${commandCount} script(s) never read the agent-authored \`command\` field.`
);
