// INPUT: { acceptance_criteria: [string] }
// USAGE: node criteria-to-checks.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
// NOTE: v1.1.0 deliberately diverges from the ADWS_Pro original per scope change SC-1
//       (finding F-2: verifiable-verb regex now covers -ing participles and "pass");
//       v1.0.0 = exact original parity, v1.1.0 = F-2 regex fix.
'use strict';

const manifest = {
  skill_id: 'criteria.to_checks',
  version: '1.1.0',
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
  // For every verb the pattern covers the base form plus its third-person (-s/-es),
  // past/past-participle (-ed/-n), and present-participle (-ing) forms (SC-1/F-2:
  // v1.0.0 omitted the -ing form for most verbs and omitted "pass" entirely).
  const outcomeWords = /\b(must|should|shall|does not|no longer|correctly|successfully|return(?:s|ed|ing)?|produc(?:es?|ed|ing)|outputt?(?:s|ed|ing)?|read(?:s|ing)?|render(?:s|ed|ing)?|display(?:s|ed|ing)?|show(?:s|n|ed|ing)?|open(?:s|ed|ing)?|contain(?:s|ed|ing)?|includ(?:es?|ed|ing)|load(?:s|ed|ing)?|defin(?:es?|ed|ing)|link(?:s|ed|ing)?|ha(?:s|ve|d)|fir(?:es?|ed|ing)|emit(?:s|ted|ting)?|send(?:s|ing)?|receiv(?:es?|ed|ing)|creat(?:es?|ed|ing)|delet(?:es?|ed|ing)|updat(?:es?|ed|ing)|validat(?:es?|ed|ing)|reject(?:s|ed|ing)?|accept(?:s|ed|ing)?|trigger(?:s|ed|ing)?|navigat(?:es?|ed|ing)|redirect(?:s|ed|ing)?|click(?:s|ed|ing)|hover(?:s|ed|ing)|switch(?:es|ed|ing)?|sort(?:s|ed|ing)?|highlight(?:s|ed|ing)?|print(?:s|ed|ing)?|exit(?:s|ed|ing)?|remain(?:s|ed|ing)?|visible|respond(?:s|ed|ing)?|match(?:es|ed|ing)?|equal(?:s|ed|ing)?|pass(?:es|ed|ing)?|throw(?:s|n|ing)?|appear(?:s|ed|ing)?|start(?:s|ed|ing)?|runn?(?:s|ing)?|execut(?:es?|ed|ing)|complet(?:es?|ed|ing)|sett?(?:s|ing)?|prevent(?:s|ed|ing)?|support(?:s|ed|ing)?|enabl(?:es?|ed|ing)|disabl(?:es?|ed|ing)|referenc(?:es?|ed|ing)|provid(?:es?|ed|ing)|handl(?:es?|ed|ing)|stor(?:es?|ed|ing)|comput(?:es?|ed|ing)|repeat(?:s|ed|ing)?|decrement(?:s|ed|ing)?|increment(?:s|ed|ing)?)\b/i;
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
