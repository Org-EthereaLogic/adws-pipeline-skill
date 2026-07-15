// INPUT: entropy_history.jsonl — one JSON object per line: { "phase", "attempt", "parse_failures": <int >= 0>, "recorded_at" }
// USAGE: node entropy-gate.js <entropy_history.jsonl | ->   → JSON gate decision on stdout (action: proceed|escalate|halt)
'use strict';

// X-2 PORT — skill-native stability gate over the ADWS_Pro entropy regulator
// (CascadeGov's portable core). The operational signal is JSON parse-failure
// counts per phase attempt, per the "OPERATIONAL SIGNAL SOURCE" comment in
// ADWS_Pro src/entropy-gating.js. The band math is NOT re-implemented here:
// this gate feeds the history (as {parseFailureScore}) into the already-ported
// drift-sentinel validator (canonical four-band gate, UMIF Canonical Spec
// v1.2 §5/§6). SC-1.b mandates the CANONICAL gate, so this script PINS
// ADWS_UMIF_CANONICAL=on for its drift-sentinel call regardless of ambient
// environment (review finding: with =off/shadow inherited from the env, the
// legacy path returns no canonical band). It then maps band → action:
//   SAFE / WATCH → "proceed"   (WATCH additionally sets "watch": true)
//   WARN         → "escalate"  (bump one model tier)
//   COLLAPSE     → "halt"      (job blocked → terminate STABILITY_BUDGET_EXCEEDED, RETRY class)
// Empty history (zero lines) → band null, action "proceed".
//
// Exit 0: gate ran (the action is in the printed JSON).
// Exit 3: unreadable input or malformed line — same convention as the validators.

const fs = require('fs');
const sentinel = require('./validators/drift-sentinel.js');

const ACTION_FROM_BAND = {
  SAFE: 'proceed',
  WATCH: 'proceed',
  WARN: 'escalate',
  COLLAPSE: 'halt',
};

function fail(message) {
  console.error('adws-entropy-gate: ' + message);
  process.exit(3);
}

function numOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

/** Parse JSON Lines into history entries; throws Error on any malformed line. */
function parseHistoryLines(raw) {
  // Tolerate a single trailing newline (LF or CRLF).
  let body = raw;
  if (body.endsWith('\r\n')) body = body.slice(0, -2);
  else if (body.endsWith('\n')) body = body.slice(0, -1);

  if (body === '') return []; // empty history: zero lines

  const entries = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i];
    const lineNo = i + 1;
    if (line.trim() === '') throw new Error('malformed line ' + lineNo + ': blank line inside history');
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      throw new Error('malformed line ' + lineNo + ': invalid JSON: ' + err.message);
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('malformed line ' + lineNo + ': expected a JSON object');
    }
    if (!Number.isInteger(obj.parse_failures) || obj.parse_failures < 0) {
      throw new Error(
        'malformed line ' + lineNo + ': parse_failures must be an integer >= 0, got ' + JSON.stringify(obj.parse_failures)
      );
    }
    entries.push(obj);
  }
  return entries;
}

if (require.main === module) {
  const src = process.argv[2];
  let raw;
  try {
    if (!src) throw new Error('missing input path (use a file path or - for stdin)');
    raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  } catch (err) {
    fail('cannot read input: ' + err.message);
  }

  let entries;
  try {
    entries = parseHistoryLines(raw);
  } catch (err) {
    fail(err.message);
  }

  // Signal for the drift-sentinel band math, in file order.
  const entropy_history = entries.map((l) => ({ parseFailureScore: l.parse_failures }));

  // Pin canonical mode for the sentinel call (SC-1.b), restoring the ambient
  // value afterwards so this process leaves the environment untouched.
  const ambientMode = process.env.ADWS_UMIF_CANONICAL;
  process.env.ADWS_UMIF_CANONICAL = 'on';
  let verdict;
  try {
    verdict = sentinel.execute({ entropy_history });
  } catch (err) {
    fail('drift-sentinel execute failed: ' + err.message);
  } finally {
    if (ambientMode === undefined) delete process.env.ADWS_UMIF_CANONICAL;
    else process.env.ADWS_UMIF_CANONICAL = ambientMode;
  }

  let band = null;
  let action = 'proceed';
  let watch = false;
  if (entropy_history.length > 0) {
    band = typeof verdict.band === 'string' ? verdict.band : null;
    action = ACTION_FROM_BAND[band];
    if (action === undefined) fail('unrecognized band from drift-sentinel: ' + JSON.stringify(verdict.band));
    watch = band === 'WATCH';
  }

  console.log(
    JSON.stringify(
      {
        action,
        band,
        ctm: numOrNull(verdict.ctm),
        xi: numOrNull(verdict.xi),
        rate: numOrNull(verdict.rate),
        accel: numOrNull(verdict.accel),
        history_length: Number.isFinite(verdict.history_length) ? verdict.history_length : entropy_history.length,
        watch,
      },
      null,
      2
    )
  );
}
