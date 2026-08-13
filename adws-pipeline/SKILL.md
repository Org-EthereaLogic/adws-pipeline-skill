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
- `references/runtimes.md` — honest degradation, host-runtime blindness, agent-type fallback
- `references/troubleshooting.md` — stale `.lock` recovery, transient API errors vs gate failures
- `references/agent-shared-blocks.md` — the evidence-integrity and security paragraphs every agent carries

Bundled scripts (standalone Node ≥ 20, run with `node`):
- `scripts/validators/*.js` — 9 deterministic validators; CLI: `node <script> <input.json|->` → JSON verdict on stdout
- `scripts/execution-report.js` — terminal report; CLI: `node scripts/execution-report.js artifacts/{jobId}` → writes report, exits 0/10/1/2/3
- `scripts/entropy-gate.js` — X-2 stability gate; CLI: `node scripts/entropy-gate.js artifacts/{jobId}/entropy_history.jsonl` → `{action: proceed|escalate|halt}`
- `scripts/skill-check.js` — installed-copy integrity + version; CLI: `node scripts/skill-check.js [--json]` → exits 0 intact / 1 mismatch / 3 no manifest

## Environment & runtimes

The bundled scripts need only Node ≥ 20 (and `gh` for `pr` mode). The TARGET repository's
test and verify phases need runtimes the pipeline does not ship. **A check that could not
run is `"pass": false` with output `NOT RUN` — never an assumed pass, and never a valid
falsifiability red** (a pre-change check that is red only because it could not execute is
recorded `gate_weak`, not `verified`). Container-green is NECESSARY, NOT SUFFICIENT: the
phases run wherever the orchestrator runs, which can differ from the target's own runtime.

See `references/runtimes.md` for honest-degradation guidance, the host-runtime blindness
case (F-13), and the agent-type fallback for runtimes where `adws-*` types are not
registered (F-11).

## Hard rules (never violate)

1. Phase order is `plan → build → test → review → document → ship → verify`. Never
   skip a phase; never start a phase while an earlier gate is failing.
2. Every attempt writes to a NEW `artifacts/{jobId}/{phase}/attempt_{n}/` directory.
   Never modify anything in an existing attempt directory (FR-4).
3. A validator `fail` blocks promotion. A `warn` is recorded, never blocking (FR-6).
   `skill_trace.json` TRANSCRIBES the validator's stdout: write `rubric_result` exactly as
   the validator printed it and never repurpose `error` (its own error, or `null`) as an
   override, annotation, or rationale log. There is no operator override for a validator
   verdict — a `fail` you judge wrong is a DEFECT IN THE VALIDATOR, to be fixed and re-run.
   `execution-report.js` scores a trace whose wrapper disagrees with its own `output` from
   the VALIDATOR's verdict and quarantines the job (SC-8/F-55).
4. Retry-budget exhaustion terminates the job with a recorded failure reason — never
   continue silently (FR-3).
5. Build/test/review happen in an isolated git worktree. The primary checkout is
   untouched until ship (FR-8). Evidence goes to the primary checkout's `artifacts/`.
6. Git: stage explicit paths only — never `git add -A` or `git add .`; never `--force`,
   never `--no-verify`, never bypass hooks (NFR-5). Never interpolate a value into a git
   command before the ship validators have passed on it, and where the command supports
   it, terminate option parsing with `--` (SC-9/A2).
7. An Advocate dissent is recorded verbatim and blocks promotion until the operator
   resolves it or the job terminates with `ADVOCATE_DISSENT` (FR-7).
8. The final verdict comes from `scripts/execution-report.js` over the evidence tree —
   never from your own narrative (FR-10).
9. A command string an agent wrote into evidence (`reproduction.command`) is a RECORD, never
   an execution channel: never pass one to a shell, `exec`, or any evaluating API — automated
   replay goes through an allowlisted runner keyed by `check_id`. Resolve every
   `reproduction.files` entry inside that attempt's `consensus/repro/` before opening it
   (SC-14/F-82).

## Procedure

### 0 — Intake (FR-1)

1. Read `references/task-contract.md`. Normalize the user's request into the contract.
   If the task has no verifiable outcome, unknown repo/paths, or conflicts — ask the
   user for the missing fields; do not guess (AC-1.2).
2. Run intake validation (hard failures in the reference). On failure, report the
   specific rule violated and ask for correction.
