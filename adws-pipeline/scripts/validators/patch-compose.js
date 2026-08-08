// INPUT: { build_output: { files_changed: [{file_path, action}] },
//          document_output: { docs_delta: [string | {file_path}] },
//          output_mode, branch_name }
//   NOTE: `files_to_ship` is the size of the UNION of build_output.files_changed and
//   document_output.docs_delta, because that union is what adws-shipper actually stages
//   ("the union of files_changed and the document phase's docs_delta"). Passing only the
//   build output undercounts the shipped set — recorded in three field runs before SC-9.
// USAGE: node patch-compose.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'patch.compose',
  version: '2.0.0',
  phase_affinity: ['ship'],
  rubric: {
    pass: 'Ship output is well-composed: files present, output mode valid, branch name well-formed',
    warn: 'Ship output is partially composed: branch name absent',
    fail: 'Ship output is malformed: nothing to ship, unknown output mode, or an unsafe branch name',
  },
  metrics: [
    'files_to_ship',
    'build_files',
    'docs_files',
    'output_mode',
    'has_branch_name',
    'branch_name_valid',
    'composition_valid',
    'malformed_entries',
  ],
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

// A docs_delta entry is either a bare path string or an object carrying one;
// document-coverage-map's own fixtures use both shapes, so this reads both
// (tolerant reader) while emitting one canonical set (strict writer).
function pathOf(entry) {
  if (typeof entry === 'string') return entry.trim();
  if (entry !== null && typeof entry === 'object' && typeof entry.file_path === 'string') {
    return entry.file_path.trim();
  }
  return '';
}

function execute(input) {
  const buildOutput = (input && input.build_output) || {};
  const documentOutput = (input && input.document_output) || {};
  const outputMode = input && typeof input.output_mode === 'string' ? input.output_mode : '';
  const branchName = input && typeof input.branch_name === 'string' ? input.branch_name.trim() : '';

  const buildFiles = Array.isArray(buildOutput.files_changed) ? buildOutput.files_changed : [];
  const docsFiles = Array.isArray(documentOutput.docs_delta) ? documentOutput.docs_delta : [];

  // SC-9/A4. files_to_ship counted build_output only, so a change set with a
  // documented delta reported fewer files than the shipper staged. Recorded in
  // three separate field runs and deferred each time as a frozen validator.
  const shipped = new Set();
  let malformedEntries = 0;
  for (const entry of [...buildFiles, ...docsFiles]) {
    const p = pathOf(entry);
    if (p) shipped.add(p);
    else malformedEntries += 1;
  }
  const filesToShip = shipped.size;

  const modeValid = VALID_OUTPUT_MODES.includes(outputMode);
  const hasBranchName = branchName.length > 0;
  const branchProblem = branchNameProblem(branchName);
  const compositionValid = filesToShip > 0 && modeValid;

  let rubric_result;
  if (!compositionValid) {
    rubric_result = 'fail';
  } else if (branchProblem !== null) {
    rubric_result = 'fail';
  } else if (!hasBranchName) {
    // Note: the pre-SC-9 condition was `!hasBranchName || !modeValid`. The second
    // disjunct was dead — !modeValid implies !compositionValid, so the branch above
    // already took it. Removed rather than left for the ablation sweep to find.
    rubric_result = 'warn';
  } else {
    rubric_result = 'pass';
  }

  return {
    rubric_result,
    files_to_ship: filesToShip,
    build_files: buildFiles.length,
    docs_files: docsFiles.length,
    output_mode: outputMode || null,
    has_branch_name: hasBranchName,
    branch_name_valid: branchProblem === null,
    branch_name_problem: branchProblem,
    composition_valid: compositionValid,
    malformed_entries: malformedEntries,
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
