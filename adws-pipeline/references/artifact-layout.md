# Artifact Layout — Append-Only Evidence Tree

## Contents

- Root and job id — evidence root, job id format
- Tree — the full directory layout
- File shapes — `run_manifest`, `phase_manifest`, per-phase `phase_output`,
  `corrections`, `consensus/{critic,advocate}`, `skill_trace`, `grader_verdict`,
  `entropy_history`
- Append-only rules (FR-4) — write-once, the designated post-hoc fields, evidence
  hygiene, schema discipline, timestamp integrity

Ported from ADWS_Pro `src/artifacts.js` conventions, simplified for the skill runtime.
This layout is the input contract of `scripts/execution-report.js` — do not deviate.

## Root and job id

Evidence root: `artifacts/` in the primary checkout (never inside the worktree —
worktrees are disposable, evidence is not). Job id format: `job_YYYYMMDD_NNNN`
(zero-padded sequence; scan existing `artifacts/` dirs to pick the next). Job ids and
skill ids must match `[A-Za-z0-9._-]{1,128}` and never contain `/` or `..`.

**`YYYYMMDD` is the UTC date (SC-17, arm A gap 2).** Not the local one. A live run started at
17:00 local on Aug 11 with the UTC date already Aug 12, found nothing in this document that said
which to use, and chose UTC by reading across to the timestamp rules — every `*_at` field in the
tree is UTC ISO-8601 and `evidence-integrity.js` enforces it, so a job id on local time would be
the only local-time value in the whole record and would sort against its own timestamps. That
inference was correct and it should not have been an inference: two runs on either side of a
midnight boundary can otherwise pick different sequences for the same day.

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
    │   ├── advocate.json
    │   └── repro/                  # SC-13/F-77 — corpus files for a reproduced finding
    ├── grader/                     # ship phase only (SC-15/F-85 — was verify)
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
  "cross_phase_rewinds": { "test": 0, "verify": 0, "review": 0 },
  "check_defect_repairs": 0,
  "operator_directed_rewinds": { "test": 0, "review": 0 },
  "candidate_sha256": null, "receipt": null,
  "carry_over": null, "resumed_from": null }
