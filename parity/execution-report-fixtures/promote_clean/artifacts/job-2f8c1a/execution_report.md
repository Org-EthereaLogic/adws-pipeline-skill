# Execution Report — job-2f8c1a

## Verdict: PROMOTE

> Job completed successfully and all evaluated gates passed.

- **Decision:** PROMOTE
- **Warn flag:** false
- **Exit code:** 0
- **Final status:** completed
- **Failure reason:** —
- **Task:** TASK-101
- **Schema version:** 1.0.0
- **Generated at:** 2026-07-15T05:58:17.938Z
- **Evidence root:** /sessions/beautiful-tender-turing/mnt/adws-pipeline-skill/parity/execution-report-fixtures/promote_clean/artifacts/job-2f8c1a

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| pipeline_completion | pass | 7/7 |
| verify_structural | pass | 5/5 |
| skills_clean | pass | 3 pass |

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
| plan-coherence | plan | 1 | pass |
| adws-lint | build | 1 | pass |
| coverage-rubric | test | 1 | pass |

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent |
| --- | --- | --- | --- | --- |
| test | 1 | pass | pass | — |
| review | 1 | pass | pass | — |

## Warnings

_None._
