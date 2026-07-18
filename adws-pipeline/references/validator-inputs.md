# Validator Inputs — Assembly Reference

The orchestrator assembles every validator's input from the contract and phase
outputs. Each script's header comment (`// INPUT:` / `// USAGE:`) is CANONICAL;
this file is a convenience summary so inputs can be assembled without opening
nine script headers mid-run. If this table and a script header ever disagree,
the header wins — and the divergence is a bug to fix here.

All validators share one CLI shape:

```text
node scripts/validators/<name>.js <input.json | ->   → JSON verdict on stdout
```

`rubric_result` is `pass | warn | fail`; exit 0 on a produced verdict, exit 3 on
unreadable/malformed input. Wrap each verdict verbatim in a `skill_trace.json`
under the attempt's `skills/{skill_id}/` directory (shape in
`references/artifact-layout.md`).

## Per-validator assembly table

| Validator | Phase | Input shape | Assemble from |
|---|---|---|---|
| `task-normalize` | plan | `{ title, requested_change, problem_statement, acceptance_criteria: [string], constraints: [string], file_hints: [string] }` | `task_contract_snapshot.json` → `task.*` fields verbatim |
| `repo-context-scan` | build | `{ plan_output: { file_change_proposal: [{file_path, action, description}], plan_summary }, policy: { allowed_paths: [string], blocked_paths: [string] } }` | plan `phase_output.json` + contract `policy.*` — each proposal's `description` is required; missing/<3-char yields `warn` |
| `criteria-to-checks` | test | `{ acceptance_criteria: [string] }` | contract `task.acceptance_criteria` |
| `review-risk-assess` | review | `{ build_output: { files_changed: [{file_path, action}] } }` | build `phase_output.json` → `files_changed`; output `risk_level` re-selects model tiers for remaining phases |
| `document-coverage-map` | document | `{ build_output: { files_changed: [...] }, doc_output: { docs_delta: [{file_path, change}], changelog_entry, documentation_summary }, acceptance_criteria: [string] }` | build + document `phase_output.json` + contract criteria |
| `ship-mode-select` | ship | `{ output_mode, branch_name, policy: { allow_direct_commit } }` | contract `execution.output_mode` + `run_manifest.branch_name` + contract `execution.allow_direct_commit` |
| `patch-compose` | ship | `{ build_output: { files_changed: [...] }, output_mode, branch_name }` | build `phase_output.json` + contract/manifest as above |
| `verify-evidence-map` | verify | `{ checks: [{check, pass}] }` | verifier `phase_output.json` → `verify_result.checks` |
| `drift-sentinel` | verify | `{ entropy_history: [{entropy}\|{parseFailureScore}\|number] }` (env: `ADWS_UMIF_CANONICAL` on\|off\|shadow, default on) | `artifacts/{jobId}/entropy_history.jsonl` lines, MAPPED: each line's `parse_failures` becomes `parseFailureScore` (or pass the bare numbers) — drift-sentinel does NOT read the `parse_failures` key, and feeding raw lines scores every entry 0 → silent false-SAFE (entropy-gate.js does this mapping internally; at verify YOU assemble it). **File absent (zero parse failures) → pass `{ "entropy_history": [] }`, which is SAFE/`pass` by design** |

## Non-validator scripts

| Script | When | Input | Notes |
|---|---|---|---|
| `entropy-gate.js` | phase entry, only if `entropy_history.jsonl` EXISTS | `node scripts/entropy-gate.js artifacts/{jobId}/entropy_history.jsonl` | `{action: proceed\|escalate\|halt}`; exit 3 = unreadable/corrupt history = evidence-integrity problem (do not proceed). Do NOT run it against a missing file — absence is the healthy case, not exit-3 territory. |
| `execution-report.js` | terminal state only | `node scripts/execution-report.js artifacts/{jobId}` | Reads the whole evidence tree; exits 0/10/1/2 = PROMOTE / PROMOTE-with-warnings / RETRY / QUARANTINE. Derived files only; never hand-edit its outputs. |

## Reader/writer discipline

Validators and `execution-report.js` are tolerant readers: they evaluate the
documented fields and ignore unknown keys. That tolerance is defense in depth,
not permission — writers (orchestrator included) supply exactly the documented
shapes. See `references/artifact-layout.md` rule 8.
