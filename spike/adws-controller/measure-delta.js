#!/usr/bin/env node
/**
 * STEP 4 measurement — the Q5 line-delta. THROWAWAY.
 *
 * Answers docs/SPIKE_CONTROLLER_PLAN.md §6 question 5: "X lines of SKILL.md + phase-gates
 * prose are replaced by Y lines of controller code + Z lines of thin interface."
 *
 * Everything here is derived, never asserted. The classification lives in
 * prose-classification.json as explicit line ranges with labels; this script refuses to
 * print a number unless those ranges tile each file exactly — no gap, no overlap, and the
 * file's current length matching the table. A reader who disagrees with a range edits the
 * table and re-runs; a reader who deletes one gets an error, not a smaller X.
 *
 * The controller-coverage table below is verified the same way: each row names a regex
 * anchor in adws-run.js, and a row whose anchor has disappeared fails the run rather than
 * silently overstating what Y bought.
 *
 * USAGE: node measure-delta.js [--json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const CLASSIFICATION = path.join(__dirname, 'prose-classification.json');
const CONTROLLER = path.join(__dirname, 'adws-run.js');
const THIN = path.join(__dirname, 'thin-skill-sketch.md');
const JSON_ONLY = process.argv.includes('--json');

let errors = 0;
const out = [];
function say(s) { if (!JSON_ONLY) out.push(s); }
function bad(s) { errors++; out.push(`  ERROR  ${s}`); }

/* ---------------------------------------------------------------- prose classification */

const CLASS_NAMES = {
  C: 'CONTROLLER  executed by adws-run.js; leaves the orchestrator\'s context',
  A: 'AGENT       instructs a phase agent; leaves the orchestrator, replaced by nothing',
  K: 'KEPT        still model work: intake, dispatch, human decisions, relay',
  S: 'SPLIT       part code part prose; counted as KEPT throughout',
};

const spec = JSON.parse(fs.readFileSync(CLASSIFICATION, 'utf8'));
const files = [...new Set(spec.ranges.map((r) => r.file))];

// { file: { lines: [...], byClass: { C: {lines, nonblank, bytes}, ... } } }
const prose = {};

for (const file of files) {
  const abs = path.join(REPO, file);
  if (!fs.existsSync(abs)) { bad(`classified file is missing: ${file}`); continue; }
  const text = fs.readFileSync(abs, 'utf8');
  // A trailing newline terminates the last line; it does not open a new one. This is the
  // `wc -l` convention, and the code side is counted with `wc -l`.
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  const ranges = spec.ranges.filter((r) => r.file === file).sort((a, b) => a.from - b.from);
  const owner = new Array(lines.length + 1).fill(null);
  for (const r of ranges) {
    if (r.from < 1 || r.to > lines.length) {
      bad(`${file}:${r.from}-${r.to} is outside the file (${lines.length} lines) — the file changed under the table`);
      continue;
    }
    for (let n = r.from; n <= r.to; n++) {
      if (owner[n]) bad(`${file}:${n} is claimed twice (${owner[n]} and ${r.label})`);
      owner[n] = r.label;
    }
  }
  const gaps = [];
  for (let n = 1; n <= lines.length; n++) if (!owner[n]) gaps.push(n);
  if (gaps.length) bad(`${file}: ${gaps.length} unclassified line(s), first at ${gaps[0]}`);

  const byClass = {};
  for (const k of Object.keys(CLASS_NAMES)) byClass[k] = { lines: 0, nonblank: 0, bytes: 0 };
  for (const r of ranges) {
    for (let n = r.from; n <= r.to && n <= lines.length; n++) {
      const L = lines[n - 1];
      byClass[r.class].lines++;
      if (L.trim() !== '') byClass[r.class].nonblank++;
      byClass[r.class].bytes += Buffer.byteLength(L, 'utf8') + 1;
    }
  }
  prose[file] = { total: lines.length, bytes: Buffer.byteLength(text, 'utf8'), byClass };
}

