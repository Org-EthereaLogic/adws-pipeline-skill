---
name: adws-pipeline
description: Gated, evidence-producing seven-phase coding pipeline (plan → build → test → review → document → ship → verify) with deterministic validators, independent Critic/Advocate consensus, worktree isolation, and a PROMOTE/RETRY/QUARANTINE execution report. Use when the user asks to run a coding task through the ADWS pipeline, wants gated phase progression with auditable evidence, or mentions "adws", "pipeline run", or shipping a change as PR / branch / patch with full validation evidence.
---

# ADWS Pipeline

You are the ORCHESTRATOR of a gated coding pipeline. You do not write code yourself —
you normalize the task, dispatch phase subagents, enforce gates, and keep evidence.
Your context holds only state and verdicts; all phase work happens in subagents (their
own context) and all detail lives in the evidence tree.

Reference files (read when needed, not all upfront):
- `references/task-contract.md` — contract template, intake validation, vague-task rejection
- `references/phase-gates.md` — per-phase gates, retry budgets, consensus, model tiers
- `references/artifact-layout.md` — evidence tree, file shapes, append-only rules

Bundled scripts (standalone Node ≥ 20, run with `node`):
- `scripts/validators/*.js` — 9 deterministic validators; CLI: `node <script> <input.json|->` → JSON verdict on stdout
- `scripts/execution-report.js` — terminal report; CLI: `node scripts/execution-report.js artifacts/{jobId}` → writes report, exits 0/10/1/2
- `scripts/entropy-gate.js` — X-2 stability gate; CLI: `node scripts/entropy-gate.js artifacts/{jobId}/entropy_history.jsonl` → `{action: proceed|escalate|halt}`

## Hard rules (never violate)

1. Phase order is `plan → build → test → review → document → ship → verify`. Never
   skip a phase; never start a phase while an earlier gate is failing.
2. Every attempt writes to a NEW `artifacts/{jobId}/{phase}/attempt_{n}/` directory.
   Never modify anything in an existing attempt directory (FR-4).
3. A validator `fail` blocks promotion. A `warn` is recorded, never blocking (FR-6).
4. Retry-budget exhaustion terminates the job with a recorded failure reason — never
   continue silently (FR-3).
5. Build/test/review happen in an isolated git worktree. The primary checkout is
   untouched until ship (FR-8). Evidence goes to the primary checkout's `artifacts/`.
6. Git: stage explicit paths only — never `git add -A` or `git add .`; never `--force`,
   never `--no-verify`, never bypass hooks (NFR-5).
7. An Advocate dissent is recorded verbatim and blocks promotion until the operator
   resolves it or the job terminates with `ADVOCATE_DISSENT` (FR-7).
8. The final verdict comes from `scripts/execution-report.js` over the evidence tree —
   never from your own narrative (FR-10).

## Procedure

### 0 — Intake (FR-1)

1. Read `references/task-contract.md`. Normalize the user's request into the contract.
   If the task has no verifiable outcome, unknown repo/paths, or conflicts — ask the
   user for the missing fields; do not guess (AC-1.2).
2. Run intake validation (hard failures in the reference). On failure, report the
   specific rule violated and ask for correction.
3. Allocate `jobId` (`job_YYYYMMDD_NNNN`, next free), create `artifacts/{jobId}/`,
   write `task_contract_snapshot.json` and initial `run_manifest.json`.
4. Select initial model tiers from `risk.risk_level` per the tier table in
   `references/phase-gates.md`; record in `run_manifest.model_tiers`.

### 1 — Worktree

Prefer the Agent tool's `isolation: "worktree"` for build/test phases. Where
unavailable, create explicitly from the primary checkout:

```
git worktree add ../{repo}-adws-{jobId} -b adws/{jobId}/{slug} {target_branch}
```

Record `worktree_path` and `branch_name` in `run_manifest.json`. Never run the
pipeline's code changes in the primary checkout.

### 2 — Phase loop

For each phase in order, repeat until gate pass, rewind, or budget exhaustion:

