const m = require(process.argv[2]);
const R = 'PR_DRIFT_SENTINEL_BLOCK';
console.log('exports:', Object.keys(m).filter(k=>/REASON|severity|Lifecycle|SCHEMA/i.test(k)).join(', '));
console.log('NO_RETRY_REASONS has        ', R, '=', m.NO_RETRY_REASONS ? m.NO_RETRY_REASONS.has(R) : '(not exported)');
console.log('QUARANTINE_REASONS has      ', R, '=', m.QUARANTINE_REASONS ? m.QUARANTINE_REASONS.has(R) : '(not exported)');
if (m.failureReasonSeverity) {
  for (const r of [R,'ADVOCATE_DISSENT','EVIDENCE_INTEGRITY_BREACH','TEST_GATE_FAILURE','PROTECTED_BRANCH_BLOCKED','MISSING_UPSTREAM_ARTIFACT'])
    console.log('  failureReasonSeverity('+r+') =', m.failureReasonSeverity(r));
}
if (m.decideLifecycle) {
  for (const st of ['quarantined','failed'])
    try { const d = m.decideLifecycle({ final_status: st, failure_reason: R }); console.log('  decideLifecycle(status='+st+') ->', JSON.stringify(d).slice(0,200)); }
    catch(e){ console.log('  decideLifecycle(status='+st+') threw:', e.message); }
}
