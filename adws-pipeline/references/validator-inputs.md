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

## Contents

- Per-validator assembly table
- Outputs worth naming
- Non-validator scripts
- Reader/writer discipline
- Verdict vocabularies and exit codes (SC-11/A2)

## Per-validator assembly table

| Validator | Phase | Input shape | Assemble from |
|---|---|---|---|
| `task-normalize` | plan | `{ title, requested_change, problem_statement, acceptance_criteria: [string], constraints: [string], file_hints: [string] }` | `task_contract_snapshot.json` → `task.*` fields verbatim |
| `repo-context-scan` | build | `{ plan_output: { file_change_proposal: [{file_path, action, description}], plan_summary }, policy: { allowed_paths: [string], blocked_paths: [string] } }` | plan `phase_output.json` + contract `policy.*` — each proposal's `description` is required; missing/<3-char yields `warn` |
| `criteria-to-checks` | test | `{ acceptance_criteria: [string] }` | contract `task.acceptance_criteria`. **Runs PRE-dispatch** — see below |
| `review-risk-assess` | review | `{ build_output: { files_changed: [{file_path, action}] } }` | build `phase_output.json` → `files_changed`; output `risk_level` re-selects model tiers for remaining phases |
| `document-coverage-map` | document | `{ build_output: { files_changed: [...] }, doc_output: { docs_delta: [{file_path, change}], changelog_entry, documentation_summary }, acceptance_criteria: [string] }` | build + document `phase_output.json` + contract criteria |
| `ship-mode-select` | ship | `{ output_mode, branch_name, policy: { allow_direct_commit } }` | contract `execution.output_mode` + `run_manifest.branch_name` + contract `execution.allow_direct_commit`. Run this BEFORE the first git command that consumes `branch_name` (SC-9/A2). |
| `patch-compose` | ship | `{ build_output: { files_changed: [...] }, document_output: { docs_delta: [...] }, output_mode, branch_name }` | build `phase_output.json` **and document `phase_output.json`** + contract/manifest as above. `files_to_ship` is the size of the UNION — that union is what the shipper stages, and passing only the build half undercounts the shipped set (recorded in three field runs before SC-9). |
| `verify-evidence-map` | verify | `{ checks: [{check, pass}] }` | verifier `phase_output.json` → `verify_result.checks` |
| `drift-sentinel` | verify | `{ entropy_history: [{entropy}\|{parseFailureScore}\|number] }` (env: `ADWS_UMIF_CANONICAL` on\|off\|shadow, default on) | `artifacts/{jobId}/entropy_history.jsonl` lines, MAPPED: each line's `parse_failures` becomes `parseFailureScore` (or pass the bare numbers) — drift-sentinel does NOT read the `parse_failures` key, and feeding raw lines scores every entry 0 → silent false-SAFE (entropy-gate.js does this mapping internally; at verify YOU assemble it). **File absent (zero parse failures) → pass `{ "entropy_history": [] }`, which is SAFE/`pass` by design** |

## Outputs worth naming

Most validator outputs are consumed only as a `rubric_result` verdict, but two carry
fields the orchestrator must read by name:

- **`criteria-to-checks`** → `check_specs: [{ check_id, criterion, check_type }]` plus
  `criteria_count`, `vague_count`, `rubric_result`. The type key is **`check_type`**
  (values `behavioral` | `unclassified`) — not `type`. `check_id` is `CHK001`, `CHK002`, …
  in criterion order. `check_specs.length` always equals `criteria_count`; a disagreement
  is a defect, never an expected narrowing (SC-5/F-27).
