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
- `references/validator-inputs.md` — validator input assembly table (headers stay canonical)

Bundled scripts (standalone Node ≥ 20, run with `node`):
- `scripts/validators/*.js` — 9 deterministic validators; CLI: `node <script> <input.json|->` → JSON verdict on stdout
- `scripts/execution-report.js` — terminal report; CLI: `node scripts/execution-report.js artifacts/{jobId}` → writes report, exits 0/10/1/2
- `scripts/entropy-gate.js` — X-2 stability gate; CLI: `node scripts/entropy-gate.js artifacts/{jobId}/entropy_history.jsonl` → `{action: proceed|escalate|halt}`

## Environment & runtimes (F-9)

The bundled scripts need only Node ≥ 20 (and `gh` for `pr` mode). But the TARGET
repository's test and verify phases usually need repo-specific runtimes the pipeline
does not ship — a PHP project needs PHP, a Python one needs Python, etc. These are the
tester's and verifier's concern, not the orchestrator's: when a required runtime is
absent, a check must degrade HONESTLY — record `"pass": false` with output `NOT RUN`,
or use a documented substitute (E2E-1 ran PHP checks via php-wasm under Node) — and
NEVER an assumed pass. A skipped or unrunnable check is evidence of a gap, not a
green light; plan checks around the runtimes actually available and say so in the
phase log.

The same honesty governs the SC-3 falsifiability baseline (A2): a pre-change check that is
red only because it could not execute (`NOT RUN` / collection error) is NOT a valid red —
the runtime is missing, not the feature — so its criterion is recorded `gate_weak`
(unverified), never `verified`. See `references/phase-gates.md` "Falsifiability at the
test gate."

**Host-runtime blindness (F-13, field-validated issue #111).** The test and verify
phases run wherever the ORCHESTRATOR runs — often a Linux / bash-5 cloud container —
which can differ from the TARGET runtime a generated project actually executes on.
macOS ships bash 3.2, where expanding an empty array `"${arr[@]}"` under `set -u`
raises `unbound variable` and aborts (a bash bug fixed only in 4.4); a change can
PROMOTE green in-container yet crash on the target host. Container-green is NECESSARY,
NOT SUFFICIENT. When a change touches shell — or any runtime whose behavior is
version/OS-sensitive — the tester MUST exercise it on the target runtime, or the ship
step MUST re-validate there before merge: render a scaffold and run the affected
scripts under the target's own interpreter, driving edge inputs (empty lists/arrays,
embedded tabs/newlines) that trip version-specific behavior, and diff against a
baseline render. A failure-set parity check alone misses this unless the new tests
themselves exercise those edges under the target interpreter.

### Agent-type fallback (F-11)

The `adws-*` agent definitions in `.claude/agents/` register as subagent types in
Claude Code, but other runtimes (e.g. Cowork/cloud sessions) may not load them. When a
phase agent's type is not registered, do NOT skip the phase or run it yourself:
dispatch a general-purpose subagent with the corresponding `adws-*.md` body inlined
VERBATIM into its prompt (spec first, then the phase inputs), apply the model tier via
the dispatch mechanism's model option, and record the usual `agent` name in
`phase_manifest.json`. The inlined spec must include the agent's Security paragraph
and evidence-integrity rules — the fallback changes the transport, never the contract.
For the single-file writers (Critic, Advocate, Grader), the dispatch prompt must ALSO
explicitly instruct: write the output file with the file-writing tool at the exact
given path, take timestamps from a live `date -u +%Y-%m-%dT%H:%M:%SZ`, and verify the
file exists (e.g. `ls -l` it) before finishing — at haiku tier the spec text alone has
not been sufficient (an agent may return its verdict in its final message without
writing the file); the orchestrator still verifies the file exists and parses before
deciding the gate.
Field-validated end to end in `docs/field-runs/2026-07-18-issue103-agentic-starter-kit.md`;
the single-file-writer dispatch note in `docs/field-runs/2026-07-19-issue107-agentic-starter-kit.md`.

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
   In Codex, route those canonical tiers through the aliases `luna`, `terra`, and
   `sol` defined in that reference. Keep canonical tier names in evidence so existing
   validators and reports remain compatible.

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
   at its current model tier (agent type not registered in this runtime → F-11
   fallback in "Environment & runtimes"). Give it: the contract path, the worktree path, its
   attempt directory `artifacts/{jobId}/{phase}/attempt_{n}/` (create it first), and
   the previous phase's `phase_output.json` path. Phase agents write their own
   evidence files per `references/artifact-layout.md`. Where the runtime exposes per-phase
   telemetry (model id, cost, tokens, wall-clock, tool-call count, timeout/cancel), record
   it in the attempt's `phase_manifest.provenance` (SC-3 B1/F-17) — ADVISORY only; absent
   or partial telemetry never affects the gate, and `execution-report.js` ignores it.
