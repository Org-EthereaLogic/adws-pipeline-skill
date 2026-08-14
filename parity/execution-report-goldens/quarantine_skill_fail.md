# Execution Report — job-skf001

## Verdict: QUARANTINE

> Job reached completed status but at least one gate evaluated to fail; quarantining to preserve evidence.

- **Decision:** QUARANTINE
- **Warn flag:** false
- **Exit code:** 2
- **Final status:** completed
- **Failure reason:** —
- **Task:** TASK-117
- **Schema version:** 1.4.0
- **Generated at:** <generated_at>
- **Evidence root:** <evidence_root>

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| pipeline_completion | pass | 7/7 |
| phase_gates | pass | 7/7 pass |
| verify_structural | pass | 5/5 |
| grader_verdict | pass | pass |
| drift_verdict | pass | PASS |
| consensus | pass | 2 round(s) clean |
| skills_clean | fail | 1 fail, 0 warn — 1 skill invocation(s) failed |

## Phases

| Phase | Attempt | Gate result | Failure reason | Model tier | Evidence path |
| --- | --- | --- | --- | --- | --- |
| plan | 1 | pass | — | opus | `plan/attempt_1/` |
| build | 1 | pass | — | sonnet | `build/attempt_1/` |
| test | 1 | pass | — | sonnet | `test/attempt_1/` |
| review | 1 | pass | — | opus | `review/attempt_1/` |
| document | 1 | pass | — | haiku | `document/attempt_1/` |
| ship | 1 | pass | — | sonnet | `ship/attempt_1/` |
| verify | 1 | pass | — | haiku | `verify/attempt_1/` |

## Skill Verdicts

| Skill | Phase | Attempt | Rubric result |
| --- | --- | --- | --- |
| plan-coherence | plan | 1 | fail |
| adws-lint | build | 1 | pass |
| coverage-rubric | test | 1 | pass |

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent | Resolution |
| --- | --- | --- | --- | --- | --- |
| test | 1 | pass | pass | — | — |
| review | 1 | pass | pass | — | — |

## Warnings

- Gate "skills_clean" evaluated to fail: 1 skill invocation(s) failed
- Skill "plan-coherence" failed in plan/attempt_1
