#!/usr/bin/env node
'use strict';

/**
 * Validates the SC-3 B1 phase_manifest.provenance schema for its three
 * contractual shapes: present, partial, and absent. Provenance remains
 * advisory; this harness validates evidence shape, not a gate outcome.
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_KEYS = [
  'model_id',
  'cost_usd',
  'tokens_in',
  'tokens_out',
  'elapsed_ms',
  'tool_call_count',
  'timeout',
  'cancel',
];

const CASES = [
  { name: 'present.json', shape: 'present' },
  { name: 'partial.json', shape: 'partial' },
  { name: 'absent.json', shape: 'absent' },
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

for (const testCase of CASES) {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, testCase.name), 'utf8'));
  const provenance = manifest.provenance;
  const errors = validateProvenance(provenance);
  const keyCount = provenance === null ? 0 : Object.keys(provenance).length;

  let shapeValid = false;
  if (testCase.shape === 'absent') shapeValid = provenance === null;
  if (testCase.shape === 'partial') shapeValid = keyCount > 0 && keyCount < ALLOWED_KEYS.length;
  if (testCase.shape === 'present') {
    shapeValid = ALLOWED_KEYS.every((key) => Object.hasOwn(provenance, key));
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
