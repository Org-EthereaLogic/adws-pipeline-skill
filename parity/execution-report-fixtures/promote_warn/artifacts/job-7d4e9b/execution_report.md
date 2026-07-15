# Execution Report — job-7d4e9b

## Verdict: PROMOTE (WITH WARNINGS)

> Job completed successfully with gate warnings; promoting with warn flag for operator awareness.

- **Decision:** PROMOTE
- **Warn flag:** true
- **Exit code:** 10
- **Final status:** completed
- **Failure reason:** —
- **Task:** TASK-102
- **Schema version:** 1.0.0
- **Generated at:** 2026-07-15T05:58:17.984Z
- **Evidence root:** /sessions/beautiful-tender-turing/mnt/adws-pipeline-skill/parity/execution-report-fixtures/promote_warn/artifacts/job-7d4e9b

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| pipeline_completion | pass | 7/7 |
| verify_structural | unverified | 0/0 — Verify phase recorded no structural checks |
| skills_clean | warn | 0 fail, 1 warn — 1 skill invocation(s) warned |

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
| adws-lint | build | 1 | pass |
| doc-style | document | 1 | warn |

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent |
| --- | --- | --- | --- | --- |
| test | 1 | pass | pass | — |
| review | 1 | pass | pass | — |

## Warnings

- Gate "skills_clean" evaluated to warn: 1 skill invocation(s) warned
- Gate "verify_structural" evaluated to unverified: Verify phase recorded no structural checks
- Skill "doc-style" warned in document/attempt_1 — Heading depth exceeds style guide (h5 used in docs/audit-log.md)
