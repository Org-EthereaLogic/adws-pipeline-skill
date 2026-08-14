# Execution Report — job-c31f57

## Verdict: RETRY

> Job failed with retriable reason (TEST_GATE_FAILURE); retry is permitted by policy.

- **Decision:** RETRY
- **Warn flag:** false
- **Exit code:** 1
- **Final status:** failed
- **Failure reason:** TEST_GATE_FAILURE
- **Task:** TASK-103
- **Schema version:** 1.4.0
- **Generated at:** <generated_at>
- **Evidence root:** <evidence_root>

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| pipeline_completion | fail | 3/7 — Missing phase evidence: review (not reached — job terminated at test), document (not reached — job terminated at test), ship (not reached — job terminated at test), verify (not reached — job terminated at test) |
| phase_gates | fail | 2/3 pass — Phase "test" recorded gate_result=fail on its latest attempt (TEST_GATE_FAILURE) — a job cannot promote past a failed phase gate |
| verify_structural | unverified | No verify-phase output recorded for this run |
| grader_verdict | unverified | No verify-phase attempt recorded for this run |
| drift_verdict | unverified | No verify-phase output recorded for this run |
| consensus | fail | 1 critic fail(s) — Critic returned fail in test/attempt_3 — consensus gate was not satisfied |
| skills_clean | pass | 3 pass |

## Phases

| Phase | Attempt | Gate result | Failure reason | Model tier | Evidence path |
| --- | --- | --- | --- | --- | --- |
| plan | 1 | pass | — | opus | `plan/attempt_1/` |
| build | 1 | pass | — | sonnet | `build/attempt_1/` |
| test | 1 | fail | TEST_GATE_FAILURE | sonnet | `test/attempt_1/` |
| test | 2 | fail | TEST_GATE_FAILURE | opus | `test/attempt_2/` |
| test | 3 | fail | TEST_GATE_FAILURE | fable | `test/attempt_3/` |

## Skill Verdicts

| Skill | Phase | Attempt | Rubric result |
| --- | --- | --- | --- |
| plan-coherence | plan | 1 | pass |
| adws-lint | build | 1 | pass |
| coverage-rubric | test | 3 | pass |

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent | Resolution |
| --- | --- | --- | --- | --- | --- |
| test | 3 | fail | pass | — | — |

## Superseded Consensus Rounds

_These rounds did not gate the verdict — a later attempt superseded them — but a recorded dissent or Critic fail is never silent (FR-7)._

| Phase | Attempt | Critic | Advocate | Resolution |
| --- | --- | --- | --- | --- |
| test | 1 | fail | pass | — |
| test | 2 | fail | pass | — |

Critic fail recorded in test/attempt_1:

> (critic returned fail with no findings recorded)

Critic fail recorded in test/attempt_2:

> (critic returned fail with no findings recorded)

## Warnings

- Critic fail in test/attempt_1 (superseded): (critic returned fail with no findings recorded) [superseded by a later attempt]
- Critic fail in test/attempt_2 (superseded): (critic returned fail with no findings recorded) [superseded by a later attempt]
- Failure reason recorded: TEST_GATE_FAILURE
- Gate "consensus" evaluated to fail: Critic returned fail in test/attempt_3 — consensus gate was not satisfied
- Gate "drift_verdict" evaluated to unverified: No verify-phase output recorded for this run
- Gate "grader_verdict" evaluated to unverified: No verify-phase attempt recorded for this run
- Gate "phase_gates" evaluated to fail: Phase "test" recorded gate_result=fail on its latest attempt (TEST_GATE_FAILURE) — a job cannot promote past a failed phase gate
- Gate "pipeline_completion" evaluated to fail: Missing phase evidence: review (not reached — job terminated at test), document (not reached — job terminated at test), ship (not reached — job terminated at test), verify (not reached — job terminated at test)
- Gate "verify_structural" evaluated to unverified: No verify-phase output recorded for this run
- Phase "test" recorded 3 attempts; latest attempt 3 gate_result=fail (earlier — attempt 1: TEST_GATE_FAILURE; attempt 2: TEST_GATE_FAILURE).
