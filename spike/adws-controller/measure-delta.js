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
const crypto = require('crypto');

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
// below conservative in ONE respect only — see the projection caveat where it is printed.
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
//
// This compared `controller_bytes` until CodeRabbit and an independent audit both found the
// hole within a day: `action: 'finalize'` -> `action: 'terminal'` is the same LENGTH, so the
// size matched, the check passed, and a stale 8,738 was reported for a controller that no
// longer produced it. Reproduced before fixing. File size is a PROXY for file content — the
// error finding 23 names, committed in the commit that named it (finding 27). A digest is
// the property; an absent digest is stale, not fresh.
const controllerSha = crypto.createHash('sha256').update(fs.readFileSync(CONTROLLER)).digest('hex');
let handshakeStale = false;
if (handshake && handshake.controller_sha256 !== controllerSha) {
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

// Size of the full controller, PROJECTED. The nine absent families wholly own
// `absentProseLines` of C-classified prose; the rest of C is what the 1,526 lines already
// cover. Applying that realized code-per-prose-line ratio to all of C extrapolates the
// finished controller.
//
// This was called a FLOOR until an audit rejected the label, correctly. Two things push it
// DOWN (shared blocks are credited to the implemented side; the absent set holds the two
// most branching families, ship modes and resume) and one pushes it UP (fixed plumbing —
// io helpers, CLI, the argument parser — is already paid for and does not recur per family).
// Which dominates is unknown, and linearity across families of very different shape is an
// assumption, not a result. It is a projection with a stated method, nothing stronger.
const implementedProse = Cfull.lines - absentProseLines;
const ratio = Y.lines / implementedProse;
const yFullFloor = Math.round(ratio * Cfull.lines);
say('');
say(`  C prose wholly owned by the nine absent families   ${String(absentProseLines).padStart(5)} lines`);
say(`  C prose the 1,526 lines already cover              ${String(implementedProse).padStart(5)} lines   ${ratio.toFixed(2)} code lines per prose line`);
say(`  LINEAR PROJECTION, finished controller             ${String(yFullFloor).padStart(5)} lines   assumes per-family cost scales`);
say(`                                                             with prose; NOT a floor`);

say('\nZ — the thin interface\n');
say(`  thin-skill-sketch.md          ${String(Z.lines).padStart(5)} lines  (${Z.nonblank} non-blank, ${Z.bytes} bytes)`);
say(`  §8's sketch of this document      5 lines  — the estimate this measurement replaces`);

say('\nTHE MEASUREMENT THAT DECIDES — orchestrator instruction bytes per run\n');
say('  Controller code is EXECUTED, not read: adws-run.js never enters the model\'s context.');
say('  Prose is loaded and interpreted every run. So the two sides of Q5 are not commensurable');
say('  as line counts, and this is the comparison that bears on §9\'s kill criterion.\n');
// "Would the orchestrator really read all five?" is the obvious objection to the before
// figure, and it is answerable rather than arguable: count the times SKILL.md explicitly
// directs the reader into each one. The floor row below is the answer for a skeptic who
// rejects the count entirely.
const skillText = fs.readFileSync(path.join(REPO, 'adws-pipeline/SKILL.md'), 'utf8');
const directives = BEFORE_SET.filter((f) => f !== 'adws-pipeline/SKILL.md')
  .map((f) => [path.basename(f), (skillText.match(new RegExp(path.basename(f).replace('.', '\\.'), 'g')) || []).length]);
say(`  SKILL.md directs the orchestrator into these by name: ${directives.map(([n, c]) => `${n} x${c}`).join(', ')}`);
// TWO SCENARIOS, both reported with the handshake included, because neither is observed.
// Nobody has instrumented a real run's context, so the honest output is the bracket: the
// full-document case (every reference read once) and the no-reference case (SKILL.md only).
// The first cut published the optimistic scenario's headroom beside the conservative
// scenario's reduction, which flattered both — an independent audit caught it.
const hs = handshake ? handshake.total_bytes : 0;
const scen = [
  ['full-document  (each reference read once)', beforeBytes, afterBytes],
  ['no-reference   (SKILL.md only, ever)', floorBefore, floorAfter],
];
say(`  ${''.padEnd(44)}${'before'.padStart(9)}${'after'.padStart(9)}${'+hs'.padStart(9)}${'of before'.padStart(11)}${'headroom'.padStart(10)}`);
for (const [label, b, a] of scen) {
  const net = a + hs;
  const head = hs ? `${((b - a) / hs).toFixed(2)}x` : 'n/a';
  say(`  ${label.padEnd(44)}${String(b).padStart(9)}${String(a).padStart(9)}${String(net).padStart(9)}${pct(net, b).padStart(11)}${head.padStart(10)}`);
}
say('  A reduction on BOTH readings; the true per-run context is somewhere between them and');
say('  was NOT observed. "of before" includes the measured handshake. "headroom" is how many');
say('  times larger the handshake would have to be to erase that scenario\'s reduction.');
say('  These are BYTES. No tokenizer was run, and JSON and English prose do not share a');
say('  bytes-per-token ratio, so they must not be read as token ratios.');
if (handshake) {
  say(`\n  handshake, one complete seven-phase run                 ${String(handshake.total_bytes).padStart(7)} bytes`);
  say(`    ${handshake.messages} controller messages, MEASURED. ${handshake.model_turns} model turns, INFERRED —`);
  say('    step 4 drove the run from a shell over canned phase outputs, so no model was in the');
  say('    loop; the 2-turns-per-phase accounting is carried from step 3\'s live plan dispatch.');
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
const agentLines = sumClass('A', FULL_SCOPE).lines;
const residue = sumClass('K', FULL_SCOPE).lines + Sfull.lines;
say(`  the residue the thin interface must carry: K + S = ${residue} lines of prose, absorbed by`);
say(`  a ${Z.lines}-line sketch. That ratio, not the classification, is what a reader should attack:`);
say(`  if the sketch is too thin the residue leaks back and X is wrong.`);
say('');
say(`  LINE ACCOUNTING, without double-counting the residue:`);
say(`    before   ${String(tot4).padStart(5)} lines of orchestrator prose`);
say(`    after    ${String(yFullFloor).padStart(5)} lines of controller (projected) + ${Z.lines} interface = ${yFullFloor + Z.lines}`);
say(`             plus ${agentLines} agent-facing lines that relocate into .claude/agents/*.md`);
say(`    net      ${String(yFullFloor + Z.lines - tot4).padStart(5)} lines, an INCREASE (${agentLines + yFullFloor + Z.lines - tot4} counting the relocated agent lines)`);
say(`  The ${residue} kept lines are INSIDE the ${Z.lines}, not additional to it — an earlier draft added`);
say(`  both and overstated the increase by ${residue} lines.`);
const breakeven = beforeBytes - afterBytes;
say('');
say(`  §9's kill criterion as arithmetic: the handshake erases the reduction at ${breakeven} bytes`);
say(`  per run on the full-document reading and ${floorBefore - floorAfter} on the no-reference one. Measured:`);
if (handshake) {
  say(`  ${handshake.total_bytes} bytes per run — ${(breakeven / handshake.total_bytes).toFixed(2)}x and ${((floorBefore - floorAfter) / handshake.total_bytes).toFixed(2)}x headroom respectively. The pessimistic`);
  say(`  end of that bracket is thin enough that the unmeasured reasoning half (finding 25)`);
  say(`  bounds the result rather than merely qualifying it.`);
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
  y_full_projection_linear: yFullFloor,
  absent_family_prose_lines: absentProseLines,
  z_lines: Z.lines,
  breakeven_handshake_bytes_per_run: breakeven,
  breakeven_handshake_bytes_per_run_conservative: floorBefore - floorAfter,
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
