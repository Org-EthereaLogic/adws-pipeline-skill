#!/usr/bin/env node
// counts-lint.mjs — Tier-1 skill-repo lint (zero deps, Node built-ins only).
//
// SC-18 (finding 60(b)). The advertised suite counts — "116 validator-parity fixtures",
// "29 report verdict fixtures", "nine validators" — are prose sitting beside the code that
// knows the real values, and nothing compared them. So they went stale, and were hand-synced
// twice: SC-13 corrected `Makefile` + `gate.sh` + `.githooks/pre-push` and recorded it as a
// one-off, and SC-17 corrected the same three files again. `scripts/local-ci/README.md` said
// the quiet part out loud — "Suite sizes are asserted, not narrated … If you change a count
// in prose, change the assertion behind it" — while its own table advertised a parity suite
// seven fixtures smaller than the one on disk.
//
// Correcting it twice by hand is the evidence that correcting it by hand is not the fix.
// This is the comparison, built the way `assertFixtureCoverage` compares a runner's declared
// CASES against the fixtures on disk: derive the real number, then assert every place that
// prints it. Both directions, because one direction is how this defect survived —
//
//   forward  every registered claim must equal the derived count;
//   converse every count-shaped phrase in a covered file must BE a registered claim,
//            so a new advertisement cannot be born unasserted (the sweep below).
//
// WHAT IS COVERED, AND WHY docs/ IS NOT. This lint covers files that describe the repository
// as it is NOW: README.md, Makefile, gate.sh, the local-ci README, and the pre-push hook. It
// deliberately does NOT cover docs/ or spike/. A line in DPPD.md reading "report fixtures
// 24 → 25" is a record of a moment, not a claim about today; a lint that "corrected" it would
// be falsifying the history that makes this repo auditable. The distinction is the point:
// a current-state claim is assertable, a historical one is not.
//
// Run from the repo root: `node scripts/local-ci/counts-lint.mjs`.
// Exit 0 = pass, 1 = one or more violations (printed with the fix).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const problems = [];

// ---------------------------------------------------------------------------
// 1. Derive the real sizes — from the suites themselves, never from another
//    piece of prose. Every number below is a fact about the tree on disk.
// ---------------------------------------------------------------------------

/** Files in `dir` ending in `suffix`. Throws loudly rather than reporting 0 — a suite that
 *  silently reads as empty would make every stale claim look correct. */
function countBySuffix(dir, suffix) {
  const files = readdirSync(dir).filter((f) => f.endsWith(suffix));
  if (files.length === 0) throw new Error(`${dir} contains no ${suffix} files`);
  return files.length;
}

function countDirs(dir) {
  const dirs = readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory());
  if (dirs.length === 0) throw new Error(`${dir} contains no fixture directories`);
  return dirs.length;
}

/** Read a file the lint DERIVES from. A missing one is a lint failure with a name, not a
 *  stack trace: this runs as a gate step, and "ENOENT" three frames deep reads as a broken
 *  lint rather than as a repository that moved a file the lint depends on. */
function mustRead(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`cannot read ${file} (${e.code || e.message}) — counts-lint derives from it`);
  }
}

let GATE_SH;
let README;
try {
  GATE_SH = mustRead('scripts/local-ci/gate.sh');
  README = mustRead('README.md');
} catch (e) {
  console.error(`[counts-lint] ${e.message}`);
  process.exit(1);
}

// `run-parity.js` DISCOVERS its fixtures from disk and asserts the total against this
// constant (M-3a), so the constant is the suite's asserted size rather than a second
// narration of it. Read it rather than re-counting: re-counting here would duplicate the
// runner's walk and could disagree with the number the runner actually enforces.
function parityTotal() {
  const m = mustRead('parity/run-parity.js').match(
    /EXPECTED_FIXTURE_TOTAL\s*=\s*(\d+)/
  );
  if (!m) throw new Error('parity/run-parity.js no longer declares EXPECTED_FIXTURE_TOTAL');
  return Number(m[1]);
}