2. **Validate**: run the phase's validator script(s) (mapping in
   `references/phase-gates.md`) with input assembled from the contract and phase
   outputs; wrap each stdout JSON in a `skill_trace.json` under the attempt's
   `skills/{skill_id}/` directory.
3. **Consensus** (test and review only): dispatch `adws-critic` and `adws-advocate`
   in parallel (MANDATORY — they have no data dependency on each other; see
   `references/phase-gates.md` "Consensus"), each with FRESH context — contract +
   change set only, no Architect reasoning, not each other's output. Include the
   standard **pipeline-mechanics preamble** in each briefing so neither flags
   expected pipeline state as a defect: staging and commits happen ONLY at ship, so
   at the test and review gates the change set is expected to be UNTRACKED in the
   worktree — a file listed in `build.files_changed` being uncommitted/untracked is
   normal, not a finding; evidence lives in the primary checkout's `artifacts/`,
   never inside the worktree. Write both verdicts to `consensus/`.
   - Both pass → continue to gate decision.
   - Critic fail → gate fails (retry path).
   - Advocate dissent → record verbatim; present it to the user ONCE for resolution;
     unresolved → terminate `failed` / `ADVOCATE_DISSENT`.
4. **Gate decision**: gate passes iff the phase agent succeeded, no validator returned
   `fail`, and consensus (where applicable) passed. Write `gate_result` into the
   attempt's `phase_manifest.json`.
   - Pass → update `run_manifest.current_phase`, proceed to next phase.
   - Fail, retries remain → new attempt; escalate this phase agent's model one tier
     (`luna` → `terra` → `sol` in Codex; canonically haiku → sonnet → opus); record
     `tier_input: retry-escalation`.
   - Test-checks fail because the CODE is wrong → rewind to build (once per job;
     increment `cross_phase_rewinds.test`); second occurrence → terminate `failed` /
     `TEST_GATE_FAILURE`. This rewind budget is separate from the verify-drift one. On the
     rewind, write the failing checks as a structured `corrections.json` (classification
     `code`) into the fresh build `attempt_{n}/` before re-dispatching (SC-3 A3/F-15).
   - A CHECK is defective, not the code (the tester classifies the failure `check`) →
     at most ONE check-defect repair per job (`run_manifest.check_defect_repairs`, capped
     at 1): write a corrected `corrections.json` (classification `check`) into a FRESH
     build `attempt_{n}/` and re-run WITHOUT consuming a build retry; the repair fixes only
     the executable check, never the frozen criteria or their mapping. A second check
     defect → `TEST_GATE_FAILURE`. No new terminal state, verdict, or exit code (SC-3 A4).
   - Falsifiability (SC-3 A1/A2, always-on when `policy.test_policy: required`;
     required + `policy.falsifiability: false` is a hard pre-plan intake failure, while
     `true` opts other test policies in): at the test gate the tester first runs a PRE-change
     baseline; a criterion whose check is not falsifiable (no red-for-the-right-reason
     baseline) is recorded `gate_weak` — an unverified criterion, surfaced as a warn, never
     counted as a pass and never treated as "already satisfied."
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
  the change set (union of `build.files_changed` and the document phase's
  `docs_delta` paths — per adws-shipper.md) only, commit (message references `task_id` and criteria), then
  push the branch.