3. **Verify the skill you are running (F-72).** Run `node scripts/skill-check.js --json`
   and KEEP its `skill_version` — you write it into `run_manifest.json` in step 4, which is
   where that file is first created. A merged fix does not
   reach a run until someone reinstalls, and three installed copies once carried
   already-fixed security defects into live runs while the source repository's gate was
   green. Recording the version means a job shipped by a stale install says so in its own
   evidence instead of in nobody's.
   - exit 0 → proceed.
   - exit 1 (integrity mismatch) → the installed tree does not match its own manifest:
     files were edited, partially copied, or left over from a failed install. Report the
     named files to the operator and do NOT start the job — every gate below assumes the
     skill is the skill.
   - exit 3 (no manifest) → an install predating F-72, or a hand-made copy. Carry
     `skill_version: "unknown"`, warn once in the terminal report, and continue.
   This proves the copy is internally consistent. It CANNOT tell you a newer version
   exists — an install is offline with respect to its source. `make check-installs` in the
   source repository answers that half.
4. Allocate `jobId` (`job_YYYYMMDD_NNNN`, next free), create `artifacts/{jobId}/`,
   write `task_contract_snapshot.json` and initial `run_manifest.json` — including
   `skill_version` from step 3.
5. **Resuming a retained worktree (SC-13/F-73).** A RETRY or QUARANTINE keeps its
   worktree (§5 step 4 below) and the work in it is the next job's starting point — but
   only a contract naming `execution.resume_from_job` may run against an existing tree.
   When it does: confirm the predecessor recorded `carry_over.resumable: true`, and that
   its `worktree_path` and `branch_name` still exist and match. Then compare the tree
   against the record and classify EVERY path in either — `unchanged` (digest matches),
   `changed` (digest differs), `added` (in the tree, absent from the record), or `removed`
   (in the record, absent from the tree) — into this job's `run_manifest.resumed_from`,
   with `isolation_mode: "worktree-resumed"`.
   Only `unchanged` carries gate evidence forward, and only as far as the predecessor's
   `gated_through` phase reached: a digest match proves the file has not moved since that
   record, NOT that any gate ever assessed it. `changed`, `added` and `removed` paths have
   no gate evidence at all. KEEP the predecessor's branch and record
   `branch_name_origin: "resumed-from:{jobId}"` rather than renaming it, so the evidence
   matches the artifact that actually ships. Every path not classified `unchanged` enters
   with NO gate evidence of its own and must earn it here — name them in the terminal
   report, including the `removed` ones, whose disappearance is a change like any other.
   Without `resume_from_job`, a job always creates its own worktree (§1). Shapes in
   `references/artifact-layout.md`. A run that adopts a retained tree without this
   classification cannot say which of its files were ever gated, which is exactly what
   two consecutive RETRY jobs had to reconstruct in prose.
6. Select initial model tiers from `risk.risk_level` per the PER-PHASE tier table in
   `references/phase-gates.md`; record in `run_manifest.model_tiers`. The seven phase
   agents do not share one tier — plan and review are priced above the mechanical tail.
   Honor the safety floors (ship ≥ sonnet, verify ≥ sonnet, grader ≥ opus) and never
   assign `fable` from the table: it is an escalation ceiling and an explicit operator
   opt-in only. In Codex, route those canonical tiers through the aliases `luna`,
   `terra`, `sol`, and `nova` defined in that reference. Keep canonical tier names
   (`haiku`, `sonnet`, `opus`, `fable`) in evidence so existing validators and reports
   remain compatible.

### 1 — Worktree

If the contract names `execution.resume_from_job`, do NOT create a worktree: adopt the
predecessor's tree and branch per §0 step 5, and skip to the phase loop. Never create a
second worktree over a branch another job's tree already checks out.

Otherwise, prefer the Agent tool's `isolation: "worktree"` for build/test phases. Where
unavailable, create explicitly from the primary checkout:

```
git worktree add ../{repo}-adws-{jobId} -b adws/{jobId}/{slug} {target_branch}
```

`{slug}` is derived deterministically from the contract, never improvised: lowercase
`task.title`, replace every run of `[^a-z0-9]` with `-`, collapse repeats, strip leading
and trailing `-`, truncate to 32 characters; if the result is empty, use `task`. The full
`branch_name` is `adws/{jobId}/{slug}`.