```
`candidate_sha256` (SC-15/F-85) is the SHA-256 of the composed patch at the moment the
drift gate passed, written at ship BEFORE the first git action. `receipt` is verify's
comparison of the PUBLISHED artifact against it:
`{ "verified": true|false, "sha256": "", "candidate_sha256": "" }`. The pair is what makes
"the thing that shipped is the thing that was graded" a checked claim rather than an
assumption — grading happens on bytes in a worktree, publishing happens over a network,
and nothing else in the tree connects them.
These are the keys the pipeline DEFINES; the shape is a floor, not a ceiling. A run may
carry additional orchestrator bookkeeping (`source_ref`, `repo_root`, `target_branch`,
`risk_level`, `intake`, `tier_source`, per-phase `phases` rollups, free-text
`operator_notes`), and `execution-report.js` reads only `job_id`, `task_id`,
`final_status`, and `failure_reason` from this file — everything else here is for the
operator and the audit trail. Extra keys are therefore not schema drift. Missing DEFINED
keys are.
`final_status` is null while running; set once to one of
`completed | failed | quarantined | canceled | halted` at terminal state.

`halted` (SC-16/F-88) is a run the OPERATOR stopped while it was healthy — not a failure, not a
cancellation. It is the fifth value because the other four all assert something a deliberate stop
does not: `completed` claims seven gates passed, `failed` and `quarantined` claim a defect, and
`canceled` routes to QUARANTINE with "human investigation required" over a run nobody needs to
investigate. Three live runs mapped an operator-directed partial run to `canceled`/`OPERATOR_CANCEL`
and each recorded that it was the closest available lie.

**A halt cannot launder a failure.** `halted` is honest only about the *stopping*; it makes no claim
about the gates. A halted run carrying a `fail` gate still QUARANTINEs, exactly as a `completed` run
carrying one does — the two branches are deliberately the same shape. What `halted` buys is the
other case: a run stopped mid-flight with nothing wrong is RETRY-and-resumable instead of
quarantined, and its worktree carries forward.

**Nor a lost phase (SC-16/F-88b).** A stop accounts for the phases AFTER it and for nothing else.
Phases with no attempt beyond the last one that produced evidence are *not reached* — expected, and
the ordinary shape of every halt. A phase with no attempt while a LATER phase has one was *skipped*,
and an attempt that wrote no readable manifest or output LOST its evidence; neither is explained by
stopping, and a halt carrying either QUARANTINEs on the same principle as the failed gate above.
The first guard shipped for this branch missed the distinction — `pipeline_completion` fails for
every non-`completed` run by construction, so it was excluded wholesale, and it answers two
questions in one status: *did this run finish* (the premise of every halt) and *did this run lose a
phase* (a finding). Excluding it excluded both, and a halted run with a skipped `review` reported
RETRY and "nothing is wrong with the run" (finding 56).
`cross_phase_rewinds` counts the GATE-AUTOMATIC rewinds to `build`, each capped at 1 and
independent of the others: `test` (checks fail, tester classifies `code`), `verify`
(grader drift BLOCK), and — since SC-7/F-46 — `review` (a Critic `fail` at the review
gate whose defect the orchestrator reproduced in the code). None of the three consumes an
ordinary build retry; see the accounting table in `references/phase-gates.md`.
`check_defect_repairs` (SC-3 A4/F-16) counts gate-defect repairs performed this job —
a `cross_phase_rewinds`-style counter capped at 1 (a second check defect terminates on
the ordinary `TEST_GATE_FAILURE`/budget path). Like `cross_phase_rewinds`, it is
orchestrator bookkeeping and is NOT read by `execution-report.js`.
`operator_directed_rewinds` (SC-6 F-37/F-39) counts rewinds the OPERATOR directed after
confirming an Advocate dissent (`resolution.action: "repair"`), keyed by the gate the
dissent came from and capped at 1 each. It is the last of the independent rewind/repair
budgets — `cross_phase_rewinds.{test,review,verify}`, `check_defect_repairs`, and this one
never draw on each other (accounting table in `references/phase-gates.md`). Alone among
them, spending it does consume
an ordinary build retry, which is what bounds the loop. Same status as its siblings:
orchestrator bookkeeping, not read by `execution-report.js`.
`isolation_mode` is `"worktree"` (this job created its own) or — since SC-13/F-73 —
`"worktree-resumed"` (this job adopted a predecessor's retained worktree under
`execution.resume_from_job`). There is no third value; a run that adopts a tree without
naming the predecessor has no way to say which of its files were ever gated.

`carry_over` (SC-13/F-73) is the PRODUCER record, written at terminal state (`SKILL.md`
§5 step 4) and `null` while running:
```json
{ "retained": true, "resumable": true, "resumable_reason": null,
  "worktree_path": "", "branch_name": "",
  "gated_through": "<last phase whose gate passed>",
  "files": [{ "path": "", "sha256": "" }] }
```
`retained: false` (the PROMOTE case, where teardown follows) needs no other key. The
per-file digests are the point: they are the only thing that later lets a successor job
tell a file this job gated from one a human edited afterwards. Nothing is staged or
committed to produce this record — hard rule 6 (commits happen only at ship) is unchanged.

`resumable` is `true` ONLY for a job that never shipped — no commit, no push, no PR, no
patch; `ship` never reached, or reached and `deferred`. A job that terminated AFTER
shipping (a verify drift BLOCK, a post-ship gate failure) has commits and possibly a live
PR attached to that branch, so its worktree is not a clean starting point: record
`resumable: false` with `resumable_reason` and let the operator resolve the shipped
artifact before anything resumes. The alternative — extending this record to describe
commit and ship state — would make it claim authority over things it was never designed
to carry, and `ship/attempt_{n}/phase_output.json` already holds them.

**A halted run reaches this record (SC-16/F-88).** Before `halted` existed, `carry_over` was written
only at a terminal state and an operator-halted run never reached one, so the rule above could not
be evaluated and `resumable: true` was unreachable for the one case that most obviously deserves
it: a healthy run, stopped on purpose, with everything it built still in the tree. That was not a
policy — nothing anywhere says a halted run may not resume — it was a gap between a record written
at terminal state and a stop that produced no terminal state. `halted` closes it by being one, and
the shipped/not-shipped test then applies unchanged: a halt before ship is `resumable: true`, a halt
after ship is `resumable: false` with the reason.

`resumed_from` (SC-13/F-73) is the CONSUMER record, written at intake by a job whose
contract names `execution.resume_from_job`, and `null` for every other job:
```json
{ "job_id": "job_YYYYMMDD_NNNN", "verified_at": "<iso>",
  "branch_name_origin": "resumed-from:{jobId}",
  "unchanged": ["<path whose digest matches the predecessor's record>"],
  "changed":   ["<path present in both, digest differs>"],
  "added":     ["<path in the tree, absent from the record>"],
  "removed":   ["<path in the record, absent from the tree>"] }
