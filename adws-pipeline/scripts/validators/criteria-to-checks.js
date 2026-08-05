// INPUT: { acceptance_criteria: [string] }
// USAGE: node criteria-to-checks.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
// NOTE: this pack deliberately diverges from the ADWS_Pro original per approved scope
//       changes. v1.0.0 = exact original parity; v1.1.0 = SC-1/F-2 regex fix (-ing
//       participles and "pass"); v2.0.0 = SC-5 (F-27 check_specs now carries EVERY
//       criterion, typed behavioral|unclassified, so a lexical miss can no longer drop a
//       criterion from the tester's work list; F-28 verb set widened; F-29 regex artifacts).
'use strict';

const manifest = {
  skill_id: 'criteria.to_checks',
  version: '2.0.0',
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
  // SC-5/F-28 widened the set: a 127-verb probe found 126 missing, including the
  // specification family ("specified", "lists", "states", "declares") that dropped a
  // criterion in a live run, and — for a validator that gates the TEST phase — "fail"
  // and "assert". SC-5/F-29 also replaced three v1.1.0 artifacts that matched non-words
  // (runn?/sett?/outputt? → runn, runns, sett, outputt) with real-form equivalents.
  // Deliberately NOT covered: bare "is"/"are", "look", "feel", "seem" — they would match
  // subjective criteria ("the code is clean", "the layout looks modern") and destroy the
  // warn signal. Under-matching is now safe (F-27: every criterion still gets a spec);
  // over-matching is not, because it silently suppresses the vagueness warning.
  const outcomeWords = /\b(must|should|shall|does not|no longer|correctly|successfully|return(?:s|ed|ing)?|produc(?:es?|ed|ing)|output(?:s|t?ed|t?ing)?|read(?:s|ing)?|render(?:s|ed|ing)?|display(?:s|ed|ing)?|show(?:s|n|ed|ing)?|open(?:s|ed|ing)?|contain(?:s|ed|ing)?|includ(?:es?|ed|ing)|load(?:s|ed|ing)?|defin(?:es?|ed|ing)|link(?:s|ed|ing)?|ha(?:s|ve|d)|fir(?:es?|ed|ing)|emit(?:s|ted|ting)?|send(?:s|ing)?|receiv(?:es?|ed|ing)|creat(?:es?|ed|ing)|delet(?:es?|ed|ing)|updat(?:es?|ed|ing)|validat(?:es?|ed|ing)|reject(?:s|ed|ing)?|accept(?:s|ed|ing)?|trigger(?:s|ed|ing)?|navigat(?:es?|ed|ing)|redirect(?:s|ed|ing)?|click(?:s|ed|ing)|hover(?:s|ed|ing)|switch(?:es|ed|ing)?|sort(?:s|ed|ing)?|highlight(?:s|ed|ing)?|print(?:s|ed|ing)?|exit(?:s|ed|ing)?|remain(?:s|ed|ing)?|visible|respond(?:s|ed|ing)?|match(?:es|ed|ing)?|equal(?:s|ed|ing)?|pass(?:es|ed|ing)?|throw(?:s|n|ing)?|appear(?:s|ed|ing)?|start(?:s|ed|ing)?|run(?:s|ning)?|execut(?:es?|ed|ing)|complet(?:es?|ed|ing)|set(?:s|ting)?|prevent(?:s|ed|ing)?|support(?:s|ed|ing)?|enabl(?:es?|ed|ing)|disabl(?:es?|ed|ing)|referenc(?:es?|ed|ing)|provid(?:es?|ed|ing)|handl(?:es?|ed|ing)|stor(?:es?|ed|ing)|comput(?:es?|ed|ing)|repeat(?:s|ed|ing)?|decrement(?:s|ed|ing)?|increment(?:s|ed|ing)?|specif(?:y|ies|ied|ying)|document(?:s|ed|ing)?|record(?:s|ed|ing)?|describ(?:es?|ed|ing)|declar(?:es?|ed|ing)|stat(?:es?|ed|ing)|list(?:s|ed|ing)?|nam(?:es?|ed|ing)|label(?:s|led|ling|ed|ing)?|mark(?:s|ed|ing)?|flag(?:s|ged|ging)?|count(?:s|ed|ing)?|fail(?:s|ed|ing)?|succeed(?:s|ed|ing)?|skip(?:s|ped|ping)?|warn(?:s|ed|ing)?|assert(?:s|ed|ing)?|block(?:s|ed|ing)?|allow(?:s|ed|ing)?|requir(?:es?|ed|ing)|report(?:s|ed|ing)?|resolv(?:es?|ed|ing)|rais(?:es?|ed|ing)|writ(?:es?|ing)|written|add(?:s|ed|ing)?|remov(?:es?|ed|ing)|replac(?:es?|ed|ing)|append(?:s|ed|ing)?|copy(?:ing)?|copi(?:es|ed)|mov(?:es?|ed|ing)|renam(?:es?|ed|ing)|pars(?:es?|ed|ing)|serializ(?:es?|ed|ing)|captur(?:es?|ed|ing)|expos(?:es?|ed|ing)|populat(?:es?|ed|ing)|log(?:s|ged|ging)?|us(?:es?|ed|ing)|appl(?:y|ies|ied|ying)|exist(?:s|ed|ing)?)\b/i;
  return outcomeWords.test(s);
}

function execute(input) {
  const criteria = Array.isArray(input.acceptance_criteria) ? input.acceptance_criteria : [];

  const verifiable = [];
  const vague = [];

  // SC-5/F-27: emit a spec for EVERY criterion, in input order, so check_id is
  // index-stable and no criterion can vanish from the tester's work list because the
  // lexical classifier missed its verb. 'unclassified' means "outcome language not
  // confirmed" — the criterion still requires a check, it just gets no free evidence
  // that one is derivable. The rubric and the three counts below are unchanged from
  // v1.1.0, so the vagueness signal is preserved exactly.
  const checkSpecs = criteria.map((c, i) => {
    const behavioral = isVerifiable(c);
    (behavioral ? verifiable : vague).push(c);
    return {
      check_id: `CHK${String(i + 1).padStart(3, '0')}`,
      criterion: c,
      check_type: behavioral ? 'behavioral' : 'unclassified',
    };
  });

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
