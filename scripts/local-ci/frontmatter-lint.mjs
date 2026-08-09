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
const AGENTS_DIR = join('.claude', 'agents');
// NFR-3. Asserted by hand in every scope change's "Invariants held" until M-3 (357 at
// SC-4, 367 at SC-5, 379 at SC-6 — monotonic, and nothing was watching the trend).
const SKILL_MD_MAX_LINES = 500;
// SC-14/A3 (F-83). The ratchet: a recorded high-water mark that may only be raised
// deliberately, in the same commit, with a reason. See the file's own `_doc`.
const SKILL_LINE_BUDGET = join('parity', 'skill-line-budget.json');
// SC-4 A2: the canonical evidence tiers. `fable` is a ceiling reachable only by
// escalation or explicit operator override, so it is valid here but never expected as a
// checked-in default; anything outside this set is a typo that would surface at dispatch
// time as an unresolvable model, or silently as the runtime's own default.
const CANONICAL_TIERS = new Set(['haiku', 'sonnet', 'opus', 'fable']);
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

// --- NFR-3: SKILL.md stays lean (M-3b) ---
// `wc -l` semantics (count newlines, not split segments) so this number matches the one
// quoted by hand in the DPPD/plan docs.
const skillLines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
if (skillLines >= SKILL_MD_MAX_LINES) {
  problems.push(`${SKILL_MD} is ${skillLines} lines; NFR-3 requires < ${SKILL_MD_MAX_LINES}`);
}

// --- SC-14/A3 (F-83): the line budget ratchet ---
// M-3b asserted the 500 CEILING and recorded the monotonic trend in the same breath. The
// ceiling is the point at which the file is already too large; SC-10's 337-line floor was
// a considered decision that three scope changes then erased in ~24 hours, because a
// decision with no mechanism is a measurement. `budget` may be raised — only by editing
// parity/skill-line-budget.json, with a reason, in the commit that grows the file.
let skillBudget = null;
try {
  const budgetDoc = JSON.parse(readFileSync(SKILL_LINE_BUDGET, 'utf8'));
  if (!Number.isInteger(budgetDoc.budget) || budgetDoc.budget <= 0) {
    problems.push(`${SKILL_LINE_BUDGET} has no valid integer \`budget\``);
  } else {
    skillBudget = budgetDoc.budget;
    if (!Array.isArray(budgetDoc.history) || budgetDoc.history.length === 0) {
      problems.push(`${SKILL_LINE_BUDGET} must carry a non-empty \`history\` array`);
    } else {
      const latest = budgetDoc.history[budgetDoc.history.length - 1];
      if (latest.value !== skillBudget) {
        problems.push(
          `${SKILL_LINE_BUDGET}: \`budget\` is ${skillBudget} but the last \`history\` entry ` +
            `records ${latest.value} — raise it by APPENDING an entry, so the reason travels with the change`
        );
      }
      let prev = null;
      for (const [i, entry] of budgetDoc.history.entries()) {
        if (!entry || typeof entry.reason !== 'string' || entry.reason.trim() === '') {
          problems.push(`${SKILL_LINE_BUDGET}: history[${i}] has no \`reason\``);
        }
        if (!entry || typeof entry.set_by !== 'string' || entry.set_by.trim() === '') {
          problems.push(`${SKILL_LINE_BUDGET}: history[${i}] has no \`set_by\``);
        }
        if (!entry || !Number.isInteger(entry.value)) {
          problems.push(`${SKILL_LINE_BUDGET}: history[${i}] has no integer \`value\``);
        } else {
          // Monotonic. A budget that may go down can hide growth: drop it, grow the file,
          // raise it again, and every individual commit looks disciplined. Lowering the
          // budget is a real and welcome act, but it belongs with a prose change that
          // actually shrinks SKILL.md — which is a scope change, not a lint-silencing edit.
          if (prev !== null && entry.value < prev) {
            problems.push(
              `${SKILL_LINE_BUDGET}: history[${i}] lowers the budget ${prev} -> ${entry.value}. ` +
                'History is monotonic; to lower it, shrink SKILL.md in a change that says so.'
            );
          }
          prev = entry.value;
        }
      }
    }
    if (skillLines > skillBudget) {
      problems.push(
        `${SKILL_MD} is ${skillLines} lines, over its recorded budget of ${skillBudget}. ` +
          `Either bring it back under, or raise \`budget\` in ${SKILL_LINE_BUDGET} and append a ` +
          `\`history\` entry saying why — in THIS commit, where a reviewer reads it (F-83).`
      );
    }
  }
} catch (e) {
  problems.push(`cannot read ${SKILL_LINE_BUDGET}: ${e.message}`);
}

