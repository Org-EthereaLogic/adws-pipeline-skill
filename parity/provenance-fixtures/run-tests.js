#!/usr/bin/env node
'use strict';

/**
 * Validates the SC-3 B1 phase_manifest.provenance schema for its three
 * contractual shapes: present, partial, and absent. Provenance remains
 * advisory; this harness validates evidence shape, not a gate outcome.
 */

const fs = require('fs');
const path = require('path');

// SC-11/A3 (F-17, closed WONTFIX-with-substitute). The obtainable half of provenance is
// now MANDATORY; the rest is structurally unavailable in this runtime and is written as
// null rather than omitted, so a reader can tell "not captured" from "field dropped".
const MANDATORY_KEYS = ['started_at', 'completed_at', 'wall_clock_s', 'agent', 'model_tier_requested'];
const UNAVAILABLE_KEYS = ['model_id', 'cost_usd', 'tokens_in', 'tokens_out', 'tool_call_count'];
const ALLOWED_KEYS = [
  ...MANDATORY_KEYS,
  ...UNAVAILABLE_KEYS,
  'elapsed_ms',
  'timeout',
  'cancel',
];

const UTC_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const CASES = [
  { name: 'present.json', shape: 'present' },
  { name: 'partial.json', shape: 'partial' },
  { name: 'absent.json', shape: 'absent' },
  // SC-11/A3: the shape every run must now produce, and the shape thirteen field runs
  // actually produced (which must now be rejected).
  { name: 'mandatory-half.json', shape: 'mandatory' },
  { name: 'reject-missing-wall-clock.json', shape: 'invalid' },
];

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateProvenance(value) {
  if (value === null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['provenance must be an object or null'];

  const errors = [];
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.includes(key)) errors.push(`unknown field: ${key}`);
  }

  const checks = {
    started_at: (v) => typeof v === 'string' && UTC_STAMP.test(v),
    completed_at: (v) => typeof v === 'string' && UTC_STAMP.test(v),
    wall_clock_s: (v) => Number.isFinite(v) && v > 0,
    agent: (v) => typeof v === 'string' && v.length > 0,
    model_tier_requested: (v) => typeof v === 'string' && v.length > 0,
    model_id: (v) => typeof v === 'string' && v.length > 0,
    cost_usd: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
    tokens_in: isNonNegativeInteger,
    tokens_out: isNonNegativeInteger,
    elapsed_ms: isNonNegativeInteger,
    tool_call_count: isNonNegativeInteger,
    timeout: (v) => typeof v === 'boolean',
    cancel: (v) => typeof v === 'boolean',
  };

  for (const [key, valueAtKey] of Object.entries(value)) {
    if (valueAtKey !== null && checks[key] && !checks[key](valueAtKey)) {
      errors.push(`invalid ${key}`);
    }
  }
  return errors;
}

let failures = 0;

// M-3a: cross-check the declared CASES against the fixtures on disk in both directions,
// so the suite cannot shrink silently. See the same block in
// parity/execution-report-fixtures/run-tests.js for the reasoning.
{
  const onDisk = fs.readdirSync(__dirname).filter((f) => f.endsWith('.json')).sort();
  const declared = CASES.map((c) => c.name).sort();
  for (const n of onDisk.filter((n) => !declared.includes(n))) {
    failures += 1;
    console.log(`FAIL fixture coverage: "${n}" exists but no CASES entry runs it`);
  }
  for (const n of declared.filter((n) => !onDisk.includes(n))) {
    failures += 1;
    console.log(`FAIL fixture coverage: CASES entry "${n}" has no fixture file`);
  }
  if (failures === 0) {
    console.log(`PASS fixture coverage — ${onDisk.length} fixture file(s) ↔ ${declared.length} CASES entr(ies)`);
  }
}

for (const testCase of CASES) {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, testCase.name), 'utf8'));
  const provenance = manifest.provenance;
  const errors = validateProvenance(provenance);
  const keyCount = provenance === null ? 0 : Object.keys(provenance).length;

  let shapeValid = false;
  if (testCase.shape === 'absent') shapeValid = provenance === null;
  if (testCase.shape === 'partial') shapeValid = keyCount > 0 && keyCount < ALLOWED_KEYS.length;
  if (testCase.shape === 'present') {
    shapeValid = ALLOWED_KEYS.every((key) => Object.hasOwn(provenance, key) || UNAVAILABLE_KEYS.includes(key) || MANDATORY_KEYS.includes(key));
  }
  if (testCase.shape === 'mandatory') {
    // Every obtainable field present AND non-null; every unavailable field present AND
    // null. `wall_clock_s` must also agree with the two stamps it derives from.
    const haveMandatory = MANDATORY_KEYS.every((k) => Object.hasOwn(provenance, k) && provenance[k] !== null);
    const unavailableExplicit = UNAVAILABLE_KEYS.every((k) => Object.hasOwn(provenance, k) && provenance[k] === null);
    const derived =
      (Date.parse(provenance.completed_at) - Date.parse(provenance.started_at)) / 1000 === provenance.wall_clock_s;
    shapeValid = haveMandatory && unavailableExplicit && derived;
    if (!haveMandatory) errors.push('a mandatory provenance field is missing or null');
    if (!unavailableExplicit) errors.push('an unavailable field must be present and null, not omitted');
    if (!derived) errors.push('wall_clock_s does not match completed_at - started_at');
  }
  if (testCase.shape === 'invalid') {
    // This fixture asserts REJECTION: the pre-SC-11 shape must no longer validate.
    const haveMandatory = MANDATORY_KEYS.every((k) => Object.hasOwn(provenance, k) && provenance[k] !== null);
    shapeValid = !haveMandatory;
    if (haveMandatory) errors.push('expected this fixture to be rejected, but it carries the mandatory half');
    errors.length = shapeValid ? 0 : errors.length;
  }

  const passed = errors.length === 0 && shapeValid;
  if (!passed) failures += 1;
  console.log(
    `${passed ? 'PASS' : 'FAIL'} ${testCase.name} — shape=${testCase.shape}` +
      (errors.length > 0 ? ` errors=${errors.join(',')}` : '')
  );
}

const rejectionCases = [
  { cost_usd: -1 },
  { tokens_in: 1.5 },
  { timeout: 'false' },
  { unrecognized: true },
  // SC-11/A3: the obtainable half is typed too — a fabricated or malformed stamp is the
  // exact failure DRILL_EVIDENCE recorded ("timestamps are agent-authored placeholders …
  // treat timeline metadata as synthetic").
  { started_at: '2026-08-08 21:14:02' },
  { completed_at: 'yesterday' },
  { wall_clock_s: 0 },
  { wall_clock_s: -5 },
  { agent: '' },
];
for (const value of rejectionCases) {
  if (validateProvenance(value).length === 0) {
    failures += 1;
    console.log(`FAIL rejection case accepted: ${JSON.stringify(value)}`);
  }
}

if (failures > 0) {
  console.log(`\n${failures} provenance fixture assertion(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll provenance fixtures passed (${CASES.length}/${CASES.length}); invalid shapes rejected.`);
}
