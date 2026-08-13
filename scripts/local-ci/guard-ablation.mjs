#!/usr/bin/env node
'use strict';

/**
 * guard-ablation.mjs — asserts that the fixture corpus actually PINS the rules it
 * appears to test (M-5a/A2).
 *
 * The claim to falsify: "every rule in these validators is pinned by at least one
 * fixture." A field run proved that claim false in the target repo — two fixtures
 * were added specifically to lock a security fix, and DELETING THE GUARD LEFT BOTH
 * FIXTURES GREEN, because they targeted paths that did not exist and ENOENT
 * produced output byte-identical to the guard refusing. The same mutation sweep
 * found roughly a dozen further rules pinned by no fixture at all. The technique
 * was recommended as routine; no mechanism was ever shipped. This is that
 * mechanism, deliberately narrow.
 *
 * How it works. For each target validator: read its source, apply ONE textual
 * mutation, instantiate the mutated source with `new Function(...)` — not `vm`,
 * not a temp file — and run every fixture in that pack against the mutant's
 * `execute()`, deep-comparing each result against the fixture's frozen `expected`.
 * `require.main === module` is false for the shim module object, so the CLI
 * wrapper at the foot of each validator never fires.
 *
 * A mutant whose output is IDENTICAL on every fixture in its pack SURVIVED. A
 * survivor means: this line can be deleted or inverted and the whole suite stays
 * green — i.e. nothing pins it.
 *
 * Scope (deliberate). Two operators over the three packs SC-9 modifies. The wider
 * operator catalogue (guard-on, boundary flips, constant offsets, negation,
 * dropped pushes) and the remaining six validators are a separate decision, to be
 * made on the measurements this run prints rather than on estimates.
 *
 * Env handling is safe here precisely because drift-sentinel reads process.env at
 * CALL time rather than module-load time: the same impurity that forces
 * run-parity.js to spawn a child per fixture lets this run in-process.
 *
 * Usage: node scripts/local-ci/guard-ablation.mjs [--verbose]
 * Exit 0 when every survivor is an accepted baseline entry and every accepted
 * entry still survives. Exit 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const VALIDATOR_DIR = path.join(ROOT, 'adws-pipeline', 'scripts', 'validators');
const FIXTURES_DIR = path.join(ROOT, 'parity', 'fixtures');
const BASELINE_PATH = path.join(ROOT, 'parity', 'guard-ablation-baseline.json');
const REPORT_SOURCE = path.join(ROOT, 'adws-pipeline', 'scripts', 'execution-report.js');
const REPORT_FIXTURES_DIR = path.join(ROOT, 'parity', 'execution-report-fixtures');
const REPORT_GOLDENS_DIR = path.join(ROOT, 'parity', 'execution-report-goldens');

// M-5b/B6: extended from the three SC-9 packs to all nine, on M-5a/A2's measured cost
// (18 mutants / 122 calls / 6 ms for three packs of that size). The sweep is cheap enough
// that narrowing it buys nothing, and the first nine-pack run immediately found unpinned
// rules in criteria-to-checks — a pack no scope change had swept.
const VALIDATOR_PACKS = ['criteria-to-checks','document-coverage-map','drift-sentinel','patch-compose','repo-context-scan','review-risk-assess','ship-mode-select','task-normalize','verify-evidence-map'];

const VERBOSE = process.argv.includes('--verbose');
const WRITE_GOLDENS = process.argv.includes('--write-goldens');

// --- source scanning ---------------------------------------------------------
// A minimal state machine over the source so mutations never fire inside a comment
// or a string. Regex-only scanning would rewrite the word `fail` in a rubric
// description and produce meaningless mutants.

const CODE = 'code';
const LINE_COMMENT = 'line-comment';
const BLOCK_COMMENT = 'block-comment';

/**
 * Walk `src`, invoking onCode(index, char) only for characters in real code, and
 * onString(start, end, quote) for each complete string literal that began in code.
 */