// --- agent frontmatter (M-3c) ---
// install.sh ships .claude/agents/adws-*.md alongside the skill, and Claude Code
// registers each as a subagent type keyed by its `name`. Nothing validated these before
// M-3: a typo'd or missing `name` does not fail loudly — the type simply never registers,
// and the F-11 fallback then papers over it, so the defect surfaces at run time as a
// mystery several layers from its cause.
let agentFiles = [];
try {
  agentFiles = readdirSync(AGENTS_DIR)
    .filter((f) => f.startsWith('adws-') && f.endsWith('.md'))
    .sort();
} catch (e) {
  problems.push(`cannot read ${AGENTS_DIR}: ${e.message}`);
}
if (agentFiles.length === 0) problems.push(`${AGENTS_DIR} contains no adws-*.md agent definitions`);
for (const file of agentFiles) {
  const body = readFileSync(join(AGENTS_DIR, file), 'utf8');
  const fm = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) {
    problems.push(`${file}: no YAML frontmatter block`);
    continue;
  }
  const get = (k) => {
    const mm = fm[1].match(new RegExp(`^${k}:\\s*(.+?)\\s*$`, 'm'));
    return mm ? mm[1].trim() : null;
  };
  const expectedName = file.replace(/\.md$/, '');
  const name = get('name');
  if (!name) problems.push(`${file}: frontmatter missing \`name\``);
  else if (name !== expectedName) {
    problems.push(`${file}: frontmatter name "${name}" must equal the filename stem "${expectedName}"`);
  }
  if (!get('description')) problems.push(`${file}: frontmatter missing \`description\``);
  const toolsRaw = get('tools');
  if (!toolsRaw) problems.push(`${file}: frontmatter missing \`tools\``);

  // SC-10/A1. An agent whose BODY instructs it to write a file must declare the Write
  // tool. Six of ten did not: critic, advocate, grader, verifier, planner and reviewer
  // were all told to write evidence files while holding only Read/Grep/Glob/Bash, so
  // their sole writer was a Bash heredoc. Three field runs recorded a haiku dispatch
  // returning its verdict in the message instead of writing the file, mitigated only by
  // prose in SKILL.md. Whether that prose was the cause is not established — Bash can
  // write — but an agent told to write a file should hold a write tool.
  //
  // This reads the BODY rather than checking a hand-maintained list, and it earned that
  // immediately: the first pass at SC-10 listed five agents and missed the reviewer,
  // whose instruction reads "Write to your attempt directory" rather than "Write EXACTLY
  // one file". A list would have shipped that gap; the regex did not.
  const tools = new Set((toolsRaw || '').split(',').map((s) => s.trim()).filter(Boolean));
  const instructsWrite = /Write EXACTLY one file|Write to your attempt directory/i.test(body);
  if (instructsWrite && !tools.has('Write')) {
    problems.push(
      `${file}: body instructs the agent to write a file, but \`tools:\` omits Write ` +
        `(it would have to shell out via Bash) — SC-10/A1`
    );
  }
  const model = get('model');
  if (!model) problems.push(`${file}: frontmatter missing \`model\``);
  else if (!CANONICAL_TIERS.has(model)) {
    problems.push(
      `${file}: model "${model}" is not a canonical tier (${[...CANONICAL_TIERS].join(', ')}) — SC-4 A2`
    );
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

// --- SC-10/A3: the reference index is BIDIRECTIONAL ---
// The check above proves every path SKILL.md names exists. The converse was never
// checked: a file could sit in references/ that SKILL.md never points at, and nothing
// would notice. That inversion is how ~125 lines of reference-grade material — a
// macOS bash-3.2 case study, a dispatch-fallback contingency, two recovery procedures —
// ended up in the ALWAYS-LOADED SKILL.md instead of in a file read on demand. A
// reference nothing points at is a reference nothing reads.
const referencesDir = join(SKILL_DIR, 'references');
let referenceFiles = [];
try {
  referenceFiles = readdirSync(referencesDir).filter((f) => f.endsWith('.md')).sort();
} catch (e) {
  problems.push(`cannot read ${referencesDir}: ${e.message}`);
}
for (const file of referenceFiles) {
  if (!seen.has(`references/${file}`)) {
    problems.push(
      `${referencesDir}/${file} exists but SKILL.md never references \`references/${file}\` — ` +
        'add it to the reference index or delete it (SC-10/A3)'
    );
  }
}

// --- NFR-3 advisory target (SC-10/A3) ---
// SKILL_MD_MAX_LINES stays the hard ceiling. This is the softer target the extraction
// aimed at: warn without failing, so the trend is visible before it reaches the ceiling
// (357 → 367 → 379 → 412 was monotonic and nothing was watching it).
const SKILL_MD_TARGET_LINES = 350;

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
if (skillLines > SKILL_MD_TARGET_LINES) {
  console.log(
    `[frontmatter-lint] NOTE — SKILL.md is ${skillLines} lines, over the ${SKILL_MD_TARGET_LINES}-line ` +
      `target (ceiling is ${SKILL_MD_MAX_LINES}). Consider moving reference-grade prose to references/.`
  );
}
console.log(
  `[frontmatter-lint] OK — name matches dir, description present, ${seen.size} referenced path(s) exist, ` +
    `${referenceFiles.length} reference file(s) all indexed, ` +
    `${skillDocs.length} skill doc(s) free of out-of-skill paths, ` +
    `SKILL.md ${skillLines} lines (budget ${skillBudget ?? '?'}, NFR-3 ceiling ${SKILL_MD_MAX_LINES}), ` +
    `${agentFiles.length} agent definition(s) well-formed`
);
