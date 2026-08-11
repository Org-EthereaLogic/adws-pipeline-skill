#!/usr/bin/env node
/*
 * run-ingest-matrix.js — SPIKE fixture-ingest matrix. THROWAWAY.
 *
 * REPLACES run-fixture-matrix.js, which the second adversarial review correctly called
 * weak: it compared `adws-run.js audit` against the scorer CLI, but BOTH read the same
 * buildReport(), so their agreement was tautological; it never drove a fixture through
 * `record`; and it asserted only the decision FAMILY encoded in the fixture's NAME, not the
 * official expectations.
 *
 * This drives each fixture's evidence through the controller — init -> next/record x N ->
 * finalize — and asserts the OFFICIAL expectations from
 * parity/execution-report-fixtures/run-tests.js (decision, warn_flag, exit_code, expectGate),
 * READ OUT OF THAT FILE rather than restated here, so the two cannot drift.
 *
 * Modes, because a sequencing controller cannot produce every shape a fixture encodes — and
 * that is a finding, not a gap to paper over:
 *   DRIVEN   all seven phases recorded `pass`; finalize ran. Compared to the expectation.
 *   HALTED   a phase gate failed mid-run; the controller stopped and never claimed
 *            completion. Compared for agreement in DIRECTION (both non-promote) and, where
 *            the official case names one gate, that the controller halted on that gate.
 *   REFUSED  the replay cannot continue. Three causes, all reported: a phase with no
 *            attempt; the controller opened an attempt the recorded run never took (a rewind
 *            or retry this fixture has no evidence for); or the fixture's defect lives in a
 *            recorded `gate_result` the raw evidence does not support — a field the
 *            controller DERIVES rather than ingests.
 *
 * Global invariants — the counterexample class, generalised:
 *   I1  No fixture the harness says is NOT a promote may come out of the controller as one.
 *   I2  Every official PROMOTE must reproduce exactly (decision + warn_flag + exit_code) or
 *       be REFUSED for a DECLARED limit. A silent downgrade fails; a declared one is
 *       counted coverage.
 *
 * MOCK-EFFECT ACCOUNTING. FR-12 keys the document/ship/verify tiers to the risk
 * `review-risk-assess` recomputes, and the controller refuses to substitute contract risk,
 * so a fixture that records no such trace has to be given one (mk-risk-trace.js, running the
 * REAL validator). Adding evidence can move the scorer's own verdict. Rather than assert
 * around that, this MEASURES it: the fixture is scored as committed and again with the
 * injection, both on copies. If the two differ, the row's expectation is ADJUSTED to the
 * measured one and both numbers are printed. Where the base copy disagrees with the official
 * expectation at all, that is a COPY-FIDELITY defect in this driver and is failed as one.
 *
 * Everything runs on throwaway copies under a temp dir; the committed fixtures are read-only.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const CTRL = path.join(REPO, 'spike/adws-controller/adws-run.js');
const VERIFY = path.join(REPO, 'spike/adws-controller/verify-canonical.js');
const MKTRACE = path.join(REPO, 'spike/adws-controller/mk-risk-trace.js');
const SCORER = path.join(REPO, 'adws-pipeline/scripts/execution-report.js');
const FIXROOT = path.join(REPO, 'parity/execution-report-fixtures');
const PHASES = ['plan', 'build', 'test', 'review', 'document', 'ship', 'verify'];
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_e) { return null; } }
function parseJson(s) { try { return JSON.parse(String(s).trim()); } catch (_e) { return null; } }
function run(cmd, args, opts) { return spawnSync(cmd, args, { encoding: 'utf8', ...opts }); }
function listAttempts(dir) {
  try { return fs.readdirSync(dir).filter((e) => /^attempt_\d+$/.test(e)).sort(); } catch (_e) { return []; }
}
function copyTree(src, dst) { fs.mkdirSync(dst, { recursive: true }); run('cp', ['-R', `${src}/.`, dst]); }

// --- the official expectations, read from the official harness -----------------
// run-tests.js has no require.main guard: requiring it would RUN the whole suite and chmod
// the committed fixtures. So the CASES literal is extracted textually and evaluated — not
// restated, so a fixture added, renamed, or re-expected upstream shows up here next run.
function officialCases() {
  const src = fs.readFileSync(path.join(FIXROOT, 'run-tests.js'), 'utf8');
  const open = src.indexOf('[', src.indexOf('const CASES = ['));
  if (open < 0) throw new Error('could not find `const CASES = [` in run-tests.js');
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '[') depth += 1;
    else if (src[i] === ']') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('unterminated CASES array in run-tests.js');
  // eslint-disable-next-line no-new-func
  return new Function(`return ${src.slice(open, end + 1)}`)();
}

// --- ingestibility --------------------------------------------------------------
// STEP 2 removed BOTH pre-emptive refusals. The multi-attempt one is obsolete (retries and
// rewinds are implemented). The other two were PREDICTIONS — "a phase has no attempt" and
// "attempt_1 records a non-pass gate_result" — and between them they refused `retry` and
// `promote_retry_recovered` sight-unseen, whose recorded ladders the controller can replay
// exactly. Everything is now discovered by DRIVING (see driveFixture):
//   - the controller asks for an attempt the fixture does not record -> stop, and say which;
//   - the controller derives `pass` where the fixture recorded a non-pass -> stop, because
//     that defect lives in a field the controller computes and continuing is the I1 exposure.
// Both stop before finalize, so a refused row can never reach a promote.

// Score a throwaway copy of the fixture with the scorer CLI, optionally after the driver's
// own injection, with the fixture's declared runtime chmod applied to the copy.
function scoreCopy(jobDir, dst, testCase, inject) {
  copyTree(jobDir, dst);
  if (inject) inject(dst);
  const restore = [];
  for (const [rel, mode] of Object.entries(testCase.chmod || {})) {
    const t = path.join(dst, rel);
    if (!fs.existsSync(t)) continue;
    restore.push([t, fs.statSync(t).mode & 0o777]);
    fs.chmodSync(t, mode);
  }
  let res;
  try { res = run('node', [SCORER, dst]); } finally {
    for (const [t, m] of restore) { try { fs.chmodSync(t, m); } catch (_e) { /* best effort */ } }
  }
  const report = readJsonSafe(path.join(dst, 'execution_report.json'));
  return {
    decision: report ? report.decision : (res.status === 3 ? 'THREW' : null),
    warn_flag: report ? report.warn_flag : null,
    exit_code: res.status,
  };
}

