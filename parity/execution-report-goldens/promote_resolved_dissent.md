# Execution Report — job-1b2c3d

## Verdict: PROMOTE (WITH WARNINGS)

> Job completed successfully with gate warnings; promoting with warn flag for operator awareness.

- **Decision:** PROMOTE
- **Warn flag:** true
- **Exit code:** 10
- **Final status:** completed
- **Failure reason:** —
- **Task:** TASK-501
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
| consensus | warn | 1 operator-overridden dissent(s) — Advocate dissent in review/attempt_1 operator-resolved (override) — promotes with a permanent warning — False positive: staging happens only at ship, so an untracked change-set file at the review gate is expected pipeline state (F-4). The change is complete. |
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
| review | 1 | pass | fail | yes | override |

Dissent recorded in review/attempt_1 — operator override (2026-07-16T12:00:00Z):

> The build's new helper file is untracked in the worktree at review; the operator asked for a committed change, so this looks unfinished and must not promote.

Resolution rationale: False positive: staging happens only at ship, so an untracked change-set file at the review gate is expected pipeline state (F-4). The change is complete.

## Warnings

- Consensus dissent in review/attempt_1: The build's new helper file is untracked in the worktree at review; the operator asked for a committed change, so this looks unfinished and must not promote. [operator override: False positive: staging happens only at ship, so an untracked change-set file at the review gate is expected pipeline state (F-4). The change is complete.]
- Gate "consensus" evaluated to warn: Advocate dissent in review/attempt_1 operator-resolved (override) — promotes with a permanent warning — False positive: staging happens only at ship, so an untracked change-set file at the review gate is expected pipeline state (F-4). The change is complete.
