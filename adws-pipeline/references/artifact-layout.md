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
    ├── corrections.json           # build attempts only, when this attempt follows a rewind-to-build (A3/F-15; orchestrator-authored input)
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
  "cross_phase_rewinds": { "test": 0, "verify": 0 }, "check_defect_repairs": 0 }
```
`final_status` is null while running; set once to one of
`completed | failed | quarantined | canceled` at terminal state.
`check_defect_repairs` (SC-3 A4/F-16) counts gate-defect repairs performed this job —
a `cross_phase_rewinds`-style counter capped at 1 (a second check defect terminates on
the ordinary `TEST_GATE_FAILURE`/budget path). Like `cross_phase_rewinds`, it is
orchestrator bookkeeping and is NOT read by `execution-report.js`.
`model_tiers` stores canonical tier names (`haiku`, `sonnet`, `opus`). Codex resolves
the routing aliases `luna`, `terra`, and `sol` only when dispatching; aliases and
provider-specific model identifiers do not enter the evidence schema.

`phase_manifest.json`
```json
{ "phase": "", "attempt": 1, "job_id": "", "started_at": "", "completed_at": "",
  "agent": "adws-…", "model_tier": "sonnet",
  "tier_input": { "source": "contract.risk_level | review-risk-assess | retry-escalation | entropy-gate | operator-resolution", "value": "" },
  "gate_result": "null | pass | fail | deferred", "failure_reason": null,
  "stability_gate": null, "provenance": null }
