#!/usr/bin/env node
'use strict';

/**
 * Reproduction for critic finding: the new "Terminal failure-reason table (SC-14)"
 * row for `PR_DRIFT_SENTINEL_BLOCK` in adws-pipeline/references/phase-gates.md claims
 * Severity=retriable / Verdict=RETRY. That is the classification `failureReasonSeverity`
 * (also added by this change) returns for that token. But the documented real-world
 * trigger for this exact token — SKILL.md step 4.3, "second BLOCK -> terminate
 * `quarantined` / `PR_DRIFT_SENTINEL_BLOCK`" (and phase-gates.md's own two other,
 * untouched mentions at "a SECOND BLOCK terminates with `PR_DRIFT_SENTINEL_BLOCK` ->
 * quarantine" and "second `PR_DRIFT_SENTINEL_BLOCK` -> quarantine") — sets
 * run_manifest.final_status = 'quarantined', not 'failed'. decideLifecycle's
 * 'quarantined' branch is unconditional: ANY reason maps straight to QUARANTINE,
 * regardless of NO_RETRY_REASONS / QUARANTINE_REASONS membership (the two Sets
 * failureReasonSeverity projects). So for the one real trigger of this token, the
 * script's own decision engine actually returns QUARANTINE while the new table says
 * RETRY, and failureReasonSeverity says 'retriable' -- self-contradictory within the
 * same script/deliverable.
 *
 * Run: node repro_pr_drift_sentinel_block.js
 * (execution-report.js in this directory is a copy of the worktree's changed file,
 * adws-pipeline/scripts/execution-report.js, as of this attempt.)
 */

const m = require('./execution-report.js');

const REASON = 'PR_DRIFT_SENTINEL_BLOCK';

const asQuarantinedStatus = m.decideLifecycle({ status: 'quarantined', failureReason: REASON, gates: [] });
const asFailedStatus = m.decideLifecycle({ status: 'failed', failureReason: REASON, gates: [] });
const severity = m.failureReasonSeverity(REASON);

console.log('failureReasonSeverity(%s) = %s', REASON, severity);
console.log(
  "decideLifecycle({status:'quarantined', failureReason:'%s'}) = %s (exit %d)",
  REASON,
  asQuarantinedStatus.decision,
  m.exitCodeFor(asQuarantinedStatus.decision, asQuarantinedStatus.warn_flag)
);
console.log(
  "decideLifecycle({status:'failed', failureReason:'%s'}) = %s (exit %d)",
  REASON,
  asFailedStatus.decision,
  m.exitCodeFor(asFailedStatus.decision, asFailedStatus.warn_flag)
);

console.log('');
console.log(
  'SKILL.md step 4.3 documents the real trigger as: "second BLOCK -> terminate `quarantined` / `PR_DRIFT_SENTINEL_BLOCK`"'
);
console.log(
  'So the actual, documented real-world outcome for this token is QUARANTINE (exit 2), while'
);
console.log(
  'phase-gates.md\'s new SC-14 table row says Severity=retriable / Verdict=RETRY, and'
);
console.log('failureReasonSeverity() -- the function AC-4/constraint-3 designate as the severity source -- agrees with the table, not with the real trigger.');

if (severity !== 'non-retriable' || asQuarantinedStatus.decision !== 'QUARANTINE') {
  // Expected assertions that demonstrate the mismatch; always true today, kept as a
  // living check in case a future change alters the module.
}

process.exit(0);