- **pr**: from the worktree, stage explicit file paths from the change set (union
  of `build.files_changed` and the document phase's `docs_delta` paths) only, commit (message references `task_id` and criteria), push the job branch, then
  `gh pr create --base {target_branch}` with title/body from the contract; record the
  live PR URL in ship evidence (AC-5.1). `pr` mode routinely targets protected
  branches — that's the point of a PR — so no protected-branch check applies here.
  - **Delegated push (F-5):** if the push fails on DETECTED missing credentials (no
    `gh`/SSH — detected, never assumed), do NOT burn the ship retry: the shipper
    records `pushed: false` and
    `delegation: { "status": "pending-operator", "detected_reason": … }` and the ship
    `gate_result` is `deferred` (does not consume the retry budget). Ask the operator to
    push. On their confirmation that the PR/branch exists, YOU (orchestrator, never a
    re-dispatched shipper) close the SAME attempt by writing `delegation.status:
    "completed"` + `pr_url` into its `phase_output.json` and flip the gate to `pass`.
    Timeout/refusal → gate `fail`. See `references/phase-gates.md` "Delegated push at
    ship".
- **patch**: from the worktree, stage explicit file paths from the change set
  (union of `build.files_changed` and the document phase's `docs_delta` paths) only,
  commit, then `git format-patch {target_branch}..HEAD` to
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
outputs — each script's expected input shape is documented in its header comment
(canonical) and summarized with assembly sources in `references/validator-inputs.md`.

Empty-history convention (verify phase): when `artifacts/{jobId}/entropy_history.jsonl`
does not exist because the job recorded zero parse failures, feed `drift-sentinel`
`{ "entropy_history": [] }` — an empty history evaluates SAFE/`pass` by design. A
MISSING history file at verify is the healthy case, distinct from an UNREADABLE or
corrupt one at the stability gate (entropy-gate exit 3), which stays an
evidence-integrity failure.

## Troubleshooting

### Stale worktree / ref `.lock` files (F-10)

On sandbox-mounted or overlay filesystems, `git worktree add` can leave behind
zero-byte `*.lock` files (e.g. `.git/worktrees/{name}/HEAD.lock`, or a
`.git/refs/.../{ref}.lock`) that git itself then refuses to remove
(`unlink: Operation not permitted`). Every subsequent ref update on that target fails
with `cannot lock ref … Unable to create '….lock': File exists`.

Recovery — run all three checks BEFORE deleting anything:
1. Confirm the file is a lock AND is **zero bytes** (`ls -l` shows size 0). A non-empty
   `.lock` may be a real in-progress git transaction — do NOT delete it.
2. Confirm **no live git process** is touching this repo (`pgrep -fl git`). If one is,
   wait for it to finish; the lock is legitimate.
3. Only then remove the specific stale lock file(s) by **explicit path** (never a
   wildcard sweep), using elevated permission if the mount requires it. Re-run the
   failed git command.

Prefer the Agent tool's `isolation: "worktree"` where available — it sidesteps this by
not manipulating the primary checkout's `.git/worktrees` under the sandbox mount.

### Transient subagent API errors vs. gate failures (F-12)

A phase subagent can die on a transient infrastructure error (e.g. a stream idle
timeout, a terminal API error after retries) rather than on the merits of its work.
This is NOT a gate failure and MUST NOT consume the phase's retry budget:

1. Inspect the attempt directory. If the subagent wrote NO evidence (no
   `phase_output.json`/`phase_manifest.json`), nothing in the append-only tree was
   committed — re-dispatch the SAME agent into the SAME `attempt_{n}` directory. It is
   not a new attempt (FR-4 is about attempts that produced evidence; an empty directory
   from a dead dispatch has recorded nothing to preserve).
2. If the subagent wrote PARTIAL/malformed evidence before dying, treat those files as
   this attempt's record (append-only — do not edit them), count the malformed outputs
   toward the X-2 parse-failure signal, and open a NEW `attempt_{n+1}` for the re-run
   (which now escalates a tier as a normal retry).
3. Only a completed dispatch whose OUTPUT fails the gate (validator `fail`, Critic
   `fail`, checks fail, etc.) consumes the retry budget. Never record an
   infrastructure death as a `{PHASE}_GATE_FAILURE`.

Field-validated: the issue-#105 run's first planner dispatch died on a stream idle
timeout having written nothing; re-dispatch into the same empty `plan/attempt_1/`
proceeded cleanly with no budget consumed (see `docs/field-runs/`).