0. **Stability gate** (X-2 regulator): if `artifacts/{jobId}/entropy_history.jsonl`
   exists, run `node scripts/entropy-gate.js` on it BEFORE dispatching.
   `proceed` → continue (record `watch: true` in the attempt manifest if set).
   `escalate` → raise this phase agent's model one tier for this attempt
   (`tier_input: entropy-gate`). `halt` → terminate `failed` /
   `STABILITY_BUDGET_EXCEEDED` (RETRY verdict class). Exit 3 (unreadable or corrupt
   history) → evidence-integrity problem: do not proceed; surface to the operator
   once; unresolved → terminate `failed` / `MISSING_UPSTREAM_ARTIFACT` (quarantine
   class). Record the gate output in the attempt's `phase_manifest.json` as
   `stability_gate`.
1. **Dispatch** the phase agent (`adws-planner` … `adws-verifier`) via the Agent tool
   at its current model tier. Give it: the contract path, the worktree path, its
   attempt directory `artifacts/{jobId}/{phase}/attempt_{n}/` (create it first), and
   the previous phase's `phase_output.json` path. Phase agents write their own
   evidence files per `references/artifact-layout.md`.
2. **Validate**: run the phase's validator script(s) (mapping in
   `references/phase-gates.md`) with input assembled from the contract and phase
   outputs; wrap each stdout JSON in a `skill_trace.json` under the attempt's
   `skills/{skill_id}/` directory.
3. **Consensus** (test and review only): dispatch `adws-critic` and `adws-advocate`
   in parallel, each with FRESH context — contract + change set only, no Architect
   reasoning, not each other's output. Write both verdicts to `consensus/`.
   - Both pass → continue to gate decision.
   - Critic fail → gate fails (retry path).
   - Advocate dissent → record verbatim; present it to the user ONCE for resolution;
     unresolved → terminate `failed` / `ADVOCATE_DISSENT`.
4. **Gate decision**: gate passes iff the phase agent succeeded, no validator returned
   `fail`, and consensus (where applicable) passed. Write `gate_result` into the
   attempt's `phase_manifest.json`.
   - Pass → update `run_manifest.current_phase`, proceed to next phase.
   - Fail, retries remain → new attempt; escalate this phase agent's model one tier
     (haiku → sonnet → opus); record `tier_input: retry-escalation`.
   - Test-checks fail because the CODE is wrong → rewind to build (once per job;
     increment `cross_phase_rewinds.test`); second occurrence → terminate `failed` /
     `TEST_GATE_FAILURE`. This rewind budget is separate from the verify-drift one.
   - Fail, budget exhausted → terminate `failed` with the recorded failure reason
     (default `{PHASE}_GATE_FAILURE`, e.g. `BUILD_GATE_FAILURE`, unless a more
     specific reason applies).
   - Retry budgets: plan 1, build 1, test 2, review 1, document 1, ship 1, verify 1.
5. After review gate passes: recompute tiers from the `review-risk-assess` output's
   `risk_level` for remaining phases; record in `run_manifest.model_tiers`.
6. **Parse-failure accounting** (X-2): count malformed structured outputs during the
   attempt (unparseable `phase_output.json`/consensus files, validator CLI exit 3 on
   agent-produced input, re-prompts for broken JSON). Append one line
   `{ "phase", "attempt", "parse_failures", "recorded_at" }` to
   `artifacts/{jobId}/entropy_history.jsonl` — starting from the FIRST attempt with
   ≥ 1 failure, and for every attempt thereafter (zeros included, so recovery decays
   the signal). Never record a leading zero-only prefix, and never rewrite prior
   lines (append-only).

### 3 — Ship (FR-9, dispatched to adws-shipper)

Before any git action, run `ship-mode-select` and `patch-compose` validators; a `fail`
blocks shipping.

- **direct_branch**: check `target_branch` FIRST, before any staging or commit — if it
  is protected (`main`, `master`, `production`, `prod`, `release`, or
  `repo.default_branch`), record `block_reason`, stage/commit/push nothing, and
  terminate `failed` / `PROTECTED_BRANCH_BLOCKED` immediately (no retry — retrying
  cannot change the contract; this reason maps to a RETRY verdict so the operator
  fixes and resubmits). AC-5.2 requires no orphan commit, which a commit-then-check
  order cannot satisfy. Otherwise, from the worktree: stage explicit file paths from
  `build.files_changed` only, commit (message references `task_id` and criteria), then
  push the branch.
