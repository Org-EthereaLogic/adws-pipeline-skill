// INPUT: { plan_output: { file_change_proposal: [{file_path, action, description}], plan_summary }, policy: { allowed_paths: [string], blocked_paths: [string] } }
//   NOTE: each proposal's `description` (what changes and why) is read by the
//   underspecification check below — a proposal with a missing or <3-char
//   `description` yields `warn`. The planner (adws-planner) MUST emit this field.
// USAGE: node repo-context-scan.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'repo.context_scan',
  version: '2.0.0',
  phase_affinity: ['build'],
  rubric: {
    pass: 'Plan file proposals are well-specified and within policy bounds',
    warn: 'Plan has minor gaps in file specification or path coverage',
    fail: 'Plan proposes paths outside policy bounds, unsafe paths, or malformed entries',
  },
  metrics: ['files_proposed', 'directories_touched', 'policy_violations', 'underspecified', 'malformed_entries'],
};

// SC-9/A1(c). Prefix matching is SEGMENT-aware. `startsWith` is a raw substring
// test, so allowed_paths ["src"] admitted "srcfoo/evil.js" and blocked_paths
// [".github"] was evaded by ".github-notes/x". That is the same defect class
// SC-8/A2 fixed in review-risk-assess and left standing here.
// Callers pass only non-empty prefixes (see normalizePrefixes): an empty prefix is
// not a policy. Letting one through would mean "everything is allowed" for
// allowed_paths and "everything is blocked" for blocked_paths from the same value.
function underPrefix(filePath, prefix) {
  const p = prefix.replace(/\/+$/, '');
  return filePath === p || filePath.startsWith(p + '/');
}

// An empty or whitespace-only entry in a policy list carries no bound, so it is
// dropped rather than interpreted. Keeping it would make `allowed_paths: ["", "src/"]`
// silently permit every path — a policy that reads restrictive and behaves as none.
function normalizePrefixes(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => (typeof p === 'string' ? p.trim() : '')).filter((p) => p !== '');
}

// A path that escapes the repo, or that carries normalization noise, cannot be
// bounded by a prefix policy at all. That is a FACT about the input, not a
// judgement about it, so it fails (SC-8 house rule: heuristic -> warn, fact -> fail).
// `.` and empty segments are rejected because "./a" and "a//b" both defeat prefix
// matching while naming the same file as a compliant path would.
function isSafeRelativePath(filePath) {
  // A drive-letter path has no empty segment, so it needs its own test.
  if (/^[A-Za-z]:[\\/]/.test(filePath)) return false; // windows absolute
  // A POSIX absolute path needs no separate test: "/etc/passwd" splits to
  // ['', 'etc', 'passwd'], and the empty leading segment is already rejected below.
  // An explicit startsWith('/') guard was written here first; guard-ablation proved
  // it could be deleted with every fixture still green, i.e. it was dead. Removed
  // rather than exempted — a redundant guard is a rule readers will trust twice.
  const segments = filePath.split(/[\\/]+/);
  return !segments.some((s) => s === '..' || s === '' || s === '.');
}

function execute(input) {
  const planOutput = (input && input.plan_output) || {};
  const policy = (input && input.policy) || {};
  const proposals = Array.isArray(planOutput.file_change_proposal) ? planOutput.file_change_proposal : [];
  const allowedPaths = normalizePrefixes(policy.allowed_paths);
  const blockedPaths = normalizePrefixes(policy.blocked_paths);

  const directoriesSet = new Set();
  const policyViolations = [];
  // SC-9/A1(a). `{}` inherits Object.prototype, so a proposal with file_path
  // "__proto__/x.js" made groupedFiles["__proto__"] truthy (it IS Object.prototype),
  // skipped the initializer, and threw on `.push`. The crash was not the defect: the
  // policy loop below lived in the same loop body and never completed, so a proposal
  // explicitly inside a blocked path produced NO VERDICT rather than `fail` — the
  // build-phase policy gate was skipped, not failed. Reproduced at exit 3.
  // task-normalize.js:26 already used this pattern.
  const groupedFiles = Object.create(null);
  let malformedEntries = 0;
  let underspecifiedDescriptions = 0;

  for (const proposal of proposals) {
    const isEntry = proposal !== null && typeof proposal === 'object' && !Array.isArray(proposal);
    const rawPath = isEntry && typeof proposal.file_path === 'string' ? proposal.file_path : '';
    const filePath = rawPath.trim();

    // An entry with no usable path is not assessable against any policy. Counting it
    // (rather than silently skipping) is SC-8/A9's rule applied here.
    if (filePath === '') {
      malformedEntries += 1;
      continue;
    }

    // --- policy FIRST -------------------------------------------------------
    // A gate must not depend on bookkeeping that can throw. Even with (a) fixed,
    // ordering the policy checks ahead of the grouping means no future exception in
    // the bookkeeping can skip the gate the way F-63 did.
    if (!isSafeRelativePath(filePath)) {
      policyViolations.push({ file: filePath, reason: 'unsafe_path' });
    }
    if (allowedPaths.length > 0 && !allowedPaths.some((ap) => underPrefix(filePath, ap))) {
      policyViolations.push({ file: filePath, reason: 'outside_allowed_paths' });
    }
    for (const bp of blockedPaths) {
      if (underPrefix(filePath, bp)) {
        policyViolations.push({ file: filePath, reason: 'in_blocked_path', blocked_path: bp });
      }
    }

    if (!isEntry || typeof proposal.description !== 'string' || proposal.description.length < 3) {
      underspecifiedDescriptions += 1;
    }

    // --- then bookkeeping ---------------------------------------------------
    const parts = filePath.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    directoriesSet.add(dir);
    if (!Object.prototype.hasOwnProperty.call(groupedFiles, dir)) {
      groupedFiles[dir] = [];
    }
    groupedFiles[dir].push({ file: filePath, action: (isEntry && proposal.action) || 'unknown' });
  }

  const underspecified = proposals.length === 0;

  let rubric_result;
  if (policyViolations.length > 0 || malformedEntries > 0) {
    rubric_result = 'fail';
  } else if (underspecified || underspecifiedDescriptions > 0) {
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
    malformed_entries: malformedEntries,
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
