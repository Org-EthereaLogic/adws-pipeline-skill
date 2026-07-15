// INPUT: { build_output: { files_changed: [{file_path, action}] }, output_mode, branch_name }
// USAGE: node patch-compose.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'patch.compose',
  version: '1.0.0',
  phase_affinity: ['ship'],
  rubric: {
    pass: 'Ship output is well-composed: files present, output mode valid, branch name provided',
    warn: 'Ship output is partially composed: missing branch name or output mode is non-standard',
    fail: 'Ship output is malformed: no files to ship or output mode is unknown',
  },
  metrics: ['files_to_ship', 'output_mode', 'has_branch_name', 'composition_valid'],
};

const VALID_OUTPUT_MODES = ['pr', 'direct_branch', 'patch'];

function execute(input) {
  const buildOutput = input.build_output || {};
  const outputMode = typeof input.output_mode === 'string' ? input.output_mode : '';
  const branchName = typeof input.branch_name === 'string' ? input.branch_name.trim() : '';

  const files = Array.isArray(buildOutput.files_changed) ? buildOutput.files_changed : [];
  const filesToShip = files.length;

  const modeValid = VALID_OUTPUT_MODES.includes(outputMode);
  const hasBranchName = branchName.length > 0;
  const compositionValid = filesToShip > 0 && modeValid;

  let rubric_result;
  if (!compositionValid) {
    rubric_result = 'fail';
  } else if (!hasBranchName || !modeValid) {
    rubric_result = 'warn';
  } else {
    rubric_result = 'pass';
  }

  return {
    rubric_result,
    files_to_ship: filesToShip,
    output_mode: outputMode || null,
    has_branch_name: hasBranchName,
    composition_valid: compositionValid,
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
