# Execution Report — job-h5k1pd

## Verdict: QUARANTINE

> Job was halted by the operator, but phase evidence is missing in a way the stop does not explain (review (no attempt recorded)); a halt accounts for the phases after it, never a gap behind it.

- **Decision:** QUARANTINE
- **Warn flag:** false
- **Exit code:** 2
- **Final status:** halted
- **Failure reason:** OPERATOR_HALT
- **Task:** TASK-116
- **Schema version:** 1.4.0
- **Generated at:** <generated_at>
- **Evidence root:** <evidence_root>

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| pipeline_completion | fail | 4/7 — Missing phase evidence: review (no attempt recorded), ship (not reached — job terminated at document), verify (not reached — job terminated at document) |
| phase_gates | pass | 4/4 pass |
| verify_structural | unverified | No verify-phase output recorded for this run |
| grader_verdict | unverified | No verify-phase attempt recorded for this run |
| drift_verdict | unverified | No verify-phase output recorded for this run |
| consensus | pass | 1 round(s) clean |
| skills_clean | unverified | No skill outcomes recorded in any phase |

## Phases

| Phase | Attempt | Gate result | Failure reason | Model tier | Evidence path |
| --- | --- | --- | --- | --- | --- |
| plan | 1 | pass | — | opus | `plan/attempt_1/` |
| build | 1 | pass | — | sonnet | `build/attempt_1/` |
| test | 1 | pass | — | sonnet | `test/attempt_1/` |
| document | 1 | pass | ROUTE_NOT_EXECUTED | haiku | `document/attempt_1/` |

## Skill Verdicts

_No skill outcomes recorded in any phase._

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent | Resolution |
| --- | --- | --- | --- | --- | --- |
| test | 1 | pass | pass | — | — |

## Warnings

- Failure reason recorded: OPERATOR_HALT
- Gate "drift_verdict" evaluated to unverified: No verify-phase output recorded for this run
- Gate "grader_verdict" evaluated to unverified: No verify-phase attempt recorded for this run
- Gate "pipeline_completion" evaluated to fail: Missing phase evidence: review (no attempt recorded), ship (not reached — job terminated at document), verify (not reached — job terminated at document)
- Gate "skills_clean" evaluated to unverified: No skill outcomes recorded in any phase
- Gate "verify_structural" evaluated to unverified: No verify-phase output recorded for this run
