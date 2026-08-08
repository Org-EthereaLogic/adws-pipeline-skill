// INPUT: { build_output: { files_changed: [{file_path, action}] } }
// USAGE: node review-risk-assess.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
// NOTE: this pack deliberately diverges from the ADWS_Pro original per an approved scope
//       change. v1.0.0 = exact original parity; v2.0.0 = SC-8 (F-53: `risk_level` is the
//       model-tier signal ONLY and no longer decides `rubric_result`; F-54: security
//       matching is path-segment/token based, skips test corpora, and names the paths it
//       matched).
'use strict';

const manifest = {
  skill_id: 'review.risk_assess',
  version: '2.0.0',
  phase_affinity: ['review'],
  rubric: {
    pass: 'Change set is assessable and scores low or medium risk',
    warn: 'Change set is assessable and scores high risk: security-sensitive paths or many deletes',
    fail: 'Change set is not assessable: build_output missing/malformed, files_changed empty, or any entry lacking a usable file_path',
  },
  metrics: [
    'files_changed',
    'malformed_entries',
    'deletes_count',
    'security_sensitive_count',
    'security_sensitive_paths',
    'risk_level',
  ],
};

// SC-8/F-54. v1.0.0 tested nine regexes against the WHOLE path, so `tokenizer.js`,
// `authoring.js`, and `retention-policy.md` all scored as security-sensitive. Matching is
// now per path segment, per token within a segment (extension stripped, split on
// non-alphanumerics) — `src/auth/login.js` and `lib/session_store.py` match; `tokenizer`
// and `authoring` do not. Membership, not substring: a token is security-sensitive or it
// is not, so adding a term here can never widen an existing one by accident.
const SECURITY_TOKENS = new Set([
  'auth', 'authn', 'authz', 'authentication', 'authorization',
  'credential', 'credentials',
  'secret', 'secrets',
  'token', 'tokens',
  'password', 'passwords', 'passwd',
  'encrypt', 'encryption', 'encrypted',
  'session', 'sessions',
  'permission', 'permissions',
  'policy', 'policies',
]);

// A file UNDER a test corpus is test DATA, not a security surface. The live run that
// prompted SC-8 matched twelve fixture files whose directory names were fixed by its own
// task contract (`fail-two-definitions-one-token/`), and the operator's only remedies were
// to rename the deliverable's files or to overwrite the validator's verdict. Both are
// worse than not matching.
const TEST_CORPUS_SEGMENTS = new Set([
  'fixtures', 'fixture', 'testdata', 'test', 'tests', '__tests__',
  'mocks', '__mocks__', 'spec', 'specs', 'parity',
]);

// Matched paths are reported, not just counted: a warn the operator cannot trace to a file
// costs a manual re-derivation (which the live run paid). Capped so a large change set
// cannot bloat the trace; the count is always exact regardless of the cap.
const MAX_REPORTED_PATHS = 20;

function pathSegments(filePath) {
  return String(filePath == null ? '' : filePath).split('/').filter(Boolean);
}

function segmentTokens(segment) {
  return segment
    .replace(/\.[^.]+$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(tok => tok.toLowerCase());
}

function isSecuritySensitive(filePath) {
  const segments = pathSegments(filePath);
  if (segments.length === 0) return false;
  if (segments.some(seg => TEST_CORPUS_SEGMENTS.has(seg.toLowerCase()))) return false;
  return segments.some(seg => segmentTokens(seg).some(tok => SECURITY_TOKENS.has(tok)));
}

// SC-8/F-59. `files_changed` entries are documented as { file_path, action }
// (references/artifact-layout.md), and an entry with no usable `file_path` cannot be risk-
// assessed at all: it silently contributes a file to the count while being invisible to
// the security scan, which can pull the whole change set down to a lower tier. `[null]`,
// `["a-string"]`, and `[{ "action": "modify" }]` all scored pass/low before this check.
// `action` is deliberately NOT validated against an enum: artifact-layout.md declares the
// field but enumerates no values, only `delete` carries behavior here, and an unrecognized
// action still leaves the entry fully assessable — inventing an enum would manufacture
// exactly the false-fail class SC-8 exists to remove.
function isAssessableEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  return typeof entry.file_path === 'string' && entry.file_path.trim() !== '';
}