```
`stability_gate` (X-2): the verbatim JSON printed by `scripts/entropy-gate.js` for
this attempt, or null when no entropy history exists yet.
`provenance` (SC-3 B1/F-17) is an OPTIONAL, ADVISORY-only object capturing per-phase
invocation telemetry the runtime exposes — `{ "model_id", "cost_usd", "tokens_in",
"tokens_out", "elapsed_ms", "tool_call_count", "timeout", "cancel" }`; any subset may be
present and any field may be null when the runtime does not expose it. Non-null values
are typed: `model_id` string; `cost_usd` finite non-negative number; token, elapsed, and
tool-call counts non-negative integers; timeout/cancel booleans. It is evidence for
audit, never a gate input: **absent or partial provenance NEVER implies pass or fail**
(mirrors F-9). It is not X-1 hosting telemetry — no dashboard, socket, DB, or process.
`execution-report.js` ignores it (tolerant reader, rule 8), so the report suite is
unchanged (SC-3 B2 leaves the report generator untouched).
The deterministic harness `parity/provenance-fixtures/run-tests.js` validates the three
schema shapes (SC-3 B1 present / partial / absent) without making provenance a gate input:
- full: `{ "model_id": "opus", "cost_usd": 0.42, "tokens_in": 18000, "tokens_out": 900, "elapsed_ms": 51200, "tool_call_count": 12, "timeout": false, "cancel": false }`
- partial: `{ "model_id": "sonnet", "elapsed_ms": 8300, "tool_call_count": 4 }` (runtime exposed no cost/token counts — omit or null, never a fabricated zero)
- absent: `null` (no telemetry available)
`tier_input.source` names what selected this attempt's model tier. `operator-resolution`
is the dissent-resolution re-attempt source (F-6): a re-review the operator triggered to
clear a dissent they judged a false positive. It escalates one tier on the same ladder as
`retry-escalation` (haiku → sonnet → opus, capped at opus), and its `value` records the
resolved dissent's location — `"{phase}/attempt_{n}/consensus/advocate.json"`. See
`references/phase-gates.md` "Consensus" for the flow.
`gate_result` is `null` as written by the phase agent (the pre-gate state; the
orchestrator overwrites it post-hoc per rule 2 below) and normally `pass`/`fail`
once the gate is decided. `deferred` (F-5) is a ship-only intermediate: a
`pr`-mode push that failed on detected missing credentials awaits an operator-delegated
push and does NOT consume the retry budget. On operator confirmation the SAME attempt's
gate flips to `pass` (see ship `phase_output.delegation` below); a timeout/refusal makes
it `fail`. A terminal report on a `completed` job should not see a `deferred` ship gate —
the delegation resolves first.

`phase_output.json` — phase-specific. Required minimums:

- plan: `{ "plan_summary": "", "file_change_proposal": [{ "file_path": "", "action": "create|modify|delete", "description": "" }], "criteria_map": [] }` (each proposal's `description` — what changes and why — is required; the build-gate `repo-context-scan` validator warns on any proposal whose `description` is missing or under 3 chars)
- build: `{ "files_changed": [{ "file_path": "", "action": "" }], "diff_summary": "", "implementation_notes": "" }`
- test: `{ "checks": [{ "check": "", "criterion": "", "pass": true, "output": "", "baseline_pass": false, "baseline_reason": "assertion-failed-runtime-present | collection-error | not-run", "falsifiable": true, "verdict": "verified | gate_weak | fail", "classification": "null | code | check | environment | prerequisite" }], "command_log": [] }` — the `baseline_*`/`falsifiable`/`verdict` fields carry the SC-3 A1/A2 falsifiability result (present when `test_policy: required` or `policy.falsifiability: true`); a `gate_weak` verdict is an unverified criterion (warn), never a pass. On a `fail` verdict, `classification` records WHY the tester attributes the failure — the orchestrator routes on it (A3/A4) and copies it into `corrections.json`; `null` otherwise.
- review: `{ "findings": [], "risk_level": "", "approved": true }`
- document: `{ "docs_delta": [], "changelog_entry": "", "documentation_summary": "" }`
- ship: `{ "mode": "", "branch_name": "", "pr_url": null, "patch_file": null, "commit_sha": "", "pushed": false, "block_reason": null, "delegation": null }` — `delegation` (optional, F-5) is present only for a delegated `pr`-mode push: `{ "status": "pending-operator | completed", "detected_reason": "NO_PUSH_CREDENTIALS_IN_SANDBOX | …", "completed_by": "operator", "completed_at": "<iso>" }`. The shipper writes `pushed: false` + `delegation.status: "pending-operator"` when it detects it cannot push; the ORCHESTRATOR later writes `delegation.status: "completed"` + `pr_url` post-hoc (never the shipper).
- verify: `{ "verify_result": { "passed": 0, "total": 0, "syntax_errors": 0, "checks": [{ "check": "", "pass": true }] }, "drift_verdict": "PASS | WARN | BLOCK" }`

`corrections.json` — build attempts only, present only when this attempt follows a
rewind-to-build (SC-3 A3/F-15). Written ONCE by the ORCHESTRATOR into the fresh build
`attempt_{n}/` directory BEFORE it dispatches the builder — the structured, auditable
form of the rewind feedback, replacing the previous free-text channel:
```json
{ "source_attempt": "test/attempt_{n} | verify/attempt_{n}",
  "corrections": [ { "check_id": "", "criterion": "", "expected": "", "actual": "",
                     "path": "", "classification": "code | check | environment | prerequisite" } ] }
```
The builder treats each `code`-classified entry as an exact instruction; `check` entries
are the gate-defect signal (A4). This is a rule-1 fresh-attempt artifact (see append-only
rules), NOT a rule-2 post-hoc field — the orchestrator authors it once and never edits it.

`consensus/critic.json` and `consensus/advocate.json`
```json
{ "role": "critic | advocate", "verdict": "pass | fail", "dissent": null,
  "findings": [{ "issue": "", "evidence": "" }],
  "model_tier": "", "assessed_at": "",
  "resolution": null }
