#!/usr/bin/env node
'use strict';

/**
 * execution-report.js — standalone execution-report generator for the
 * adws-pipeline skill.
 *
 * Ported from ADWS_Pro src/execution-report/ (decide.js, gates.js) against the
 * skill's simplified artifact tree:
 *
 *   artifacts/{jobId}/
 *     task_contract_snapshot.json
 *     run_manifest.json
 *     {phase}/attempt_{n}/phase_manifest.json
 *     {phase}/attempt_{n}/phase_output.json
 *     {phase}/attempt_{n}/consensus/{critic,advocate}.json   (test/review)
 *     {phase}/attempt_{n}/skills/{skill_id}/skill_trace.json
 *
 * Usage:
 *   node execution-report.js <path-to-artifacts/jobId-dir>
 *
 * Writes execution_report.json and execution_report.md into the job dir
 * (derived files — overwrite allowed) and exits with the verdict exit code:
 *   0  PROMOTE (clean)
 *   10 PROMOTE with warn_flag
 *   1  RETRY
 *   2  QUARANTINE
 *   3  CLI / validation error
 *
 * Everything is derived from files in the tree — no other inputs, no network.
 */

const fs = require('fs');
const path = require('path');

// 1.2.0 adds the `phase_gates` gate to the gates array (additive; existing gate
// keys, decision vocabulary, and exit codes are unchanged).
// 1.3.0 (SC-6/F-38) adds the `superseded_consensus` array and lets it drive the
// existing `consensus` gate to WARN, so a dissent an operator conceded and repaired
// can no longer vanish behind a later clean round (additive; no new gate key, no new
// DECISION, no new exit code).
// 1.4.0 (SC-7/F-52) extends that array to the CRITIC: a superseded Critic fail carries
// `critic` and `critic_finding` and warns on the same terms as a superseded dissent.
// F-38 closed the hole for one half of consensus and left the other open — a Critic fail
// is now a rewind origin (F-46), so the clean later round it produces was exactly what
// hid it. Additive: same gate key, same decisions, same exit codes.
const SCHEMA_VERSION = '1.4.0';

// --- Constants ported from ADWS_Pro src/phases.js -------------------------

const PHASE_NAMES = ['plan', 'build', 'test', 'review', 'document', 'ship', 'verify'];

const NO_RETRY_REASONS = new Set([
  'CREDENTIAL_FAILURE',
  'OPERATOR_CANCEL',
  'MISSING_UPSTREAM_ARTIFACT',
  'PLAN_COHERENCE_BELOW_THRESHOLD',
  'ADVOCATE_DISSENT',
]);

const QUARANTINE_REASONS = new Set(['CREDENTIAL_FAILURE', 'MISSING_UPSTREAM_ARTIFACT']);

// --- Constants ported from ADWS_Pro src/execution-report/decide.js --------

const DECISIONS = Object.freeze({
  PROMOTE: 'PROMOTE',
  RETRY: 'RETRY',
  QUARANTINE: 'QUARANTINE',
});

const GATE_STATUSES = Object.freeze({
  PASS: 'pass',
  WARN: 'warn',
  FAIL: 'fail',
  UNVERIFIED: 'unverified',
});

// --- Small utilities -------------------------------------------------------

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return null;
  }
}

function listAttempts(jobDir, phaseName) {
  const dir = path.join(jobDir, phaseName);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return [];
  }
  const attempts = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('attempt_')) {
      const num = parseInt(entry.name.slice('attempt_'.length), 10);
      if (!Number.isNaN(num)) attempts.push(num);
    }
  }
  attempts.sort((a, b) => a - b);
  return attempts;
}

function attemptDir(jobDir, phaseName, attempt) {
  return path.join(jobDir, phaseName, `attempt_${attempt}`);
}

function relPath(jobDir, absPath) {
  return path.relative(jobDir, absPath).split(path.sep).join('/');
}

// --- Evidence collection (adapted from normalize.js for the skill layout) --

function readAttempt(jobDir, phaseName, attempt) {
  const dir = attemptDir(jobDir, phaseName, attempt);
  return {
    phase: phaseName,
    attempt,
    dir,
    rel_dir: relPath(jobDir, dir),
    manifest: safeReadJson(path.join(dir, 'phase_manifest.json')),
    output: safeReadJson(path.join(dir, 'phase_output.json')),
  };
}

function normalizeSkillVerdict(raw) {
  if (typeof raw !== 'string') return 'unverified';
  const v = raw.toLowerCase();
  if (v === 'pass' || v === 'warn' || v === 'fail') return v;
  return 'unverified';
}