function scanSource(src, { onCode, onString }) {
  let state = CODE;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (state === CODE) {
      if (c === '/' && next === '/') {
        state = LINE_COMMENT;
        i += 2;
        continue;
      }
      if (c === '/' && next === '*') {
        state = BLOCK_COMMENT;
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        const start = i;
        const quote = c;
        i += 1;
        while (i < src.length) {
          if (src[i] === '\\') {
            i += 2;
            continue;
          }
          if (src[i] === quote) break;
          i += 1;
        }
        if (onString) onString(start, i, quote);
        i += 1;
        continue;
      }
      if (onCode) onCode(i, c);
      i += 1;
      continue;
    }
    if (state === LINE_COMMENT) {
      if (c === '\n') state = CODE;
      i += 1;
      continue;
    }
    // BLOCK_COMMENT
    if (c === '*' && next === '/') {
      state = CODE;
      i += 2;
      continue;
    }
    i += 1;
  }
}

/**
 * The mutable region is the module body ABOVE the CLI wrapper.
 *
 * The first run of this tool reported nine survivors and every one of them was in
 * the wrapper (`if (require.main === module)`, `if (!src)`, the JSON-object guard).
 * That is a true finding stated in the wrong place: the 93 parity fixtures call
 * execute() directly through exec-one.js and never invoke the CLI at all, so they
 * pin no wrapper line by construction. Keeping those nine as permanent baseline
 * entries would say the same thing nine times and drown any real survivor.
 *
 * So the wrapper is out of scope HERE and pinned ELSEWHERE — by
 * parity/cli-contract/run-tests.js, which asserts all four exit-3 paths and both
 * input modes for every validator, and by scripts/local-ci/cli-block-lint.mjs,
 * which asserts the nine copies cannot drift apart. This tool's claim is
 * correspondingly narrow and true: the FIXTURE CORPUS pins every rule in execute().
 *
 * SC-17/F-90: the marker is a LIST because execution-report.js writes `// --- CLI ---`
 * rather than the validators' `// --- CLI wrapper`. Relying on the `module.exports`
 * fallback there would have been silently wrong rather than loud: the fallback cuts at
 * the exports block, which sits BELOW `main()` and the `require.main === module` line,
 * so 30-odd lines of argv parsing and usage text would have entered the mutable region
 * and re-created the exact wrapper-noise the paragraph above describes — this time
 * against a corpus that, like the validators', never calls the CLI.
 */
const CLI_MARKERS = ['// --- CLI wrapper', '// --- CLI ---'];

function executeRegion(src, name) {
  for (const marker of CLI_MARKERS) {
    const at = src.indexOf(marker);
    if (at !== -1) return src.slice(0, at);
  }
  const exportsAt = src.indexOf('module.exports');
  if (exportsAt === -1) {
    throw new Error(`guard-ablation: ${name} has neither a CLI marker nor module.exports`);
  }
  return src.slice(0, exportsAt);
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === '\n') line += 1;
  return line;
}

function snippet(text, max = 58) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

// --- operators ---------------------------------------------------------------

/**
 * guard-off: replace each `if (COND)` condition with `false`, so the guarded
 * branch never runs. This is the operator that reproduces the field defect
 * exactly — a guard deleted while its fixtures stay green.
 */
function guardOffMutants(src, pack) {
  const region = executeRegion(src, pack);
  const starts = [];
  scanSource(region, {
    onCode(i) {
      // `if` as a whole token, followed by optional space then `(`
      if (src.startsWith('if', i) && !/[A-Za-z0-9_$]/.test(src[i - 1] || ' ')) {
        const after = src.slice(i + 2).match(/^\s*\(/);
        if (after) starts.push(i + 2 + after[0].length - 1); // index of '('
      }
    },
  });

  const mutants = [];
  starts.forEach((openIdx, ordinal) => {
    // Balance parentheses, ignoring those inside strings/comments.
    let depth = 0;
    let closeIdx = -1;
    scanSource(src.slice(openIdx), {
      onCode(rel, ch) {
        if (closeIdx !== -1) return;
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) closeIdx = openIdx + rel;
        }
      },
    });
    if (closeIdx === -1) return;
    const cond = src.slice(openIdx + 1, closeIdx);
    if (cond.trim() === 'false' || cond.trim() === 'true') return; // already constant
    mutants.push({
      id: `${pack}:guard-off:#${ordinal}`,
      line: lineOf(src, openIdx),
      original: `if (${snippet(cond)})`,
      mutated: 'if (false)',
      source: src.slice(0, openIdx + 1) + 'false' + src.slice(closeIdx),
    });
  });
  return mutants;
}