```
`findings` is an array of `{ issue, evidence }` objects — the SAME shape for both
roles: the Critic's specific rejection grounds, or a note either role wants on
record (e.g. an Advocate flagging a code-quality concern that is really the
Critic's territory, or either role recording an out-of-scope follow-up
candidate). Both fields are strings; use `[]` when there are none, and add no
other keys — the reader is tolerant (unknown keys are ignored) but writers stay
strict (rule 8). An Advocate dissent goes in `dissent` VERBATIM (the full text of the objection).
`resolution` (advocate only, optional, F-3) is written POST-HOC by the ORCHESTRATOR —
never by the Advocate agent — when the operator resolves a recorded dissent:
```json
{ "resolved_by": "operator", "action": "override | uphold",
  "rationale": "<why>", "resolved_at": "<iso>" }
```
`action: "override"` (operator judged the dissent a false positive) clears the terminal
consensus block but ALWAYS leaves a permanent warning; `action: "uphold"` (dissent
confirmed) behaves exactly as an unresolved dissent → QUARANTINE. See
`references/phase-gates.md` "Consensus" rule 5.

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
     the orchestrator's, not the agent's — agents write `"gate_result": null` per
     each agent spec and the orchestrator overwrites it post-hoc).
   - `{phase}/attempt_{n}/phase_manifest.json` → `provenance` (SC-3 B1; advisory
     invocation telemetry only the orchestrator observes — the agent writes
     `"provenance": null` and the orchestrator fills it post-hoc, structurally the same
     pattern as `gate_result`).
   - `verify/attempt_{n}/phase_output.json` → `drift_verdict` (filled from the
     adws-grader result once grading completes).
   - `{test,review}/attempt_{n}/consensus/advocate.json` → `resolution` (F-3; written
     only when the operator resolves a recorded dissent — `override` or `uphold`).
   - `ship/attempt_{n}/phase_output.json` → `delegation.status` and `pr_url` (F-5;
     written only when closing a delegated `pr`-mode push the operator completed).

   Every other field of every other file is immutable once written. This list is
   exhaustive: anything not named here stays write-once for everyone, orchestrator
   included (invariant — F-7 resolved in favor of the designed flow, not by weakening
   append-only).

   **Orchestrator-authored input (SC-3 A3), distinct from the post-hoc fields above.**
   The orchestrator MAY author exactly one file it owns — `build/attempt_{n}/corrections.json`
   — into a build attempt directory it just created, BEFORE dispatching the builder. This
   is a fresh rule-1 artifact (written once at attempt creation, never edited afterward),
   not a post-hoc amendment of an agent's output: it PRECEDES the agent as its input. It
   does not weaken append-only — no existing file is touched.
3. `task_contract_snapshot.json` is written once at intake and never touched again.
4. `run_manifest.json` is the only mutable file: update it at phase transitions and
   terminal state only (current_phase, model_tiers, rewind count, `check_defect_repairs`,
   final_status).
   `entropy_history.jsonl` is append-only: new lines at the end only; existing lines
   are never edited or deleted.
5. `execution_report.{json,md}` are derived files generated by the script; they may be
   regenerated, never hand-edited.
6. Evidence lives in the primary checkout. The worktree receives code changes only.
7. **Evidence hygiene (C5).** `phase_log.md` and any evidence file capture command
   output verbatim — agents MUST redact secrets (tokens, keys, passwords, credentials)
   to `[REDACTED]` before writing them. Defense in depth on top of `secret_policy:
   no-new-secrets`; the evidence tree is an audit artifact, not a secret store.
8. **Schema discipline — tolerant reader, strict writer.** Consumers of the evidence
   tree (`execution-report.js`) evaluate only the fields documented in this file and
   ignore unknown keys. Writers get no inverse latitude: agents write EXACTLY the
   documented fields for each file shape. An undocumented extra key is schema drift —
   it will not break the terminal report, but it is flagged at review and nothing may
   depend on it.
9. **Timestamp integrity.** Every `*_at` field is a real UTC value captured with
   `date -u +%Y-%m-%dT%H:%M:%SZ` at the moment of writing — never estimated, copied
   from another file, or a placeholder. A midnight `T00:00:00Z` stamp reads as
   fabricated evidence: PASS claims built on low-integrity timestamps do not meet the
   dual-evidence bar.