// The diverged-by-design packs, declared in run-parity.js and used by it to decide which
// baseline a fixture is frozen against. README quotes both halves of the split ("4 of 9
// verified byte-for-byte … five deliberately diverged"), and both halves move whenever a
// scope change diverges a pack — which is exactly the shape that goes stale.
function divergedPacks() {
  const src = mustRead('parity/run-parity.js');
  const block = src.match(/const DIVERGED_PACKS = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('parity/run-parity.js no longer declares DIVERGED_PACKS');
  return (block[1].match(/^\s*'([^']+)':/gm) || []).map((l) => l.match(/'([^']+)'/)[1]);
}

// A validator's own `version`, read from its source. Same principle as the counts: the
// value lives in the code, README narrates it, and nothing compared them — so SC-15 bumped
// repo-context-scan to 2.1.0 and README went on saying "all v2.0.0" in two places.
function validatorVersion(pack) {
  const src = mustRead(join(VALIDATOR_DIR, `${pack}.js`));
  const m = src.match(/version:\s*'(\d+\.\d+\.\d+)'/);
  if (!m) throw new Error(`${pack}.js declares no version`);
  return m[1];
}

// The suite commands the README tells a reader to run, counted from the README's own
// Validation block. "runs all seven" was written when there were seven; guard-ablation made
// it eight and nothing noticed. This one is an internal-consistency claim: the summary line
// must agree with the list directly above it.
function validationCommands() {
  const block = README.match(/## Validation[\s\S]*?```bash\n([\s\S]*?)```/);
  if (!block) throw new Error('README.md has no Validation bash block');
  return block[1].split('\n').filter((l) => /^node\s+\S/.test(l)).length;
}

// Steps in gate.sh that run one of the skill-repo lints (`*-lint.mjs`). Derived from the
// gate rather than counted by hand for the same reason as everything else here.
function skillRepoLints() {
  return (GATE_SH.match(/^run_step\s+"[^"]+"\s+node scripts\/local-ci\/\S*-lint\.mjs/gm) || [])
    .length;
}

const VALIDATOR_DIR = 'adws-pipeline/scripts/validators';

let COUNTS;
let DIVERGED = [];
let VERSIONS = new Map();
try {
  const validators = countBySuffix(VALIDATOR_DIR, '.js');
  DIVERGED = divergedPacks();
  // EVERY validator, not only the diverged ones. The first cut built this map from
  // DIVERGED_PACKS, which made the check exactly as wide as the defect that motivated it —
  // a false `task-normalize` v9.9.9 passed. The rule being enforced is "a version written
  // next to a validator's name is that validator's version", and that rule has nothing to do
  // with divergence; only the "must state a version at all" requirement below does.
  VERSIONS = new Map(
    readdirSync(VALIDATOR_DIR)
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.replace(/\.js$/, ''))
      .map((p) => [p, validatorVersion(p)])
  );
  COUNTS = {
    parity_fixtures: parityTotal(),
    report_fixtures: countDirs('parity/execution-report-fixtures'),
    entropy_fixtures: countBySuffix('parity/entropy-gate-fixtures', '.jsonl'),
    provenance_fixtures: countBySuffix('parity/provenance-fixtures', '.json'),
    evidence_fixtures: countBySuffix('parity/evidence-integrity-fixtures', '.json'),
    // A golden is a (report JSON, markdown) PAIR; the count everyone quotes is the pair count.
    golden_pairs: countBySuffix('parity/execution-report-goldens', '.json'),
    validators,
    // The CLI contract covers every shipped CLI: the nine validators plus entropy-gate.js
    // and execution-report.js, whose stderr prefixes and exit vocabularies differ.
    cli_targets: validators + 2,
    // guard-ablation sweeps the nine validators through execute() and execution-report.js
    // through buildReport() (SC-17/F-90).
    ablation_targets: validators + 1,
    agents: readdirSync(join('.claude', 'agents')).filter(
      (f) => f.startsWith('adws-') && f.endsWith('.md')
    ).length,
    diverged_packs: DIVERGED.length,
    byte_for_byte: validators - DIVERGED.length,
    validation_commands: validationCommands(),
    skill_repo_lints: skillRepoLints(),
    // SC-19/F-96. Imported, not regex-counted: the module exports the rule table it applies,
    // so this is the value the scanner actually uses rather than a second reading of its
    // source. A count derived by parsing the file that owns the number is still a second
    // opinion about it, and this lint exists because second opinions drift.
    secret_scan_rules: require(join('..', '..', 'adws-pipeline', 'scripts', 'secret-scan.js'))
      .RULE_IDS.length,
  };
} catch (e) {
  console.error(`[counts-lint] cannot derive suite sizes: ${e.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. The registry: every current-state site that prints one of those numbers.
//    A claim whose regex stops matching is a FAILURE, not a skip — prose gets
//    rewritten, and a silently-unmatched claim is exactly the hole this closes.
// ---------------------------------------------------------------------------

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty'];

function tokenToNumber(tok) {
  if (/^\d+$/.test(tok)) return Number(tok);
  const i = WORDS.indexOf(tok.toLowerCase());
  return i === -1 ? null : i;
}

/** How a site should be re-written: word sites stay words, digit sites stay digits, and a
 *  capitalized word stays capitalized — the message is something a person retypes. */
function renderLike(sample, n) {
  if (/^\d+$/.test(sample)) return String(n);
  const word = WORDS[n];
  if (word === undefined) return String(n);
  return /^[A-Z]/.test(sample) ? word[0].toUpperCase() + word.slice(1) : word;
}

const CLAIMS = [
  // --- README.md -----------------------------------------------------------
  { file: 'README.md', key: 'parity_fixtures', re: /(\d+)\/\d+ validator-parity fixtures/ },
  { file: 'README.md', key: 'report_fixtures', re: /(\d+)\/\d+ report verdict fixtures/ },
  { file: 'README.md', key: 'entropy_fixtures', re: /(\d+)\/\d+ stability-gate fixtures/ },
  { file: 'README.md', key: 'provenance_fixtures', re: /(\d+)\/\d+ provenance-schema fixtures/ },
  { file: 'README.md', key: 'evidence_fixtures', re: /(\d+)\/\d+ timestamp-integrity fixtures/ },
  { file: 'README.md', key: 'validators', re: /CLI contract: (\d+) validators \+ 2 scripts/ },
  { file: 'README.md', key: 'validators', re: /validators\/ \((\d+)\)/ },
  { file: 'README.md', key: 'byte_for_byte', re: /(\d+) of the (?:\d+) deterministic validators/ },
  { file: 'README.md', key: 'validators', re: /(?:\d+) of the (\d+) deterministic validators/ },
  { file: 'README.md', key: 'byte_for_byte', re: /(\d+) of (?:\d+) validators are verified/ },
  { file: 'README.md', key: 'validators', re: /(?:\d+) of (\d+) validators are verified/ },
  { file: 'README.md', key: 'diverged_packs', re: /(\w+) are deliberately diverged under/ },
  { file: 'README.md', key: 'validators', re: /duplicated (\w+) times/ },
  { file: 'README.md', key: 'validators', re: /asserts the (\w+)\n?\s*copies stay byte-identical/ },
  { file: 'README.md', key: 'validators', re: /the (\w+) validators through `execute\(\)`/ },
  { file: 'README.md', key: 'validators', re: /both input modes for all (\w+)/ },
  { file: 'README.md', key: 'ablation_targets', re: /(\w+) targets —/ },
  { file: 'README.md', key: 'golden_pairs', re: /(\d+) frozen report \+ markdown goldens/ },
  { file: 'README.md', key: 'agents', re: /\| (\d+) subagents:/ },
  { file: 'README.md', key: 'agents', re: /the (\d+) subagents \(install these\)/ },
  { file: 'README.md', key: 'validation_commands', re: /runs all (\w+) plus the static floors/ },
  { file: 'README.md', key: 'secret_scan_rules', re: /secret redaction: (\d+) credential rules/ },

  // --- Makefile ------------------------------------------------------------
  { file: 'Makefile', key: 'parity_fixtures', re: /Tier 1: fast host gate \((\d+)\/\d+\/\d+/ },
  { file: 'Makefile', key: 'report_fixtures', re: /Tier 1: fast host gate \(\d+\/(\d+)\/\d+/ },
  { file: 'Makefile', key: 'entropy_fixtures', re: /Tier 1: fast host gate \(\d+\/\d+\/(\d+)/ },

  // --- scripts/local-ci/gate.sh -------------------------------------------
  { file: 'scripts/local-ci/gate.sh', key: 'parity_fixtures', re: /the (\d+)\n# validator-parity fixtures/ },
  { file: 'scripts/local-ci/gate.sh', key: 'report_fixtures', re: /(\d+) report-verdict fixtures/ },
  { file: 'scripts/local-ci/gate.sh', key: 'entropy_fixtures', re: /(\d+) stability-gate fixtures/ },
  { file: 'scripts/local-ci/gate.sh', key: 'provenance_fixtures', re: /(\d+) provenance-schema fixtures/ },
  { file: 'scripts/local-ci/gate.sh', key: 'cli_targets', re: /suite over all (\d+) shipped CLIs/ },
  { file: 'scripts/local-ci/gate.sh', key: 'skill_repo_lints', re: /and (\w+) skill-repo lints/ },
  { file: 'scripts/local-ci/gate.sh', key: 'parity_fixtures', re: /must stay green: (\d+) \/ \d+ \/ \d+/ },
  { file: 'scripts/local-ci/gate.sh', key: 'report_fixtures', re: /must stay green: \d+ \/ (\d+) \/ \d+/ },
  { file: 'scripts/local-ci/gate.sh', key: 'entropy_fixtures', re: /must stay green: \d+ \/ \d+ \/ (\d+)/ },
  { file: 'scripts/local-ci/gate.sh', key: 'provenance_fixtures', re: /\+ provenance (\d+)/ },
  { file: 'scripts/local-ci/gate.sh', key: 'evidence_fixtures', re: /\+ evidence (\d+)/ },
  { file: 'scripts/local-ci/gate.sh', key: 'validators', re: /CLI contract over (\d+) validators and 2 scripts/ },
  { file: 'scripts/local-ci/gate.sh', key: 'secret_scan_rules', re: /secret-scan suite over\n# all (\d+) credential rules/ },
  { file: 'scripts/local-ci/gate.sh', key: 'secret_scan_rules', re: /\+ secret-scan (\d+) rules/ },

  // --- scripts/local-ci/README.md -----------------------------------------
  { file: 'scripts/local-ci/README.md', key: 'parity_fixtures', re: /parity (\d+) \+ report/ },
  { file: 'scripts/local-ci/README.md', key: 'report_fixtures', re: /\+ report (\d+) \+ entropy/ },
  { file: 'scripts/local-ci/README.md', key: 'entropy_fixtures', re: /\+ entropy (\d+) fixtures/ },
  { file: 'scripts/local-ci/README.md', key: 'provenance_fixtures', re: /provenance fixtures (\d+)/ },
  { file: 'scripts/local-ci/README.md', key: 'validators', re: /\*\*CLI contract\*\* over (\d+) validators/ },
  { file: 'scripts/local-ci/README.md', key: 'secret_scan_rules', re: /\*\*secret-scan\*\* over (\d+) credential rules/ },

  // --- .githooks/pre-push --------------------------------------------------
  { file: '.githooks/pre-push', key: 'parity_fixtures', re: /host gate \(parity (\d+)\/\d+\/\d+/ },
  { file: '.githooks/pre-push', key: 'report_fixtures', re: /host gate \(parity \d+\/(\d+)\/\d+/ },
  { file: '.githooks/pre-push', key: 'entropy_fixtures', re: /host gate \(parity \d+\/\d+\/(\d+)/ },
];

const COVERED = [...new Set(CLAIMS.map((c) => c.file))].sort();
const text = new Map();
for (const f of COVERED) {
  if (!existsSync(f)) {
    problems.push(`covered file ${f} does not exist — remove its CLAIMS entries or restore it`);
    continue;
  }
  text.set(f, readFileSync(f, 'utf8'));
}

/** char offset -> 1-based line number */
function lineOf(body, index) {
  return body.slice(0, index).split('\n').length;
}

// The lines a registered claim matched, per file — the sweep below treats these as covered.
const claimedLines = new Map(COVERED.map((f) => [f, new Set()]));
let checked = 0;

for (const claim of CLAIMS) {
  const body = text.get(claim.file);
  if (body === undefined) continue;
  const expected = COUNTS[claim.key];
  const re = new RegExp(claim.re.source, claim.re.flags.includes('g') ? claim.re.flags : claim.re.flags + 'g');
  let m;
  let hits = 0;
  while ((m = re.exec(body)) !== null) {
    hits += 1;
    checked += 1;
    const line = lineOf(body, m.index);
    claimedLines.get(claim.file).add(line);
    const found = tokenToNumber(m[1]);
    if (found === null) {
      problems.push(
        `${claim.file}:${line} — claim for \`${claim.key}\` captured "${m[1]}", which is not a number`
      );
    } else if (found !== expected) {
      problems.push(
        `${claim.file}:${line} — advertises ${claim.key} = ${m[1]}, but the suite on disk has ` +
          `${expected}. Fix the prose to "${renderLike(m[1], expected)}" (or fix the suite).\n` +
          `      in: ${m[0].replace(/\n/g, ' ')}`
      );
    }
  }
  if (hits === 0) {
    problems.push(
      `${claim.file} — registered claim for \`${claim.key}\` (${claim.re}) matched nothing. ` +
        'The prose was rewritten; update this claim in counts-lint.mjs so the number stays asserted.'
    );
  }
}

