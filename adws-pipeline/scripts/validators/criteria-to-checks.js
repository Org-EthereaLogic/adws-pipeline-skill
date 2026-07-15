// INPUT: { acceptance_criteria: [string] }
// USAGE: node criteria-to-checks.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

const manifest = {
  skill_id: 'criteria.to_checks',
  version: '1.0.0',
  phase_affinity: ['test'],
  rubric: {
    pass: 'All acceptance criteria are present, countable, and specific enough to map to test checks',
    warn: 'Acceptance criteria present but one or more are vague or non-verifiable',
    fail: 'No acceptance criteria present or criteria array is empty',
  },
  metrics: ['criteria_count', 'verifiable_count', 'vague_count', 'check_specs'],
};

function isVerifiable(criterion) {
  if (typeof criterion !== 'string') return false;
  const s = criterion.trim();
  if (s.length < 10) return false;
  // Criteria are verifiable if they contain outcome or observable-action language.
  // The pattern covers base verbs, third-person (-s/-es), past participles (-ed),
  // and present participles (-ing) for the most common acceptance-criteria verbs.
  const outcomeWords = /\b(must|should|shall|does not|no longer|correctly|successfully|return(?:s|ed)?|produce[sd]?|output[sd]?|read(?:s)?|render(?:s|ed)?|display(?:s|ed)?|show(?:s|n|ed)?|open(?:s|ed)?|contain(?:s|ed|ing)?|include[sd]?|load(?:s|ed)?|defin(?:es?|ed|ing)|link(?:s|ed)?|ha(?:s|ve|d)|fire[sd]?|emit(?:s|ted)?|send(?:s)?|receive[sd]?|creat(?:es?|ed|ing)|delet(?:es?|ed|ing)|updat(?:es?|ed|ing)|validat(?:es?|ed|ing)|reject(?:s|ed)?|accept(?:s|ed)?|trigger(?:s|ed)?|navigat(?:es?|ed|ing)|redirect(?:s|ed)?|click(?:s|ed|ing)|hover(?:s|ed|ing)|switch(?:es|ed)?|sort(?:s|ed)?|highlight(?:s|ed)?|print(?:s|ed)?|exit(?:s|ed)?|remain(?:s|ed)?|visible|respond(?:s|ed)?|match(?:es|ed)?|equal(?:s|ed)?|throw(?:s|n)?|appear(?:s|ed)?|start(?:s|ed)?|run(?:s)?|execut(?:es?|ed|ing)|complet(?:es?|ed)|set(?:s)?|prevent(?:s|ed)?|support(?:s|ed)?|enabl(?:es?|ed)|disabl(?:es?|ed)|reference[sd]?|provid(?:es?|ed|ing)|handle[sd]?|store[sd]?|comput(?:es?|ed|ing)|repeat(?:s|ed)?|decrement(?:s|ed)?|increment(?:s|ed)?)\b/i;
  return outcomeWords.test(s);
}

function execute(input) {
  const criteria = Array.isArray(input.acceptance_criteria) ? input.acceptance_criteria : [];

  const verifiable = [];
  const vague = [];

  for (const c of criteria) {
    if (isVerifiable(c)) {
      verifiable.push(c);
    } else {
      vague.push(c);
    }
  }

  const checkSpecs = verifiable.map((c, i) => ({
    check_id: `CHK${String(i + 1).padStart(3, '0')}`,
    criterion: c,
    check_type: 'behavioral',
  }));

  let rubric_result;
  if (criteria.length === 0) {
    rubric_result = 'fail';
  } else if (vague.length > criteria.length / 2) {
    rubric_result = 'warn';
  } else {
    rubric_result = 'pass';
  }

  return {
    rubric_result,
    criteria_count: criteria.length,
    verifiable_count: verifiable.length,
    vague_count: vague.length,
    check_specs: checkSpecs,
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