// --- driving --------------------------------------------------------------------
// STEP 2: the loop is driven by `next`, not by a fixed walk over the seven phases. A retry
// or a rewind means the controller decides which phase and which attempt comes next, and the
// driver's job is to hand it the recorded evidence for exactly that attempt — or to stop and
// say the fixture has none.
const DRIVE_GUARD = 40; // more steps than any fixture's attempts can justify

function driveFixture(testCase, jobDir, tmp, mkReviewSrc) {
  const init = run('node', [CTRL, 'init', path.join(jobDir, 'task_contract_snapshot.json'), path.join(tmp, 'artifacts')]);
  const initJson = parseJson(init.stdout);
  if (!initJson) return { error: `init failed: ${init.stderr || init.stdout}` };
  const ingested = initJson.job_dir;

  let halt = null, derivedMismatch = null, missingAttempt = null, lastFail = null, steps = 0;
  const stricter = [];
  const tierDiff = [];
  const consumed = {};
  for (;;) {
    if (++steps > DRIVE_GUARD) return { ingested, error: `drive guard: more than ${DRIVE_GUARD} next/record steps` };
    const nx = parseJson(run('node', [CTRL, 'next', ingested]).stdout);
    if (!nx) return { ingested, error: 'next produced unparseable output' };
    if (nx.action === 'finalize') break;
    if (nx.action !== 'dispatch') { halt = { phase: nx.phase, attempt: nx.attempt, action: nx.action, reason: lastFail ? lastFail.reason : nx.note }; break; }

    const { phase, attempt } = nx;
    const recorded = listAttempts(path.join(jobDir, phase));
    if (!recorded.includes(`attempt_${attempt}`)) {
      // The controller opened an attempt the recorded run never took — a rewind or a retry
      // this fixture has no evidence for. Not a mismatch: a declared boundary of the replay.
      missingAttempt = `the controller asked for ${phase}/attempt_${attempt}; the fixture records ${recorded.length} ${phase} attempt(s)`;
      break;
    }
    const src = phase === 'review' ? mkReviewSrc(attempt) : path.join(jobDir, phase, `attempt_${attempt}`);
    if (!src) { missingAttempt = `review/attempt_${attempt} cannot be given an FR-12 risk trace`; break; }
    const fixtureManifest = readJsonSafe(path.join(jobDir, phase, `attempt_${attempt}`, 'phase_manifest.json')) || {};
    const args = [CTRL, 'record', ingested, phase, String(attempt), '--from', src];
    // Replay the recorded run's OWN timings where it recorded them: this is replaying
    // evidence, not dispatching, so a live clock here would be the fabricated duration the
    // provenance rule exists to prevent. Fixtures without usable stamps fall back to the
    // controller's live-clock default.
    const s = fixtureManifest.started_at, c = fixtureManifest.completed_at;
    if (UTC.test(s || '') && UTC.test(c || '') && Date.parse(c) > Date.parse(s)) args.push('--started-at', s, '--completed-at', c);
    const res = run('node', args);
    if (res.status !== 0) return { ingested, error: `record ${phase}/${attempt} exited ${res.status}: ${(res.stderr || '').trim()}` };
    const out = parseJson(res.stdout);
    if (!out) return { ingested, error: `record ${phase}/${attempt} produced unparseable output: ${(res.stdout || '').slice(0, 160)}` };
    consumed[phase] = (consumed[phase] || 0) + 1;
    if (fixtureManifest.model_tier && out.model_tier && fixtureManifest.model_tier !== out.model_tier) {
      tierDiff.push(`${phase}/attempt_${attempt}: recorded ${fixtureManifest.model_tier}, derived ${out.model_tier}`);
    }
    if (out.gate_result !== 'pass') lastFail = { phase, attempt, reason: out.reason };

    // The measurement that replaced the old prediction. The fixture recorded a gate decision;
    // the controller derived one from the same raw evidence. The two disagreements are NOT
    // the same thing, and treating them alike is what made the first cut of this useless:
    //
    //   recorded non-pass, derived PASS  -> the controller is WEAKER than the record. The
    //     fixture's defect lives in a field the controller computes, so replaying its
    //     evidence cannot reproduce it. Stop before finalize — this is the I1 exposure.
    //   recorded PASS, derived fail      -> the controller is STRICTER than the record: it
    //     caught something that fixture's recorded gate_result waved through. Not a replay
    //     failure. Keep driving (it will halt) and count it.
    if (fixtureManifest.gate_result && fixtureManifest.gate_result !== out.gate_result) {
      if (out.gate_result === 'pass') {
        derivedMismatch = `fixture records ${phase}/attempt_${attempt} gate_result=${fixtureManifest.gate_result}; the controller derives "pass" from the same raw evidence — the defect is in a field the controller computes, not ingests`;
        break;
      }
      stricter.push(`${phase}/attempt_${attempt}: recorded ${fixtureManifest.gate_result}, derived ${out.gate_result}`);
    }
  }
  const unused = PHASES
    .map((p) => ({ p, n: listAttempts(path.join(jobDir, p)).length - (consumed[p] || 0) }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.p}+${x.n}`);
  if (derivedMismatch || missingAttempt) {
    return { ingested, stricter, tierDiff, unrunnable: derivedMismatch || missingAttempt, kind: derivedMismatch ? 'derived-field' : 'route' };
  }

  // Mirror the harness's runtime chmod onto the INGESTED tree. Here it lands AFTER every
  // gate was written — the post-gate-mutation case only finalize can catch (FIX 2).
  const restore = [];
  for (const [rel, mode] of Object.entries(testCase.chmod || {})) {
    const t = path.join(ingested, rel);
    if (!fs.existsSync(t)) continue;
    restore.push([t, fs.statSync(t).mode & 0o777]);
    fs.chmodSync(t, mode);
  }
  let fin;
  try { fin = run('node', [CTRL, 'finalize', ingested, '--report', SCORER]); } finally {
    for (const [t, m] of restore) { try { fs.chmodSync(t, m); } catch (_e) { /* best effort */ } }
  }
  const report = readJsonSafe(path.join(ingested, 'execution_report.json'));
  const runManifest = readJsonSafe(path.join(ingested, 'run_manifest.json'));
  const canon = run('node', [VERIFY, ingested]);
  return {
    ingested, halt, unused, stricter, tierDiff,
    final_status: runManifest && runManifest.final_status,
    decision: report ? report.decision : null,
    warn_flag: report ? report.warn_flag : null,
    exit_code: fin.status,
    gates: report ? report.gates : [],
    canonical: canon.status === 0 ? 'OK' : 'FAIL',
    canonical_detail: canon.status === 0 ? '' : (canon.stdout || '').trim(),
  };
}

// --- matrix ---------------------------------------------------------------------
const CASES = officialCases();
{
  const onDisk = fs.readdirSync(FIXROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const declared = CASES.map((c) => c.name).sort();
  // FAIL, not warn. The extractor counts brackets over raw source, so a `[` added inside a
  // future string or comment in the CASES literal would truncate the parse — and a truncated
  // CASES is a SMALLER matrix that still prints PASS. Cross-checking the extracted names
  // against the fixture dirs in both directions is the control that catches it, and a
  // control nothing acts on is not a control (the same reasoning as M-3a/F-27 in the
  // official harness, which fails on exactly this disagreement).
  if (onDisk.join(',') !== declared.join(',')) {
    console.log('### INGEST MATRIX FAIL — extracted CASES and the fixture dirs on disk disagree.');
    console.log(`  on disk (${onDisk.length}) : ${onDisk.join(', ')}`);
    console.log(`  extracted (${declared.length}): ${declared.join(', ')}`);
    console.log('  Either a fixture changed upstream, or the CASES extraction was truncated by a');
    console.log('  bracket inside a string or comment. Both are reasons to stop, not to warn.');
    process.exit(1);
  }
}

const rows = [];
const limits = [];
const adjustments = [];
const divergent = [];
const strictRows = [];
const tierRows = [];
const severity = [];
let failures = 0;

for (const testCase of CASES) {
  const jobDir = path.join(FIXROOT, testCase.name, 'artifacts', testCase.jobId);
  const officialPromote = testCase.decision === 'PROMOTE';
  const official = `${testCase.decision}/${testCase.exit_code}`;
  const push = (o) => rows.push({ name: testCase.name, official, got: '-', canonical: '-', ...o });

  if (testCase.skipIfRoot && IS_ROOT) { push({ mode: 'SKIP', verdict: 'SKIP', detail: 'root: mode 000 is readable' }); continue; }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
  try {
    // FR-12 risk: use the fixture's own recorded trace when it has one; supply it only when
    // it does not. mk-risk-trace.js refuses to overwrite, so this cannot erase a fixture's
    // defect even if the check below were wrong. STEP 2: a review RETRY means attempt_2 needs
    // one too — `recomputedRisk` reads the LATEST review attempt — so the source is a factory
    // over the attempt number rather than a single directory decided up front.
    const hasRisk = (n) => {
      const t = readJsonSafe(path.join(jobDir, 'review', `attempt_${n}`, 'skills', 'review-risk-assess', 'skill_trace.json'));
      return !!(t && t.output && ['low', 'medium', 'high'].includes(t.output.risk_level));
    };
    const buildOut = path.join(jobDir, 'build', 'attempt_1', 'phase_output.json');
    const injected = listAttempts(path.join(jobDir, 'review')).some((a) => !hasRisk(Number(a.slice('attempt_'.length))));
    if (injected) {
      const probe = path.join(tmp, 'review_probe');
      copyTree(path.join(jobDir, 'review', 'attempt_1'), probe);
      if (run('node', [MKTRACE, buildOut, probe]).status !== 0) {
        const why = 'review-risk-assess cannot assess this build output, so no FR-12 risk is recordable';
        push({ mode: 'REFUSED', verdict: officialPromote ? 'LIMIT' : 'EXPLAINED', detail: why });
        if (officialPromote) limits.push(`${testCase.name}: ${why}`);
        continue;
      }
    }
    const mkReviewSrc = (n) => {
      const dir = path.join(jobDir, 'review', `attempt_${n}`);
      if (hasRisk(n)) return dir;
      const mock = path.join(tmp, `review_mock_${n}`);
      copyTree(dir, mock);
      return run('node', [MKTRACE, buildOut, mock]).status === 0 ? mock : null;
    };

    // Measure what the injection alone does to the scorer's verdict, so the row is compared
    // against an expectation that accounts for it instead of quietly inheriting the blame.
    let expect = { decision: testCase.decision, warn_flag: testCase.warn_flag, exit_code: testCase.exit_code };
    let adjusted = false;
    if (injected) {
      const base = scoreCopy(jobDir, path.join(tmp, 'base'), testCase, null);
      if (base.decision !== testCase.decision || base.exit_code !== testCase.exit_code) {
        failures += 1;
        push({ mode: 'ERROR', verdict: 'MISMATCH', detail: `COPY FIDELITY: a plain copy of the fixture scores ${base.decision}/${base.exit_code}, not ${official}` });
        continue;
      }
      const withMock = scoreCopy(jobDir, path.join(tmp, 'inj'), testCase, (dst) => {
        run('node', [MKTRACE, path.join(dst, 'build', 'attempt_1', 'phase_output.json'), path.join(dst, 'review', 'attempt_1')]);
      });
      if (withMock.decision !== base.decision || withMock.exit_code !== base.exit_code || withMock.warn_flag !== base.warn_flag) {
        expect = withMock;
        adjusted = true;
        adjustments.push(`${testCase.name}: supplying the missing review-risk-assess trace moves the fixture itself from ${base.decision}/${base.exit_code} to ${withMock.decision}/${withMock.exit_code}`);
      }
    }

    const r = driveFixture(testCase, jobDir, tmp, mkReviewSrc);
    if (r.error) { failures += 1; push({ mode: 'ERROR', verdict: 'MISMATCH', detail: r.error }); continue; }
    if (r.tierDiff && r.tierDiff.length) tierRows.push(`${testCase.name}: ${r.tierDiff.join('; ')}`);
    if (r.stricter && r.stricter.length) strictRows.push(`${testCase.name}: ${r.stricter.join('; ')}`);
    if (r.unrunnable) {
      // Discovered by driving, not predicted: the fixture's evidence stops being replayable
      // partway. The drive halted before finalize, so this row cannot reach a promote.
      push({ mode: 'REFUSED', verdict: officialPromote ? 'LIMIT' : 'EXPLAINED', detail: r.unrunnable });
      if (officialPromote) limits.push(`${testCase.name}: ${r.unrunnable}`);
      continue;
    }

    const got = `${r.decision}/${r.exit_code}`;
    const mode = r.halt ? 'HALTED' : 'DRIVEN';
    const expectPromote = expect.decision === 'PROMOTE';
    let verdict = null, detail = adjusted ? `expectation ADJUSTED to ${expect.decision}/${expect.exit_code} for the supplied trace` : '';
    if (r.unused && r.unused.length) {
      // The controller reached the end by a DIFFERENT route than the recorded run took, so
      // some recorded attempts were never asked for. The triple can still reproduce; the run
      // did not. Counted separately so it is never read as a clean replay.
      divergent.push(`${testCase.name}: ${r.unused.join(', ')} recorded attempt(s) unused — the controller took a different route`);
      detail = detail ? `${detail}; route differs (${r.unused.join(', ')} unused)` : `route differs (${r.unused.join(', ')} recorded attempt(s) unused)`;
    }

    if (!r.halt && r.decision === expect.decision && r.warn_flag === expect.warn_flag && r.exit_code === expect.exit_code) {
      verdict = adjusted ? 'ADJUSTED' : (r.unused && r.unused.length ? 'ROUTE-DIFF' : 'MATCH');
      // the official per-gate expectations, on the INGESTED tree. Skipped when the
      // expectation was adjusted: the gate set is no longer the one they describe.
      if (!adjusted) {
        for (const exp of [].concat(testCase.expectGate || [])) {
          const g = r.gates.find((x) => x.gate === exp.key);
          if (!g || g.result !== exp.result) {
            verdict = 'MISMATCH';
            detail = `gate ${exp.key}: expected ${exp.result}, got ${g ? g.result : '<absent>'}`;
            failures += 1;
            break;
          }
        }
      }
      if (verdict !== 'MISMATCH' && r.canonical !== 'OK') {
        verdict = 'MISMATCH';
        detail = `driven tree is not canonical: ${(r.canonical_detail.split('\n')[1] || '').trim()}`;
        failures += 1;
      }
    } else if (r.decision === 'PROMOTE' && !expectPromote) {
      verdict = 'MISMATCH';                       // I1 — the counterexample class
      detail = `INVARIANT I1: controller promoted a tree the scorer's own expectation puts at ${expect.decision}/${expect.exit_code}`;
      failures += 1;
    } else if (expectPromote) {
      verdict = 'MISMATCH';                       // I2 — an undeclared downgrade
      detail = `INVARIANT I2: PROMOTE fixture came out as ${got}${r.halt ? ` (halted at ${r.halt.phase})` : ''}`;
      failures += 1;
    } else {
      // Both non-promote by different routes: the controller stops at the offending phase
      // instead of certifying a completed-but-failing tree. Where the official case names a
      // single evidence gate, the controller must have halted on that same gate.
      verdict = 'EXPLAINED';
      detail = r.halt ? `halted at ${r.halt.phase}` : `finalize retracted to ${r.final_status}`;
      if (r.halt && testCase.exit_code === 2 && r.exit_code === 1) severity.push({ name: testCase.name, gate: String(r.halt.reason || '').split(':')[0], phase: r.halt.phase });
      const named = [].concat(testCase.expectGate || []).map((g) => g.key).filter((k) => k !== 'pipeline_completion' && k !== 'phase_gates');
      if (named.length === 1 && r.halt) {
        const haltedOn = String(r.halt.reason || '').split(':')[0];
        if (haltedOn !== named[0]) {
          verdict = 'MISMATCH';
          detail = `halted on "${haltedOn}" but the official case names gate "${named[0]}"`;
          failures += 1;
        } else { detail += ` on gate ${named[0]}`; }
      }
    }
    push({ mode, verdict, detail, canonical: r.canonical, got });
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('FIXTURE', 38) + pad('MODE', 9) + pad('OFFICIAL', 14) + pad('INGESTED', 14) + pad('CANON', 7) + 'VERDICT');
console.log('-'.repeat(122));
for (const r of rows) {
  console.log(pad(r.name, 38) + pad(r.mode, 9) + pad(r.official, 14) + pad(r.got, 14) + pad(r.canonical, 7) + r.verdict + (r.detail ? ` — ${r.detail}` : ''));
}
console.log('-'.repeat(122));
const count = (v) => rows.filter((r) => r.verdict === v).length;
console.log(`fixtures: ${rows.length}   MATCH: ${count('MATCH')}   ADJUSTED: ${count('ADJUSTED')}   ROUTE-DIFF: ${count('ROUTE-DIFF')}   EXPLAINED: ${count('EXPLAINED')}   LIMIT: ${count('LIMIT')}   MISMATCH: ${count('MISMATCH')}   SKIP: ${count('SKIP')}`);
console.log(`modes: ${['DRIVEN', 'HALTED', 'REFUSED', 'ERROR', 'SKIP'].map((m) => `${m}=${rows.filter((r) => r.mode === m).length}`).join('  ')}`);
if (limits.length) {
  console.log('\nDECLARED step-1 limits (I2 — counted, never silent):');
  for (const n of limits) console.log(`  - ${n}`);
}
if (tierRows.length) {
  console.log('\nTIER vs THE RECORD (FR-12 table + escalation ladder, checked against recorded manifests):');
  for (const n of tierRows) console.log(`  - ${n}`);
} else {
  console.log('\nTIER vs THE RECORD: every attempt the controller recorded selected the tier the fixture recorded.');
}
if (strictRows.length) {
  console.log('\nSTRICTER THAN THE RECORD (the controller failed a gate the fixture recorded as pass):');
  for (const n of strictRows) console.log(`  - ${n}`);
}
if (divergent.length) {
  console.log('\nROUTE DIVERGENCE (the triple reproduced; the RUN did not):');
  for (const n of divergent) console.log(`  - ${n}`);
}
if (adjustments.length) {
  console.log('\nMOCK EFFECTS (measured, not assumed):');
  for (const n of adjustments) console.log(`  - ${n}`);
}
if (severity.length) {
  // NOT a matrix failure, and NOT nothing. A HALTED job legitimately scores RETRY: the
  // `retry` fixture is itself a Critic-fail halt (final_status failed, TEST_GATE_FAILURE)
  // that the official harness expects at RETRY/exit 1, so stopping at the offending gate is
  // the documented shape and the fixtures' QUARANTINE expectations describe a DIFFERENT
  // tree — one that claimed `completed` anyway.
  // The open question is narrower: finalize writes a blanket PHASE_GATE_FAILURE for every
  // halt, and the scorer's own vocabulary has non-retriable classes (NO_RETRY_REASONS
  // includes ADVOCATE_DISSENT; QUARANTINE_REASONS includes MISSING_UPSTREAM_ARTIFACT, which
  // artifact-layout.md names as the class of a skill_trace/validator disagreement). For
  // those two the flat reason IS a severity downgrade. Fixing it needs a reason
  // classification the CONTROLLER can source from the scorer rather than re-derive by
  // parsing gate detail — the same partial-reimplementation trap that produced the original
  // divergence — so it is recorded here, not patched in.
  console.log('\nSEVERITY QUESTION (open — see FINDINGS.md, not a matrix failure):');
  console.log(`  ${severity.length} halted fixture(s) score RETRY/1 where the completed-tree fixture expects QUARANTINE/2:`);
  for (const s of severity) console.log(`  - ${s.name}: halted at ${s.phase} on ${s.gate}`);
}
if (failures === 0) {
  console.log('\n### INGEST MATRIX PASS — no fixture the harness refuses to promote came out of the controller');
  console.log('### as a promote (I1); every official PROMOTE reproduced exactly or is listed as a declared');
  console.log('### step-1 limit (I2); every driven tree is canonical.');
} else {
  console.log(`\n### INGEST MATRIX FAIL — ${failures} fixture(s) mismatched.`);
}
process.exitCode = failures === 0 ? 0 : 1;
