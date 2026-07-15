# Execution Report — job-c31f57

## Verdict: RETRY

> Job failed with retriable reason (TEST_GATE_FAILURE); retry is permitted by policy.

- **Decision:** RETRY
- **Warn flag:** false
- **Exit code:** 1
- **Final status:** failed
- **Failure reason:** TEST_GATE_FAILURE
- **Task:** TASK-103
- **Schema version:** 1.0.0
- **Generated at:** 2026-07-15T05:58:18.028Z
- **Evidence root:** /sessions/beautiful-tender-turing/mnt/adws-pipeline-skill/parity/execution-report-fixtures/retry/artifacts/job-c31f57

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| pipeline_completion | fail | 3/7 — Missing phase outputs: review, document, ship, verify |
| verify_structural | unverified | No verify-phase output recorded for this run |
| skills_clean | pass | 5 pass |

## Phases

| Phase | Attempt | Gate result | Failure reason | Model tier | Evidence path |
| --- | --- | --- | --- | --- | --- |
| plan | 1 | pass | — | opus | `plan/attempt_1/` |
| build | 1 | pass | — | sonnet | `build/attempt_1/` |
| test | 1 | fail | TEST_GATE_FAILURE | sonnet | `test/attempt_1/` |
| test | 2 | fail | TEST_GATE_FAILURE | sonnet | `test/attempt_2/` |
| test | 3 | fail | TEST_GATE_FAILURE | sonnet | `test/attempt_3/` |

## Skill Verdicts

| Skill | Phase | Attempt | Rubric result |
| --- | --- | --- | --- |
| plan-coherence | plan | 1 | pass |
| adws-lint | build | 1 | pass |
| coverage-rubric | test | 1 | pass |
| coverage-rubric | test | 2 | pass |
| coverage-rubric | test | 3 | pass |

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent |
| --- | --- | --- | --- | --- |
| test | 1 | fail | pass | — |
| test | 2 | fail | pass | — |
| test | 3 | fail | pass | — |

## Warnings

- Failure reason recorded: TEST_GATE_FAILURE
- Gate "pipeline_completion" evaluated to fail: Missing phase outputs: review, document, ship, verify
- Gate "verify_structural" evaluated to unverified: No verify-phase output recorded for this run
- Phase "test" required 3 attempts before producing output.