function execute(input) {
  const raw = input && input.build_output;
  const buildOutput = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  const files = buildOutput && Array.isArray(buildOutput.files_changed) ? buildOutput.files_changed : [];

  const malformedEntries = files.filter(f => !isAssessableEntry(f)).length;
  const deletesCount = files.filter(f => f && f.action === 'delete').length;
  const securitySensitive = files
    .filter(f => isAssessableEntry(f) && isSecuritySensitive(f.file_path))
    .map(f => f.file_path);
  const securitySensitiveCount = securitySensitive.length;
  const filesCount = files.length;

  // The risk score. Unchanged arithmetic from v1.0.0 — it feeds the per-phase model-tier
  // table in references/phase-gates.md and nothing else.
  let riskLevel;
  if (filesCount === 0 || malformedEntries > 0 || securitySensitiveCount > 0 || deletesCount > 3) {
    // An unassessable change set scores `high` for the same reason an empty one does: the
    // conservative value is the honest one when the input cannot be read. The verdict is
    // `fail` either way, so no tier is ever recomputed from it — this keeps "unassessable
    // ⇒ high" uniform rather than reporting a reassuring `low` beside a failure.
    riskLevel = 'high';
  } else if (filesCount > 5 || deletesCount > 0) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  // SC-8/F-53: the gate verdict, which is NOT the risk score. A validator fails on a FACT
  // and warns on a GUESS — the discipline criteria-to-checks, document-coverage-map, and
  // repo-context-scan already follow. The only fact this validator has is whether there is
  // an assessable change set at all; the security heuristic and the file/delete counts are
  // guesses, so they cap at warn. Before v2.0.0 `high` meant `fail`, which made the `high`
  // row of the tier table unreachable and hard-blocked every security-touching change.
  const assessable =
    buildOutput !== null &&
    Array.isArray(buildOutput.files_changed) &&
    filesCount > 0 &&
    malformedEntries === 0;

  let rubric_result;
  if (!assessable) {
    rubric_result = 'fail';
  } else if (riskLevel === 'high') {
    rubric_result = 'warn';
  } else {
    rubric_result = 'pass';
  }

  return {
    rubric_result,
    files_changed: filesCount,
    malformed_entries: malformedEntries,
    deletes_count: deletesCount,
    security_sensitive_count: securitySensitiveCount,
    security_sensitive_paths: securitySensitive.slice(0, MAX_REPORTED_PATHS),
    risk_level: riskLevel,
    cost_usd: 0,
    token_count: 0,
    model_used: null,
  };
}

module.exports = { manifest, execute };

// --- CLI wrapper (standalone invocation; NFR-4: Node built-ins only) ---
// Usage: node <script>.js <input.json | ->   ('-' reads the JSON object from stdin)
// Exit 0: execute ran (verdict is rubric_result in the printed JSON).
// Exit 3: unreadable input, invalid JSON, or execute threw on bad input.
if (require.main === module) {
  const fs = require('fs');
  const src = process.argv[2];
  let raw;
  try {
    if (!src) throw new Error('missing input path (use a file path or - for stdin)');
    raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  } catch (err) {
    console.error('adws-validator: cannot read input: ' + err.message);
    process.exit(3);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    console.error('adws-validator: invalid JSON: ' + err.message);
    process.exit(3);
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    console.error('adws-validator: input must be a JSON object');
    process.exit(3);
  }
  let result;
  try {
    result = execute(input);
  } catch (err) {
    console.error('adws-validator: execute failed: ' + err.message);
    process.exit(3);
  }
  console.log(JSON.stringify(result, null, 2));
}
