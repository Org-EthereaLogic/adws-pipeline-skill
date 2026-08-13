// INPUT: { output_mode, branch_name, policy: { allow_direct_commit } }
// USAGE: node ship-mode-select.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'ship.mode_select',
  version: '2.0.0',
  phase_affinity: ['ship'],
  rubric: {
    pass: 'Output mode is valid, policy-consistent, and branch name is present and well-formed',
    warn: 'Output mode is valid but conflicts with allow_direct_commit policy, or branch name is absent',
    fail: 'Output mode is missing or unrecognized, or the branch name is not safe to pass to git',
  },
  metrics: ['output_mode', 'mode_valid', 'policy_consistent', 'has_branch_name', 'branch_name_valid'],
};

const VALID_OUTPUT_MODES = ['pr', 'direct_branch', 'patch'];

// --- Branch-name safety (SC-9/A2) --------------------------------------------
// These two validators are documented as the PRE-GIT gate, and branch_name is the
// one field they hold that reaches git: SKILL.md interpolates it into
// `git worktree add ... -b adws/{jobId}/{slug}` and adws-shipper.md:49,62 into
// `git push -u origin {branch_name}`. Before SC-9 the only check was
// `.trim().length > 0`, so `--upload-pack=/tmp/evil` and `foo; rm -rf ~` both
// returned pass. The validators execute no git, so this is a validation gap
// rather than a demonstrated injection -- but a leading-dash value lands in argv
// option position, and nothing in the spec constrains how the agent quotes the
// value for the shell. Whether a name is well-formed is a FACT, so a malformed
// one fails (SC-8 house rule: heuristic -> warn, fact -> fail). An ABSENT name
// stays `warn` -- that is the pre-existing "not chosen yet" case, unchanged.
//
// Three rules, deliberately: each is safety-bearing and each is pinned by a
// fixture in both packs. Git's remaining refname niceties (dot segments, .lock
// suffixes, slash placement) are left to git, which rejects them with a clear
// error and no ambiguity about who decided.
//
// This block is duplicated verbatim in patch-compose.js and ship-mode-select.js.
// They cannot share a module -- NFR-4 requires each validator to import only Node
// built-ins and run standalone -- so scripts/local-ci/cli-block-lint.mjs asserts
// the two copies are byte-identical and a fix to one is a fix to both.
const BRANCH_NAME_MAX = 255;
const BRANCH_NAME_CHARSET = /^[A-Za-z0-9._/-]+$/;

function branchNameProblem(name) {
  if (name === '') return null;
  if (name.length > BRANCH_NAME_MAX) return 'too_long';
  if (name.startsWith('-')) return 'leading_dash_reads_as_option';
  if (!BRANCH_NAME_CHARSET.test(name)) return 'illegal_character';
  return null;
}
// --- end Branch-name safety ---------------------------------------------------

function execute(input) {
  const outputMode = input && typeof input.output_mode === 'string' ? input.output_mode : '';
  const branchName = input && typeof input.branch_name === 'string' ? input.branch_name.trim() : '';
  const policy = (input && input.policy) || {};
  const allowDirectCommit = policy.allow_direct_commit !== false;

  const modeValid = VALID_OUTPUT_MODES.includes(outputMode);
  const hasBranchName = branchName.length > 0;
  const branchProblem = branchNameProblem(branchName);

  if (!modeValid) {
    return {
      rubric_result: 'fail',
      output_mode: outputMode || null,
      mode_valid: false,
      policy_consistent: false,
      has_branch_name: hasBranchName,
      branch_name_valid: branchProblem === null,
      branch_name_problem: branchProblem,
      cost_usd: 0,
      token_count: 0,
      model_used: null,
    };
  }

  const policyConflict = outputMode === 'direct_branch' && !allowDirectCommit;
  const policyConsistent = !policyConflict;

  let rubric_result;
  if (branchProblem !== null) {
    // SC-9/A2: a name git cannot safely receive is a fact, not a judgement call.
    // This is checked before the policy/absence branches so an unsafe name can
    // never be downgraded to a warn by a policy conflict.
    rubric_result = 'fail';
  } else if (policyConsistent && hasBranchName) {
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
    branch_name_valid: branchProblem === null,
    branch_name_problem: branchProblem,
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
  // SC-16/F-89. The identity of the tool travels WITH the verdict. `manifest.skill_id`
  // and `manifest.version` have existed in every validator since the port and reached
  // stdout in NONE of them, so `skill_trace.skill_id` and `.version` — both mandatory —
  // had no documented source: a live run read three validator SOURCES to recover the
  // dotted ids. Emitted at the CLI boundary, not inside execute(), because this is
  // ENVELOPE, not verdict — execute()'s contract and the parity corpus are untouched.
  console.log(
    JSON.stringify({ skill_id: manifest.skill_id, tool_version: manifest.version, ...result }, null, 2)
  );
}
