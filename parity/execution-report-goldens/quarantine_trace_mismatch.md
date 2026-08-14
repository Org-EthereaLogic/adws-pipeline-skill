# Execution Report — job-9b2e14

## Verdict: QUARANTINE

> Job reached completed status but at least one gate evaluated to fail; quarantining to preserve evidence.

- **Decision:** QUARANTINE
- **Warn flag:** false
- **Exit code:** 2
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
| skills_clean | fail | 1 evidence-integrity mismatch(es), 1 fail, 0 warn — 1 skill_trace.json verdict(s) disagree with their own validator output — review-risk-assess in review/attempt_1 (trace "warn" vs validator "fail") |

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
| review-risk-assess | review | 1 | fail |

## Consensus

| Phase | Attempt | Critic | Advocate | Dissent | Resolution |
| --- | --- | --- | --- | --- | --- |
| test | 1 | pass | pass | — | — |
| review | 1 | pass | pass | — | — |

## Warnings

- EVIDENCE INTEGRITY: skill_trace.json for "review-risk-assess" in review/attempt_1 records rubric_result="warn" but its own output.rubric_result is "fail". The trace must transcribe the validator's stdout verbatim (references/artifact-layout.md); the validator's verdict is authoritative and is what this report scored.
- Gate "skills_clean" evaluated to fail: 1 skill_trace.json verdict(s) disagree with their own validator output — review-risk-assess in review/attempt_1 (trace "warn" vs validator "fail")
- Skill "review-risk-assess" failed in review/attempt_1 — OPERATOR_OVERRIDE: the validator's verbatim rubric_result is 'fail' — see output — adjudicated a false positive and downgraded to warn so the run could proceed.
