#!/usr/bin/env node
'use strict';

/**
 * check-installs.mjs — compare every known installed copy of the skill against this
 * source tree (F-72).
 *
 * The other half of the problem `adws-pipeline/scripts/skill-check.js` addresses. An
 * install can prove it is internally consistent with the manifest it shipped with; it
 * cannot know whether a newer version exists, because it is offline with respect to its
 * source. This runs FROM the source and answers the question the install cannot:
 * **is what is installed what we just merged?**
 *
 * F-72 in one line: three installs sat on pre-remediation validators — F-63, F-64 and
 * F-65 all reproducing live — while this repository's gate was green, because nothing
 * connected the two.
 *
 * Where installs come from:
 *   1. `.adws-installs` in the repo root — one path per line, appended by install.sh
 *      when it installs from this checkout. Gitignored: it is a local fact about this
 *      machine, not a property of the project.
 *   2. `--root <dir>` arguments, repeatable, for installs this checkout did not create.
 *
 * A registry that only install.sh writes cannot know about copies made by hand — so a
 * clean report means "every install I know of is current", never "every install is
 * current". The output says so rather than implying otherwise.
 *
 * Usage:
 *   node scripts/local-ci/check-installs.mjs [--root <dir>]...
 *   make check-installs
 *
 * Exit 0 when every known install is current (or none are registered); 1 when any is
 * stale or modified.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_MANIFEST = path.join(ROOT, 'adws-pipeline', 'skill-manifest.json');
const REGISTRY = path.join(ROOT, '.adws-installs');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_err) {
    return null;
  }
}

const source = readJson(SOURCE_MANIFEST);
if (!source || typeof source.skill_version !== 'string') {
  console.error('[check-installs] FAIL — no readable source manifest at adws-pipeline/skill-manifest.json');
  console.error('  Run: node scripts/local-ci/skill-manifest.mjs --write');
  process.exit(1);
}

// --- collect roots -----------------------------------------------------------
const roots = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root' && argv[i + 1]) roots.push(path.resolve(argv[++i]));
}
if (fs.existsSync(REGISTRY)) {
  for (const line of fs.readFileSync(REGISTRY, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    roots.push(path.resolve(trimmed.replace(/^~(?=$|\/)/, os.homedir())));
  }
}
const unique = [...new Set(roots)];

if (unique.length === 0) {
  console.log('[check-installs] no installs registered.');
  console.log('  install.sh records each destination in .adws-installs; pass --root <dir> for others.');
  console.log('  This is not evidence that no stale install exists — only that none is known here.');
  process.exit(0);
}

// --- compare -----------------------------------------------------------------
let stale = 0;
const rows = [];

for (const root of unique) {
  const skillDir = path.join(root, '.claude', 'skills', 'adws-pipeline');
  const label = root.replace(os.homedir(), '~');

  if (!fs.existsSync(skillDir)) {
    rows.push({ label, state: 'GONE', detail: 'no skill directory (uninstalled or moved)' });
    continue; // not a failure: an install that no longer exists cannot be stale
  }

  const installed = readJson(path.join(skillDir, 'skill-manifest.json'));
  if (!installed || typeof installed.skill_version !== 'string') {
    stale += 1;
    rows.push({
      label,
      state: 'UNKNOWN',
      detail: 'no readable skill-manifest.json — predates F-72 or was installed by hand; reinstall to stamp it',
    });
    continue;
  }

  if (installed.skill_version !== source.skill_version) {
    stale += 1;
    rows.push({
      label,
      state: 'STALE',
      detail: `installed ${installed.skill_version} ≠ source ${source.skill_version}`,
    });
    continue;
  }

  // Same version — but is the installed tree still what that version says it is? A
  // matching version with edited files is the more dangerous of the two failures,
  // because the version string alone looks correct.
  const drifted = [];
  for (const [rel, hash] of Object.entries(installed.skill || {})) {
    const full = path.join(skillDir, rel);
    let buf;
    try {
      buf = fs.readFileSync(full);
    } catch (_err) {
      drifted.push(rel + ' (missing)');
      continue;
    }
    const actual = crypto.createHash('sha256').update(buf).digest('hex');
    if (actual !== hash) drifted.push(rel);
  }
  if (drifted.length) {
    stale += 1;
    rows.push({ label, state: 'MODIFIED', detail: `${drifted.length} file(s) differ from their own manifest: ${drifted.slice(0, 3).join(', ')}` });
    continue;
  }

  rows.push({ label, state: 'CURRENT', detail: installed.skill_version });
}

const width = Math.max(...rows.map((r) => r.label.length), 10);
console.log(`[check-installs] source version ${source.skill_version}`);
for (const r of rows) {
  console.log(`  ${r.label.padEnd(width)}  ${r.state.padEnd(8)}  ${r.detail}`);
}

if (stale > 0) {
  console.error(`\n[check-installs] ${stale} install(s) not current. Reinstall with:  ./install.sh <target>`);
  console.error('  A merged fix does not reach a run until someone reinstalls (F-72).');
  process.exit(1);
}
console.log(`\n[check-installs] OK — ${rows.length} known install(s) current. Unregistered copies are not covered.`);