// NOTE: callers must pass the LATEST attempt of each phase only (not every
// historical attempt). A failed attempt_1 that was superseded by a passing
// attempt_2 must not permanently fail the terminal gate — the report
// certifies the job's final recorded state, not its full retry history
// (which remains in the evidence tree, and is surfaced separately via
// buildWarnings' "required N attempts" note).
function collectSkillVerdicts(latestAttempts) {
  const rows = [];
  for (const entry of latestAttempts) {
    const skillsDir = path.join(entry.dir, 'skills');
    let skillDirs;
    try {
      skillDirs = fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch (_err) {
      continue;
    }
    skillDirs.sort();
    for (const skillId of skillDirs) {
      const trace = safeReadJson(path.join(skillsDir, skillId, 'skill_trace.json'));
      if (!trace) continue;
      // SC-8/F-55: skill_trace.json WRAPS the validator CLI's stdout — its rubric_result
      // must be exactly what the validator printed, which `output` also carries. A live
      // run wrote "warn" at the wrapper over an `output.rubric_result` of "fail" (with the
      // rationale in `error`) to route around a validator fail it judged a false positive,
      // and nothing in the toolchain could tell that apart from an honest warn. The rule
      // predates this check by five scope changes; a rule nothing asserts is a rule
      // nothing enforces. On disagreement the VALIDATOR's verdict is authoritative — the
      // wrapper is a transcription, never a judgment — and the mismatch is surfaced as a
      // warning. Scoring by stdout means a concealed `fail` still fails skills_clean, so
      // the job QUARANTINEs on the existing path: an evidence-integrity breach, the same
      // class as MISSING_UPSTREAM_ARTIFACT. Absent or unrecognized `output.rubric_result`
      // (older traces, crashed validators) leaves the wrapper untouched.
      const wrapperVerdict = normalizeSkillVerdict(trace.rubric_result);
      const output = trace.output;
      const stdoutRaw =
        output && typeof output === 'object' && !Array.isArray(output) ? output.rubric_result : undefined;
      const stdoutVerdict = normalizeSkillVerdict(stdoutRaw);
      const mismatch = stdoutVerdict !== 'unverified' && stdoutVerdict !== wrapperVerdict;
      rows.push({
        skill_id: typeof trace.skill_id === 'string' ? trace.skill_id : skillId,
        phase: entry.phase,
        attempt: entry.attempt,
        rubric_result: mismatch ? stdoutVerdict : wrapperVerdict,
        error: typeof trace.error === 'string' ? trace.error : null,
        trace_mismatch: mismatch ? { wrapper: wrapperVerdict, validator: stdoutVerdict } : null,
      });
    }
  }
  return rows;
}

// B1 (F-3): the operator-resolution object the orchestrator records post-hoc on a
// dissenting advocate.json. Only a recognized action (override|uphold|repair) counts;
// any other/malformed value is treated as no resolution (the dissent stays blocking).
// SC-6 (F-37) adds `repair`: the operator judged the dissent CORRECT and rewound to
// build to fix the deliverable. Like `uphold` it concedes the dissent, but unlike
// `uphold` it is not terminal — the repaired attempt is superseded by a later one, so
// `repair` is only ever seen on a NON-latest attempt and is scored there (see
// collectSupersededConsensus). A `repair` sitting on the LATEST attempt means the
// rewind never produced a newer round, so it stays blocking exactly like `uphold`.
const RESOLUTION_ACTIONS = new Set(['override', 'uphold', 'repair']);
function normalizeResolution(advocate) {
  const r = advocate && advocate.resolution;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const action = typeof r.action === 'string' ? r.action.toLowerCase() : null;
  if (!RESOLUTION_ACTIONS.has(action)) return null;
  return {
    resolved_by: typeof r.resolved_by === 'string' ? r.resolved_by : null,
    action,
    rationale: typeof r.rationale === 'string' ? r.rationale : null,
    resolved_at: typeof r.resolved_at === 'string' ? r.resolved_at : null,
  };
}

// Same latest-attempt-only contract as collectSkillVerdicts above.
function collectConsensus(latestAttempts) {
  const rows = [];
  for (const entry of latestAttempts) {
    const consensusDir = path.join(entry.dir, 'consensus');
    const critic = safeReadJson(path.join(consensusDir, 'critic.json'));
    const advocate = safeReadJson(path.join(consensusDir, 'advocate.json'));
    if (!critic && !advocate) continue;
    const criticDissent = critic && typeof critic.dissent === 'string' ? critic.dissent : null;
    const advocateDissent = advocate && typeof advocate.dissent === 'string' ? advocate.dissent : null;
    rows.push({
      phase: entry.phase,
      attempt: entry.attempt,
      critic: critic && typeof critic.verdict === 'string' ? critic.verdict : null,
      advocate: advocate && typeof advocate.verdict === 'string' ? advocate.verdict : null,
      dissent: advocateDissent || criticDissent || null,
      resolution: normalizeResolution(advocate),
    });
  }
  return rows;
}

// SC-6 (F-38): the counterpart to the latest-attempt contract above. Gates certify the
// job's FINAL state, so a superseded attempt must never FAIL the terminal verdict — but
// FR-7 also says a dissent is never silent, and before this the two rules together made
// a dissent DISAPPEAR whenever a later attempt cleared it. That is the loudest case
// there is: the operator conceded the dissent and rewound to build to fix the
// deliverable (`resolution.action: "repair"`), the fix worked, and the report then read
// `consensus: pass — "2 round(s) clean"` for a job whose evidence recorded a blocking
// dissent. The weaker resolution (`override` — the dissent was WRONG and nothing
// changed) stayed visible as a WARN the whole time, so the pipeline surfaced the
// resolution that changed nothing and hid the one that changed the shipped artifact.
//
// These rows therefore WARN, never fail: any Advocate dissent recorded anywhere in a
// job's evidence forbids a CLEAN promote. Pass the non-latest attempts only.
//
// SC-7 (F-52): the scan originally read `advocate.json` ONLY, which left the other half
// of consensus in exactly the hole F-38 had just closed for the Advocate. A Critic fail
// is now a rewind origin in its own right (F-46: reproduce the finding, rewind to build,
// re-run forward), so the clean later round that F-46 produces is precisely what hid it.
// A live run promoted reading `consensus: pass — "2 round(s) clean"` after two
// independent Critics caught two real defects that changed the shipped artifact. Both
// halves are scored here now, on the same terms: WARN, never fail.
function collectSupersededConsensus(supersededAttempts) {
  const rows = [];
  for (const entry of supersededAttempts) {
    const consensusDir = path.join(entry.dir, 'consensus');
    const advocate = safeReadJson(path.join(consensusDir, 'advocate.json'));
    const critic = safeReadJson(path.join(consensusDir, 'critic.json'));
    const dissent = advocate && typeof advocate.dissent === 'string' && advocate.dissent.trim().length > 0
      ? advocate.dissent
      : null;
    const advocateVerdict = advocate && typeof advocate.verdict === 'string' ? advocate.verdict : null;
    const criticVerdict = critic && typeof critic.verdict === 'string' ? critic.verdict : null;
    const criticFailed = criticVerdict === 'fail';
    if (!dissent && advocateVerdict !== 'fail' && !criticFailed) continue;
    rows.push({
      phase: entry.phase,
      attempt: entry.attempt,
      advocate: advocateVerdict,
      dissent,
      critic: criticVerdict,
      // The Critic writes no `dissent`; its objection lives in `findings`. Carry BOTH
      // shapes: `critic_issue` is the one-phrase claim, for the terse surfaces (gate
      // detail, warning line); `critic_finding` is issue + evidence verbatim, for the
      // Superseded Consensus Rounds section. The Advocate's `dissent` is designed to be
      // quoted whole, but a finding's `evidence` is a CITATION — a live one ran past
      // 2,500 characters — so quoting it into a gate detail makes the gates table
      // unreadable. FR-7 asks that the objection never be silent, not that every surface
      // carry all of it.
      critic_issue: criticFailed ? firstFindingIssue(critic) : null,
      critic_finding: criticFailed ? firstFindingText(critic) : null,
      resolution: normalizeResolution(advocate),
    });
  }
  return rows;
}

// The first finding's `issue` alone, clipped, for the terse surfaces.
const CRITIC_ISSUE_MAX = 160;
function firstFindingIssue(critic) {
  const findings = critic && Array.isArray(critic.findings) ? critic.findings : [];
  for (const f of findings) {
    if (!f || typeof f !== 'object') continue;
    const issue = typeof f.issue === 'string' ? f.issue.trim() : '';
    if (issue) {
      return issue.length > CRITIC_ISSUE_MAX ? `${issue.slice(0, CRITIC_ISSUE_MAX - 1)}…` : issue;
    }
  }
  return null;
}

// A Critic finding is `{ issue, evidence }`. Render it as one short line, tolerating a
// malformed or empty `findings` array (tolerant reader, artifact-layout rule 8).
function firstFindingText(critic) {
  const findings = critic && Array.isArray(critic.findings) ? critic.findings : [];
  for (const f of findings) {
    if (!f || typeof f !== 'object') continue;
    const issue = typeof f.issue === 'string' ? f.issue.trim() : '';
    const evidence = typeof f.evidence === 'string' ? f.evidence.trim() : '';
    if (issue && evidence) return `${issue} (${evidence})`;
    if (issue) return issue;
    if (evidence) return evidence;
  }
  return null;
}

// --- Gates (ported from ADWS_Pro src/execution-report/gates.js) ------------

// A phase counts as having produced an attempt only when its LATEST attempt
// actually WROTE evidence. An `attempt_n` directory on its own is not evidence:
// a dispatch that dies before writing anything leaves exactly that (SKILL.md
// "Transient subagent API errors", F-12), and certifying an empty directory as a
// produced attempt is how a phase that never ran reaches a clean PROMOTE.
function missingPhaseEvidence(phaseData) {
  const missing = [];
  for (const phaseName of PHASE_NAMES) {
    const entry = phaseData[phaseName];
    if (!entry) {
      missing.push(`${phaseName} (no attempt recorded)`);
      continue;
    }
    const absent = [];
    if (!entry.manifest) absent.push('phase_manifest.json');
    if (!entry.output) absent.push('phase_output.json');
    if (absent.length > 0) {
      missing.push(`${phaseName} (attempt_${entry.attempt} wrote no readable ${absent.join(' / ')})`);
    }
  }
  return missing;
}

function evalPipelineCompletion(phaseData, finalStatus) {
  const missing = missingPhaseEvidence(phaseData);
  const base = {
    key: 'pipeline_completion',
    label: 'All seven phases produced an attempt with readable evidence',
    value: `${PHASE_NAMES.length - missing.length}/${PHASE_NAMES.length}`,
    threshold: `${PHASE_NAMES.length}/${PHASE_NAMES.length}`,
  };
  if (missing.length > 0) {
    return { ...base, status: GATE_STATUSES.FAIL, reason: `Missing phase evidence: ${missing.join(', ')}` };
  }
  if (finalStatus !== 'completed') {
    return { ...base, status: GATE_STATUSES.FAIL, reason: 'Job did not reach completed status' };
  }
  return { ...base, status: GATE_STATUSES.PASS, reason: null };
}

// Hard rule 8 / FR-10: the orchestrator's gate decision for each phase is recorded
// in `phase_manifest.gate_result` (references/artifact-layout.md). The terminal
// report must EVALUATE it, not merely render it in the Phases table — otherwise a
// job whose own evidence records a failed (or still-deferred) phase gate promotes
// clean on the strength of `run_manifest.final_status` alone, which is exactly the
// narrative-over-evidence failure the consensus, grader, and drift gates exist to
// prevent. Latest attempt per phase only, same contract as the other gates.
const PHASE_GATES_LABEL = 'Every phase gate decided pass on its latest attempt';
const PHASE_GATE_RESULTS = new Set(['pass', 'fail', 'deferred']);

function evalPhaseGates(phaseSummaries) {
  const rows = phaseSummaries || [];
  const base = { key: 'phase_gates', label: PHASE_GATES_LABEL, threshold: 'all pass' };
  if (rows.length === 0) {
    return { ...base, status: GATE_STATUSES.UNVERIFIED, value: null, reason: 'No phase attempts recorded' };
  }
  const failed = rows.filter((r) => r.last_gate_result === 'fail');
  const deferred = rows.filter((r) => r.last_gate_result === 'deferred');
  const undecided = rows.filter((r) => !PHASE_GATE_RESULTS.has(r.last_gate_result));
  const value = `${rows.length - failed.length - deferred.length - undecided.length}/${rows.length} pass`;

  if (failed.length > 0) {
    const f = failed[0];
    return {
      ...base,
      status: GATE_STATUSES.FAIL,
      value,
      reason: `Phase "${f.phase}" recorded gate_result=fail on its latest attempt${
        f.failure_reason ? ` (${f.failure_reason})` : ''
      } — a job cannot promote past a failed phase gate`,
    };
  }
  // F-5: `deferred` is a ship-only intermediate that the orchestrator closes to
  // `pass` once the operator completes the delegated push. Still deferred at the
  // terminal report means that never happened.
  if (deferred.length > 0) {
    const d = deferred[0];
    return {
      ...base,
      status: GATE_STATUSES.WARN,
      value,
      reason: `Phase "${d.phase}" is still deferred on its latest attempt — a delegated push that was never closed (F-5)`,
    };
  }
  if (undecided.length > 0) {
    const u = undecided[0];
    return {
      ...base,
      status: GATE_STATUSES.UNVERIFIED,
      value,
      reason: `Phase "${u.phase}" has no recorded gate_result — the orchestrator never wrote its gate decision`,
    };
  }
  return { ...base, status: GATE_STATUSES.PASS, value, reason: null };
}

function evalVerifyStructural(phaseData) {
  const verifyEntry = phaseData.verify;
  if (!verifyEntry || !verifyEntry.output || !verifyEntry.output.verify_result) {
    return {
      key: 'verify_structural',
      label: 'Verify-phase structural checks',
      status: GATE_STATUSES.UNVERIFIED,
      value: null,
      threshold: '100%',
      reason: 'No verify-phase output recorded for this run',
    };
  }
  const vr = verifyEntry.output.verify_result;
  const total = typeof vr.total === 'number' ? vr.total : Array.isArray(vr.checks) ? vr.checks.length : 0;
  const passed =
    typeof vr.passed === 'number'
      ? vr.passed
      : Array.isArray(vr.checks)
        ? vr.checks.filter((c) => c.pass).length
        : 0;
  if (total === 0) {
    return {
      key: 'verify_structural',
      label: 'Verify-phase structural checks',
      status: GATE_STATUSES.UNVERIFIED,
      value: '0/0',
      threshold: '100%',
      reason: 'Verify phase recorded no structural checks',
    };
  }
  const status = passed === total ? GATE_STATUSES.PASS : GATE_STATUSES.FAIL;
  return {
    key: 'verify_structural',
    label: 'Verify-phase structural checks',
    status,
    value: `${passed}/${total}`,
    threshold: '100%',
    reason: status === GATE_STATUSES.FAIL ? `${total - passed} structural check(s) failed` : null,
  };
}

// SKILL.md §4 step 3: adws-grader grades the shipped diff per acceptance
// criterion; a grader fail is a drift BLOCK that must never be masked by a
// narrative "completed" status (hard rule 8 — the report decides from
// evidence, not narrative).
function evalGraderVerdict(phaseData) {
  const verifyEntry = phaseData.verify;
  if (!verifyEntry) {
    return {
      key: 'grader_verdict',
      label: 'AC-coverage grader verdict (verify phase)',
      status: GATE_STATUSES.UNVERIFIED,
      value: null,
      threshold: 'pass',
      reason: 'No verify-phase attempt recorded for this run',
    };
  }
  const grader = safeReadJson(path.join(verifyEntry.dir, 'grader', 'grader_verdict.json'));
  const raw = grader && typeof grader.rubric_result === 'string' ? grader.rubric_result.toLowerCase() : null;
  if (raw !== 'pass' && raw !== 'warn' && raw !== 'fail') {
    return {
      key: 'grader_verdict',
      label: 'AC-coverage grader verdict (verify phase)',
      status: GATE_STATUSES.UNVERIFIED,
      value: null,
      threshold: 'pass',
      reason: 'No grader_verdict.json recorded for the latest verify attempt',
    };
  }
  const status = raw === 'pass' ? GATE_STATUSES.PASS : raw === 'warn' ? GATE_STATUSES.WARN : GATE_STATUSES.FAIL;
  return {
    key: 'grader_verdict',
    label: 'AC-coverage grader verdict (verify phase)',
    status,
    value: raw,
    threshold: 'pass',
    reason:
      status === GATE_STATUSES.FAIL
        ? 'Grader verdict recorded fail — AC-coverage drift BLOCK (PR_DRIFT_SENTINEL_BLOCK)'
        : status === GATE_STATUSES.WARN
          ? 'Grader verdict recorded warn'
          : null,
  };
}

// SKILL.md §4 step 3: verify's drift-sentinel result. BLOCK is the same
// drift-BLOCK condition the grader gate above guards — evaluated
// independently since either evidence file can exist without the other.
function evalDriftVerdict(phaseData) {
  const verifyEntry = phaseData.verify;
  if (!verifyEntry || !verifyEntry.output) {
    return {
      key: 'drift_verdict',
      label: 'Verify-phase drift verdict',
      status: GATE_STATUSES.UNVERIFIED,
      value: null,
      threshold: 'PASS',
      reason: 'No verify-phase output recorded for this run',
    };
  }
  const raw =
    typeof verifyEntry.output.drift_verdict === 'string' ? verifyEntry.output.drift_verdict.toUpperCase() : null;
  if (raw !== 'PASS' && raw !== 'WARN' && raw !== 'BLOCK') {
    return {
      key: 'drift_verdict',
      label: 'Verify-phase drift verdict',
      status: GATE_STATUSES.UNVERIFIED,
      value: null,
      threshold: 'PASS',
      reason: 'verify phase_output.json has no recognized drift_verdict',
    };
  }
  const status = raw === 'PASS' ? GATE_STATUSES.PASS : raw === 'WARN' ? GATE_STATUSES.WARN : GATE_STATUSES.FAIL;
  return {
    key: 'drift_verdict',
    label: 'Verify-phase drift verdict',
    status,
    value: raw,
    threshold: 'PASS',
    reason:
      status === GATE_STATUSES.FAIL
        ? 'drift_verdict recorded BLOCK (PR_DRIFT_SENTINEL_BLOCK)'
        : status === GATE_STATUSES.WARN
          ? 'drift_verdict recorded WARN'
          : null,
  };
}

// FR-7 / AC-4.2: the Critic/Advocate consensus recorded at the test and review
// gates must gate the terminal verdict — an Advocate dissent (or Advocate fail,
// which must carry a dissent) BLOCKS promotion, and a Critic fail means the gate
// should never have passed. Deriving this from the consensus evidence (not from
// run_manifest.failure_reason) is what makes hard rule 8 / FR-10 hold: a job whose
// evidence records a dissent must not PROMOTE even if final_status says "completed".
const CONSENSUS_LABEL = 'Critic/Advocate consensus — no blocking dissent, no critic fail';
// B1 (F-3): a dissent the operator resolved as a false positive
// (`resolution.action: "override"`) no longer FAILS this gate, but it can never pass
// SILENTLY — it downgrades to WARN so the terminal verdict is PROMOTE-with-warnings,
// never a clean promote (FR-7 / SC2_PLAN invariant #4). An upheld or unresolved
// dissent, and any Critic fail, still FAIL exactly as before.
function evalConsensus(consensusRows, supersededDissentRows) {
  const rows = consensusRows || [];
  const superseded = supersededDissentRows || [];
  if (rows.length === 0) {
    return {
      key: 'consensus',
      label: CONSENSUS_LABEL,
      status: GATE_STATUSES.UNVERIFIED,
      value: null,
      threshold: '0 blocking dissent, 0 critic fail',
      reason: 'No consensus rounds recorded (the test and review gates require a Critic+Advocate round)',
    };
  }
  const isDissenting = (r) =>
    (typeof r.dissent === 'string' && r.dissent.trim().length > 0) || r.advocate === 'fail';
  const isOverridden = (r) => r.resolution != null && r.resolution.action === 'override';
  const dissenting = rows.filter(isDissenting);
  const blocking = dissenting.filter((r) => !isOverridden(r)); // unresolved or upheld
  const overridden = dissenting.filter(isOverridden);
  const criticFails = rows.filter((r) => r.critic === 'fail');

  // A blocking dissent (unresolved, or explicitly UPHELD by the operator) fails the
  // gate exactly as before B1 — only an `override` resolution clears it.
  if (blocking.length > 0) {
    const d = blocking[0];
    const where = `${d.phase}/attempt_${d.attempt}`;
    const how = d.resolution != null && d.resolution.action === 'uphold' ? 'operator UPHELD the dissent' : 'unresolved';
    const text = d.dissent ? `: ${d.dissent}` : ' (advocate returned fail)';
    return {
      key: 'consensus',
      label: CONSENSUS_LABEL,
      status: GATE_STATUSES.FAIL,
      value: `${blocking.length} blocking dissent(s), ${overridden.length} overridden, ${criticFails.length} critic fail(s)`,
      threshold: '0 blocking dissent, 0 critic fail',
      reason: `Advocate dissent in ${where} (${how}) — blocks promotion (ADVOCATE_DISSENT / AC-4.2)${text}`,
    };
  }

  // A Critic fail always fails the gate — the override path covers Advocate dissents only.
  if (criticFails.length > 0) {
    const c = criticFails[0];
    return {
      key: 'consensus',
      label: CONSENSUS_LABEL,
      status: GATE_STATUSES.FAIL,
      value: `${criticFails.length} critic fail(s)`,
      threshold: '0 blocking dissent, 0 critic fail',
      reason: `Critic returned fail in ${c.phase}/attempt_${c.attempt} — consensus gate was not satisfied`,
    };
  }

  // An operator-overridden dissent promotes, but NEVER silently: WARN forces
  // PROMOTE-with-warnings and a permanent warning line in the report.
  if (overridden.length > 0) {
    const d = overridden[0];
    const where = `${d.phase}/attempt_${d.attempt}`;
    const rat = d.resolution && d.resolution.rationale ? ` — ${d.resolution.rationale}` : '';
    return {
      key: 'consensus',
      label: CONSENSUS_LABEL,
      status: GATE_STATUSES.WARN,
      value: `${overridden.length} operator-overridden dissent(s)`,
      threshold: '0 blocking dissent, 0 critic fail',
      reason: `Advocate dissent in ${where} operator-resolved (override) — promotes with a permanent warning${rat}`,
    };
  }

  // SC-6 (F-38): the latest round is clean, but an EARLIER round recorded an objection
  // that a later attempt superseded — most often because the objection was conceded and
  // the job rewound to build to repair the deliverable. The fix worked, so this never
  // fails; it warns, because a job whose evidence records an objection must not read as
  // though none ever happened (FR-7: a resolved dissent is never silent). SC-7 (F-52)
  // scores a superseded Critic fail on exactly the same terms.
  if (superseded.length > 0) {
    const d = superseded[0];
    const where = `${d.phase}/attempt_${d.attempt}`;
    const how = d.resolution ? `operator ${d.resolution.action}` : 'superseded by a later attempt';
    const rat = d.resolution && d.resolution.rationale ? ` — ${d.resolution.rationale}` : '';
    const isDissent = (typeof d.dissent === 'string' && d.dissent.trim().length > 0) || d.advocate === 'fail';
    const what = isDissent ? 'Advocate dissent' : 'Critic fail';
    const detail = !isDissent && d.critic_issue ? `: ${d.critic_issue}` : '';
    return {
      key: 'consensus',
      label: CONSENSUS_LABEL,
      status: GATE_STATUSES.WARN,
      value: `${rows.length} latest round(s) clean, ${superseded.length} superseded objection(s)`,
      threshold: '0 blocking dissent, 0 critic fail',
      reason: `${what} in ${where} (${how}) was superseded by a later clean round — promotes with a permanent warning${rat}${detail}`,
    };
  }

  return {
    key: 'consensus',
    label: CONSENSUS_LABEL,
    status: GATE_STATUSES.PASS,
    value: `${rows.length} round(s) clean`,
    threshold: '0 blocking dissent, 0 critic fail',
    reason: null,
  };
}

function evalSkillsClean(skillVerdicts) {
  const rows = skillVerdicts || [];
  if (rows.length === 0) {
    return {
      key: 'skills_clean',
      label: 'No skill failures or warnings',
      status: GATE_STATUSES.UNVERIFIED,
      value: null,
      threshold: '0 fail, 0 warn',
      reason: 'No skill outcomes recorded in any phase',
    };
  }
  const failures = rows.filter((r) => r.rubric_result === 'fail').length;
  const warnings = rows.filter((r) => r.rubric_result === 'warn').length;
  const unverified = rows.filter((r) => r.rubric_result === 'unverified').length;
  const passes = rows.length - failures - warnings - unverified;
  // SC-8/F-58: the MISMATCH is the breach, independently of which way it points. Scoring
  // the row from the validator's stdout is necessary but not sufficient — when the
  // concealed verdict is the milder one (wrapper "warn" over an output of "pass"), the
  // substituted row is clean and the gate would pass, promoting a job whose evidence is
  // known to misreport a verdict. The first cut shipped exactly that hole: it had a
  // regression fixture for warn-over-fail only, so the one direction it tested was the one
  // where substitution happened to fail the gate on its own. An evidence tree that
  // misstates any verdict is untrustworthy in both directions, so the disagreement itself
  // fails the gate and the job QUARANTINEs — which is what SKILL.md hard rule 3 and
  // references/artifact-layout.md have always claimed.
  const mismatches = rows.filter((r) => r.trace_mismatch);
  if (mismatches.length > 0) {
    const detail = mismatches
      .map((r) => `${r.skill_id} in ${r.phase}/attempt_${r.attempt} (trace "${r.trace_mismatch.wrapper}" vs validator "${r.trace_mismatch.validator}")`)
      .join('; ');
    return {
      key: 'skills_clean',
      label: 'No skill failures or warnings',
      status: GATE_STATUSES.FAIL,
      value: `${mismatches.length} evidence-integrity mismatch(es), ${failures} fail, ${warnings} warn`,
      threshold: '0 fail, 0 warn, 0 trace mismatches',
      reason: `${mismatches.length} skill_trace.json verdict(s) disagree with their own validator output — ${detail}`,
    };
  }
  if (failures > 0) {
    return {
      key: 'skills_clean',
      label: 'No skill failures or warnings',
      status: GATE_STATUSES.FAIL,
      value: `${failures} fail, ${warnings} warn`,
      threshold: '0 fail, 0 warn',
      reason: `${failures} skill invocation(s) failed`,
    };
  }
  if (warnings > 0) {
    return {
      key: 'skills_clean',
      label: 'No skill failures or warnings',
      status: GATE_STATUSES.WARN,
      value: `0 fail, ${warnings} warn`,
      threshold: '0 fail, 0 warn',
      reason: `${warnings} skill invocation(s) warned`,
    };
  }
  if (unverified > 0) {
    return {
      key: 'skills_clean',
      label: 'No skill failures or warnings',
      status: GATE_STATUSES.UNVERIFIED,
      value: `${passes} pass, ${unverified} unverified`,
      threshold: '0 fail, 0 warn',
      reason: `${unverified} skill invocation(s) produced no verifiable rubric_result (crashed or malformed trace)`,
    };
  }
  return {
    key: 'skills_clean',
    label: 'No skill failures or warnings',
    status: GATE_STATUSES.PASS,
    value: `${passes} pass`,
    threshold: '0 fail, 0 warn',
    reason: null,
  };
}

// --- Decision (ported verbatim from ADWS_Pro src/execution-report/decide.js)

function hasGateStatus(gates, status) {
  if (!Array.isArray(gates)) return false;
  return gates.some((g) => g && g.status === status);
}

function decideLifecycle({ status, failureReason, gates }) {
  const normalizedStatus = typeof status === 'string' ? status : 'unknown';
  const reason = typeof failureReason === 'string' ? failureReason : null;
  const gateFail = hasGateStatus(gates, GATE_STATUSES.FAIL);
  const gateWarn = hasGateStatus(gates, GATE_STATUSES.WARN);

  if (normalizedStatus === 'completed') {
    if (gateFail) {
      return {
        decision: DECISIONS.QUARANTINE,
        decision_reason:
          'Job reached completed status but at least one gate evaluated to fail; quarantining to preserve evidence.',
        warn_flag: false,
      };
    }
    const hasUnverified = hasGateStatus(gates, GATE_STATUSES.UNVERIFIED);
    if (gateWarn) {
      return {
        decision: DECISIONS.PROMOTE,
        decision_reason:
          'Job completed successfully with gate warnings; promoting with warn flag for operator awareness.',
        warn_flag: true,
      };
    }
    if (hasUnverified) {
      return {
        decision: DECISIONS.PROMOTE,
        decision_reason:
          'Job completed successfully but at least one gate is unverified (missing evidence); promoting with warn flag — per CONSTITUTION/AGENTS governance, unverified evidence must not silently pass as clean.',
        warn_flag: true,
      };
    }
    return {
      decision: DECISIONS.PROMOTE,
      decision_reason: 'Job completed successfully and all evaluated gates passed.',
      warn_flag: false,
    };
  }

  if (normalizedStatus === 'quarantined') {
    const why = reason ? ` (reason: ${reason})` : '';
    return {
      decision: DECISIONS.QUARANTINE,
      decision_reason: `Job was quarantined by the runtime${why}. Human investigation required.`,
      warn_flag: false,
    };
  }

  if (normalizedStatus === 'failed') {
    if (reason && QUARANTINE_REASONS.has(reason)) {
      return {
        decision: DECISIONS.QUARANTINE,
        decision_reason: `Job failed with quarantine-class reason (${reason}); non-retriable.`,
        warn_flag: false,
      };
    }
    if (reason && NO_RETRY_REASONS.has(reason)) {
      return {
        decision: DECISIONS.QUARANTINE,
        decision_reason: `Job failed with non-retriable reason (${reason}); evidence preserved for review.`,
        warn_flag: false,
      };
    }
    return {
      decision: DECISIONS.RETRY,
      decision_reason: reason
        ? `Job failed with retriable reason (${reason}); retry is permitted by policy.`
        : 'Job failed with no specific reason recorded; retry permitted.',
      warn_flag: false,
    };
  }

  if (normalizedStatus === 'canceled') {
    return {
      decision: DECISIONS.QUARANTINE,
      decision_reason: 'Job was canceled before reaching a terminal completion; treated as non-promotable.',
      warn_flag: false,
    };
  }

  return {
    decision: DECISIONS.QUARANTINE,
    decision_reason: `Job is in non-terminal or unknown state "${normalizedStatus}"; conservative default is QUARANTINE.`,
    warn_flag: false,
  };
}

function exitCodeFor(decision, warnFlag) {
  if (decision === DECISIONS.PROMOTE) return warnFlag ? 10 : 0;
  if (decision === DECISIONS.RETRY) return 1;
  return 2; // QUARANTINE
}

// --- Warnings (modeled on normalize.js buildOutstandingIssues) --------------

function buildWarnings({ failureReason, gates, skillVerdicts, phaseSummaries, phaseAttemptRows, consensus, supersededDissents, shipDelegation }) {
  const warnings = [];
  if (failureReason) {
    warnings.push(`Failure reason recorded: ${failureReason}`);
  }
  // B2 (F-5): surface an operator-delegated ship push — completed is a clean promote
  // but never a silent one; not-yet-completed on a terminal report is an inconsistency
  // worth flagging.
  if (shipDelegation && typeof shipDelegation.status === 'string') {
    if (shipDelegation.status === 'completed') {
      warnings.push(
        'Ship push was operator-delegated in a credential-less environment and completed by the operator (F-5)' +
          (shipDelegation.detected_reason ? ` — trigger: ${shipDelegation.detected_reason}` : '') +
          '.'
      );
    } else {
      warnings.push(
        `Ship push is operator-delegated and NOT completed (delegation.status=${shipDelegation.status}) — the recorded PR/branch may not exist yet.`
      );
    }
  }
  for (const gate of gates) {
    if (gate.status === GATE_STATUSES.PASS) continue;
    warnings.push(`Gate "${gate.key}" evaluated to ${gate.status}${gate.reason ? `: ${gate.reason}` : ''}`);
  }
  for (const row of skillVerdicts) {
    // SC-8/F-55: named FIRST and unconditionally — an evidence-integrity breach outranks
    // the verdict it was hiding, and the reader needs to know the row below is scored from
    // the validator's stdout rather than from what the trace claimed.
    if (row.trace_mismatch) {
      warnings.push(
        `EVIDENCE INTEGRITY: skill_trace.json for "${row.skill_id}" in ${row.phase}/attempt_${row.attempt} ` +
          `records rubric_result="${row.trace_mismatch.wrapper}" but its own output.rubric_result is ` +
          `"${row.trace_mismatch.validator}". The trace must transcribe the validator's stdout verbatim ` +
          `(references/artifact-layout.md); the validator's verdict is authoritative and is what this report scored.`
      );
    }
    if (row.rubric_result === 'fail') {
      warnings.push(
        `Skill "${row.skill_id}" failed in ${row.phase}/attempt_${row.attempt}${row.error ? ` — ${row.error}` : ''}`
      );
    } else if (row.rubric_result === 'warn') {
      warnings.push(
        `Skill "${row.skill_id}" warned in ${row.phase}/attempt_${row.attempt}${row.error ? ` — ${row.error}` : ''}`
      );
    }
  }
  // B3 (F-8): the old "required N attempts before producing output" wording was wrong
  // when an early attempt DID produce output but its gate failed. Report gate outcomes
  // instead: which attempt passed and why the earlier ones gate-failed. A single
  // deferred-then-pass attempt (B2 delegated push) is one attempt_dir, so it never
  // trips this warning.
  const attemptsByPhase = {};
  for (const r of phaseAttemptRows || []) {
    (attemptsByPhase[r.phase] = attemptsByPhase[r.phase] || []).push(r);
  }
  for (const ps of phaseSummaries) {
    if (ps.attempts <= 1) continue;
    const rows = (attemptsByPhase[ps.phase] || []).slice().sort((a, b) => a.attempt - b.attempt);
    const latest = rows.length ? rows[rows.length - 1] : null;
    const n = latest ? latest.attempt : ps.attempts;
    const priors = rows.slice(0, -1);
    // SC-6 (F-40): a prior attempt is not necessarily a FAILED attempt. A rewind can
    // supersede an attempt that passed its own gate — the operator-directed repair
    // (F-37) re-runs build/test forward from a review-gate dissent, so build and test
    // attempt_1 can both read `gate_result: pass` while being superseded. The old
    // wording rendered that as "attempt(s) 1..1 gate-failed — attempt 1: pass", which
    // contradicts itself in a single line. Label each prior by what actually happened,
    // and only claim "gate-failed" in the lead when every prior did fail (which keeps
    // the B3/F-8 regression string byte-identical for the ordinary retry case).
    const anySuperseded = priors.some((r) => r.gate_result === 'pass');
    const reasons = priors
      .map((r) =>
        r.gate_result === 'pass'
          ? `attempt ${r.attempt}: superseded (gate_result=pass)`
          : `attempt ${r.attempt}: ${r.failure_reason || r.gate_result || 'gate-failed'}`
      )
      .join('; ');
    const lead = anySuperseded ? 'superseded or gate-failed' : 'gate-failed';
    if (latest && latest.gate_result === 'pass') {
      warnings.push(
        `Phase "${ps.phase}" passed on attempt ${n}` +
          (reasons ? ` (attempt(s) 1..${n - 1} ${lead} — ${reasons})` : '') +
          '.'
      );
    } else {
      const state = latest && latest.gate_result ? latest.gate_result : 'unset';
      warnings.push(
        `Phase "${ps.phase}" recorded ${ps.attempts} attempts; latest attempt ${n} gate_result=${state}` +
          (reasons ? ` (earlier — ${reasons})` : '') +
          '.'
      );
    }
  }
  for (const c of consensus) {
    if (c.dissent) {
      const res = c.resolution
        ? ` [operator ${c.resolution.action}${c.resolution.rationale ? `: ${c.resolution.rationale}` : ''}]`
        : '';
      warnings.push(`Consensus dissent in ${c.phase}/attempt_${c.attempt}: ${c.dissent}${res}`);
    }
  }
  // SC-6 (F-38): the same line for an objection a later attempt superseded. It carries
  // the dissent text VERBATIM exactly as the latest-attempt case does — FR-7's record
  // requirement is about the dissent, not about which attempt it landed on. SC-7 (F-52)
  // adds the Critic's side, quoting its first finding for the same reason.
  for (const s of supersededDissents || []) {
    const res = s.resolution
      ? ` [operator ${s.resolution.action}${s.resolution.rationale ? `: ${s.resolution.rationale}` : ''}]`
      : ' [superseded by a later attempt]';
    const hasDissent = (typeof s.dissent === 'string' && s.dissent.trim().length > 0) || s.advocate === 'fail';
    if (hasDissent) {
      warnings.push(
        `Consensus dissent in ${s.phase}/attempt_${s.attempt} (superseded): ${s.dissent || '(advocate returned fail)'}${res}`
      );
    }
    if (s.critic === 'fail') {
      warnings.push(
        `Critic fail in ${s.phase}/attempt_${s.attempt} (superseded): ${s.critic_issue || '(critic returned fail with no findings recorded)'}${res}`
      );
    }
  }
  warnings.sort();
  return Array.from(new Set(warnings));
}

// --- Markdown rendering -----------------------------------------------------

function mdEscapeCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown(report, phaseAttemptRows) {
  const lines = [];
  const flag =
    report.decision === DECISIONS.PROMOTE && report.warn_flag ? ' (WITH WARNINGS)' : '';
  lines.push(`# Execution Report — ${report.job_id}`);
  lines.push('');
  lines.push(`## Verdict: ${report.decision}${flag}`);
  lines.push('');
  lines.push(`> ${report.decision_reason}`);
  lines.push('');
  lines.push(`- **Decision:** ${report.decision}`);
  lines.push(`- **Warn flag:** ${report.warn_flag}`);
  lines.push(`- **Exit code:** ${report.exit_code}`);
  lines.push(`- **Final status:** ${report.final_status}`);
  lines.push(`- **Failure reason:** ${report.failure_reason || '—'}`);
  lines.push(`- **Task:** ${report.task_id}`);
  lines.push(`- **Schema version:** ${report.schema_version}`);
  lines.push(`- **Generated at:** ${report.generated_at}`);
  lines.push(`- **Evidence root:** ${report.evidence_root}`);
  lines.push('');

  lines.push('## Gates');
  lines.push('');
  lines.push('| Gate | Result | Detail |');
  lines.push('| --- | --- | --- |');
  for (const gate of report.gates) {
    lines.push(`| ${gate.gate} | ${gate.result} | ${mdEscapeCell(gate.detail)} |`);
  }
  lines.push('');

  lines.push('## Phases');
  lines.push('');
  if (phaseAttemptRows.length === 0) {
    lines.push('_No phase attempts recorded._');
  } else {
    lines.push('| Phase | Attempt | Gate result | Failure reason | Model tier | Evidence path |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const row of phaseAttemptRows) {
      lines.push(
        `| ${row.phase} | ${row.attempt} | ${mdEscapeCell(row.gate_result)} | ${mdEscapeCell(
          row.failure_reason
        )} | ${mdEscapeCell(row.model_tier)} | \`${row.rel_dir}/\` |`
      );
    }
  }
  lines.push('');

  lines.push('## Skill Verdicts');
  lines.push('');
  if (report.skill_verdicts.length === 0) {
    lines.push('_No skill outcomes recorded in any phase._');
  } else {
    lines.push('| Skill | Phase | Attempt | Rubric result |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of report.skill_verdicts) {
      lines.push(`| ${row.skill_id} | ${row.phase} | ${row.attempt} | ${row.rubric_result} |`);
    }
  }
  lines.push('');

  lines.push('## Consensus');
  lines.push('');
  if (report.consensus.length === 0) {
    lines.push('_No consensus rounds recorded._');
  } else {
    lines.push('| Phase | Attempt | Critic | Advocate | Dissent | Resolution |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const row of report.consensus) {
      lines.push(
        `| ${row.phase} | ${row.attempt} | ${mdEscapeCell(row.critic)} | ${mdEscapeCell(
          row.advocate
        )} | ${row.dissent ? 'yes' : '—'} | ${mdEscapeCell(row.resolution ? row.resolution.action : null)} |`
      );
    }
    for (const row of report.consensus) {
      if (row.dissent) {
        lines.push('');
        const res = row.resolution
          ? ` — operator ${row.resolution.action}${row.resolution.resolved_at ? ` (${row.resolution.resolved_at})` : ''}`
          : '';
        lines.push(`Dissent recorded in ${row.phase}/attempt_${row.attempt}${res}:`);
        lines.push('');
        lines.push(`> ${row.dissent}`);
        if (row.resolution && row.resolution.rationale) {
          lines.push('');
          lines.push(`Resolution rationale: ${mdEscapeCell(row.resolution.rationale)}`);
        }
      }
    }
  }
  lines.push('');

  // SC-6 (F-38): objections from superseded attempts get their own section rather than
  // rows in the table above, so the table keeps its latest-attempt-only meaning while
  // the objection text still appears VERBATIM in the report (FR-7). SC-7 (F-52) adds the
  // Critic column and quotes its finding on the same terms.
  const superseded = report.superseded_consensus || [];
  if (superseded.length > 0) {
    lines.push('## Superseded Consensus Rounds');
    lines.push('');
    lines.push(
      '_These rounds did not gate the verdict — a later attempt superseded them — but a recorded dissent or Critic fail is never silent (FR-7)._'
    );
    lines.push('');
    lines.push('| Phase | Attempt | Critic | Advocate | Resolution |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of superseded) {
      lines.push(
        `| ${row.phase} | ${row.attempt} | ${mdEscapeCell(row.critic)} | ${mdEscapeCell(row.advocate)} | ${mdEscapeCell(
          row.resolution ? row.resolution.action : null
        )} |`
      );
    }
    for (const row of superseded) {
      const res = row.resolution
        ? ` — operator ${row.resolution.action}${row.resolution.resolved_at ? ` (${row.resolution.resolved_at})` : ''}`
        : '';
      const hasDissent = (typeof row.dissent === 'string' && row.dissent.trim().length > 0) || row.advocate === 'fail';
      if (hasDissent) {
        lines.push('');
        lines.push(`Dissent recorded in ${row.phase}/attempt_${row.attempt}${res}:`);
        lines.push('');
        lines.push(`> ${row.dissent || '(advocate returned fail with no dissent text)'}`);
      }
      if (row.critic === 'fail') {
        lines.push('');
        lines.push(`Critic fail recorded in ${row.phase}/attempt_${row.attempt}${res}:`);
        lines.push('');
        lines.push(`> ${row.critic_finding || '(critic returned fail with no findings recorded)'}`);
      }
      if (row.resolution && row.resolution.rationale) {
        lines.push('');
        lines.push(`Resolution rationale: ${mdEscapeCell(row.resolution.rationale)}`);
      }
    }
    lines.push('');
  }

  lines.push('## Warnings');
  lines.push('');
  if (report.warnings.length === 0) {
    lines.push('_None._');
  } else {
    for (const w of report.warnings) {
      lines.push(`- ${w}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// --- Report assembly --------------------------------------------------------

function buildReport(jobDir, options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();

  const runManifest = safeReadJson(path.join(jobDir, 'run_manifest.json'));
  if (!runManifest) {
    const err = new Error(`run_manifest.json is missing or unreadable in ${jobDir}`);
    err.code = 'INVALID_JOB_DIR';
    throw err;
  }
  const taskContract = safeReadJson(path.join(jobDir, 'task_contract_snapshot.json'));

  const jobId =
    (typeof runManifest.job_id === 'string' && runManifest.job_id) || path.basename(jobDir);
  const taskId =
    (typeof runManifest.task_id === 'string' && runManifest.task_id) ||
    (taskContract && (taskContract.task_id || taskContract.id)) ||
    'unknown';
  const finalStatus = typeof runManifest.final_status === 'string' ? runManifest.final_status : 'unknown';
  const failureReason = typeof runManifest.failure_reason === 'string' ? runManifest.failure_reason : null;

  // Collect every attempt of every phase (PHASE_NAMES order, attempts ascending).
  const phaseData = {}; // latest attempt per phase, as in normalize.js
  const phaseSummaries = [];
  const phaseAttemptRows = [];
  for (const phaseName of PHASE_NAMES) {
    const attempts = listAttempts(jobDir, phaseName);
    if (attempts.length === 0) continue;
    const entries = attempts.map((n) => readAttempt(jobDir, phaseName, n));
    const latest = entries[entries.length - 1];
    phaseData[phaseName] = latest;
    phaseSummaries.push({
      phase: phaseName,
      attempts: entries.length,
      last_gate_result:
        latest.manifest && typeof latest.manifest.gate_result === 'string'
          ? latest.manifest.gate_result
          : null,
      failure_reason:
        latest.manifest && typeof latest.manifest.failure_reason === 'string'
          ? latest.manifest.failure_reason
          : null,
      model_tier:
        latest.manifest && typeof latest.manifest.model_tier === 'string'
          ? latest.manifest.model_tier
          : null,
    });
    for (const entry of entries) {
      phaseAttemptRows.push({
        phase: phaseName,
        attempt: entry.attempt,
        gate_result:
          entry.manifest && typeof entry.manifest.gate_result === 'string'
            ? entry.manifest.gate_result
            : null,
        failure_reason:
          entry.manifest && typeof entry.manifest.failure_reason === 'string'
            ? entry.manifest.failure_reason
            : null,
        model_tier:
          entry.manifest && typeof entry.manifest.model_tier === 'string'
            ? entry.manifest.model_tier
            : null,
        rel_dir: entry.rel_dir,
      });
    }
  }

  // Gates certify the job's FINAL recorded state: latest attempt per phase
  // only. A superseded failed attempt stays in the evidence tree (and in
  // phaseAttemptRows above) for audit, but must not re-fail a job that a
  // later attempt already fixed.
  const latestAttempts = PHASE_NAMES.filter((p) => phaseData[p]).map((p) => phaseData[p]);
  const skillVerdicts = collectSkillVerdicts(latestAttempts);
  const consensus = collectConsensus(latestAttempts);
  // SC-6 (F-38) / SC-7 (F-52): superseded attempts do not gate the verdict, but an
  // Advocate dissent or a Critic fail recorded in one must still surface — see
  // collectSupersededConsensus.
  const latestDirs = new Set(latestAttempts.map((e) => e.dir));
  const supersededAttempts = [];
  for (const phaseName of PHASE_NAMES) {
    for (const n of listAttempts(jobDir, phaseName)) {
      const entry = readAttempt(jobDir, phaseName, n);
      if (!latestDirs.has(entry.dir)) supersededAttempts.push(entry);
    }
  }
  const supersededDissents = collectSupersededConsensus(supersededAttempts);

  // B2 (F-5): the ship phase's delegated-push sub-state, if any. When a `pr`-mode push
  // fails on missing credentials the attempt records delegation.status; the orchestrator
  // later closes the SAME attempt (post-hoc delegation.status + pr_url). Surfaced as an
  // informational warning — an operator-completed push is a clean promote, but never a
  // silent one.
  const shipEntry = phaseData.ship;
  const shipDelegation =
    shipEntry &&
    shipEntry.output &&
    shipEntry.output.delegation &&
    typeof shipEntry.output.delegation === 'object' &&
    !Array.isArray(shipEntry.output.delegation)
      ? shipEntry.output.delegation
      : null;

  const gates = [
    evalPipelineCompletion(phaseData, finalStatus),
    evalPhaseGates(phaseSummaries),
    evalVerifyStructural(phaseData),
    evalGraderVerdict(phaseData),
    evalDriftVerdict(phaseData),
    evalConsensus(consensus, supersededDissents),
    evalSkillsClean(skillVerdicts),
  ];

  const verdict = decideLifecycle({ status: finalStatus, failureReason, gates });
  const exitCode = exitCodeFor(verdict.decision, verdict.warn_flag);

  const warnings = buildWarnings({
    failureReason,
    gates,
    skillVerdicts,
    phaseSummaries,
    phaseAttemptRows,
    consensus,
    supersededDissents,
    shipDelegation,
  });

  const report = {
    schema_version: SCHEMA_VERSION,
    generated_at: now(),
    job_id: jobId,
    task_id: taskId,
    decision: verdict.decision,
    decision_reason: verdict.decision_reason,
    warn_flag: verdict.warn_flag,
    exit_code: exitCode,
    final_status: finalStatus,
    failure_reason: failureReason,
    gates: gates.map((g) => ({
      gate: g.key,
      result: g.status,
      detail: [g.value, g.reason].filter(Boolean).join(' — ') || null,
    })),
    phases: phaseSummaries,
    skill_verdicts: skillVerdicts.map((r) => ({
      skill_id: r.skill_id,
      phase: r.phase,
      attempt: r.attempt,
      rubric_result: r.rubric_result,
    })),
    consensus,
    superseded_consensus: supersededDissents,
    warnings,
    evidence_root: jobDir,
  };

  const markdown = renderMarkdown(report, phaseAttemptRows);
  return { report, markdown };
}

function generateExecutionReport(jobDir, options = {}) {
  const { report, markdown } = buildReport(jobDir, options);
  fs.writeFileSync(path.join(jobDir, 'execution_report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(jobDir, 'execution_report.md'), markdown);
  return { report, markdown };
}

// --- CLI ---------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);
  if (args.length !== 1 || args[0] === '--help' || args[0] === '-h') {
    process.stderr.write('Usage: node execution-report.js <path-to-artifacts/jobId-dir>\n');
    return 3;
  }
  const jobDir = path.resolve(args[0]);
  let stat;
  try {
    stat = fs.statSync(jobDir);
  } catch (_err) {
    process.stderr.write(`Error: job directory not found: ${jobDir}\n`);
    return 3;
  }
  if (!stat.isDirectory()) {
    process.stderr.write(`Error: not a directory: ${jobDir}\n`);
    return 3;
  }
  let result;
  try {
    result = generateExecutionReport(jobDir);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    return 3;
  }
  const { report } = result;
  process.stdout.write(
    `execution_report: decision=${report.decision} warn_flag=${report.warn_flag} exit_code=${report.exit_code} (${report.decision_reason})\n`
  );
  return report.exit_code;
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = {
  buildReport,
  generateExecutionReport,
  decideLifecycle,
  exitCodeFor,
  DECISIONS,
  GATE_STATUSES,
  PHASE_NAMES,
  NO_RETRY_REASONS,
  QUARANTINE_REASONS,
  SCHEMA_VERSION,
};
