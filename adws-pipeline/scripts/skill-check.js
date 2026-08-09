// USAGE: node scripts/skill-check.js [--json]   → prints the installed skill's version and
//        verifies every shipped file against skill-manifest.json.
// Exit 0: intact. Exit 1: integrity mismatch. Exit 3: manifest missing or unreadable.
'use strict';

// Why this ships WITH the skill (F-72).
//
// A merged fix does not reach a run until someone reinstalls, and nothing said so. All
// three installed copies of this skill were still pre-remediation while the source
// repository's gate was green — F-63, F-64 and F-65 all reproduced live in code that was
// about to run against a real repository. The repository lints its own tree exhaustively
// and had no idea what any installed copy contained.
//
// This closes the half of that gap an installed copy can close on its own: it proves the
// installed tree is internally consistent with the manifest it was installed with, and it
// reports the version so that EVERY RUN records which skill actually executed. It cannot
// know whether a newer version exists upstream — an install is offline with respect to its
// source — so staleness against source is the other half, checked by `make check-installs`
// from the repository. Together: the install proves what it is, the repository proves
// whether that is current.
//
// The orchestrator runs this at intake (SKILL.md step 0) and records `skill_version` in
// `run_manifest.json`, so a job shipped by a stale install says so in its own evidence
// rather than in nobody's.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKILL_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(SKILL_DIR, 'skill-manifest.json');
const MANIFEST_NAME = 'skill-manifest.json';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function die(code, message) {
  process.stderr.write('adws-skill-check: ' + message + '\n');
  process.exit(code);
}

/**
 * Agents install to a sibling of the skills tree, but live elsewhere in the source repo:
 *   installed: <root>/.claude/skills/adws-pipeline  →  <root>/.claude/agents
 *   source:    <repo>/adws-pipeline                 →  <repo>/.claude/agents
 * Both are checked so this script behaves identically in a checkout and in an install.
 */
function findAgentsDir() {
  const candidates = [
    path.resolve(SKILL_DIR, '..', '..', 'agents'), // installed layout
    path.resolve(SKILL_DIR, '..', '.claude', 'agents'), // source layout
  ];
  return candidates.find((d) => fs.existsSync(d)) || null;
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
} catch (err) {
  die(3, 'cannot read ' + MANIFEST_NAME + ': ' + err.message);
}
if (manifest === null || typeof manifest !== 'object' || typeof manifest.skill_version !== 'string') {
  die(3, MANIFEST_NAME + ' is malformed (no skill_version)');
}

const mismatched = [];
const missing = [];
const unexpected = [];

// --- skill files -------------------------------------------------------------
const declaredSkill = manifest.skill || {};
for (const rel of Object.keys(declaredSkill)) {
  const full = path.join(SKILL_DIR, rel);
  let buf;
  try {
    buf = fs.readFileSync(full);
  } catch (_err) {
    missing.push('skill/' + rel);
    continue;
  }
  if (sha256(buf) !== declaredSkill[rel]) mismatched.push('skill/' + rel);
}

// An UNDECLARED file in the skill tree matters as much as a changed one: it is how a
// partial install, a stray edit, or a leftover staging directory hides in plain sight.
(function walkSkill(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSkill(full);
      continue;
    }
    if (entry.name === '.DS_Store') continue;
    const rel = path.relative(SKILL_DIR, full).split(path.sep).join('/');
    if (rel === MANIFEST_NAME) continue;
    if (!(rel in declaredSkill)) unexpected.push('skill/' + rel);
  }
})(SKILL_DIR);

// --- agent definitions -------------------------------------------------------
const declaredAgents = manifest.agents || {};
const agentsDir = findAgentsDir();
let agentsChecked = 0;
if (agentsDir) {
  for (const name of Object.keys(declaredAgents)) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(agentsDir, name));
    } catch (_err) {
      missing.push('agent/' + name);
      continue;
    }
    agentsChecked += 1;
    if (sha256(buf) !== declaredAgents[name]) mismatched.push('agent/' + name);
  }
}

const intact = mismatched.length === 0 && missing.length === 0 && unexpected.length === 0;
const result = {
  skill_version: manifest.skill_version,
  git_commit: manifest.git_commit || null,
  intact,
  files_declared: Object.keys(declaredSkill).length + Object.keys(declaredAgents).length,
  agents_dir: agentsDir,
  agents_checked: agentsChecked,
  mismatched,
  missing,
  unexpected,
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  process.stdout.write('skill_version: ' + result.skill_version + '\n');
  if (result.git_commit) process.stdout.write('built_from:    ' + result.git_commit + '\n');
  process.stdout.write(
    'integrity:     ' +
      (intact
        ? 'OK — ' + result.files_declared + ' declared file(s) match'
        : mismatched.length + ' changed, ' + missing.length + ' missing, ' + unexpected.length + ' undeclared') +
      '\n'
  );
  if (!agentsDir) {
    process.stdout.write('agents:        NOT CHECKED — no agents directory found beside this install\n');
  }
  for (const f of mismatched.slice(0, 10)) process.stdout.write('  changed:    ' + f + '\n');
  for (const f of missing.slice(0, 10)) process.stdout.write('  missing:    ' + f + '\n');
  for (const f of unexpected.slice(0, 10)) process.stdout.write('  undeclared: ' + f + '\n');
}

// A missing agents directory is reported, never fatal: the skill runs from a checkout
// during development, where the agents live somewhere this script may not find.
process.exit(intact ? 0 : 1);