```
The classification covers every path in the tree OR the record, not just the ones that
matched. Only `unchanged` carries evidence forward, and only as far as the predecessor's
`gated_through` reached: **a digest match proves the file has not moved since that record
— never that a gate assessed it.** A file the predecessor wrote after its last passing
gate is `unchanged` and still ungated, which is why `gated_through` is recorded beside the
digests rather than instead of them. `changed`, `added` and `removed` paths carry no gate
evidence at all and must earn it in this job; the terminal report names them, `removed`
included, since a deletion is a change like any other. This exists because two consecutive
RETRY jobs carried repairs forward with the classification recorded only in free-text
`operator_notes`, which no reader and no gate can act on.

`model_tiers` maps each phase to a canonical tier name (`haiku`, `sonnet`, `opus`,
`fable`) — one entry per phase, not one tier for the whole run. It is legitimately
HETEROGENEOUS: plan/build/test/review are keyed to contract risk while document/ship/
verify are re-keyed to the recomputed `review-risk-assess` risk, so entries selected
under different risk levels sitting side by side is expected, not a defect. The
authoritative per-attempt record is `phase_manifest.model_tier` plus its `tier_input`.
Codex resolves the routing aliases `luna`, `terra`, `sol`, and `nova` only when
dispatching; aliases and provider-specific model identifiers do not enter the evidence
schema.

`phase_manifest.json`
```json
{ "phase": "", "attempt": 1, "job_id": "", "started_at": "", "completed_at": "",
  "agent": "adws-…", "model_tier": "sonnet",
  "tier_input": { "source": "contract.risk_level | review-risk-assess | retry-escalation | entropy-gate | operator-resolution | cross-phase-rewind | operator-tier-override | retry-escalation-saturated | entropy-gate-saturated | operator-resolution-saturated | cross-phase-rewind-saturated", "value": "" },
  "gate_result": "null | pass | fail | deferred", "failure_reason": null,
  "stability_gate": null, "provenance": null }
