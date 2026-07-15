// INPUT: { build_output: { files_changed: [{file_path, action}] } }
// USAGE: node review-risk-assess.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'review.risk_assess',
  version: '1.0.0',
  phase_affinity: ['review'],
  rubric: {
    pass: 'Change set is low risk: few files, no security-sensitive paths, no deletes',
    warn: 'Change set has moderate risk: multiple files or security-adjacent paths touched',
    fail: 'Change set is high risk: security-sensitive files modified, many deletes, or no files present',
  },
  metrics: ['files_changed', 'deletes_count', 'security_sensitive_count', 'risk_level'],
};

const SECURITY_SENSITIVE_PATTERNS = [
  /auth/i,
  /credential/i,
  /secret/i,
  /token/i,
  /password/i,
  /encrypt/i,
  /session/i,
  /permission/i,
  /policy/i,
];

function isSecuritySensitive(filePath) {
  return SECURITY_SENSITIVE_PATTERNS.some(pattern => pattern.test(filePath));
}

function execute(input) {
  const buildOutput = input.build_output || {};
  const files = Array.isArray(buildOutput.files_changed) ? buildOutput.files_changed : [];

  const deletesCount = files.filter(f => f.action === 'delete').length;
  const securitySensitiveCount = files.filter(f => isSecuritySensitive(f.file_path || '')).length;
  const filesCount = files.length;

  let riskLevel;
  if (filesCount === 0 || securitySensitiveCount > 0 || deletesCount > 3) {
    riskLevel = 'high';
  } else if (filesCount > 5 || deletesCount > 0) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  let rubric_result;
  if (riskLevel === 'high') {
    rubric_result = 'fail';
  } else if (riskLevel === 'medium') {
    rubric_result = 'warn';
  } else {
    rubric_result = 'pass';
  }

  return {
    rubric_result,
    files_changed: filesCount,
    deletes_count: deletesCount,
    security_sensitive_count: securitySensitiveCount,
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