- **`review-risk-assess`** → `risk_level` (`low` | `medium` | `high`), which re-selects
  the model tiers for document, ship, and verify, plus `security_sensitive_count` and
  `security_sensitive_paths[]` (the matched paths, capped at 20; the count is always
  exact). Since SC-8/F-53 the score and the verdict are SEPARATE, so the outcome is
  derivable without opening the validator:

  | `rubric_result` | When |
  |---|---|
  | `fail` | `build_output` missing/malformed, `files_changed` empty, or ANY entry lacking a usable `file_path` — there is no assessable change set. `malformed_entries` counts the bad entries; `risk_level` is `high` (unassessable scores conservatively) |
  | `warn` | `risk_level: high` — security-sensitive paths matched, or more than 3 deletes |
  | `pass` | `risk_level: low` or `medium` |

  An entry is assessable when it is a non-null, non-array object whose `file_path` is a
  non-empty string. `action` is NOT validated against an enum — only `delete` carries
  behavior, and an entry with a usable path is assessable whatever its action.

  A `high` risk level therefore WARNS and the gate still passes: it buys the `high` row of
  the tier table, it does not block. Before v2.0.0 `high` meant `fail`, which made that row
  unreachable. Security matching is per path SEGMENT and per token within a segment
  (extension stripped, split on non-alphanumerics), and any path under a test corpus
  (`fixtures/`, `test/`, `spec/`, `parity/`, …) is never security-sensitive — so
  `src/auth/login.js` matches while `tokenizer.js`, `authoring.js`, and fixture data do not.

**`criteria-to-checks` is the one validator that runs BEFORE its phase agent.** The
tester must echo each spec's `check_id` onto the checks it runs so coverage is verifiable
by id rather than by prose (SC-5/F-31), which is impossible if the specs do not exist
until after it finishes. Run it at test-phase entry, confirm
`check_specs.length == criteria_count`, hand the specs to `adws-tester` in its dispatch,
and write its `skill_trace.json` at that point. Every other validator runs after its
phase agent, on that agent's output.

**`document-coverage-map` scoring** (so an empty `docs_delta` can be judged without
opening the script): `changelog_entry` present 0.5 + at least one documented path 0.3 +
`documentation_summary` present 0.2, `pass` at ≥ 0.7. A contract whose `allowed_paths`
excludes every documentation location therefore still passes on a real changelog plus a
real summary with `docs_delta: []` — see `adws-documenter.md`.

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

## Verdict vocabularies and exit codes (SC-11/A2)

Three tools, three verdict fields, two exit vocabularies. They name genuinely different
things and are not being unified; what follows is the mapping, which existed nowhere in
writing before SC-11.

| Tool | Verdict field | Values | Exit codes |
|---|---|---|---|
| `scripts/validators/*.js` (9) | `rubric_result` | `pass` / `warn` / `fail` | **0** = execute ran and the verdict is in the JSON, **including `fail`**; **3** = input rejected (unreadable, invalid JSON, not an object, over the size cap) or `execute()` threw |
| `scripts/entropy-gate.js` | `action` | `proceed` / `escalate` / `halt` | 0 = ran; 3 = unreadable input or a malformed JSONL line |
| `scripts/execution-report.js` | `decision` | `PROMOTE` / `RETRY` / `QUARANTINE` | 0 = PROMOTE; 10 = PROMOTE with warnings; 1 = RETRY; 2 = QUARANTINE; **3 = could not run** (missing argv, missing directory, not a directory, or the generator threw) |

**A validator's `fail` is exit 0.** The verdict is data, not a process outcome — only the
report's decision maps to an exit code. Reading a validator's exit status as its verdict is
a category error: `if node validator.js …` treats a `fail` as success, and `if node
execution-report.js …` treats a PROMOTE-with-warnings as failure. Read the JSON.

Empty input differs by tool for a reason: it is exit 3 for a validator (no JSON object was
supplied at all) and exit **0** for the entropy gate (zero lines means no signal, and the
gate stands open). Both are asserted by the skill repo's CLI-contract suite.

### Degenerate input: fact → fail, heuristic → warn

Extending SC-8's house rule. *Nothing assessable was provided* is a fact; *something
assessable but thin* is a heuristic.

| Validator | Empty input | Why |
|---|---|---|
| `criteria-to-checks` | `fail` | criteria are the subject; zero of them is nothing to check |
| `verify-evidence-map` | `fail` | checks are the subject |
| `patch-compose` | `fail` | nothing to ship is not a shippable composition |
| `ship-mode-select` | `fail` (empty mode) | the mode is mandatory |
| `repo-context-scan` | `warn` | a plan with no file proposals is thin, not absent |
| `document-coverage-map` | `warn` | an empty docs delta is a legitimate outcome |
| `drift-sentinel` | `pass` | an empty entropy history is the normal state of a healthy run |

These are documented rather than harmonized: changing any of them means a divergence, a
version bump and a refreeze, for a symmetry no gate reads.