```
`failure_reason` here is the ATTEMPT-level reason and is a different vocabulary from
`run_manifest.failure_reason` — `references/phase-gates.md` lists the annotations that live only at
this level (`CRITIC_FAIL_REPAIRED`, `ADVOCATE_DISSENT_REPAIRED`) and never reach the terminal
record.

`ROUTE_NOT_EXECUTED` (SC-16/F-88) belongs to that attempt-only set: **the gate evaluated, a route
was determined from its result, and the route did not run** — because the job halted first. Record
it with `route_determined` naming what would have happened (`"rewind-to-build"`,
`"retry-attempt-2"`, `"terminate"`), so the evidence says *we knew the next step and did not take
it* rather than inventing a step that did. Every other documented value asserts something false in
this position: `CRITIC_FAIL_REPAIRED` presupposes the rewind ran, and `{PHASE}_GATE_FAILURE`
asserts a budget exhaustion that a halt at attempt 1 of 2 did not reach. A live run wrote `null`
here and explained itself in prose, which is the correct instinct and the wrong place for it.

`ROUTE_NOT_EXECUTED` is never written to `run_manifest.failure_reason` and never enters the terminal
reason vocabulary; the job-level record of a halt is `OPERATOR_HALT`. `gate_result` keeps whatever
the gate actually returned — a halt does not retroactively unmake a `fail`.
`run_manifest.skill_version` (F-72) is the `skill_version` reported by
`scripts/skill-check.js` at intake — the content digest of the installed skill that actually
ran, or the string `"unknown"` for an install predating the manifest. It is evidence, never
a gate input. It exists because a merged fix does not reach a run until someone reinstalls:
three installed copies once carried already-fixed security defects into live runs while the
source repository's own gate was green, and no artifact recorded which skill had run.

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
**F-17 disposition (SC-11/A3): closed WONTFIX-with-substitute.** F-17 asked for per-phase
invocation provenance and stayed open across five scope changes because the data is not
obtainable: the orchestrating runtime does not expose per-subagent token or cost
accounting to a skill. Across thirteen recorded field runs, every `phase_manifest.json`
carries `model_used=null, cost_usd=null, token_count=null`, and only three runs record
wall-clock at all.

So the split is now explicit rather than aspirational:

- **Structurally unavailable in this runtime** — `model_id`, `cost_usd`, `tokens_in`,
  `tokens_out`, `tool_call_count`. Keep the keys and write `null`. They are NOT removed:
  removal would be a breaking change to every recorded evidence tree and every reader,
  and an explicitly-documented-unavailable field is no less honest than an absent one.
  A reader can tell "not captured" from "field dropped" only if the field is still there.
- **Obtainable, and therefore MANDATORY** — `started_at` and `completed_at` from live
  `date -u +%Y-%m-%dT%H:%M:%SZ` at dispatch and at return, the derived `wall_clock_s`,
  the `agent` name, and `model_tier_requested` (what the orchestrator asked for, which is
  a fact it owns even when it cannot observe what answered). Only three of thirteen runs
  recorded wall-clock, so this changes behaviour, not just schema.

The advisory rule still holds for the unavailable half: absent or null telemetry NEVER
implies pass or fail, and `execution-report.js` still ignores the whole object.

The three schema shapes (SC-3 B1 present / partial / absent) are validated by a
deterministic harness in the source repository, without making provenance a gate input:
- full: `{ "model_id": "opus", "cost_usd": 0.42, "tokens_in": 18000, "tokens_out": 900, "elapsed_ms": 51200, "tool_call_count": 12, "timeout": false, "cancel": false }`
- partial: `{ "model_id": "sonnet", "elapsed_ms": 8300, "tool_call_count": 4 }` (runtime exposed no cost/token counts — omit or null, never a fabricated zero)
- absent: `null` (no telemetry available)
`tier_input.source` names what selected this attempt's model tier. `operator-resolution`
is the dissent-resolution re-attempt source (F-6): a re-review the operator triggered to
clear a dissent they judged a false positive. It escalates one tier on the same ladder as
`retry-escalation` (haiku → sonnet → opus → fable, capped at fable), and its `value`
records the resolved dissent's location —
`"{phase}/attempt_{n}/consensus/advocate.json"`. See `references/phase-gates.md`
"Consensus" for the flow.
`cross-phase-rewind` (SC-7/F-48) records the tier of a `build` attempt opened by a rewind
— from failing test checks, a verified Critic fail, a grader drift BLOCK, or a
check-defect repair. Its `value` names the origin attempt (`"review/attempt_1"`,
`"test/attempt_2"`, `"verify/attempt_1"`). It escalates one tier on the standard ladder
for the same reason F-6 and F-37 do: the previous tier produced work an independent
assessor or an executed check faulted. The FORWARD re-run of downstream phases after the
rewind is not a retry and records the ordinary `contract.risk_level` /
`review-risk-assess` source at the table tier.
`operator-tier-override` records an explicit operator tier election; it is the only
source that may select `fable` outright, since no table cell mandates that tier (it is
otherwise reachable only by escalating off `opus`).
The four `*-saturated` sources record an escalation requested when the agent was
already at the `fable` ceiling: the tier is unchanged, the retry is consumed as usual,
and the marker keeps a real escalation distinguishable from a no-op. They change no
gate, budget, or verdict.
`gate_result` is `null` as written by the phase agent (the pre-gate state; the
orchestrator overwrites it post-hoc per rule 2 below) and normally `pass`/`fail`
once the gate is decided. `deferred` (F-5) is a ship-only intermediate: a
`pr`-mode push that failed on detected missing credentials awaits an operator-delegated
push and does NOT consume the retry budget. On operator confirmation the SAME attempt's
gate flips to `pass` (see ship `phase_output.delegation` below); a timeout/refusal makes
it `fail`. A terminal report on a `completed` job should not see a `deferred` ship gate —
the delegation resolves first.

`phase_output.json` — phase-specific. Required minimums:

- plan: `{ "plan_summary": "", "file_change_proposal": [{ "file_path": "", "action": "create|modify|delete", "description": "" }], "criteria_map": [], "planning_blocked": false, "planning_blocked_reason": null }` (each proposal's `description` — what changes and why — is required; the build-gate `repo-context-scan` validator warns on any proposal whose `description` is missing or under 3 chars). `planning_blocked` is `true` only when the contract cannot be planned at all — a criterion is unimplementable inside `allowed_paths` — in which case `planning_blocked_reason` states why and the planner invents no plan rather than guessing.
- build: `{ "files_changed": [{ "file_path": "", "action": "" }], "diff_summary": "", "implementation_notes": "", "regression_check_ids": [] }` — `regression_check_ids` (SC-13/F-76) is required only on an attempt that followed a rewind carrying a `code` correction, and echoes the `regression_check_id` of every such correction: the permanent checks this attempt added or extended to keep the repaired defect from returning. `[]` or absent on an ordinary build attempt. Ids are criterion ids where a criterion covered the finding and correction-scoped `REG-…` ids where none did. The forward test re-run verifies these SEPARATELY from the SC-5/F-31 criterion-coverage join — that join only proves some check answered the criterion, and a criterion may legitimately carry several checks, so an OLDER row for the same criterion would satisfy it while the new regression assertion never ran. See `references/phase-gates.md` "Regression coverage for a repaired defect" for what the test gate requires instead.
- test: `{ "checks": [{ "check_id": "", "check": "", "criterion": "", "pass": true, "output": "", "baseline_pass": false, "baseline_reason": "assertion-failed-runtime-present | collection-error | not-run | null", "falsifiable": true, "verdict": "verified | gate_weak | fail", "check_role": "required | supplemental", "classification": "null | code | check | environment | prerequisite" }], "command_log": [] }` — `check_id` is the id of the `criteria-to-checks` spec this check answers (SC-5/F-31), and is what makes coverage machine-checkable: several checks MAY share one `check_id` when a criterion needs more than one, but every emitted spec id must appear at least once. It is the same key `corrections.json` already carries below, so a routed correction now joins back to its criterion by id rather than by prose match. The `baseline_*`/`falsifiable`/`verdict` fields carry the SC-3 A1/A2 falsifiability result (present when `test_policy: required` or `policy.falsifiability: true`); a `gate_weak` verdict is an unverified criterion (warn), never a pass. `baseline_reason` names WHY a pre-change baseline was not a clean pass, so it is enum-valued **if and only if `baseline_pass: false`** — `assertion-failed-runtime-present` for a valid red (the feature was absent), `collection-error`/`not-run` for an invalid red (the runtime could not execute). When `baseline_pass: true` — the check passed pre-change, which is the FIRST `gate_weak` case in `references/phase-gates.md` ("no red baseline") — there is no red to characterize and `baseline_reason` is **`null`, which is REQUIRED there, not a fourth enum member**; a green baseline has no reason to state, so the tester writes `null` rather than improvising a prose string into the field (SC-18/F-91, closing finding 39: the enum row above formerly omitted `null` and a strict reader rejected the honest value — the table was the bug, not the recorded evidence). On a `fail` verdict, `classification` records WHY the tester attributes the failure — the orchestrator routes on it (A3/A4) and copies it into `corrections.json`; `null` otherwise. `check_role` (SC-18/F-92, closing arm A gap 11) records whether a check is `required` — it answers the criterion's core outcome, the DEFAULT, and the only value a `criteria-to-checks` spec ever carries since every emitted spec is required by construction — or `supplemental`: a no-regression / parity guard the tester adds that has no red baseline BY CONSTRUCTION (it asserts existing behavior is preserved) and is therefore expected to be `gate_weak`. The distinction is what lets a criterion carrying several checks be aggregated into one verdict without either masking a real gap or over-blocking a genuine pass: a `gate_weak` on any *required* row holds the criterion at `gate_weak` (never masked by a verified sibling), while a `supplemental` `gate_weak` is surfaced as a warn and does NOT pull below `verified` a criterion its required checks verified — and a `fail` on ANY row, either role, fails the criterion. It is NOT derivable from `baseline_pass`/`falsifiable` — a *required* check may also legitimately pass pre-change (the primary `gate_weak` case, F-91), and that required `gate_weak` is a gap that must not be masked — so the tester states the role; the full aggregation rule and its two pinned constraints live in `references/phase-gates.md`.
- review: `{ "findings": [], "risk_level": "", "approved": true }`
- document: `{ "docs_delta": [], "changelog_entry": "", "documentation_summary": "" }`
- ship: `{ "mode": "", "branch_name": "", "pr_url": null, "patch_file": null, "commit_sha": "", "pushed": false, "block_reason": null, "delegation": null }` — `delegation` (optional, F-5) is present only for a delegated `pr`-mode push: `{ "status": "pending-operator | completed", "detected_reason": "NO_PUSH_CREDENTIALS_IN_SANDBOX | …", "completed_by": "operator", "completed_at": "<iso>" }`. The shipper writes `pushed: false` + `delegation.status: "pending-operator"` when it detects it cannot push; the ORCHESTRATOR later writes `delegation.status: "completed"` + `pr_url` post-hoc (never the shipper).
- verify: `{ "verify_result": { "passed": 0, "total": 0, "syntax_errors": 0, "checks": [{ "check": "", "pass": true }] }, "drift_verdict": "PASS | WARN | BLOCK" }`

`corrections.json` — build attempts only, present only when this attempt follows a
rewind-to-build (SC-3 A3/F-15). Written ONCE by the ORCHESTRATOR into the fresh build
`attempt_{n}/` directory BEFORE it dispatches the builder — the structured, auditable
form of the rewind feedback, replacing the previous free-text channel:
```json
{ "source_attempt": "test/attempt_{n} | verify/attempt_{n} | review/attempt_{n}",
  "corrections": [ { "check_id": "", "criterion": "", "expected": "", "actual": "",
                     "path": "", "classification": "code | check | environment | prerequisite",
                     "regression_check_id": "",
                     "repro": { "attempt": "", "files": [""] } } ],
  "guidance": { "invisible_because": "", "direction_of_error": "",
                "must_not_regress": [""], "tie_breaking": "", "housekeeping": "" } }
