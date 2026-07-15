// INPUT: { plan_output: { file_change_proposal: [{file_path, action, description}], plan_summary }, policy: { allowed_paths: [string], blocked_paths: [string] } }
//   NOTE: each proposal's `description` (what changes and why) is read by the
//   underspecification check below — a proposal with a missing or <3-char
//   `description` yields `warn`. The planner (adws-planner) MUST emit this field.
// USAGE: node repo-context-scan.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'repo.context_scan',
  version: '1.0.0',
  phase_affinity: ['build'],
  rubric: {
    pass: 'Plan file proposals are well-specified and within policy bounds',
    warn: 'Plan has minor gaps in file specification or path coverage',
    fail: 'Plan has no file proposals or proposes paths outside policy bounds',
  },
  metrics: ['files_proposed', 'directories_touched', 'policy_violations', 'underspecified'],
};

function execute(input) {
  const planOutput = input.plan_output || {};
  const policy = input.policy || {};
  const proposals = planOutput.file_change_proposal || [];

  const directoriesSet = new Set();
  const policyViolations = [];
  const groupedFiles = {};

  for (const proposal of proposals) {
    const filePath = proposal.file_path || '';
    const parts = filePath.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    directoriesSet.add(dir);

    if (!groupedFiles[dir]) {
      groupedFiles[dir] = [];
    }
    groupedFiles[dir].push({ file: filePath, action: proposal.action || 'unknown' });

    const allowedPaths = policy.allowed_paths || [];
    if (allowedPaths.length > 0) {
      const inAllowed = allowedPaths.some(ap => filePath.startsWith(ap));
      if (!inAllowed) {
        policyViolations.push({ file: filePath, reason: 'outside_allowed_paths' });
      }
    }

    const blockedPaths = policy.blocked_paths || [];
    for (const bp of blockedPaths) {
      if (filePath.startsWith(bp)) {
        policyViolations.push({ file: filePath, reason: 'in_blocked_path', blocked_path: bp });
      }
    }
  }

  const underspecified = proposals.length === 0;

  let rubric_result;
  if (policyViolations.length > 0) {
    rubric_result = 'fail';
  } else if (underspecified) {
    rubric_result = 'warn';
  } else if (proposals.some(p => !p.description || p.description.length < 3)) {
    rubric_result = 'warn';
  } else {
    rubric_result = 'pass';
  }

  return {
    rubric_result,
    files_proposed: proposals.length,
    directories_touched: directoriesSet.size,
    grouped_files: groupedFiles,
    policy_violations: policyViolations,
    underspecified,
    plan_summary: planOutput.plan_summary || null,
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