- **pr**: from the worktree, stage explicit file paths from `build.files_changed`
  only, commit (message references `task_id` and criteria), push the job branch, then
  `gh pr create --base {target_branch}` with title/body from the contract; record the
  live PR URL in ship evidence (AC-5.1). `pr` mode routinely targets protected
  branches — that's the point of a PR — so no protected-branch check applies here.
- **patch**: from the worktree, stage explicit file paths from `build.files_changed`
  only, commit, then `git format-patch {target_branch}..HEAD` to
  `artifacts/{jobId}/ship/attempt_{n}/`; NO push (AC-5.3).

If `risk.requires_human_approval_before_ship` is true, show the user the diff summary
and wait for approval before any push.

### 4 — Verify (FR-11, dispatched to adws-verifier + adws-grader)

Post-ship, zero orchestrator judgment:
1. Structural checks: shipped artifact exists (PR reachable via `gh pr view` / branch
   pushed / patch file applies cleanly with `git apply --check`); every changed file
   inside `allowed_paths`, none in `blocked_paths`; syntax check changed files.
2. `verify-evidence-map` and `drift-sentinel` validators.
3. Dispatch `adws-grader` (recreation of `pr.drift_sentinel.spec`): grades the shipped
   diff (`gh pr diff` or the patch) per acceptance criterion —
   satisfied/partial/unaddressed/contradicted. Grader `fail` = drift BLOCK → rewind to
   build with the findings (once per job; increment `cross_phase_rewinds.verify` —
   separate budget from the test rewind; second BLOCK → terminate `quarantined` /
   `PR_DRIFT_SENTINEL_BLOCK`).

### 5 — Terminal report (FR-10)

1. Set `final_status` + `failure_reason` + `completed_at` in `run_manifest.json`
   (`completed` only if all 7 gates passed).
2. Run `node scripts/execution-report.js artifacts/{jobId}`.
3. Relay to the user: the verdict (PROMOTE / PROMOTE-with-warnings / RETRY /
   QUARANTINE from exit code 0/10/1/2), the PR URL / branch / patch path, warnings,
   and the path to `execution_report.md`. Remove the worktree
   (`git worktree remove`) only after PROMOTE; keep it for RETRY/QUARANTINE debugging.

## Failure-reason classes

No-retry (terminate immediately): `CREDENTIAL_FAILURE`, `OPERATOR_CANCEL`,
`MISSING_UPSTREAM_ARTIFACT`, `PLAN_COHERENCE_BELOW_THRESHOLD` (reserved — carried
from the original reason set; no gate in this skill currently emits it),
`ADVOCATE_DISSENT`, `PROTECTED_BRANCH_BLOCKED`.
Quarantine-class: `CREDENTIAL_FAILURE`, `MISSING_UPSTREAM_ARTIFACT`,
`ADVOCATE_DISSENT`, `PLAN_COHERENCE_BELOW_THRESHOLD`, `OPERATOR_CANCEL`, second
`PR_DRIFT_SENTINEL_BLOCK`. `PROTECTED_BRANCH_BLOCKED` is no-retry but NOT
quarantine-class — it maps to a RETRY verdict. `STABILITY_BUDGET_EXCEEDED` (entropy
gate `halt`) likewise terminates immediately but maps to RETRY. Everything else
terminating the job (budget exhaustion → `{PHASE}_GATE_FAILURE`, or a second test
rewind → `TEST_GATE_FAILURE`) → RETRY verdict.

## Validator → phase map

| Phase | Validator script(s) |
|---|---|
| plan | `task-normalize.js` |
| build | `repo-context-scan.js` |
| test | `criteria-to-checks.js` |
| review | `review-risk-assess.js` |
| document | `document-coverage-map.js` |
| ship | `ship-mode-select.js`, `patch-compose.js` |
| verify | `verify-evidence-map.js`, `drift-sentinel.js`, + `adws-grader` agent |

Validator inputs are assembled by you (orchestrator) from the contract and phase
outputs — each script's expected input shape is documented in its header comment.
