# Execution Report — job-3d5f82

## Verdict: PROMOTE (WITH WARNINGS)

> Job completed successfully with gate warnings; promoting with warn flag for operator awareness.

- **Decision:** PROMOTE
- **Warn flag:** true
- **Exit code:** 10
- **Final status:** completed
- **Failure reason:** —
- **Task:** TASK-721
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
| consensus | warn | 2 latest round(s) clean, 1 superseded objection(s) — Critic fail in review/attempt_1 (superseded by a later attempt) was superseded by a later clean round — promotes with a permanent warning: Self-entry excluded from the forward existence check, so a broken self-entry passes silently |
| skills_clean | pass | 3 pass |

## Phases

| Phase | Attempt | Gate result | Failure reason | Model tier | Evidence path |
| --- | --- | --- | --- | --- | --- |
| plan | 1 | pass | — | opus | `plan/attempt_1/` |
| build | 1 | pass | — | sonnet | `build/attempt_1/` |
| build | 2 | pass | — | opus | `build/attempt_2/` |
| test | 1 | pass | — | sonnet | `test/attempt_1/` |
| test | 2 | pass | — | sonnet | `test/attempt_2/` |
| review | 1 | fail | CRITIC_FAIL_REPAIRED | opus | `review/attempt_1/` |
| review | 2 | pass | — | opus | `review/attempt_2/` |
| document | 1 | pass | — | haiku | `document/attempt_1/` |
| ship | 1 | pass | — | sonnet | `ship/attempt_1/` |
| verify | 1 | pass | — | sonnet | `verify/attempt_1/` |

## Skill Verdicts

| Skill | Phase | Attempt | Rubric result |
| --- | --- | --- | --- |
| plan-coherence | plan | 1 | pass |
| adws-lint | build | 2 | pass |
| coverage-rubric | test | 2 | pass |

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent | Resolution |
| --- | --- | --- | --- | --- | --- |
| test | 2 | pass | pass | — | — |
| review | 2 | pass | pass | — | — |

## Superseded Consensus Rounds

_These rounds did not gate the verdict — a later attempt superseded them — but a recorded dissent or Critic fail is never silent (FR-7)._

| Phase | Attempt | Critic | Advocate | Resolution |
| --- | --- | --- | --- | --- |
| review | 1 | fail | pass | — |

Critic fail recorded in review/attempt_1:

> Self-entry excluded from the forward existence check, so a broken self-entry passes silently (gate-self-test.js:204-245 iterates siblingEntries (self-slug filtered out) when checking registry-entry-without-fixture; a self-entry whose fixture_root is absent is never flagged. Reproduced: broken self-entry + one valid sibling returns pass/exit 0.)

## Warnings

- Critic fail in review/attempt_1 (superseded): Self-entry excluded from the forward existence check, so a broken self-entry passes silently [superseded by a later attempt]
- Gate "consensus" evaluated to warn: Critic fail in review/attempt_1 (superseded by a later attempt) was superseded by a later clean round — promotes with a permanent warning: Self-entry excluded from the forward existence check, so a broken self-entry passes silently
- Phase "build" passed on attempt 2 (attempt(s) 1..1 superseded or gate-failed — attempt 1: superseded (gate_result=pass)).
- Phase "review" passed on attempt 2 (attempt(s) 1..1 gate-failed — attempt 1: CRITIC_FAIL_REPAIRED).
- Phase "test" passed on attempt 2 (attempt(s) 1..1 superseded or gate-failed — attempt 1: superseded (gate_result=pass)).