// ---------------------------------------------------------------------------
// 2b. Version claims. Same defect, different value type: a validator's version lives in its
//     source, README narrates it, and nothing compared them. The rule is general — a
//     `vX.Y.Z` written next to a validator's name must be that validator's version — so it
//     also catches the grouped form ("`a` / `b` / `c` (all v2.0.0)") the moment one of the
//     three moves, which is how SC-15's bump to repo-context-scan went unrecorded twice.
// ---------------------------------------------------------------------------

for (const [pack, version] of VERSIONS) {
  const body = text.get('README.md');
  if (body === undefined) break;
  const re = new RegExp('`' + pack + '`[^\\n]{0,60}?v(\\d+\\.\\d+\\.\\d+)', 'g');
  let m;
  let hits = 0;
  while ((m = re.exec(body)) !== null) {
    hits += 1;
    checked += 1;
    if (m[1] !== version) {
      problems.push(
        `README.md:${lineOf(body, m.index)} — states \`${pack}\` v${m[1]}, but ` +
          `${VALIDATOR_DIR}/${pack}.js declares v${version}.\n      in: ${m[0].replace(/\n/g, ' ')}`
      );
    }
  }
  // Stating a version is REQUIRED only for a diverged pack — it is verified against a frozen
  // baseline rather than against the original, so its version is the reader's only handle on
  // which port was frozen. A non-diverged pack need not be versioned in prose; if it IS
  // versioned, the loop above still holds it to the source.
  if (hits === 0 && DIVERGED.includes(pack)) {
    problems.push(
      `README.md — \`${pack}\` is diverged-by-design (run-parity.js DIVERGED_PACKS) but README ` +
        `never states its version ON THE SAME LINE as the name (expected v${version} within 60 ` +
        'chars). A diverged pack is verified against a frozen baseline rather than the original, ' +
        "so its version is the reader's only handle on WHICH port was frozen."
    );
  }
}

