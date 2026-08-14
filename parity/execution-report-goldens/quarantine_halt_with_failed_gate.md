# Execution Report — job-h9f41d

## Verdict: QUARANTINE

> Job was halted by the operator, but the "phase_gates" gate recorded fail; the halt does not clear the failure, so the job quarantines to preserve evidence.

- **Decision:** QUARANTINE
- **Warn flag:** false
- **Exit code:** 2
- **Final status:** halted
- **Failure reason:** OPERATOR_HALT
- **Task:** TASK-103
- **Schema version:** 1.4.0
- **Generated at:** <generated_at>
- **Evidence root:** <evidence_root>

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| pipeline_completion | fail | 3/7 — Missing phase evidence: review (not reached — job terminated at test), document (not reached — job terminated at test), ship (not reached — job terminated at test), verify (not reached — job terminated at test) |
| phase_gates | fail | 2/3 pass — Phase "test" recorded gate_result=fail on its latest attempt (ROUTE_NOT_EXECUTED) — a job cannot promote past a failed phase gate |
| verify_structural | unverified | No verify-phase output recorded for this run |
| grader_verdict | unverified | No verify-phase attempt recorded for this run |
| drift_verdict | unverified | No verify-phase output recorded for this run |
| consensus | fail | 1 critic fail(s) — Critic returned fail in test/attempt_1 — consensus gate was not satisfied |
| skills_clean | pass | 3 pass |

## Phases

| Phase | Attempt | Gate result | Failure reason | Model tier | Evidence path |
| --- | --- | --- | --- | --- | --- |
| plan | 1 | pass | — | opus | `plan/attempt_1/` |
| build | 1 | pass | — | sonnet | `build/attempt_1/` |
| test | 1 | fail | ROUTE_NOT_EXECUTED | sonnet | `test/attempt_1/` |

## Skill Verdicts

| Skill | Phase | Attempt | Rubric result |
| --- | --- | --- | --- |
| plan-coherence | plan | 1 | pass |
| adws-lint | build | 1 | pass |
| coverage-rubric | test | 1 | pass |

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent | Resolution |
| --- | --- | --- | --- | --- | --- |
| test | 1 | fail | pass | — | — |

## Warnings

- Failure reason recorded: OPERATOR_HALT
- Gate "consensus" evaluated to fail: Critic returned fail in test/attempt_1 — consensus gate was not satisfied
- Gate "drift_verdict" evaluated to unverified: No verify-phase output recorded for this run
- Gate "grader_verdict" evaluated to unverified: No verify-phase attempt recorded for this run
- Gate "phase_gates" evaluated to fail: Phase "test" recorded gate_result=fail on its latest attempt (ROUTE_NOT_EXECUTED) — a job cannot promote past a failed phase gate
- Gate "pipeline_completion" evaluated to fail: Missing phase evidence: review (not reached — job terminated at test), document (not reached — job terminated at test), ship (not reached — job terminated at test), verify (not reached — job terminated at test)
- Gate "verify_structural" evaluated to unverified: No verify-phase output recorded for this run
