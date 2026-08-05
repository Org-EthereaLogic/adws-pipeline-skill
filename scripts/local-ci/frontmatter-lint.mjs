#!/usr/bin/env node
// frontmatter-lint.mjs — Tier-1 skill-repo lint (zero deps, Node built-ins only).
//
// Asserts the SKILL.md frontmatter is well-formed and that the reference/script paths
// it names actually exist. Run from the repo root: `node scripts/local-ci/frontmatter-lint.mjs`.
// Exit 0 = pass, 1 = one or more violations (printed).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const SKILL_DIR = 'adws-pipeline';
const SKILL_MD = join(SKILL_DIR, 'SKILL.md');
const problems = [];

let text;
try {
  text = readFileSync(SKILL_MD, 'utf8');
} catch (e) {
  console.error(`[frontmatter-lint] cannot read ${SKILL_MD}: ${e.message}`);
  process.exit(1);
}

// --- frontmatter block: the content between the first two `---` fences ---
const m = text.match(/^---\n([\s\S]*?)\n---\n/);
if (!m) {
  problems.push('no YAML frontmatter block (expected leading `---` … `---`)');
} else {
  const fm = m[1];
  const field = (name) => {
    const mm = fm.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm'));
    return mm ? mm[1].trim() : null;
  };
  const name = field('name');
  const description = field('description');
  if (!name) problems.push('frontmatter missing `name`');
  if (!description) problems.push('frontmatter missing `description`');
  const expected = basename(SKILL_DIR);
  if (name && name !== expected) {
    problems.push(`frontmatter name "${name}" must equal the skill directory name "${expected}"`);
  }
}

// --- referenced paths: backtick tokens like `references/x.md` / `scripts/y.js` must exist ---
// (relative to the skill dir; glob patterns containing `*` are skipped — not literal paths.)
const seen = new Set();
const refRe = /`((?:references|scripts)\/[^`\s*]+\.(?:md|js))`/g;
let r;
while ((r = refRe.exec(text)) !== null) {
  const rel = r[1];
  if (seen.has(rel)) continue;
  seen.add(rel);
  const full = join(SKILL_DIR, rel);
  if (!existsSync(full)) problems.push(`SKILL.md references \`${rel}\` but ${full} does not exist`);
}

// --- no references to files outside the skill directory ---
// install.sh copies ONLY adws-pipeline/ and .claude/agents/adws-*.md into a target
// project, so a backticked `docs/…` or `parity/…` path inside the skill is a link that
// is already broken the moment the skill is installed. Development material must be
// described, not addressed by path.
const OUTSIDE_ROOTS = /`((?:docs|parity)\/[^`\s]+)`/g;
const skillDocs = readdirSync(SKILL_DIR, { recursive: true })
  .filter((f) => typeof f === 'string' && f.endsWith('.md'))
  .sort();
for (const rel of skillDocs) {
  const body = readFileSync(join(SKILL_DIR, rel), 'utf8');
  for (const hit of body.matchAll(OUTSIDE_ROOTS)) {
    problems.push(`${SKILL_DIR}/${rel} references \`${hit[1]}\`, which is not installed with the skill`);
  }
}

if (problems.length) {
  console.error(`[frontmatter-lint] FAIL (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `[frontmatter-lint] OK — name matches dir, description present, ${seen.size} referenced path(s) exist, ` +
    `${skillDocs.length} skill doc(s) free of out-of-skill paths`
);
