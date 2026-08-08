// INPUT: { title, requested_change, problem_statement, acceptance_criteria: [string], constraints: [string], file_hints: [string] }  (contract task.* fields)
// USAGE: node task-normalize.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

// DataForge cosine helpers — validated in E42 (defect_detection=0.9983).
// Uses cosine similarity only; Hellinger batch approach rejected in E45 (F1=0.61).
//
// Canonical ΔR (remediation plan P5.3, audit F-09; approval row B-3 in
// report/2026-07-02-umif-p5-decision-note.md §2): the REPORTED `delta_r` is
// the canonical angular divergence `arccos(clip(cos, −1, 1)) / π ∈ [0,1]`
// (Spec v1.2 §4, umif_validated E01/E42) — 0 = identical, 1 = maximally
// divergent. The raw cosine stays the internal detail the risk gates operate
// on, so the E42-calibrated trip points are mathematically unchanged:
//   cos ≥ 0.20 (low risk)  ⟺ ΔR ≤ 0.4359
//   cos <  0.10 (high risk) ⟺ ΔR >  0.4677
function tokenize(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function buildFreqVector(words) {
  const vec = Object.create(null);
  for (const w of words) vec[w] = (vec[w] || 0) + 1;
  return vec;
}

function cosineSimilarity(vecA, vecB) {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const k of keys) {
    const a = vecA[k] || 0;
    const b = vecB[k] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Canonical angular divergence from a cosine similarity (Spec v1.2 §4). */
function angularDeltaR(cosine) {
  const clipped = Math.min(1, Math.max(-1, cosine));
  return Math.acos(clipped) / Math.PI;
}

function computeCosineCoherence(input) {
  const problemTokens = [
    ...tokenize(input.title),
    ...tokenize(input.requested_change),
    ...tokenize(input.problem_statement),
  ];
  const criteriaText = Array.isArray(input.acceptance_criteria)
    ? input.acceptance_criteria.join(' ')
    : typeof input.acceptance_criteria === 'string'
      ? input.acceptance_criteria
      : '';
  const solutionTokens = tokenize(criteriaText);

  if (problemTokens.length === 0 || solutionTokens.length === 0) return 0;

  const vecA = buildFreqVector(problemTokens);
  const vecB = buildFreqVector(solutionTokens);
  return cosineSimilarity(vecA, vecB);
}

const manifest = {
  skill_id: 'task.normalize',
  version: '2.1.0',
  phase_affinity: ['plan'],
  rubric: {
    // ΔR is the canonical divergence: LOW ΔR = coherent (direction flipped
    // from v2.0.0, which reported the raw cosine under the ΔR name — F-09).
    pass: 'All required task fields are present, well-formed, and semantically coherent (canonical ΔR <= 0.4359, i.e. cosine >= 0.20)',
    warn: 'One or more optional fields are missing, underspecified, or semantic divergence is elevated (canonical ΔR > 0.4359)',
    fail: 'Required task fields are missing/empty, or semantic divergence is critical (canonical ΔR > 0.4677 with required fields absent)',
  },
  metrics: ['fields_present', 'fields_missing', 'fields_weak', 'delta_r', 'synthetic_risk', 'coherence_score'],
};

function execute(input) {
  // --- Phase 1: Field presence validation (preserved from v1.0.0) ---
  const fields = {
    title: { required: true, value: input.title },
    requested_change: { required: true, value: input.requested_change },
    problem_statement: { required: false, value: input.problem_statement },
    acceptance_criteria: { required: true, value: input.acceptance_criteria },
    constraints: { required: false, value: input.constraints },
    file_hints: { required: false, value: input.file_hints },
  };

  const present = [];
  const missing = [];
  const weak = [];

  for (const [name, field] of Object.entries(fields)) {
    if (field.value == null || field.value === '') {
      missing.push({ field: name, required: field.required });
    } else if (Array.isArray(field.value) && field.value.length === 0) {
      weak.push({ field: name, reason: 'empty array' });
    } else if (typeof field.value === 'string' && field.value.trim().length < 5) {
      weak.push({ field: name, reason: 'too short' });
    } else {
      present.push(name);
    }
  }

  const requiredMissing = missing.filter((f) => f.required);

  // --- Phase 2: DataForge coherence gate (cosine internal, E42 lineage) ---
  const cosine = computeCosineCoherence(input);
  const deltaR = angularDeltaR(cosine); // canonical divergence, reported (B-3)
  const coherenceScore = cosine; // similarity direction, internal detail
  let syntheticRisk;
  if (cosine < 0.1) {
    syntheticRisk = 'high';
  } else if (cosine < 0.2) {
    syntheticRisk = 'medium';
  } else {
    syntheticRisk = 'low';
  }

  // --- Phase 3: Composite rubric (DataForge overlaid on v1 field logic) ---
  let rubric_result;
  if (requiredMissing.length > 0) {
    rubric_result = 'fail';
  } else if (syntheticRisk === 'high') {
    rubric_result = 'warn';
  } else if (weak.length > 0 || missing.length > 0) {
    rubric_result = 'warn';
  } else {
    rubric_result = 'pass';
  }

  return {
    rubric_result,
    normalized_summary: {
      title: typeof input.title === 'string' ? input.title.trim() : null,
      requested_change: typeof input.requested_change === 'string' ? input.requested_change.trim() : null,
      acceptance_criteria_count: Array.isArray(input.acceptance_criteria) ? input.acceptance_criteria.length : 0,
      constraints_count: Array.isArray(input.constraints) ? input.constraints.length : 0,
      file_hints_count: Array.isArray(input.file_hints) ? input.file_hints.length : 0,
      has_policy: input.policy != null,
      has_risk: input.risk != null,
    },
    fields_present: present,
    fields_missing: missing,
    fields_weak: weak,
    delta_r: Math.round(deltaR * 10000) / 10000, // canonical divergence (0 = identical)
    coherence_score: Math.round(coherenceScore * 10000) / 10000, // raw cosine (internal detail)
    synthetic_risk: syntheticRisk,
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