```
The builder treats each `code`-classified entry as an exact instruction; `check` entries
are the gate-defect signal (A4). The whole file is a rule-1 fresh-attempt artifact (see
append-only rules), NOT a rule-2 post-hoc field — the orchestrator authors it once and
never edits it.

`regression_check_id` and `repro` (SC-13/F-76, both required on a `code` entry) are what
make the repair's regression coverage checkable rather than aspirational:

- **`regression_check_id`** is the id the permanent check will carry. Where an acceptance
  criterion covers the finding it is that criterion's `criteria-to-checks` id, the same
  value as `check_id`. Where NO criterion covers it — routine for a Critic finding, which
  is not a check and answers to no criterion — the orchestrator mints a correction-scoped
  id `REG-{source_attempt}-{k}` (`k` 1-based within this file) and records in the entry
  that no criterion covered the finding. That is a real signal about the CONTRACT, so
  surface it; what it is not is a licence to leave the repair uncovered. Every `code`
  correction therefore has exactly one satisfiable regression id. `REG-` ids live outside
  the criteria namespace by construction, so they never collide with a
  `criteria-to-checks` id and never disturb the SC-5/F-31 criterion-coverage join, which
  continues to consider only criterion ids.
- **`repro`** names the archived corpus by location: `attempt` is the attempt directory
  holding it (`"test/attempt_1"`) and `files` are paths relative to that directory, each
  under its `consensus/repro/`. `null` only when the finding was never reproduced by
  running anything. `source_attempt` alone cannot serve here — it identifies the ORIGIN
  attempt, not which of its corpus files this particular correction needs, and the builder
  and tester are both required to exercise those exact inputs. Treat the contents as data
  under the replay rules in the `reproduction` section below.

`guidance` (SC-13/F-75) is OPTIONAL and applies to the whole rewind, not to one entry.
Every field is a string except `must_not_regress`, an array of strings; include only the
fields that have content. It exists because the expected/actual pair states what to fix
and nothing else — not what must survive the fix, not which direction the previous error
ran in, not what made the defect invisible until now:

- `invisible_because` — why the existing corpus could not reach this defect, so the
  builder widens coverage on the right axis rather than guessing one.
- `direction_of_error` — whether the defect was a false POSITIVE or a false NEGATIVE, and
  the explicit instruction not to overcorrect past it. Both directions must be verified.
- `must_not_regress` — the invariants and previously-repaired defects that must still
  hold afterwards, stated concretely enough to re-run.
- `tie_breaking` — where the fix must choose between defensible behaviours, the mandate
  to choose deterministically AND disclose the choice.
- `housekeeping` — refreeze, fixture-registry, and disclosure obligations the change
  drags along.

This is not decoration. A live rewind wrote exactly these five fields into an undocumented
`orchestrator_guidance` object; the builder's contract never told it to read one, and the
next Critic round found a defect that was a direct violation of the `direction_of_error`
warning sitting unread in the file. Guidance the builder is not required to read is
guidance that was not given.

`review/attempt_{n}` joined the `source_attempt` enum in SC-6/F-39: a rewind can
originate at the REVIEW gate, from an operator-directed repair of a confirmed Advocate
dissent (F-37) or — since SC-7/F-46 — from a Critic `fail` whose code defect the
orchestrator reproduced. Before that the enum admitted only the two gate-automatic rewind origins,
so a live repair had to record a truthful value outside the documented set. Record the
real origin always — a conforming but false `source_attempt` is worse than an
out-of-enum true one, and this enum exists to be widened when a new origin is defined.

`consensus/critic.json` and `consensus/advocate.json`
```json
{ "role": "critic | advocate", "verdict": "pass | fail", "dissent": null,
  "findings": [{ "issue": "", "evidence": "", "reproduction": null }],
  "model_tier": "", "assessed_at": "" }
