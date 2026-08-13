// INPUT: { build_output: { files_changed: [{file_path, action}] }, doc_output: { docs_delta: [{file_path, change}], changelog_entry, documentation_summary }, acceptance_criteria: [string] }
// USAGE: node document-coverage-map.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'document.coverage_map',
  version: '1.0.0',
  phase_affinity: ['document'],
  rubric: {
    pass: 'A changelog entry plus at least one documentation artifact (docs delta or summary) capture the implemented change',
    warn: 'Some documentation is present but thin — a changelog without supporting docs, or docs without a changelog entry',
    fail: 'Files were changed but no changelog, documentation delta, or summary was produced',
  },
  metrics: [
    'files_changed_count',
    'documented_paths_count',
    'changelog_present',
    'summary_present',
    'acceptance_criteria_count',
    'coverage_ratio',
  ],
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function execute(input) {
  const buildOutput = (input && input.build_output) || {};
  const docOutput = (input && input.doc_output) || {};
  const acceptanceCriteria = Array.isArray(input && input.acceptance_criteria) ? input.acceptance_criteria : [];

  const filesChanged = Array.isArray(buildOutput.files_changed) ? buildOutput.files_changed : [];
  const docsDelta = Array.isArray(docOutput.docs_delta) ? docOutput.docs_delta : [];

  const filesChangedCount = filesChanged.length;
  const documentedPathsCount = docsDelta.length;
  const changelogPresent = isNonEmptyString(docOutput.changelog_entry);
  const summaryPresent = isNonEmptyString(docOutput.documentation_summary);
  const acceptanceCriteriaCount = acceptanceCriteria.length;

  // Weighted, deterministic completeness signal in [0, 1].
  // Changelog is the primary documentation artifact for any shipped change.
  const coverageRatio =
    (changelogPresent ? 0.5 : 0) + (documentedPathsCount > 0 ? 0.3 : 0) + (summaryPresent ? 0.2 : 0);

  const nothingDocumented = !changelogPresent && documentedPathsCount === 0 && !summaryPresent;

  let rubricResult;
  if (nothingDocumented) {
    // A change with zero documentation is the real failure mode; a no-op job
    // with nothing to document is thin but not a hard failure.
    rubricResult = filesChangedCount > 0 ? 'fail' : 'warn';
  } else if (coverageRatio >= 0.7) {
    rubricResult = 'pass';
  } else {
    rubricResult = 'warn';
  }

  return {
    rubric_result: rubricResult,
    files_changed_count: filesChangedCount,
    documented_paths_count: documentedPathsCount,
    changelog_present: changelogPresent,
    summary_present: summaryPresent,
    acceptance_criteria_count: acceptanceCriteriaCount,
    coverage_ratio: coverageRatio,
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
