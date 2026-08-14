# Execution Report — job-abs001

## Verdict: PROMOTE (WITH WARNINGS)

> Job completed successfully but at least one gate is unverified (missing evidence); promoting with warn flag — per CONSTITUTION/AGENTS governance, unverified evidence must not silently pass as clean.

- **Decision:** PROMOTE
- **Warn flag:** true
- **Exit code:** 10
- **Final status:** completed
- **Failure reason:** —
- **Task:** TASK-101
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
| skills_clean | unverified | No skill outcomes recorded in any phase |

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

_No skill outcomes recorded in any phase._

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent | Resolution |
| --- | --- | --- | --- | --- | --- |
| test | 1 | pass | pass | — | — |
| review | 1 | pass | pass | — | — |

## Warnings

- Gate "skills_clean" evaluated to unverified: No skill outcomes recorded in any phase