**Run `ship-mode-select` on `{ output_mode, branch_name }` BEFORE the first git command
that consumes the branch name** (SC-9/A2). A `fail` there is a pre-git gate failure — do
not create the worktree. Before SC-9 the only check was that the name was non-empty, so
`--upload-pack=/tmp/evil` and `foo; rm -rf ~` both passed the validator that exists to be
checked before git.

Record `worktree_path` and `branch_name` in `run_manifest.json`. Never run the
pipeline's code changes in the primary checkout.

### 2 — Phase loop

For each phase in order, repeat until gate pass, rewind, or budget exhaustion:

0. **Stability gate** (X-2 regulator): if `artifacts/{jobId}/entropy_history.jsonl`
   exists, run `node scripts/entropy-gate.js` on it BEFORE dispatching.
   `proceed` → continue (record `watch: true` in the attempt manifest if set).
   `escalate` → raise this phase agent's model one tier for this attempt
   (`tier_input: entropy-gate`; already at the `fable` ceiling → keep the tier and record
   `entropy-gate-saturated`). `halt` → terminate `failed` /
   `STABILITY_BUDGET_EXCEEDED` (RETRY verdict class). Exit 3 (unreadable or corrupt
   history) → evidence-integrity problem: do not proceed; surface to the operator
   once; unresolved → terminate `failed` / `MISSING_UPSTREAM_ARTIFACT` (quarantine
   class). Record the gate output in the attempt's `phase_manifest.json` as
   `stability_gate`.
1. **Dispatch** the phase agent (`adws-planner` … `adws-verifier`) via the Agent tool
   at its current model tier (agent type not registered in this runtime → the F-11
   fallback in `references/runtimes.md`). Give it: the contract path, the worktree path, its
   attempt directory `artifacts/{jobId}/{phase}/attempt_{n}/` (create it first), the
   previous phase's `phase_output.json` path, and its **`scratch_root`** (SC-13/F-77) —
   an absolute path you create before dispatch, one per agent, conventionally
   `${TMPDIR:-/tmp}/adws-{jobId}/{phase}/attempt_{n}/{agent}/`. Pass it as a resolved
   ABSOLUTE PATH, never a brace template: an agent handed `{scratch}/…` can only guess,
   and the guesses collide. Your own reproduction work goes in
   `${TMPDIR:-/tmp}/adws-{jobId}/orchestrator/`. The same applies to the consensus pair
   at step 3.
   **At the TEST phase only, run `criteria-to-checks` BEFORE this dispatch** (it is a
   pure function of the frozen criteria, so it needs no phase output), confirm
   `check_specs.length == criteria_count`, write its `skill_trace.json` now, and pass the
   `check_specs` to `adws-tester` in its dispatch. The tester must echo each spec's
   `check_id` onto the checks it runs (SC-5/F-31) — it cannot do that with specs that do
   not exist yet, and ids it mints itself cannot join back to the criteria. Every other
   validator runs at step 2, on its agent's output. Phase agents write their own
   evidence files per `references/artifact-layout.md`. Record `phase_manifest.provenance`
   (SC-3 B1/F-17): `started_at`, `completed_at`, the derived `wall_clock_s`, `agent`, and
   `model_tier_requested` are MANDATORY and come from a live `date -u`; model id, cost,
   tokens and tool-call count are structurally unavailable in this runtime and are written
   as `null` rather than omitted (SC-11/A3). Provenance is never a gate input: absent or
   null telemetry never affects a gate, and `execution-report.js` ignores it.
2. **Validate**: run the phase's validator script(s) (mapping in
   `references/phase-gates.md`) with input assembled from the contract and phase
   outputs; wrap each stdout JSON in a `skill_trace.json` under the attempt's
   `skills/{skill_id}/` directory.
   **At the BUILD phase, assemble `repo-context-scan`'s `actual_changes` from the
   WORKTREE** — `git -C <worktree> status --porcelain -uall | cut -c4-` — never from the
   plan or the builder's self-report (SC-15/F-84). The plan states intent; this is the
   only gate that sees what the builder did. Omitting the key is not a pass: the verdict
   carries `actuals_checked: false` and floors at `warn`.