```
**NEITHER agent writes `resolution`.** It is an advocate-only key, and the ORCHESTRATOR adds it
post-hoc when an operator resolves a dissent — see the `resolution` paragraph below, which has
always said "never by the Advocate agent", and `.claude/agents/adws-advocate.md`, whose template
omits the key and whose prose says "you never write `resolution`". An `advocate.json` with no
`resolution` key is CORRECT and complete; the reader treats an absent key and an explicit `null`
identically (`normalizeResolution` in `scripts/execution-report.js`).

*This paragraph used to open "`advocate.json` carries ONE further key, `"resolution": null`", and
that was the bug (SC-17, arm A gap 6).* Two live runs recorded an Advocate "omitting" the key —
arm A1 and arm A3, independently — and both were reading THIS line rather than the agent it
describes. The agent was right and the sentence describing it was wrong. Worth noting how it got
here: SC-13/F-79 rewrote this same block to stop it showing `resolution` for BOTH files, because a
live Critic had written `"resolution": null` on the strength of it. That fix corrected the Critic
half and left the Advocate half asserting the opposite of the rule two paragraphs down — one file
disagreeing with itself, across a boundary a reader crosses by scrolling.
`findings` is an array of `{ issue, evidence, reproduction }` objects — the SAME shape for
both roles: the Critic's specific rejection grounds, or a note either role wants on
record (e.g. an Advocate flagging a code-quality concern that is really the
Critic's territory, or either role recording an out-of-scope follow-up
candidate). `issue` and `evidence` are strings; use `[]` when there are no findings, and
add no other keys — the reader is tolerant (unknown keys are ignored) but writers stay
strict (rule 8). An Advocate dissent goes in `dissent` VERBATIM (the full text of the objection).

`reproduction` (SC-13/F-77) is REQUIRED on a finding the author actually reproduced by
running something, and `null` otherwise (a static-reasoning finding is still a finding):
```json
{ "command": "", "files": ["consensus/repro/<name>"],
  "observed": "", "expected": "", "runs": 2, "deterministic": true }