// ---------------------------------------------------------------------------
// 3. The converse sweep: a count-shaped phrase that is NOT a registered claim.
//    Forward-only checking is how this defect survived two syncs — each sync
//    fixed the numbers it knew about, and the next new sentence was unwatched.
// ---------------------------------------------------------------------------

// Longest word first, and \b on both sides: without either, the alternation matches `seven`
// inside "seventeen" and reads 17 as 7.
const NUM = `\\b(\\d+|${[...WORDS].sort((a, b) => b.length - a.length).join('|')})\\b`;
// Filler between the number and the noun: no digits (so we take the NEAREST number), and no
// brackets or backticks (so `**Node.js ≥ 20** on \`PATH\` (validators …)` does not read as a
// claim that there are 20 validators — the parenthesis ends the clause).
const FILLER = '[^\\d\\n()`]{0,40}?';
// One entry per DERIVED count, so the sweep is as wide as the derivation. The first cut
// listed ten of these and omitted `validation_commands` and `ablation_targets`; the phrase
// "There are eight validation commands" was accepted as ordinary prose. A sweep narrower
// than the thing it guards is the F-27 family again — a control that reads as total
// coverage while covering a subset.
//
// STATED LIMIT: this is a vocabulary, so a count written with a noun nobody listed still
// slips. That is a bounded gap, not a silent one — every derived key has an entry, so the
// hole can only be a NEW way of naming an EXISTING suite, and the registry check (a claim
// that stops matching fails) catches the common form of that. `byte_for_byte` is
// deliberately absent: its phrase is "4 of the 9 … verified byte-for-byte", where the
// nearest number before the noun is the wrong one. It is registered as a CLAIM instead.
const NOUNS = [
  ['parity_fixtures', 'validator-parity fixtures?|parity fixtures?'],
  ['report_fixtures', 'report[- ]verdict fixtures?'],
  ['entropy_fixtures', 'stability-gate fixtures?'],
  ['provenance_fixtures', 'provenance-schema fixtures?'],
  ['evidence_fixtures', 'timestamp-integrity fixtures?'],
  ['golden_pairs', 'goldens'],
  ['validators', 'deterministic validators?|validators through|shipped validators?'],
  ['cli_targets', 'shipped CLIs?'],
  ['agents', 'subagents?'],
  ['skill_repo_lints', 'skill-repo lints?'],
  ['validation_commands', 'validation commands?|suite commands?'],
  ['ablation_targets', 'ablation targets?|targets —|targets:'],
  ['diverged_packs', 'deliberately diverged|diverged packs?'],
  // SC-19/F-96. Added with the count it guards, not after: `11 credential rules` was written
  // into three files and the sweep would have let all three through, because the vocabulary
  // only ever grew to cover counts that already existed. That is finding 62(b)'s shape — a
  // converse check exactly as wide as the defects that motivated it — and the fix is to add
  // the noun in the same commit as the noun.
  ['secret_scan_rules', 'credential rules?'],
];

