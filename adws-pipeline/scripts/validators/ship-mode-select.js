// INPUT: { output_mode, branch_name, policy: { allow_direct_commit } }
// USAGE: node ship-mode-select.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'ship.mode_select',
  version: '1.0.0',
  phase_affinity: ['ship'],
  rubric: {
    pass: 'Output mode is valid, policy-consistent, and branch name is present',
    warn: 'Output mode is valid but conflicts with allow_direct_commit policy, or branch name is absent',
    fail: 'Output mode is missing or not a recognized value',
  },
  metrics: ['output_mode', 'mode_valid', 'policy_consistent', 'has_branch_name'],
};

const VALID_OUTPUT_MODES = ['pr', 'direct_branch', 'patch'];

function execute(input) {
  const outputMode = typeof input.output_mode === 'string' ? input.output_mode : '';
  const branchName = typeof input.branch_name === 'string' ? input.branch_name.trim() : '';
  const policy = input.policy || {};
  const allowDirectCommit = policy.allow_direct_commit !== false;

  const modeValid = VALID_OUTPUT_MODES.includes(outputMode);
  const hasBranchName = branchName.length > 0;

  if (!modeValid) {
    return {
      rubric_result: 'fail',
      output_mode: outputMode || null,
      mode_valid: false,
      policy_consistent: false,
      has_branch_name: hasBranchName,
      cost_usd: 0,
      token_count: 0,
      model_used: null,
    };
  }

  const policyConflict = outputMode === 'direct_branch' && !allowDirectCommit;
  const policyConsistent = !policyConflict;

  let rubric_result;
  if (policyConsistent && hasBranchName) {
    rubric_result = 'pass';
  } else {
    rubric_result = 'warn';
  }

  return {
    rubric_result,
    output_mode: outputMode,
    mode_valid: true,
    policy_consistent: policyConsistent,
    has_branch_name: hasBranchName,
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