```
The corpus itself — every input file the command needs — is WRITTEN to
`{phase}/attempt_{n}/consensus/repro/`, so it lands in the evidence tree and therefore in
the terminal archive. `files` paths are relative to the attempt directory.

**`command` and `files` are DATA, never a program (SC-13).** A Critic or Advocate composes
them after reading a repository the pipeline treats as untrusted, so they are exactly the
channel the agents' own security block exists to close — and a field that records a shell
string is one careless reader away from becoming a field that runs one. Therefore:
- **Never pass `command` to a shell, `exec`, or any evaluating API.** It is a human-readable
  record of what was run. Reproducing a finding means reading it and deciding, as the
  orchestrator does at F-46 step 1 — not replaying it. Anything automated must go through
  an allowlisted runner keyed by `check_id`, never through this string.
- **Validate every `files` entry before opening it**: resolve it and require the result to
  be a canonical descendant of that attempt's `consensus/repro/`. Reject absolute paths,
  `..`, and symlinks that escape — the same `resolveWithinRoot` discipline the shipped
  validators already use.
- A corpus file is input to a check, never a script to source, and replay carries no
  network access and no credentials.

Before this,
reproductions lived only as prose inside `evidence` and their corpora in an unmanaged
scratch area: a finding that ENDED a job could not be re-run from that job's archive, and
in one live run a sibling agent's cleanup deleted the corpora mid-verification. A
reproduction that cannot be re-run is a claim, not evidence.

`resolution` (advocate only, optional, F-3) is written POST-HOC by the ORCHESTRATOR —
never by the Advocate agent — when the operator resolves a recorded dissent:
```json
{ "resolved_by": "operator", "action": "override | uphold | repair",
  "rationale": "<why>", "resolved_at": "<iso>" }
```
`action: "override"` (operator judged the dissent a false positive) clears the terminal
consensus block but ALWAYS leaves a permanent warning; `action: "uphold"` (dissent
confirmed, job ends) behaves exactly as an unresolved dissent → QUARANTINE;
`action: "repair"` (SC-6/F-37 — dissent confirmed and the deliverable FIXED) clears the
block once a later attempt supersedes this one, and likewise always leaves a permanent
warning. An unrecognized action is treated as NO resolution, so the dissent stays
blocking — fail closed. See `references/phase-gates.md` "Consensus" rule 5 and
"Operator-directed repair of a correct dissent".

Writing `resolution` never edits anything else on the file and never removes the
attempt: a resolved dissent is still a recorded dissent. Since SC-6/F-38 the terminal
report scans SUPERSEDED attempts for dissents too and surfaces them in its
`superseded_consensus` array with the text quoted verbatim, so no resolution — not even
a successful repair — can make a dissent disappear from the record.

`skills/{skill_id}/skill_trace.json` — wrap the validator CLI's stdout:
```json
{ "skill_id": "", "version": "", "started_at": "", "completed_at": "",
  "rubric_result": "pass | warn | fail", "latency_ms": 0, "error": null,
  "output": { } }
