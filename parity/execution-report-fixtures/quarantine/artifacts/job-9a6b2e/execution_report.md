# Execution Report — job-9a6b2e

## Verdict: QUARANTINE

> Job failed with non-retriable reason (ADVOCATE_DISSENT); evidence preserved for review.

- **Decision:** QUARANTINE
- **Warn flag:** false
- **Exit code:** 2
- **Final status:** failed
- **Failure reason:** ADVOCATE_DISSENT
- **Task:** TASK-104
- **Schema version:** 1.0.0
- **Generated at:** 2026-07-15T05:58:18.067Z
- **Evidence root:** /sessions/beautiful-tender-turing/mnt/adws-pipeline-skill/parity/execution-report-fixtures/quarantine/artifacts/job-9a6b2e

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| pipeline_completion | fail | 4/7 — Missing phase outputs: document, ship, verify |
| verify_structural | unverified | No verify-phase output recorded for this run |
| skills_clean | pass | 3 pass |

## Phases

| Phase | Attempt | Gate result | Failure reason | Model tier | Evidence path |
| --- | --- | --- | --- | --- | --- |
| plan | 1 | pass | — | opus | `plan/attempt_1/` |
| build | 1 | pass | — | sonnet | `build/attempt_1/` |
| test | 1 | pass | — | sonnet | `test/attempt_1/` |
| review | 1 | fail | ADVOCATE_DISSENT | opus | `review/attempt_1/` |

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
| review | 1 | pass | fail | yes |

Dissent recorded in review/attempt_1:

> The proposed change removes the idempotency guard in src/retry_worker.py; under concurrent retries the webhook dispatcher can double-send. I cannot certify correctness without a compensating dedupe key.

## Warnings

- Consensus dissent in review/attempt_1: The proposed change removes the idempotency guard in src/retry_worker.py; under concurrent retries the webhook dispatcher can double-send. I cannot certify correctness without a compensating dedupe key.
- Failure reason recorded: ADVOCATE_DISSENT
- Gate "pipeline_completion" evaluated to fail: Missing phase outputs: document, ship, verify
- Gate "verify_structural" evaluated to unverified: No verify-phase output recorded for this run