3. **Consensus** (test and review only): dispatch `adws-critic` and `adws-advocate`
   in parallel (MANDATORY — they have no data dependency on each other; see
   `references/phase-gates.md` "Consensus"). The parallel set is EXACTLY those two:
   never fan the phase agent (or any other agent) in alongside them. Steps 1 → 2 → 3
   are strictly sequential — the consensus pair is dispatched only after the phase
   agent has finished writing its evidence and the validators have run, because both
   read the change set the phase agent is still producing (F-35). Each gets FRESH
   context — contract + change set only, no Architect reasoning, not each other's
   output. Include the
   standard **pipeline-mechanics preamble** in each briefing so neither flags
   expected pipeline state as a defect: staging and commits happen ONLY at ship, so
   at the test and review gates the change set is expected to be UNTRACKED in the
   worktree — a file listed in `build.files_changed` being uncommitted/untracked is
   normal, not a finding; evidence lives in the primary checkout's `artifacts/`,
   never inside the worktree. Because of that, `git diff` is EMPTY for a green-field
   change set: brief them (and the reviewer) to enumerate from `build.files_changed`
   plus `git status --porcelain -uall` and read new files directly — an empty diff is
   never grounds to assess nothing. Write both verdicts to `consensus/`.
   - Both pass → continue to gate decision.
   - Critic fail → gate fails. REPRODUCE the finding from the evidence before routing
     it (verification picks the route, not the verdict — the gate failed either way):
     a reproduced CODE defect rewinds to build (`cross_phase_rewinds.review` at review,
     `cross_phase_rewinds.test` at test, each capped at 1, attempt-level
     `failure_reason: CRITIC_FAIL_REPAIRED`); one that does not reproduce takes the
     ordinary retry path with the non-reproduction recorded. Second fail at the same
     gate → `{PHASE}_GATE_FAILURE`. See `references/phase-gates.md` "Critic-fail
     remediation" (SC-7/F-46).
   - Advocate dissent → record verbatim; present it to the user ONCE for resolution.
     Four resolutions, all recorded as `resolution.action` on the dissenting
     `advocate.json`: `override` (false positive — promotes with a permanent warn),
     `uphold` (confirmed, job ends), a fresh escalated re-review (F-6), or `repair`
     (confirmed AND fixed — rewind to build with the dissent as `corrections.json`,
     re-run forward, capped at 1 per gate in `operator_directed_rewinds`; SC-6/F-37).
     Unresolved → terminate `failed` / `ADVOCATE_DISSENT`. A dissent recorded anywhere
     in the evidence — including on an attempt a later one superseded — forbids a CLEAN
     promote (F-38); only `override` and a completed `repair` clear the block.
4. **Gate decision**: gate passes iff the phase agent succeeded, no validator returned
   `fail`, and consensus (where applicable) passed. Write `gate_result` into the
   attempt's `phase_manifest.json`.
   - Pass → update `run_manifest.current_phase`, proceed to next phase.
   - Fail, retries remain → new attempt; escalate this phase agent's model one tier
     (`luna` → `terra` → `sol` → `nova` in Codex; canonically haiku → sonnet → opus →
     fable, capped at fable); record `tier_input: retry-escalation`. Already at the cap →
     keep the tier and record `retry-escalation-saturated` instead, so a real escalation
     is never indistinguishable from a no-op.
   - Test-checks fail because the CODE is wrong → rewind to build (once per job;
     increment `cross_phase_rewinds.test`); second occurrence → terminate `failed` /
     `TEST_GATE_FAILURE`. This rewind budget is separate from the review and verify-drift
     ones. On the
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
   - Rewind budgets are separate from retry budgets and from each other. The
     gate-automatic rewinds (`cross_phase_rewinds.test`, `.review`, `.verify`) and the
     check-defect repair do NOT consume a build retry — their own cap of 1 bounds them;
     only the operator-directed repair does (SC-6/F-37). A rewind's build attempt
     escalates one tier (`tier_input.source: cross-phase-rewind`); the forward re-run of
     downstream phases afterwards is not a retry and runs at the table tier. Full
     accounting table in `references/phase-gates.md`.
5. After review gate passes: recompute tiers from the `review-risk-assess` output's
   `risk_level` for the remaining phases (document, ship, verify) and record in
   `run_manifest.model_tiers`. The reviewer's own tier came from contract risk — the
   validator runs after it — so the resulting map is legitimately heterogeneous.
