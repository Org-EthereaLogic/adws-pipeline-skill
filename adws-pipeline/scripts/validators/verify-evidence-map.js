// INPUT: { checks: [{check, pass}] }
// USAGE: node verify-evidence-map.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'verify.evidence_map',
  version: '1.0.0',
  phase_affinity: ['verify'],
  rubric: {
    pass: 'All verify checks are present and pass; no syntax errors detected',
    warn: 'Verify checks present but one or more fail; syntax errors found',
    fail: 'No verify checks produced; evidence map is empty',
  },
  metrics: ['checks_total', 'checks_passed', 'checks_failed', 'syntax_errors', 'evidence_coverage'],
};

function execute(input) {
  const checks = Array.isArray(input.checks) ? input.checks : [];
  const checksTotal = checks.length;

  if (checksTotal === 0) {
    return {
      rubric_result: 'fail',
      checks_total: 0,
      checks_passed: 0,
      checks_failed: 0,
      syntax_errors: 0,
      evidence_coverage: 0,
      cost_usd: 0,
      token_count: 0,
      model_used: null,
    };
  }

  const passed = checks.filter(c => c.pass === true).length;
  const failed = checksTotal - passed;
  const syntaxErrors = checks.filter(c => c.check === 'js_syntax' && !c.pass).length;
  const evidenceCoverage = passed / checksTotal;

  let rubric_result;
  if (failed === 0) {
    rubric_result = 'pass';
  } else {
    rubric_result = 'warn';
  }

  return {
    rubric_result,
    checks_total: checksTotal,
    checks_passed: passed,
    checks_failed: failed,
    syntax_errors: syntaxErrors,
    evidence_coverage: evidenceCoverage,
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
  // SC-9/A3(b). Every wrapper read stdin and files unbounded, with no size limit
  // anywhere in the codebase. The cap bounds the read and the parse before either
  // can become the failure. 64 MiB is far above any evidence payload a recorded
  // job has produced, so a legitimate input never approaches it. This is a floor,
  // NOT the fix for F-65: a 200k-entry entropy history is only ~2 MB, well under
  // the cap — the fix for that is the fold in drift-sentinel.js.
  const MAX_INPUT_BYTES = 64 * 1024 * 1024;
  let raw;
  try {
    if (!src) throw new Error('missing input path (use a file path or - for stdin)');
    const buf = src === '-' ? fs.readFileSync(0) : fs.readFileSync(src);
    if (buf.length > MAX_INPUT_BYTES) {
      throw new Error('input exceeds ' + MAX_INPUT_BYTES + ' bytes (' + buf.length + ')');
    }
    raw = buf.toString('utf8');
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