```
`output` is the full JSON object printed by the validator script.

**`skill_id` and `version` are TRANSCRIBED, never guessed (SC-16/F-89).** Every validator prints
`skill_id` and `tool_version` as the first two keys of its verdict:

| Wrapper key | Source | Note |
|---|---|---|
| `skill_id` | `output.skill_id` | also the `skills/{skill_id}/` directory name |
| `version` | `output.tool_version` | the validator's own `manifest.version` |

**The ids are DOTTED and do not match the filenames.** `task-normalize.js` announces
`task.normalize`; `repo-context-scan.js` announces `repo.context_scan`. An orchestrator that
derived the directory from the filename would write `skills/task-normalize/` and be wrong on
**every trace in the tree** — one path convention, applied uniformly, silently. The canonical list
is in `references/validator-inputs.md`, and the authority is the running validator: read
`output.skill_id`.

Before this, both keys were mandatory with no documented source. `version` had none at all, and a
live orchestrator recovered the ids by reading three validator SOURCE files mid-run. The values
always existed in each script's `manifest`; nothing printed them. This is the same shape as
`repo-context-scan` reading the plan — two correct halves, never connected.

**The wrapper is a transcription, never a judgment (SC-8/F-55).** `rubric_result` MUST be
exactly the verdict the validator printed — the same value `output.rubric_result` carries —
and `error` holds the validator's own error or `null`, never an override, annotation, or
rationale. There is no operator override for a validator verdict: a `fail` the operator
judges wrong is a defect in the VALIDATOR, fixed there and re-run, not adjudicated in the
evidence. `execution-report.js` cross-checks the two and, on disagreement, scores the row
from the validator's stdout and quarantines the job — an evidence-integrity breach, the
same class as `MISSING_UPSTREAM_ARTIFACT`. This rule predates the check by five scope
changes; a live run wrote `"warn"` over an `output.rubric_result` of `"fail"` precisely
because nothing asserted it.

`grader/grader_verdict.json` — the adws-grader agent's output (same shape as the
original `pr.drift_sentinel.spec` result): `rubric_result`, `criteria_results[]` with
per-criterion `satisfied | partial | unaddressed | contradicted` verdicts, `summary`.
Written under `ship/attempt_{n}/` since SC-15/F-85: the grader is the last gate before
publication, not the first after it. Trees recorded before that carry it under
`verify/attempt_{n}/`, which is where a reader of an older job should look.

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
   **Enforced by `scripts/secret-scan.js` since SC-19/F-96** (closing F-81), which the
   orchestrator runs over `artifacts/{jobId}/` at the terminal report — before step 5
   archives the tree, because SC-11/A5 makes that archive a durable destination outside
   the worktree and SC-13/F-77 fills it with verbatim copies of an untrusted repository.
   From SC-2 until then this rule was carried byte-identically by all ten agents and
   verified by none of them: `agent-blocks-lint.mjs` proves they all say it, which is not
   evidence that any of them does it. A self-identifying credential format FAILS (the
   match is a fact); a key whose name suggests the value beside it is sensitive WARNS (the
   match is an inference) — and `[REDACTED]` is never either, or the check would punish
   the behaviour this rule exists to produce. The report carries a location and a
   fingerprint, never the matched string, because the report is evidence and lands in the
   same archive.
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
   dual-evidence bar. `null` is not a placeholder — it is an honest "not known yet"
   (`completed_at` while a phase runs, the structurally-unavailable provenance keys) and
   is always permitted; `"--"` is the opposite, a field claiming a value it does not have.
   **Enforced by `scripts/evidence-integrity.js` since SC-15/F-84b**, which the
   orchestrator runs over `artifacts/{jobId}/` at the terminal report. Between SC-13 and
   then this rule was prose only, and a live run wrote `"performed_at": "--"` into a
   reproduction record that passed every gate the skill has. Rule 8's strict-writer half
   and the write-once discipline of FR-4 are still prose: both are rules about WHO WROTE a
   field, and a finished tree does not record authorship, so no reader can decide them.
