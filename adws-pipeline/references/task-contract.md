# Task Contract — Template and Field Definitions

Every job begins by normalizing the operator's request into this contract. No phase may
run before the contract is written to `artifacts/{jobId}/task_contract_snapshot.json`
and has passed intake validation (below). Derived from ADWS_Pro
`specs/ADWS_TASK_CONTRACT.md` + `specs/schema/taskspec.schema.json`, trimmed of hosting
fields (`tenant_id`, `submitted_by`, `submitted_at`, duplicate-ID registry,
`max_cost_usd`) per DPPD §2.2.

## Template

```json
{
  "task_id": "tsk_YYYYMMDD_NNNN",
  "source_type": "direct_prompt",
  "repo": {
    "provider": "github",
    "owner": "<owner>",
    "name": "<repo>",
    "default_branch": "main"
  },
  "task": {
    "title": "<short imperative title>",
    "problem_statement": "<why this change is needed>",
    "requested_change": "<what to implement>",
    "acceptance_criteria": [
      "<testable, outcome-oriented criterion — at least one required>"
    ],
    "non_goals": [],
    "constraints": [],
    "file_hints": []
  },
  "execution": {
    "output_mode": "pr",
    "target_branch": "main",
    "allow_direct_commit": false,
    "commit_identity": null,
    "max_runtime_minutes": 60
  },
  "policy": {
    "allowed_paths": ["<at least one path prefix required>"],
    "blocked_paths": [],
    "test_policy": "required",
    "secret_policy": "no-new-secrets",
    "falsifiability": true
  },
  "risk": {
    "task_size": "small | medium | large",
    "risk_level": "low | medium | high",
    "requires_human_approval_before_ship": false
  }
}
```

## Field rules

| Field | Required | Rule |
|---|---|---|
| `task_id` | yes | `tsk_` + date + sequence; unique within the artifacts directory |
| `source_type` | yes | `direct_prompt` or `github_issue`; `github_issue` additionally requires `source_ref` (issue URL) and `task.problem_statement` |
| `repo.*` | yes | all four fields non-empty; provider is `github` |
| `task.title`, `task.requested_change` | yes | non-empty |
| `task.acceptance_criteria` | yes | ≥ 1 item, each non-empty, each testable (see rejection guidance) |
| `task.problem_statement`, `non_goals`, `constraints`, `file_hints` | no | recommended; absence produces soft warnings |
| `execution.output_mode` | yes | `pr`, `direct_branch`, or `patch` |
| `execution.target_branch` | yes | non-empty |
| `execution.allow_direct_commit` | yes | boolean |
| `execution.commit_identity` | no | Author identity for ship commits, `"Name <email>"` (C3). Default `null` = use the operator's git config (`user.name`/`user.email`); if that is also unset, the documented fallback `Claude (ADWS pipeline) <noreply@anthropic.com>` applies. Decided at intake so authorship is never a ship-time improvisation. |
| `execution.max_runtime_minutes` | no | advisory; > 0 if present |
| `policy.allowed_paths` | yes | ≥ 1 entry |
| `policy.blocked_paths` | yes | may be empty array |
| `policy.test_policy` | yes | `required`, `best-effort`, or `skip` |
| `policy.secret_policy` | yes | `no-new-secrets` or `allow-listed` |
| `policy.falsifiability` | no | boolean (SC-3 A5). Default: the falsifiability baseline (A1/A2) runs automatically whenever `test_policy` is `required`. Set `true` to force the pre-change RED baseline under any `test_policy`; `false` to opt out. Orchestrator-consumed — not a `task-normalize` field (unknown to the validator, which inspects only `task.*`). |
| `risk.*` | yes | all three; enums as in template |

## Hard intake failures (reject the contract; do not start plan)

1. **Path overlap** — any `allowed_paths` entry equals, prefixes, or is prefixed by any
   `blocked_paths` entry (compare normalized, `/`-delimited segments).
2. **Protected-branch direct commit** — `allow_direct_commit: true` while
   `target_branch` ∈ {`main`, `master`, `production`, `prod`, `release`} or equals
   `repo.default_branch`.
3. **Empty acceptance criteria** — zero criteria, or any empty criterion.
4. **Bad enums / missing required fields** — anything violating the table above.

## Soft warnings (record in evidence; do not block)

- `MISSING_FILE_HINTS` — no `file_hints`.
- `EXCESSIVE_ACCEPTANCE_CRITERIA` — more than 10 criteria.
- `MISSING_NON_GOALS` — no `non_goals` and `task_size` is `medium` or `large`.
- `PROTECTED_TARGET_FOR_DIRECT_BRANCH` — `output_mode: direct_branch` while
  `target_branch` is protected. Warn the operator now: this contract will pass intake
  but is GUARANTEED to be refused at ship (`PROTECTED_BRANCH_BLOCKED`). Suggest `pr`
  mode or an unprotected target before starting.

## Vague-task rejection guidance (AC-1.2)

Do NOT guess missing fields. Ask the operator and wait when:

- No verifiable outcome can be stated — you cannot write a single acceptance criterion
  that a test or check could pass/fail. Ask: "What observable behavior proves this done?"
- Target repository or paths are unknown — you cannot fill `repo.*` or `allowed_paths`.
- The request is a question, an opinion, or an investigation with no change to ship.
  This skill ships code changes; redirect instead.
- Conflicting instructions (e.g., "don't touch X" and the change requires X).

Fields you MAY infer without asking: `task_id` (generate), `task_size`/`risk_level`
(from scope of request; when unsure choose the higher risk), `output_mode` default `pr`,
`target_branch` default `repo.default_branch`, `allow_direct_commit` default `false`,
policies default as in template. Mandatory `pr` mode when `risk_level` is `high`,
migrations/schema changes are involved, or `requires_human_approval_before_ship` is true.

After writing the contract, the planner runs the `task-normalize` validator against
`task.*` fields; a `fail` verdict (missing required fields) returns to intake, a `warn`
(weak fields or high semantic divergence between problem and criteria) is recorded and
surfaced but does not block.
