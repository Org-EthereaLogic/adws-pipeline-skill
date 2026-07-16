# Artifact Layout — Append-Only Evidence Tree

Ported from ADWS_Pro `src/artifacts.js` conventions, simplified for the skill runtime.
This layout is the input contract of `scripts/execution-report.js` — do not deviate.

## Root and job id

Evidence root: `artifacts/` in the primary checkout (never inside the worktree —
worktrees are disposable, evidence is not). Job id format: `job_YYYYMMDD_NNNN`
(zero-padded sequence; scan existing `artifacts/` dirs to pick the next). Job ids and
skill ids must match `[A-Za-z0-9._-]{1,128}` and never contain `/` or `..`.

## Tree

```
artifacts/{jobId}/
├── task_contract_snapshot.json     # written once at intake, never modified
├── run_manifest.json               # job state; the ONLY mutable file (see rules)
├── entropy_history.jsonl           # X-2 regulator signal; append-only lines (see rules)
├── execution_report.json           # derived at terminal state by execution-report.js
├── execution_report.md             # derived at terminal state by execution-report.js
└── {phase}/attempt_{n}/            # phase ∈ plan|build|test|review|document|ship|verify; n 1-based
    ├── phase_manifest.json
    ├── phase_output.json
    ├── phase_log.md                # narrative log of what the phase agent did
    ├── consensus/                  # test and review phases only
    │   ├── critic.json
    │   └── advocate.json
    ├── grader/                     # verify phase only
    │   └── grader_verdict.json
    └── skills/{skill_id}/
        └── skill_trace.json
```

## File shapes

`run_manifest.json`
```json
{ "schema_version": "1.0.0", "job_id": "", "task_id": "", "started_at": "",
  "completed_at": null, "final_status": null, "failure_reason": null,
  "current_phase": "plan", "output_mode": "pr", "isolation_mode": "worktree",
  "worktree_path": "", "branch_name": "", "model_tiers": {},
  "cross_phase_rewinds": { "test": 0, "verify": 0 } }
```
`final_status` is null while running; set once to one of
`completed | failed | quarantined | canceled` at terminal state.

`phase_manifest.json`
```json
{ "phase": "", "attempt": 1, "job_id": "", "started_at": "", "completed_at": "",
  "agent": "adws-…", "model_tier": "sonnet",
  "tier_input": { "source": "contract.risk_level | review-risk-assess | retry-escalation | entropy-gate | operator-resolution", "value": "" },
  "gate_result": "pass | fail", "failure_reason": null,
  "stability_gate": null }
```
`stability_gate` (X-2): the verbatim JSON printed by `scripts/entropy-gate.js` for
this attempt, or null when no entropy history exists yet.
`tier_input.source` names what selected this attempt's model tier. `operator-resolution`
is the dissent-resolution re-attempt source (F-6): a re-review the operator triggered to
clear a dissent they judged a false positive. It escalates one tier on the same ladder as
`retry-escalation` (haiku → sonnet → opus, capped at opus), and its `value` records the
resolved dissent's location — `"{phase}/attempt_{n}/consensus/advocate.json"`. See
`references/phase-gates.md` "Consensus" for the flow.

`phase_output.json` — phase-specific. Required minimums:

- plan: `{ "plan_summary": "", "file_change_proposal": [{ "file_path": "", "action": "create|modify|delete", "description": "" }], "criteria_map": [] }` (each proposal's `description` — what changes and why — is required; the build-gate `repo-context-scan` validator warns on any proposal whose `description` is missing or under 3 chars)
- build: `{ "files_changed": [{ "file_path": "", "action": "" }], "diff_summary": "", "implementation_notes": "" }`
- test: `{ "checks": [{ "check": "", "pass": true, "output": "" }], "command_log": [] }`
- review: `{ "findings": [], "risk_level": "", "approved": true }`
- document: `{ "docs_delta": [], "changelog_entry": "", "documentation_summary": "" }`
- ship: `{ "mode": "", "branch_name": "", "pr_url": null, "patch_file": null, "commit_sha": "", "pushed": false, "block_reason": null }`
- verify: `{ "verify_result": { "passed": 0, "total": 0, "syntax_errors": 0, "checks": [{ "check": "", "pass": true }] }, "drift_verdict": "PASS | WARN | BLOCK" }`

`consensus/critic.json` and `consensus/advocate.json`
```json
{ "role": "critic | advocate", "verdict": "pass | fail", "dissent": null,
  "model_tier": "", "assessed_at": "" }
```
An Advocate dissent goes in `dissent` VERBATIM (the full text of the objection).

`skills/{skill_id}/skill_trace.json` — wrap the validator CLI's stdout:
```json
{ "skill_id": "", "version": "", "started_at": "", "completed_at": "",
  "rubric_result": "pass | warn | fail", "latency_ms": 0, "error": null,
  "output": { } }
```
`output` is the full JSON object printed by the validator script.

`grader/grader_verdict.json` — the adws-grader agent's output (same shape as the
original `pr.drift_sentinel.spec` result): `rubric_result`, `criteria_results[]` with
per-criterion `satisfied | partial | unaddressed | contradicted` verdicts, `summary`.

`entropy_history.jsonl` — X-2 regulator signal. One JSON object per line:
```json
{ "phase": "", "attempt": 1, "parse_failures": 0, "recorded_at": "" }
```
`parse_failures` = integer count of malformed structured outputs during that attempt.
Created at the FIRST attempt with ≥ 1 failure; from then on every attempt appends a
line (zeros included). Lines are never modified or removed. Consumed by
`scripts/entropy-gate.js` at phase entry; its output is recorded as `stability_gate`
in that attempt's `phase_manifest.json`.

## Append-only rules (FR-4)

1. A new attempt ALWAYS gets a new `attempt_{n}` directory (n = max existing + 1).
2. **Write-once for phase agents (FR-4).** A phase agent (planner … verifier, plus
   critic, advocate, grader) treats every file it writes in its attempt directory as
   write-once: it never re-opens, modifies, or deletes a file in any existing
   `attempt_*` directory — including its own earlier files within a completed attempt.
   The ORCHESTRATOR is the sole exception, and only for an EXHAUSTIVE, enumerated set
   of designated post-hoc fields it completes after the agent has written the file:
   - `{phase}/attempt_{n}/phase_manifest.json` → `gate_result` (the gate decision is
     the orchestrator's, not the agent's — agents leave it unset per each agent spec).
   - `verify/attempt_{n}/phase_output.json` → `drift_verdict` (filled from the
     adws-grader result once grading completes).

   Every other field of every other file is immutable once written. This list is
   exhaustive: anything not named here stays write-once for everyone, orchestrator
   included (invariant — F-7 resolved in favor of the designed flow, not by weakening
   append-only).
3. `task_contract_snapshot.json` is written once at intake and never touched again.
4. `run_manifest.json` is the only mutable file: update it at phase transitions and
   terminal state only (current_phase, model_tiers, rewind count, final_status).
   `entropy_history.jsonl` is append-only: new lines at the end only; existing lines
   are never edited or deleted.
5. `execution_report.{json,md}` are derived files generated by the script; they may be
   regenerated, never hand-edited.
6. Evidence lives in the primary checkout. The worktree receives code changes only.
