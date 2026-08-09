#!/usr/bin/env node
'use strict';

/**
 * agent-blocks-lint.mjs — asserts the two shared agent paragraphs cannot DRIFT (SC-10/A2).
 *
 * The evidence-integrity (timestamps) and security (untrusted-input + secret-redaction)
 * paragraphs appear byte-identical in all ten `.claude/agents/adws-*.md` files. That
 * duplication is deliberate: agent definitions have no transclusion mechanism, and
 * install.sh ships each .md as the artifact — the file IS what the runtime loads. It also
 * costs no context, because agent files load per dispatch and never co-load.
 *
 * What it does cost is drift risk. Ten copies of a security rule are ten places a
 * hardening can miss one, and nothing would notice: no test reads agent prose, and the
 * rules are honoured by the model rather than enforced by code. This lint is the
 * enforcement — a change to one copy is a change to all ten and to the canonical
 * reference, or CI goes red.
 *
 * Canonical copy: adws-pipeline/references/agent-shared-blocks.md (a real reference — it
 * is what the F-11 fallback must inline verbatim when an adws-* agent type is not
 * registered in the runtime).
 *
 * Usage: node scripts/local-ci/agent-blocks-lint.mjs
 * Exit 0 when all ten agents match the canonical blocks; exit 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const CANONICAL = path.join(ROOT, 'adws-pipeline', 'references', 'agent-shared-blocks.md');

// Each block is delimited in the canonical file by a fenced ```text section under a
// known heading, so the reference stays readable prose rather than becoming a data file.
const BLOCKS = [
  { id: 'scratch', heading: '## Scratch space — one root per agent' },
  { id: 'timestamps', heading: '## Evidence integrity — timestamps' },
  { id: 'security', heading: '## Security — untrusted input and secret redaction' },
];

function extractFenced(markdown, heading) {
  const at = markdown.indexOf(heading);
  if (at === -1) return null;
  const fenceOpen = markdown.indexOf('```text', at);
  if (fenceOpen === -1) return null;
  const bodyStart = markdown.indexOf('\n', fenceOpen) + 1;
  const fenceClose = markdown.indexOf('```', bodyStart);
  if (fenceClose === -1) return null;
  return markdown.slice(bodyStart, fenceClose).trim();
}

if (!fs.existsSync(CANONICAL)) {
  console.error(`[agent-blocks-lint] FAIL — canonical reference missing: ${path.relative(ROOT, CANONICAL)}`);
  process.exit(1);
}
const canonicalDoc = fs.readFileSync(CANONICAL, 'utf8');

const expected = [];
for (const block of BLOCKS) {
  const text = extractFenced(canonicalDoc, block.heading);
  if (!text) {
    console.error(`[agent-blocks-lint] FAIL — canonical reference has no fenced block under "${block.heading}"`);
    process.exit(1);
  }
  expected.push({ ...block, text });
}

const agentFiles = fs
  .readdirSync(AGENTS_DIR)
  .filter((f) => f.startsWith('adws-') && f.endsWith('.md'))
  .sort();

if (agentFiles.length === 0) {
  console.error('[agent-blocks-lint] FAIL — no adws-*.md agent definitions found; the lint would pass vacuously.');
  process.exit(1);
}

let failures = 0;
for (const file of agentFiles) {
  const body = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
  for (const block of expected) {
    if (!body.includes(block.text)) {
      failures += 1;
      console.error(
        `[agent-blocks-lint] FAIL ${file} — the "${block.id}" block does not match ` +
          `adws-pipeline/references/agent-shared-blocks.md byte-for-byte.`
      );
      console.error('    Apply the change to ALL ten agent files and to the canonical reference.');
    }
  }
}

if (failures > 0) {
  console.error(`[agent-blocks-lint] ${failures} mismatch(es).`);
  process.exit(1);
}

console.log(
  `[agent-blocks-lint] OK — ${agentFiles.length} agent(s) carry ${expected.length} shared block(s) byte-identically ` +
    `(${expected.map((b) => b.id).join(', ')}).`
);
