#!/usr/bin/env node
'use strict';

/**
 * evidence-integrity.js — makes `references/artifact-layout.md` rule 9 executable.
 *
 * SC-15/F-84b. Rule 9 has said since SC-13 that every `*_at` field is a real UTC value
 * captured with `date -u +%Y-%m-%dT%H:%M:%SZ` at the moment of writing — "never
 * estimated, copied from another file, or a placeholder" — and that a midnight stamp
 * "reads as fabricated evidence". Nothing enforced it. A live run (job_20260812_0001)
 * wrote `"performed_at": "--"` into a reproduction record; the tree passed every gate the
 * skill has and was caught by a human reading files. A grep for `_at` across all nine
 * scripts in scripts/validators/ returns nothing: the rule was prose, and prose does not
 * run.
 *
 * WHAT THIS CHECKS, and only this:
 *   - every key ending in `_at`, at any depth, in every *.json under the given root
 *   - `null` is ALLOWED. An absent timestamp is an honest "not known yet"
 *     (`completed_at` on a running manifest, the five structurally-unavailable provenance
 *     keys). `"--"` is different in kind: it claims a value and carries none.
 *   - a non-null value must be a string matching the exact rule-9 shape. Anything else
 *     is a FACT about the file, so it fails (SC-8 house rule: fact -> fail).
 *   - a well-formed `T00:00:00Z` stamp WARNS rather than fails. Rule 9 says it "reads as
 *     fabricated"; reading-as is a heuristic, and a real event can happen at midnight.
 *     Same house rule, other branch.
 *   - `completed_at` earlier than `started_at` in the same object fails: also a fact.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK. The write-once discipline of FR-4 and the
 * exhaustive orchestrator-owned post-hoc field list in artifact-layout.md are rules about
 * WHO WROTE a field. A finished tree does not record authorship, so no check reading the
 * tree can decide them — a validator that appeared to would be inferring authorship from
 * presence, which is the proxy-for-the-property mistake this codebase keeps finding.
 * Enforcing those needs a different mechanism (per-write attribution at the moment of the
 * write), not a stricter reader. Stated here so the gap stays visible instead of looking
 * covered.
 *
 * USAGE: node evidence-integrity.js <dir | file.json>   → JSON report on stdout
 * EXIT:  0 clean or warnings only · 1 violations found · 3 unreadable path or invalid JSON
 */

const fs = require('fs');
const path = require('path');

// Exactly the shape `date -u +%Y-%m-%dT%H:%M:%SZ` produces. Deliberately not a general
// ISO-8601 parser: rule 9 mandates one command, and accepting the offsets, fractional
// seconds and lowercase `t` that ISO-8601 also permits would let a stamp from some other
// source read as compliant. The rule is narrower than the standard, on purpose.
const UTC_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// Values that name themselves as absent while occupying the field. Compared
// case-insensitively after trimming, because "TBD" and " tbd " are the same claim.
const PLACEHOLDER_TOKENS = new Set(['', '-', '--', '---', 'tbd', 'todo', 'n/a', 'na', 'none', '?', 'null', 'unknown', 'xxx']);

function classify(value) {
  if (value === null) return null; // honest absence
  if (typeof value !== 'string') return { reason: 'wrong_type', detail: typeof value };
  const trimmed = value.trim();
  if (PLACEHOLDER_TOKENS.has(trimmed.toLowerCase())) return { reason: 'placeholder', detail: value };
  if (!UTC_STAMP.test(value)) return { reason: 'malformed', detail: value };
  // A stamp can be perfectly shaped and still not be a date — "2026-02-31T00:00:00Z"
  // matches the regex. Round-tripping through Date is the only way to tell.
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 19) + 'Z' !== value) {
    return { reason: 'not_a_real_instant', detail: value };
  }
  return null;
}

function walk(node, file, pointer, out) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, file, pointer + '/' + i, out));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  for (const key of Object.keys(node)) {
    const value = node[key];
    const childPointer = pointer + '/' + key;
    if (key.endsWith('_at')) {
      out.fieldsChecked += 1;
      const bad = classify(value);
      if (bad) {
        out.violations.push({ file, pointer: childPointer, key, value, reason: bad.reason });
      } else if (typeof value === 'string' && value.endsWith('T00:00:00Z')) {
        out.warnings.push({ file, pointer: childPointer, key, value, reason: 'midnight_stamp' });
      }
    }
    walk(value, file, childPointer, out);
  }

  // Chronology, checked per object so `started_at`/`completed_at` siblings are compared
  // and unrelated timestamps in different objects never are.
  const started = node.started_at;
  const completed = node.completed_at;
  if (typeof started === 'string' && typeof completed === 'string' && UTC_STAMP.test(started) && UTC_STAMP.test(completed)) {
    if (Date.parse(completed) < Date.parse(started)) {
      out.violations.push({
        file,
        pointer: pointer + '/completed_at',
        key: 'completed_at',
        value: completed,
        reason: 'completed_before_started',
      });
    }
  }
}

function collectJsonFiles(root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  const found = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) found.push(full);
    }
  }
  // Sorted so the report is byte-identical across runs on the same tree; an
  // order-dependent report cannot be diffed between attempts.
  return found.sort();
}

function execute(root) {
  const files = collectJsonFiles(root);
  const out = { fieldsChecked: 0, violations: [], warnings: [] };
  for (const file of files) {
    const rel = path.relative(root, file) || path.basename(file);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      // An unparseable evidence file is an integrity failure in its own right, not a
      // reason to stop scanning the rest of the tree.
      out.violations.push({ file: rel, pointer: '', key: null, value: null, reason: 'unparseable_json' });
      continue;
    }
    walk(parsed, rel, '', out);
  }
  // A tree with no JSON in it is not a clean tree — it is a wrong path, or a run that wrote
  // nothing. `artifacts/{jobId}/` always holds at least `run_manifest.json`. Reporting `pass`
  // here would be this script committing the defect it exists to catch: absence reading as
  // success. Distinct from exit 3, which means the path could not be READ at all — here it
  // was read and was empty, which is a fact about the evidence and so fails.
  if (files.length === 0) {
    out.violations.push({ file: null, pointer: '', key: null, value: null, reason: 'no_evidence_files' });
  }

  const rubric_result = out.violations.length > 0 ? 'fail' : out.warnings.length > 0 ? 'warn' : 'pass';
  return {
    rubric_result,
    files_scanned: files.length,
    fields_checked: out.fieldsChecked,
    violations: out.violations,
    warnings: out.warnings,
  };
}

module.exports = { execute, classify, UTC_STAMP };

if (require.main === module) {
  const target = process.argv[2];
  let result;
  try {
    if (!target) throw new Error('missing path (pass an evidence directory or a .json file)');
    result = execute(target);
  } catch (err) {
    console.error('adws-evidence-integrity: cannot read input: ' + err.message);
    process.exit(3);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.rubric_result === 'fail' ? 1 : 0);
}
