# Execution Report — job-3f2b8c

## Verdict: QUARANTINE

> Job reached completed status but at least one gate evaluated to fail; quarantining to preserve evidence.

- **Decision:** QUARANTINE
- **Warn flag:** false
- **Exit code:** 2
- **Final status:** completed
- **Failure reason:** —
- **Task:** TASK-401
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
| consensus | fail | 1 blocking dissent(s), 0 overridden, 0 critic fail(s) — Advocate dissent in review/attempt_1 (unresolved) — blocks promotion (ADVOCATE_DISSENT / AC-4.2): The shipped change silently weakens the auth-token expiry check; the operator asked for a refactor with identical behavior, so this contradicts the stated intent and must not promote. |
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

| Phase | Attempt | Critic | Advocate | Dissent | Resolution |
| --- | --- | --- | --- | --- | --- |
| test | 1 | pass | pass | — | — |
| review | 1 | pass | fail | yes | — |

Dissent recorded in review/attempt_1:

> The shipped change silently weakens the auth-token expiry check; the operator asked for a refactor with identical behavior, so this contradicts the stated intent and must not promote.

## Warnings

- Consensus dissent in review/attempt_1: The shipped change silently weakens the auth-token expiry check; the operator asked for a refactor with identical behavior, so this contradicts the stated intent and must not promote.
- Gate "consensus" evaluated to fail: Advocate dissent in review/attempt_1 (unresolved) — blocks promotion (ADVOCATE_DISSENT / AC-4.2): The shipped change silently weakens the auth-token expiry check; the operator asked for a refactor with identical behavior, so this contradicts the stated intent and must not promote.