function sumClass(k, subset) {
  const acc = { lines: 0, nonblank: 0, bytes: 0 };
  for (const f of subset) {
    if (!prose[f]) continue;
    acc.lines += prose[f].byClass[k].lines;
    acc.nonblank += prose[f].byClass[k].nonblank;
    acc.bytes += prose[f].byClass[k].bytes;
  }
  return acc;
}

const Q5_SCOPE = ['adws-pipeline/SKILL.md', 'adws-pipeline/references/phase-gates.md'];
const FULL_SCOPE = files;

/* ------------------------------------------------------- what Y actually covers of X */

// Each row: a rule family the classification credits to CONTROLLER, and whether the spike's
// 1,526 lines actually implement it. `anchor` must match adws-run.js or the row fails.
//
// `owns` lists the C-classified blocks that belong WHOLLY to an absent family, by exact
// classification-table range. Blocks an absent family SHARES with an implemented one (the
// rewind prose, the consensus prose) are deliberately left out, which makes the projection
// below a FLOOR on the full controller's size, never a ceiling.
const COVERAGE = [
  { name: 'phase sequencing, no skip, terminal states',        status: 'full',    anchor: /const PHASES = \[/ },
  { name: 'fresh attempt_{n} directory per attempt (FR-4)',    status: 'full',    anchor: /function attemptDir\(/ },
  { name: 'retry budgets + escalation ladder + saturation',    status: 'full',    anchor: /const RETRY_BUDGET =/ },
  { name: 'FR-12 tier table, floors, post-review re-key',      status: 'full',    anchor: /const TIER_TABLE =/ },
  { name: 'gate decision + validator fail blocks promotion',   status: 'full',    anchor: /function phaseGate\(/ },
  { name: 'skill_trace transcription (SC-8/F-55)',             status: 'full',    anchor: /rubric_result/ },
  { name: 'validator invocation',                              status: 'partial', anchor: /function runValidator\(/ },
  { name: 'test->build rewind, corrections.json, F-76 ids',    status: 'full',    anchor: /function openRewind\(/ },
  { name: 'check-defect repair budget (SC-3 A4)',              status: 'full',    anchor: /const CHECK_REPAIR_CAP/ },
  { name: 'terminal report + exit-code contract (FR-10)',      status: 'full',    anchor: /const SCORER_PATH =/ },
  { name: 'failure-reason classes',                            status: 'partial', anchor: /function terminalReasonFor\(/ },
  { name: 'controller-owned decision ledger',                  status: 'extra',   anchor: /function decisionsPath\(/ },
  { name: 'worktree creation, slug, ship-mode-select pre-git', status: 'absent',  owns: ['adws-pipeline/SKILL.md:134-157'] },
  { name: 'skill-check at intake (F-72)',                      status: 'absent',  owns: ['adws-pipeline/SKILL.md:81-97'] },
  { name: 'stability gate + parse-failure accounting (X-2)',   status: 'absent',  owns: ['adws-pipeline/references/phase-gates.md:472-491'] },
  { name: 'review / verify / operator-directed rewinds',       status: 'absent',  owns: [] },
  { name: 'consensus dispatch + reconciliation (FR-7)',        status: 'absent',  owns: [] },
  { name: 'grader + drift routing (FR-11)',                    status: 'absent',  owns: ['adws-pipeline/SKILL.md:327-339'] },
  { name: 'ship modes + delegated push (FR-9/F-5)',            status: 'absent',  owns: ['adws-pipeline/SKILL.md:288-292'] },
  { name: 'resume, carry_over, resumed_from (SC-13/F-73)',     status: 'absent',  owns: ['adws-pipeline/SKILL.md:101-121', 'adws-pipeline/SKILL.md:349-363'] },
  { name: 'evidence archive + conditional teardown (SC-11)',   status: 'absent',  owns: ['adws-pipeline/SKILL.md:364-384'] },
];

const controllerSrc = fs.readFileSync(CONTROLLER, 'utf8');
const rangeKey = (r) => `${r.file}:${r.from}-${r.to}`;
const byKey = new Map(spec.ranges.map((r) => [rangeKey(r), r]));
let absentProseLines = 0;
for (const r of COVERAGE) {
  if (r.anchor && !r.anchor.test(controllerSrc)) bad(`coverage row "${r.name}" claims ${r.status} but its anchor ${r.anchor} is gone from adws-run.js`);
  if (!r.anchor && r.status !== 'absent') bad(`coverage row "${r.name}" claims ${r.status} with no anchor`);
  for (const key of r.owns || []) {
    const block = byKey.get(key);
    if (!block) { bad(`coverage row "${r.name}" owns ${key}, which is not a range in the classification table`); continue; }
    if (block.class !== 'C') { bad(`coverage row "${r.name}" owns ${key}, classified ${block.class} not C`); continue; }
    absentProseLines += block.to - block.from + 1;
  }
}
const covCount = (s) => COVERAGE.filter((r) => r.status === s).length;

const wc = (p) => {
  const t = fs.readFileSync(p, 'utf8');
  const L = t.split('\n');
  if (L[L.length - 1] === '') L.pop();
  return { lines: L.length, nonblank: L.filter((x) => x.trim() !== '').length, bytes: Buffer.byteLength(t, 'utf8') };
};

const Y = wc(CONTROLLER);
const Z = wc(THIN);

/* ------------------------------------------------ orchestrator context loaded per run */

// BEFORE: the five documents SKILL.md's own procedure directs the orchestrator into during
// a seven-phase run. AFTER: the thin interface plus the one reference intake still needs.
// runtimes.md and troubleshooting.md are conditional in BOTH worlds and are excluded from
// both, so the comparison stays symmetric.
const BEFORE_SET = [
  'adws-pipeline/SKILL.md',
  'adws-pipeline/references/task-contract.md',
  'adws-pipeline/references/phase-gates.md',
  'adws-pipeline/references/artifact-layout.md',
  'adws-pipeline/references/validator-inputs.md',
];
const AFTER_SET = ['adws-pipeline/references/task-contract.md'];
const bytesOf = (rel) => fs.statSync(path.join(REPO, rel)).size;
const beforeBytes = BEFORE_SET.reduce((a, f) => a + bytesOf(f), 0);
const afterBytes = AFTER_SET.reduce((a, f) => a + bytesOf(f), 0) + Z.bytes;
const floorBefore = bytesOf('adws-pipeline/SKILL.md');
const floorAfter = Z.bytes;

// Handshake cost, if a driver measured one. run-step4.sh writes this file after driving a
// complete seven-phase run; absent, the row says so rather than quoting step 3's estimate.
const HANDSHAKE = path.join(__dirname, '.step4-handshake.json');
let handshake = fs.existsSync(HANDSHAKE) ? JSON.parse(fs.readFileSync(HANDSHAKE, 'utf8')) : null;
// The recorded run is only evidence about the controller it ran against. If adws-run.js has
// changed since, say so instead of quoting a number that no longer describes anything.
let handshakeStale = false;
if (handshake && handshake.controller_bytes !== fs.statSync(CONTROLLER).size) {
  handshakeStale = true;
  handshake = null;
}

/* --------------------------------------------------------------------------- report */

const pct = (a, b) => (b === 0 ? 'n/a' : `${((a / b) * 100).toFixed(1)}%`);
const row = (a, b, c, d) => say(`  ${String(a).padEnd(46)}${String(b).padStart(7)}${String(c).padStart(9)}${String(d).padStart(11)}`);

say('=== STEP 4 — the Q5 line-delta ===\n');
say('CLASSIFICATION (every line of every orchestrator-facing document, tiled)\n');
say(`  ${'file'.padEnd(46)}${'lines'.padStart(7)}${'nonblank'.padStart(9)}${'bytes'.padStart(11)}`);
for (const f of files) {
  const p = prose[f];
  if (!p) continue;
  row(path.basename(f), p.total, Object.values(p.byClass).reduce((a, c) => a + c.nonblank, 0), p.bytes);
  for (const k of ['C', 'A', 'K', 'S']) {
    const c = p.byClass[k];
    if (c.lines) row(`    ${k}  ${CLASS_NAMES[k].split('  ')[0]}`, c.lines, c.nonblank, c.bytes);
  }
}

say('\nX — prose the controller takes over\n');
for (const [label, scope] of [['Q5 scope (SKILL.md + phase-gates.md)', Q5_SCOPE], ['§8 scope (all four orchestrator documents)', FULL_SCOPE]]) {
  const tot = scope.reduce((a, f) => a + (prose[f] ? prose[f].total : 0), 0);
  const C = sumClass('C', scope), A = sumClass('A', scope), K = sumClass('K', scope), S = sumClass('S', scope);
  say(`  ${label}`);
  say(`    total prose                 ${String(tot).padStart(5)} lines`);
  say(`    X = C  controller           ${String(C.lines).padStart(5)} lines  ${pct(C.lines, tot).padStart(6)}   (${C.nonblank} non-blank, ${C.bytes} bytes)`);
  say(`        A  agent-facing         ${String(A.lines).padStart(5)} lines  ${pct(A.lines, tot).padStart(6)}   replaced by nothing`);
  say(`        K  kept by the model    ${String(K.lines).padStart(5)} lines  ${pct(K.lines, tot).padStart(6)}`);
  say(`        S  split (counted kept) ${String(S.lines).padStart(5)} lines  ${pct(S.lines, tot).padStart(6)}`);
}

const Cfull = sumClass('C', FULL_SCOPE), Sfull = sumClass('S', FULL_SCOPE);
say('\nY — controller code, and how much of X it actually buys\n');
say(`  adws-run.js                   ${String(Y.lines).padStart(5)} lines  (${Y.nonblank} non-blank, ${Y.bytes} bytes)`);
say(`  rule families credited to C   ${String(COVERAGE.length - covCount('extra')).padStart(5)}`);
say(`    implemented (full)          ${String(covCount('full')).padStart(5)}`);
say(`    implemented (partial)       ${String(covCount('partial')).padStart(5)}`);
say(`    not implemented             ${String(covCount('absent')).padStart(5)}`);
say(`    built with no prose origin  ${String(covCount('extra')).padStart(5)}   (the decision ledger — finding 19)`);
for (const r of COVERAGE) say(`      ${r.status.padEnd(8)} ${r.name}`);

// Floor on the full controller. The nine absent families wholly own `absentProseLines` of
// C-classified prose; the rest of C is what the 1,526 lines already cover. Applying that
// realized code-per-prose-line ratio to all of C projects the finished controller. It is a
// FLOOR twice over: shared blocks are credited to the implemented side, and the absent set
// contains the two families with the most branching (ship modes, resume).
const implementedProse = Cfull.lines - absentProseLines;
const ratio = Y.lines / implementedProse;
const yFullFloor = Math.round(ratio * Cfull.lines);
say('');
say(`  C prose wholly owned by the nine absent families   ${String(absentProseLines).padStart(5)} lines`);
say(`  C prose the 1,526 lines already cover              ${String(implementedProse).padStart(5)} lines   ${ratio.toFixed(2)} code lines per prose line`);
say(`  FLOOR on the finished controller                   ${String(yFullFloor).padStart(5)} lines`);

say('\nZ — the thin interface\n');
say(`  thin-skill-sketch.md          ${String(Z.lines).padStart(5)} lines  (${Z.nonblank} non-blank, ${Z.bytes} bytes)`);
say(`  §8's sketch of this document      5 lines  — the estimate this measurement replaces`);

say('\nTHE MEASUREMENT THAT DECIDES — orchestrator instruction bytes per run\n');
say('  Controller code is EXECUTED, not read: adws-run.js never enters the model\'s context.');
say('  Prose is loaded and interpreted every run. So the two sides of Q5 are not commensurable');
say('  as line counts, and this is the comparison that bears on §9\'s kill criterion.\n');
say(`  before  ${BEFORE_SET.length} documents the procedure directs into   ${String(beforeBytes).padStart(7)} bytes`);
say(`  after   thin interface + task-contract.md          ${String(afterBytes).padStart(7)} bytes`);
say(`  delta                                             ${String(afterBytes - beforeBytes).padStart(7)} bytes   ${pct(afterBytes, beforeBytes)} of before`);
say(`  conservative floor (SKILL.md alone vs the sketch)  ${String(floorAfter - floorBefore).padStart(7)} bytes   ${pct(floorAfter, floorBefore)} of before`);
say('  Token estimates would divide both sides by the same constant, so the ratio above is');
say('  independent of any tokenizer. Bytes are reported because they are what was measured.');
if (handshake) {
  say(`\n  handshake added back, one complete seven-phase run      ${String(handshake.total_bytes).padStart(7)} bytes`);
  say(`    ${handshake.messages} controller messages over ${handshake.phases} phases, ${handshake.model_turns} model turns`);
  say(`    net change in orchestrator instruction bytes         ${String(afterBytes + handshake.total_bytes - beforeBytes).padStart(7)} bytes`);
} else if (handshakeStale) {
  say('\n  handshake volume: STALE — .step4-handshake.json was measured against a different');
  say('  adws-run.js. Re-run run-step4.sh; the recorded number is not quoted here.');
} else {
  say('\n  handshake volume: NOT MEASURED in this invocation (run run-step4.sh, which drives a');
  say('  complete seven-phase run and writes .step4-handshake.json).');
}

say('\nSENSITIVITY — what it takes to change the answer\n');
const tot4 = FULL_SCOPE.reduce((a, f) => a + prose[f].total, 0);
say(`  as classified,  X = ${Cfull.lines} of ${tot4} lines   ${pct(Cfull.lines, tot4)}`);
say(`  credit every SPLIT block to the controller (the optimistic reading)`);
say(`                  X = ${Cfull.lines + Sfull.lines} of ${tot4} lines   ${pct(Cfull.lines + Sfull.lines, tot4)}`);
const residue = sumClass('A', FULL_SCOPE).lines + sumClass('K', FULL_SCOPE).lines + Sfull.lines;
say(`  the residue the thin interface must carry: A + K + S = ${residue} lines of prose,`);
say(`  absorbed by a ${Z.lines}-line sketch plus the unchanged agent definitions. That ratio, not`);
say(`  the classification, is what a reader should attack: if the sketch is too thin, X is wrong.`);
const breakeven = beforeBytes - afterBytes;
say('');
say(`  BREAK-EVEN, which is §9's kill criterion stated as a number: the handshake would have`);
say(`  to cost ${breakeven} bytes per run — ${Math.round(breakeven / 7)} bytes per phase — to erase the`);
say(`  reduction. §9 kills §6.2 above roughly 2-3 model round trips per phase.`);
if (handshake) {
  say(`  measured: ${handshake.total_bytes} bytes per run, ${Math.round(handshake.total_bytes / handshake.phases)} per phase`);
  say(`            = ${(breakeven / handshake.total_bytes).toFixed(1)}x headroom against break-even.`);
}

const result = {
  x_q5_scope: sumClass('C', Q5_SCOPE).lines,
  x_full_scope: Cfull.lines,
  x_full_scope_optimistic: Cfull.lines + Sfull.lines,
  agent_facing: sumClass('A', FULL_SCOPE).lines,
  kept: sumClass('K', FULL_SCOPE).lines + Sfull.lines,
  prose_total_q5: Q5_SCOPE.reduce((a, f) => a + prose[f].total, 0),
  prose_total_full: tot4,
  y_lines: Y.lines,
  y_nonblank: Y.nonblank,
  y_full_floor: yFullFloor,
  absent_family_prose_lines: absentProseLines,
  z_lines: Z.lines,
  breakeven_handshake_bytes_per_run: breakeven,
  coverage: { full: covCount('full'), partial: covCount('partial'), absent: covCount('absent'), extra: covCount('extra') },
  context_before_bytes: beforeBytes,
  context_after_bytes: afterBytes,
  context_floor_before_bytes: floorBefore,
  context_floor_after_bytes: floorAfter,
  handshake,
  errors,
};

if (JSON_ONLY) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
else {
  process.stdout.write(out.join('\n') + '\n');
  if (errors) process.stdout.write(`\n${errors} structural error(s) — the numbers above are not trustworthy.\n`);
}
process.exit(errors ? 1 : 0);