/**
 * verdict: replace each `'fail'` / `'warn'` STRING LITERAL with `'pass'`. A
 * surviving verdict mutant means no fixture reaches that branch — the verdict is
 * unreachable by the corpus, which is how a rule ships un-pinned.
 */
function verdictMutants(src, pack) {
  const region = executeRegion(src, pack);
  const spans = [];
  scanSource(region, {
    onString(start, end, quote) {
      if (quote === '`') return;
      const value = src.slice(start + 1, end);
      if (value === 'fail' || value === 'warn') spans.push({ start, end, value });
    },
  });

  return spans.map((span, ordinal) => ({
    id: `${pack}:verdict:#${ordinal}`,
    line: lineOf(src, span.start),
    original: `'${span.value}'`,
    mutated: "'pass'",
    source: src.slice(0, span.start) + "'pass'" + src.slice(span.end + 1),
  }));
}

// --- mutant execution --------------------------------------------------------

const requireShim = createRequire(import.meta.url);

// Node strips a shebang when it loads a module; `new Function` does not, and chokes on
// `#!`. execution-report.js has one and the nine validators do not, which is why this
// never came up before. Rewrite the two characters to `//` rather than dropping the line:
// same byte length, so every mutation offset and every `lineOf` result stays exact. A
// slice would shift them all by one line and quietly mislabel every reported survivor.
function stripShebang(source) {
  return source.startsWith('#!') ? '//' + source.slice(2) : source;
}