for (const file of COVERED) {
  const body = text.get(file);
  if (body === undefined) continue;
  for (const [key, nounSrc] of NOUNS) {
    const re = new RegExp(`${NUM}${FILLER}(?:${nounSrc})`, 'gi');
    let m;
    while ((m = re.exec(body)) !== null) {
      const line = lineOf(body, m.index);
      if (claimedLines.get(file).has(line)) continue;
      problems.push(
        `${file}:${line} — "${m[0].replace(/\n/g, ' ')}" reads as a count of \`${key}\` but no ` +
          'CLAIMS entry asserts it. Register it in counts-lint.mjs (or reword it so it is not a count).'
      );
    }
  }
}

if (problems.length) {
  console.error(`[counts-lint] FAIL (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `[counts-lint] OK — ${checked} advertised count(s) across ${COVERED.length} file(s) match the ` +
    `suites on disk (parity ${COUNTS.parity_fixtures} / report ${COUNTS.report_fixtures} / ` +
    `entropy ${COUNTS.entropy_fixtures} / provenance ${COUNTS.provenance_fixtures} / ` +
    `evidence ${COUNTS.evidence_fixtures} / goldens ${COUNTS.golden_pairs} / ` +
    `validators ${COUNTS.validators} / agents ${COUNTS.agents})`
);