6. **Parse-failure accounting** (X-2): count malformed structured outputs during the
   attempt (unparseable `phase_output.json`/consensus files, validator CLI exit 3 on
   agent-produced input, re-prompts for broken JSON). Append one line
   `{ "phase", "attempt", "parse_failures", "recorded_at" }` to
   `artifacts/{jobId}/entropy_history.jsonl` — starting from the FIRST attempt with
   ≥ 1 failure, and for every attempt thereafter (zeros included, so recovery decays
   the signal). Never record a leading zero-only prefix, and never rewrite prior
   lines (append-only).

### 3 — Ship (FR-9, dispatched to adws-shipper)

Before any git action, run `ship-mode-select` and `patch-compose` validators, then run the
**drift gate below**; a `fail` from any of them blocks shipping.

**Drift gate, BEFORE publication (SC-15/F-85).** Dispatch `adws-grader` (recreation of
`pr.drift_sentinel.spec`) on the CANDIDATE — the local change set `patch-compose` just
unioned, read from the worktree — and grade it per acceptance criterion:
satisfied/partial/unaddressed/contradicted. Grader `fail` = drift BLOCK → rewind to build
with the findings (once per job; increment `cross_phase_rewinds.verify` — separate budget
from the test rewind; second BLOCK → terminate `quarantined` / `PR_DRIFT_SENTINEL_BLOCK`).
This runs before the first git action so the rewind is still free. Grading AFTER
publication meant a BLOCK rewound a change that already had commits and a live PR behind
it — a rewind cannot un-publish, so the job either left the artifact standing or produced
a second one. Then record `candidate_sha256` (SHA-256 of the composed patch) in
`run_manifest.json`; step 4 binds what was published to what was graded.

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

### 4 — Verify (FR-11, dispatched to adws-verifier)

Post-ship, zero orchestrator judgment, and **no route back** — everything that can rewind
ran at step 3. A failure here is about the PUBLICATION, never the change set:
1. Structural checks: shipped artifact exists (PR reachable via `gh pr view` / branch
   pushed / patch file applies cleanly with `git apply --check`); every changed file
   inside `allowed_paths`, none in `blocked_paths`; syntax check changed files.
2. **Receipt binding (SC-15/F-85).** Re-derive the published artifact's diff (`gh pr diff`,
   the pushed branch against its base, or the patch file) and compare its SHA-256 to
   `run_manifest.candidate_sha256`. Record `receipt: { verified, sha256, candidate_sha256 }`
   either way. Unequal → what is published is not what was graded. Re-deriving the same two
   digests cannot change the answer, so this exhausts verify's budget on the first failure:
   terminate `failed` / `VERIFY_GATE_FAILURE`, name both digests in the report, and set
   `carry_over.resumable: false` — the artifact is live and the operator must resolve it.
   **Never a rewind**: build cannot un-publish, so a job that rewound here would leave the
   first artifact standing and produce a second.
3. `verify-evidence-map` and `drift-sentinel` validators.

### 5 — Terminal report (FR-10)

1. Set `final_status` + `failure_reason` + `completed_at` in `run_manifest.json`
   (`completed` only if all 7 gates passed).
2. Run `node scripts/evidence-integrity.js artifacts/{jobId}` (SC-15/F-84b —
   `references/artifact-layout.md` rule 9, executable). Exit 1 = a `*_at` field is a
   placeholder, malformed, mistyped, or out of order: fix the offending record from a live
   `date -u` if the true value is recoverable, and if it is not, say so in the report
   rather than inventing one. A PASS claim standing on a timestamp nobody can source does
   not meet the dual-evidence bar. Then run
   `node scripts/execution-report.js artifacts/{jobId}`.
3. Relay to the user: the verdict (PROMOTE / PROMOTE-with-warnings / RETRY /
   QUARANTINE from exit code 0/10/1/2), the PR URL / branch / patch path, warnings,
   and the path to `execution_report.md`.
