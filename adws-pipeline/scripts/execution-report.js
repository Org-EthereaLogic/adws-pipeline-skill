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

const SCHEMA_VERSION = '1.0.0';

// --- Constants ported from ADWS_Pro src/phases.js -------------------------

const PHASE_NAMES = ['plan', 'build', 'test', 'review', 'document', 'ship', 'verify'];

const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled', 'quarantined']);

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
function collectSkillVerdicts(jobDir, latestAttempts) {
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
      rows.push({
        skill_id: typeof trace.skill_id === 'string' ? trace.skill_id : skillId,
        phase: entry.phase,
        attempt: entry.attempt,
        rubric_result: normalizeSkillVerdict(trace.rubric_result),
        error: typeof trace.error === 'string' ? trace.error : null,
      });
    }
  }
  return rows;
}

// Same latest-attempt-only contract as collectSkillVerdicts above.
function collectConsensus(jobDir, latestAttempts) {
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
    });
  }
  return rows;
}

// --- Gates (ported from ADWS_Pro src/execution-report/gates.js) ------------

function evalPipelineCompletion(phaseData, finalStatus) {
  const missing = PHASE_NAMES.filter((p) => !phaseData[p]);
  if (finalStatus !== 'completed') {
    return {
      key: 'pipeline_completion',
      label: 'All seven phases produced an attempt',
      status: GATE_STATUSES.FAIL,
      value: `${PHASE_NAMES.length - missing.length}/${PHASE_NAMES.length}`,
      threshold: `${PHASE_NAMES.length}/${PHASE_NAMES.length}`,
      reason:
        missing.length > 0
          ? `Missing phase outputs: ${missing.join(', ')}`
          : 'Job did not reach completed status',
    };
  }
  if (missing.length > 0) {
    return {
      key: 'pipeline_completion',
      label: 'All seven phases produced an attempt',
      status: GATE_STATUSES.FAIL,
      value: `${PHASE_NAMES.length - missing.length}/${PHASE_NAMES.length}`,
      threshold: `${PHASE_NAMES.length}/${PHASE_NAMES.length}`,
      reason: `Missing phase outputs: ${missing.join(', ')}`,
    };
  }
  return {
    key: 'pipeline_completion',
    label: 'All seven phases produced an attempt',
    status: GATE_STATUSES.PASS,
    value: `${PHASE_NAMES.length}/${PHASE_NAMES.length}`,
    threshold: `${PHASE_NAMES.length}/${PHASE_NAMES.length}`,
    reason: null,
  };
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
const CONSENSUS_LABEL = 'Critic/Advocate consensus — no dissent, no critic fail';
function evalConsensus(consensusRows) {
  const rows = consensusRows || [];
  if (rows.length === 0) {
    return {
      key: 'consensus',
      label: CONSENSUS_LABEL,
      status: GATE_STATUSES.UNVERIFIED,
      value: null,
      threshold: '0 dissent, 0 critic fail',
      reason: 'No consensus rounds recorded (the test and review gates require a Critic+Advocate round)',
    };
  }
  const dissents = rows.filter((r) => typeof r.dissent === 'string' && r.dissent.trim().length > 0);
  const advocateFails = rows.filter((r) => r.advocate === 'fail');
  const criticFails = rows.filter((r) => r.critic === 'fail');
  if (dissents.length > 0 || advocateFails.length > 0) {
    const d = dissents[0] || advocateFails[0];
    const where = `${d.phase}/attempt_${d.attempt}`;
    const text = d.dissent ? `: ${d.dissent}` : ' (advocate returned fail)';
    return {
      key: 'consensus',
      label: CONSENSUS_LABEL,
      status: GATE_STATUSES.FAIL,
      value: `${dissents.length} dissent(s), ${criticFails.length} critic fail(s)`,
      threshold: '0 dissent, 0 critic fail',
      reason: `Advocate dissent recorded in ${where} — blocks promotion (ADVOCATE_DISSENT / AC-4.2)${text}`,
    };
  }
  if (criticFails.length > 0) {
    const c = criticFails[0];
    return {
      key: 'consensus',
      label: CONSENSUS_LABEL,
      status: GATE_STATUSES.FAIL,
      value: `${criticFails.length} critic fail(s)`,
      threshold: '0 dissent, 0 critic fail',
      reason: `Critic returned fail in ${c.phase}/attempt_${c.attempt} — consensus gate was not satisfied`,
    };
  }
  return {
    key: 'consensus',
    label: CONSENSUS_LABEL,
    status: GATE_STATUSES.PASS,
    value: `${rows.length} round(s) clean`,
    threshold: '0 dissent, 0 critic fail',
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

function buildWarnings({ failureReason, gates, skillVerdicts, phaseSummaries, consensus }) {
  const warnings = [];
  if (failureReason) {
    warnings.push(`Failure reason recorded: ${failureReason}`);
  }
  for (const gate of gates) {
    if (gate.status === GATE_STATUSES.PASS) continue;
    warnings.push(`Gate "${gate.key}" evaluated to ${gate.status}${gate.reason ? `: ${gate.reason}` : ''}`);
  }
  for (const row of skillVerdicts) {
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
  for (const ps of phaseSummaries) {
    if (ps.attempts > 1) {
      warnings.push(`Phase "${ps.phase}" required ${ps.attempts} attempts before producing output.`);
    }
  }
  for (const c of consensus) {
    if (c.dissent) {
      warnings.push(`Consensus dissent in ${c.phase}/attempt_${c.attempt}: ${c.dissent}`);
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
    lines.push('| Phase | Attempt | Critic | Advocate | Dissent |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of report.consensus) {
      lines.push(
        `| ${row.phase} | ${row.attempt} | ${mdEscapeCell(row.critic)} | ${mdEscapeCell(
          row.advocate
        )} | ${row.dissent ? 'yes' : '—'} |`
      );
    }
    for (const row of report.consensus) {
      if (row.dissent) {
        lines.push('');
        lines.push(`Dissent recorded in ${row.phase}/attempt_${row.attempt}:`);
        lines.push('');
        lines.push(`> ${row.dissent}`);
      }
    }
  }
  lines.push('');

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
  const skillVerdicts = collectSkillVerdicts(jobDir, latestAttempts);
  const consensus = collectConsensus(jobDir, latestAttempts);

  const gates = [
    evalPipelineCompletion(phaseData, finalStatus),
    evalVerifyStructural(phaseData),
    evalGraderVerdict(phaseData),
    evalDriftVerdict(phaseData),
    evalConsensus(consensus),
    evalSkillsClean(skillVerdicts),
  ];

  const verdict = decideLifecycle({ status: finalStatus, failureReason, gates });
  const exitCode = exitCodeFor(verdict.decision, verdict.warn_flag);

  const warnings = buildWarnings({
    failureReason,
    gates,
    skillVerdicts,
    phaseSummaries,
    consensus,
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
  TERMINAL_STATES,
  NO_RETRY_REASONS,
  QUARANTINE_REASONS,
  SCHEMA_VERSION,
};