function instantiate(rawSource, filename) {
  const source = stripShebang(rawSource);
  const moduleObj = { exports: {} };
  // `require.main === module` is false here, so the CLI wrapper never fires.
  // The shim only resolves what a validator is permitted to import (NFR-4).
  const scopedRequire = (spec) => {
    if (spec === 'fs' || spec === 'node:fs' || spec === 'path' || spec === 'node:path') return requireShim(spec);
    throw new Error(`guard-ablation: mutant tried to require '${spec}' — validators may import Node built-ins only`);
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', source);
  fn(moduleObj, moduleObj.exports, scopedRequire, filename, path.dirname(filename));
  return moduleObj.exports;
}

// The frozen `expected` baselines are produced by parity/exec-one.js, which serialises
// `undefined` as the sentinel string "__UNDEFINED__" (JSON.stringify would otherwise drop
// those keys and the key-count comparison would silently pass). This tool calls execute()
// in-process, so it sees real `undefined` and must treat the two as equal — without it,
// drift-sentinel fails the pristine sanity floor and the whole pack cannot be swept.
const UNDEFINED_SENTINEL = '__UNDEFINED__';

function deepEqual(a, b) {
  if (a === undefined && b === UNDEFINED_SENTINEL) return true;
  if (b === undefined && a === UNDEFINED_SENTINEL) return true;
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== 'object') return Number.isNaN(a) && Number.isNaN(b);
  // Keys whose value is `undefined` are present in the in-process result but serialise
  // to the sentinel in the baseline, so compare the union rather than raw key counts.
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

function loadFixtures(pack) {
  const dir = path.join(FIXTURES_DIR, pack);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ name: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

// --- the execution-report target (SC-17/F-90) --------------------------------
//
// The validators expose `execute(input) -> result`, a pure function over a JSON literal.
// execution-report.js exposes `buildReport(jobDir) -> {report, markdown}`, which READS a
// directory tree and WRITES nothing — `generateExecutionReport` is the thin writing
// wrapper around it. That is the same seam wearing different clothes, and it is why this
// target is tractable at all.
//
// Two volatile fields must be normalised, not one. `generated_at` is the obvious one and
// the existing suite already strips it. `evidence_root` is the trap: it is the absolute
// jobDir, so a golden frozen without normalising it passes only on the machine that wrote
// it.
//
// Comparison covers BOTH artifacts the tool writes — the report object and the rendered
// markdown — and the second one was a late correction worth recording. The first cut
// compared the report alone, on the reasoning that markdown is derived from it and
// sweeping renderMarkdown would roughly double the cost of that region. The measurement
// refuted it: 12 of the 31 survivors that cut produced were inside renderMarkdown, and
// they were not artefacts of the choice. NOTHING in this repo asserts markdown CONTENT —
// run-tests.js compares run 1 against run 2, which is determinism, not correctness — so
// the file the operator actually reads was pinned by nothing at all. The report object is
// what gates read; the markdown is what a human reads to decide whether to trust the gate.
// Both are output.
const REPORT_VOLATILE = { generated_at: '<generated_at>' };
const MD_GENERATED_AT = '- **Generated at:**';
const ROOT_PLACEHOLDER = '<evidence_root>';

/**
 * Scrub the absolute job directory out of a whole document, by VALUE.
 *
 * The first cut replaced `report.evidence_root` as a key and scrubbed the markdown as a
 * string, and the two disagreed: `quarantine_malformed_output` and
 * `quarantine_unreadable_manifest` interpolate the failing file's absolute path into a
 * gate detail and a warning, so those goldens pinned this checkout's path while the
 * markdown goldens did not. Two normalisations of one fact, one thorough and one not —
 * finding 51 in miniature, caught by grepping the frozen output for a path that had no
 * business being in it. One scrubber now, applied to both.
 */
/**
 * V8's JSON.parse message gained a " (line N column M)" suffix in Node 22; Node 20 emits
 * the same message without it. `quarantine_malformed_output` puts that message into a gate
 * detail and a warning verbatim, so goldens frozen on Node 24 could not be reproduced on
 * Node 20 and the sanity floor aborted the whole target. Caught by the pre-push
 * cross-version leg, which is the only thing in this repo that runs both.
 *
 * Strip the varying clause and nothing else: the byte offset ("at position 53") is stable
 * across both versions and stays pinned, as does the fact that the file failed to parse.
 * The assertion is that the reader reports a malformed file, never that a particular V8
 * release phrases it a particular way.
 */
const V8_JSON_POSITION_SUFFIX = / \(line \d+ column \d+\)/g;

function scrubRuntimeDetail(text, jobDir) {
  return text.split(jobDir).join(ROOT_PLACEHOLDER).replace(V8_JSON_POSITION_SUFFIX, '');
}

function normalizeReport(report, jobDir) {
  // Round-trip through JSON so the comparison is against what execution_report.json would
  // actually contain. Without it, a key whose value is `undefined` survives in the live
  // object and vanishes from the golden, and deepEqual's key-count check reports a
  // mismatch that does not exist on disk. The scrub runs on the serialised form so it
  // reaches paths nested anywhere — gate details and warnings both carry them.
  return JSON.parse(scrubRuntimeDetail(JSON.stringify({ ...report, ...REPORT_VOLATILE }), jobDir));
}

function normalizeMarkdown(markdown, jobDir) {
  return scrubRuntimeDetail(
    markdown
      .split('\n')
      .map((line) => (line.startsWith(MD_GENERATED_AT) ? `${MD_GENERATED_AT} <generated_at>` : line))
      .join('\n'),
    jobDir
  );
}

const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

function loadReportCases() {
  const { CASES } = requireShim(path.join(REPORT_FIXTURES_DIR, 'cases.js'));
  return CASES.map((c) => ({
    name: c.name,
    jobDir: path.join(REPORT_FIXTURES_DIR, c.name, 'artifacts', c.jobId),
    chmod: c.chmod || null,
    // SC-11/A1's rule, replicated rather than re-derived: mode 000 is still readable as
    // root, so the case cannot be evaluated there.
    skip: Boolean(c.skipIfRoot) && IS_ROOT,
    goldenPath: path.join(REPORT_GOLDENS_DIR, `${c.name}.json`),
    // Kept as a sibling `.md` rather than a string inside the JSON: a 60-line rendered
    // report embedded as one escaped value is a golden nobody reviews, and an unreviewed
    // golden pins whatever was wrong when it was frozen.
    goldenMdPath: path.join(REPORT_GOLDENS_DIR, `${c.name}.md`),
  }));
}

/**
 * Apply a case's declared modes and return the function that reverts them. A crash
 * between the two would leave an unreadable file in the working tree, so every caller
 * runs the revert in a `finally`.
 */
function applyModes(reportCase) {
  if (!reportCase.chmod) return () => {};
  const restore = [];
  for (const [rel, mode] of Object.entries(reportCase.chmod)) {
    const target = path.join(reportCase.jobDir, rel);
    restore.push([target, fs.statSync(target).mode & 0o777]);
    fs.chmodSync(target, mode);
  }
  return () => {
    for (const [target, mode] of restore) fs.chmodSync(target, mode);
  };
}

function reportFor(exports_, reportCase) {
  const revert = applyModes(reportCase);
  try {
    caseRuns += 1;
    const { report, markdown } = exports_.buildReport(reportCase.jobDir);
    return {
      report: normalizeReport(report, reportCase.jobDir),
      markdown: normalizeMarkdown(markdown, reportCase.jobDir),
    };
  } catch (_err) {
    return { __threw: true };
  } finally {
    revert();
  }
}

/**
 * Measured, not derived. Both runners short-circuit on the first case that disagrees, so
 * mutants + fixtures is a MATRIX SIZE and not a call count — the two diverge by more the
 * better the corpus is, because a well-pinned rule dies on its first case. Incremented at
 * the actual invocation so the reported figure is what ran.
 */
let caseRuns = 0;

function runAgainstGoldens(exports_, cases) {
  for (const reportCase of cases) {
    if (reportCase.skip) continue;
    if (!deepEqual(reportFor(exports_, reportCase), reportCase.golden)) return false;
  }
  return true;
}

function runAgainstFixtures(exports_, fixtures) {
  // Returns true if EVERY fixture still produces its frozen `expected` (survived).
  for (const fixture of fixtures) {
    const saved = {};
    if (fixture.env) {
      for (const [k, v] of Object.entries(fixture.env)) {
        saved[k] = process.env[k];
        process.env[k] = v;
      }
    }
    let result;
    try {
      caseRuns += 1;
      result = exports_.execute(fixture.input);
    } catch (_err) {
      result = { __threw: true };
    } finally {
      if (fixture.env) {
        for (const [k] of Object.entries(fixture.env)) {
          if (saved[k] === undefined) delete process.env[k];
          else process.env[k] = saved[k];
        }
      }
    }
    if (!deepEqual(result, fixture.expected)) return false; // killed by this fixture
  }
  return true; // survived every fixture
}

// --- baseline ----------------------------------------------------------------

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { accepted: [] };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

const VALID_CLASSES = new Set(['equivalent', 'unpinned']);

/**
 * SC-14/A4a (F-86). The baseline's own `_doc` has required `reason`, `class` and — for an
 * unpinned entry — an `owner` since M-5a. Nothing read any of them. Audit M-6 found all 19
 * entries carrying `class: unpinned` and `owner: "SC-12 (unscheduled)"` long after SC-12
 * shipped: a bulk assignment nobody had to justify and nothing could contradict. A field
 * the reader is not told to read is a field that was not written (F-75), and a count no
 * consumer compares is not a control (F-27).
 *
 * The two classes need opposite treatment, which is why merging them into one number was
 * the defect: `equivalent` is permanent and costs nothing, `unpinned` is debt and must
 * shrink. The budget makes growth deliberate rather than silent.
 */
function validateBaselineShape(doc) {
  const errors = [];
  const entries = doc.accepted || [];

  for (const entry of entries) {
    const id = entry && entry.id ? entry.id : '<entry with no id>';
    if (!entry || typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      errors.push(`${id}: missing \`reason\``);
    }
    if (!entry || !VALID_CLASSES.has(entry.class)) {
      errors.push(
        `${id}: \`class\` must be one of ${[...VALID_CLASSES].join(' | ')} (got ${JSON.stringify(
          entry && entry.class
        )})`
      );
    }
    if (entry && entry.class === 'unpinned' && (typeof entry.owner !== 'string' || entry.owner.trim() === '')) {
      errors.push(`${id}: an \`unpinned\` entry must name an \`owner\` — the work package that closes it`);
    }
    if (entry && entry.class === 'equivalent' && entry.owner) {
      errors.push(`${id}: an \`equivalent\` entry is permanent and must NOT carry an \`owner\` (nothing is owed)`);
    }
  }

  const unpinned = entries.filter((e) => e && e.class === 'unpinned');
  const budget = doc.unpinned_budget;
  if (!Number.isInteger(budget) || budget < 0) {
    errors.push('baseline has no valid integer `unpinned_budget`');
  } else if (unpinned.length > budget) {
    errors.push(
      `${unpinned.length} \`unpinned\` entr(ies) against a budget of ${budget}. Unpinned entries are ` +
        'DEBT: close one with a fixture, or raise `unpinned_budget` in this commit and say why.'
    );
  }

  // Count `equivalent` explicitly rather than as "everything that is not unpinned".
  // Subtraction reported an entry with a missing or misspelled `class` as equivalent —
  // i.e. the summary line would absorb exactly the entries the validation above rejects,
  // and would keep mis-counting if a third class is ever added (review finding).
  const equivalent = entries.filter((e) => e && e.class === 'equivalent');
  return { errors, unpinnedCount: unpinned.length, equivalentCount: equivalent.length, budget };
}

// --- targets -----------------------------------------------------------------
//
// A target is a source file plus the corpus that claims to pin it. The nine validators
// and execution-report.js differ only in how a case is run and what it is compared
// against; everything below this point — the two operators, the mutable region, the
// sanity floor, the baseline contract — is shared, which is the whole reason the file the
// last three defects lived in can be swept without a second tool.

// The coverage assertion the report goldens need already exists and is already the one
// three other runners use (F-41). Reach for it rather than writing a fourth copy.
const { assertFixtureCoverage, listBySuffix } = requireShim(path.join(ROOT, 'parity', '_harness.js'));

function validatorTarget(pack) {
  return {
    name: pack,
    sourcePath: path.join(VALIDATOR_DIR, pack + '.js'),
    caseUnit: 'fixture',
    loadCases: () => loadFixtures(pack),
    survives: runAgainstFixtures,
  };
}

const REPORT_TARGET = {
  name: 'execution-report',
  sourcePath: REPORT_SOURCE,
  caseUnit: 'report fixture',
  loadCases: () => {
    const cases = loadReportCases();
    // The goldens are a second source for the same fact as the fixture directories, so
    // cross-check them the way M-3a cross-checks CASES against disk. A missing golden must
    // be loud: silently sweeping 27 of 28 cases would under-report survivors, which is the
    // one direction this tool must never fail in.
    const problems = assertFixtureCoverage({
      declared: cases.map((c) => c.name).sort(),
      onDisk: listBySuffix(REPORT_GOLDENS_DIR, '.json').map((f) => f.replace(/\.json$/, '')).sort(),
      unit: 'golden',
      declaredUnit: 'report fixture(s)',
    });
    if (problems > 0) {
      console.error('guard-ablation: report goldens and fixtures disagree — run --write-goldens after reviewing the diff.');
      process.exit(1);
    }
    return cases.map((c) => ({
      ...c,
      golden: {
        report: JSON.parse(fs.readFileSync(c.goldenPath, 'utf8')),
        markdown: fs.readFileSync(c.goldenMdPath, 'utf8'),
      },
    }));
  },
  survives: runAgainstGoldens,
};

const TARGETS = [...VALIDATOR_PACKS.map(validatorTarget), REPORT_TARGET];

// --- goldens freeze ----------------------------------------------------------
// On the same script as the comparator, deliberately: a separate freezing tool is a second
// implementation of `normalizeReport`, and two implementations of one normalisation is how
// a golden corpus quietly stops describing what the comparator checks.

if (WRITE_GOLDENS) {
  fs.mkdirSync(REPORT_GOLDENS_DIR, { recursive: true });
  const pristine = instantiate(fs.readFileSync(REPORT_SOURCE, 'utf8'), REPORT_SOURCE);
  let written = 0;
  let skipped = 0;
  for (const reportCase of loadReportCases()) {
    if (reportCase.skip) {
      skipped += 1;
      console.log(`  SKIP ${reportCase.name} — running as root; mode 000 is readable`);
      continue;
    }
    const frozen = reportFor(pristine, reportCase);
    fs.writeFileSync(reportCase.goldenPath, JSON.stringify(frozen.report, null, 2) + '\n');
    fs.writeFileSync(reportCase.goldenMdPath, frozen.markdown);
    written += 1;
  }
  console.log(`[guard-ablation] wrote ${written} golden(s) to parity/execution-report-goldens/${skipped ? `, skipped ${skipped}` : ''}`);
  process.exit(0);
}

// --- main --------------------------------------------------------------------

const started = Date.now();
const baseline = loadBaseline();
const acceptedById = new Map((baseline.accepted || []).map((entry) => [entry.id, entry]));

let totalMutants = 0;
const survivors = [];

for (const target of TARGETS) {
  const { name: pack, sourcePath: scriptPath } = target;
  const src = fs.readFileSync(scriptPath, 'utf8');
  const fixtures = target.loadCases();

  // Sanity floor: the UNMUTATED source must reproduce every frozen expectation.
  // Without this, a survivor count is meaningless — everything would "survive".
  const pristine = instantiate(src, scriptPath);
  if (!target.survives(pristine, fixtures)) {
    console.error(`guard-ablation: ${pack} does not reproduce its own fixtures unmutated — aborting.`);
    process.exit(1);
  }

  const mutants = [...guardOffMutants(src, pack), ...verdictMutants(src, pack)];
  totalMutants += mutants.length;

  let packSurvivors = 0;
  for (const mutant of mutants) {
    let exports_;
    try {
      exports_ = instantiate(mutant.source, scriptPath);
    } catch (_err) {
      continue; // mutant does not parse — not a survivor, not a finding
    }
    if (target.survives(exports_, fixtures)) {
      packSurvivors += 1;
      survivors.push({ ...mutant, pack });
    }
    if (VERBOSE) {
      console.log(`  ${mutant.id} L${mutant.line} ${mutant.original} → ${mutant.mutated}`);
    }
  }

  console.log(
    `[guard-ablation] ${pack}: ${mutants.length} mutant(s) × ${fixtures.length} ${target.caseUnit}(s), ${packSurvivors} survivor(s)`
  );
}

const elapsedMs = Date.now() - started;

// --- verdict: bidirectional, mirroring EXPECTED_FIXTURE_TOTAL's discipline -----

let failed = false;
const survivorIds = new Set(survivors.map((s) => s.id));

// SC-14/A4a: the baseline's own contract, finally asserted.
const shape = validateBaselineShape(baseline);
if (shape.errors.length) {
  failed = true;
  console.log('\nBASELINE CONTRACT VIOLATION(S) — parity/guard-ablation-baseline.json:');
  for (const e of shape.errors) console.log(`  ${e}`);
  console.log(
    '\n  `equivalent` means the mutation provably cannot change output, and is permanent.\n' +
      '  `unpinned` means the rule genuinely lacks a fixture: it is debt, it needs an owner,\n' +
      '  and it counts against `unpinned_budget`.'
  );
}

const unaccepted = survivors.filter((s) => !acceptedById.has(s.id));
if (unaccepted.length) {
  failed = true;
  console.log('\nNEW SURVIVOR(S) — a rule that no fixture pins:');
  for (const s of unaccepted) {
    console.log(`  ${s.id}`);
    console.log(`    ${s.pack}.js:${s.line}  ${s.original} → ${s.mutated}`);
    console.log('    Every fixture in the pack still produced its frozen `expected` with this change applied.');
  }
  console.log(
    '\n  Fix: add a fixture that flips when this rule is reverted alone — or, if the mutant is\n' +
      '  genuinely equivalent, add it to parity/guard-ablation-baseline.json with a reason.'
  );
}

const stale = [...acceptedById.keys()].filter((id) => !survivorIds.has(id));
if (stale.length) {
  failed = true;
  console.log('\nSTALE BASELINE ENTR(IES) — these mutants are now killed:');
  for (const id of stale) console.log(`  ${id} — delete this entry from the baseline in the same commit`);
}

console.log(
  `\n[guard-ablation] ${totalMutants} mutant(s) over ${TARGETS.length} target(s), ` +
    `${caseRuns} case run(s), ${survivors.length} survivor(s), ${elapsedMs} ms`
);

if (failed) {
  process.exitCode = 1;
} else {
  // SC-14/A4a: report the two populations separately. One number merged a permanent,
  // costless class with a debt that is supposed to shrink, so 19 unverified rules read as
  // a clean pass.
  console.log(
    `[guard-ablation] OK — ${shape.equivalentCount} equivalent (permanent), ` +
      `${shape.unpinnedCount} unpinned (debt, budget ${shape.budget}); ` +
      'every survivor is accepted and every accepted entry still survives.'
  );
}