4. **Record the carry-over on any non-PROMOTE terminal state (SC-13/F-73).** The
   worktree is about to be RETAINED (step 5.4), so record what is in it:
   `carry_over: { "retained": true, "resumable", "resumable_reason", "worktree_path",
   "branch_name", "files": [{ "path", "sha256" }], "gated_through": "<last phase whose
   gate passed>" }` in `run_manifest.json`. The digests are the only thing that later lets
   a successor job tell a file this job gated from one edited by hand afterwards. Nothing
   is staged or committed — hard rule 6 is unchanged; this is evidence, not a commit. On
   PROMOTE, record `carry_over: { "retained": false }` and continue to teardown.
   **`resumable` is `true` only when the job never shipped** — no commit, no push, no PR,
   no patch, `ship` never reached or `deferred`. A job that died AFTER shipping (a receipt
   mismatch, a post-ship structural failure) leaves commits and a live PR behind, so
   its worktree is not a clean starting point and a successor must not adopt it; record
   `resumable: false` with the reason and let the operator resolve the shipped artifact
   first. Restricting the state is the honest move here — the alternative is a carry-over
   schema that pretends to describe commit and ship state it was never designed to carry.
5. **Archive the evidence before any teardown (SC-11/A5).** In order:
   1. Write `artifacts/{jobId}.tar.gz` from `artifacts/{jobId}/` to a **durable
      destination outside the worktree and outside the target checkout** —
      `execution.evidence_archive_dir` from the contract. If the contract names no
      durable destination, say so in the terminal report and do NOT remove anything:
      an archive written into a disposable checkout is not an archive.
   2. Record `evidence_archive: { path, sha256, bytes, created_at }` in
      `run_manifest.json`. A verdict whose evidence was archived somewhere unrecorded is
      as unverifiable as one never archived.
   3. **Verify by EXTRACTION, not by size.** Extract to a scratch directory and confirm
      `execution_report.json` and every phase's `phase_manifest.json` are readable from
      the extracted copy. A truncated tarball is non-empty.
   4. Only then remove the worktree (`git worktree remove`), and only after PROMOTE;
      keep it for RETRY/QUARANTINE debugging. **If any step above fails, do not remove
      the worktree — report the failure.** Teardown is conditional on a verified
      archive, never the reverse.

   Four recorded runs lost their evidence tree at teardown; one field record notes it as
   the *third* time that cost a verifiable claim. In each case an archive was not absent
   so much as written somewhere disposable, which is why the destination and the
   extraction check are both mandatory rather than advisory.
6. Cancel any wakeups, timers, or scheduled follow-ups you created for this run. The
   verdict is terminal, so anything still scheduled is stale by construction (F-57).

## Failure-reason classes

The authoritative lists — no-retry (terminate immediately) versus quarantine-class, and
which map to RETRY — are in `references/phase-gates.md` "Failure-reason classes". Record
the reason verbatim from that reference; never invent one outside the documented enums.
## Validator → phase map

| Phase | Validator script(s) |
|---|---|
| plan | `task-normalize.js` |
| build | `repo-context-scan.js` |
| test | `criteria-to-checks.js` |
| review | `review-risk-assess.js` |
| document | `document-coverage-map.js` |
| ship | `ship-mode-select.js`, `patch-compose.js`, + `adws-grader` agent — all PRE-git |
| verify | `verify-evidence-map.js`, `drift-sentinel.js` |

Validator inputs are assembled by you (orchestrator) from the contract and phase
outputs — each script's expected input shape is documented in its header comment
(canonical) and summarized with assembly sources in `references/validator-inputs.md`.

**Criterion coverage at the test gate (SC-5/F-27).** `criteria-to-checks` v2.0.0 emits one
entry in `check_specs` for EVERY acceptance criterion, typed `behavioral` (outcome language
confirmed) or `unclassified` (not confirmed — a statement about the wording, not a verdict).
`check_specs.length` therefore always equals `criteria_count`; if it does not, treat that as
a defect and do not proceed as though the criteria narrowed. Earlier versions emitted specs
only for criteria the lexical classifier recognized, so an unrecognized one disappeared from
the tester's work list without any signal — a live run silently dropped 1 of 8 criteria that
way. `unclassified` never licenses skipping a criterion; the vagueness signal lives in
`rubric_result`/`vague_count`, which are unchanged.

Empty-history convention (verify phase): when `artifacts/{jobId}/entropy_history.jsonl`
does not exist because the job recorded zero parse failures, feed `drift-sentinel`
`{ "entropy_history": [] }` — an empty history evaluates SAFE/`pass` by design. A
MISSING history file at verify is the healthy case, distinct from an UNREADABLE or
corrupt one at the stability gate (entropy-gate exit 3), which stays an
evidence-integrity failure.

## Troubleshooting

See `references/troubleshooting.md` — stale worktree / ref `.lock` files (F-10), and
telling transient subagent API errors apart from gate failures (F-12).
