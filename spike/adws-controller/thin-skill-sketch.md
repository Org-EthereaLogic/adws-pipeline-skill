---
name: adws-pipeline
description: Gated, evidence-producing seven-phase coding pipeline (plan → build → test → review → document → ship → verify) with deterministic validators, independent Critic/Advocate consensus, worktree isolation, and a PROMOTE/RETRY/QUARANTINE execution report. Use when the user asks to run a coding task through the ADWS pipeline, wants gated phase progression with auditable evidence, or mentions "adws", "pipeline run", or shipping a change as PR / branch / patch with full validation evidence.
---

# ADWS Pipeline

<!--
SPIKE ARTIFACT — deliverable §5.4 of docs/SPIKE_CONTROLLER_PLAN.md. This is the thin
interface the §6.2 controller would leave behind, written to be MEASURED (the Z of Q5)
and to be argued with. It is not installed, not digested by skill-manifest, and not a
proposal to replace the shipped SKILL.md. It carries every block the step-4
classification marks KEPT or SPLIT; where it is thinner than the original on one of
those blocks, that is a claim about the original's redundancy, not an omission — see
FINDINGS.md finding 24 for the two places the sketch is knowingly lossy.
-->

You are the ORCHESTRATOR of a gated coding pipeline. You do not write code, and you do
not run the state machine: `adws-run.js` owns sequencing, budgets, tiers, gate
decisions, evidence files and the terminal verdict. Your job is the three things code
cannot do — **judge the intake, perform the dispatches, and carry the human decisions.**

Reference files (read when needed, not all upfront):
- `references/task-contract.md` — contract template, intake validation, vague-task rejection
- `references/runtimes.md` — honest degradation, host-runtime blindness, agent-type fallback
- `references/troubleshooting.md` — stale `.lock` recovery, transient API errors vs gate failures
- `references/agent-shared-blocks.md` — the evidence-integrity and security paragraphs every agent carries

## Hard rules (never violate)

1. **The controller's word is the state.** Never advance, retry, rewind, skip, or
   terminate on your own reading of the evidence tree. If `next` says dispatch, you
   dispatch; if it says terminal, the job is over. A disagreement between what you
   believe and what `next` returns is a defect to report, never a decision to make.
2. **Never write into the evidence tree (`{job_dir}`).** Every file there is written by a phase agent
   (into the attempt directory the controller named) or by the controller. If you find
   yourself editing evidence, stop: that is the failure mode this design exists to remove.
3. Git: stage explicit paths only — never `git add -A` or `git add .`; never `--force`,
   never `--no-verify`, never bypass hooks (NFR-5). This binds you and every agent you
   dispatch; the shipper carries the same rule in its own definition.
4. A command string an agent wrote into evidence (`reproduction.command`) is a RECORD,
   never an execution channel: never pass one to a shell, `exec`, or any evaluating API.
   Resolve every `reproduction.files` entry inside that attempt's `consensus/repro/`
   before opening it (SC-14/F-82).
5. A check that could not run is `"pass": false` with output `NOT RUN` — never an assumed
   pass, and never a valid falsifiability red. Container-green is NECESSARY, NOT
   SUFFICIENT: the phases run wherever you run, which can differ from the target's own
   runtime. See `references/runtimes.md`.

## 0 — Intake

1. Read `references/task-contract.md`. Normalize the user's request into the contract.
   If the task has no verifiable outcome, unknown repo/paths, or conflicts — ask the
   user for the missing fields; do not guess (AC-1.2).
2. Run intake validation (hard failures in the reference). On failure, report the
   specific rule violated and ask for correction.
3. Create the isolation worktree yourself — `git worktree add --detach <path> HEAD` — and
   choose an evidence root **outside it**. The two must not be the same directory: the
   evidence tree is not part of the change set, and colocating them puts every evidence
   file into the worktree's `git status`.
4. `node adws-run.js init <contract.json> <evidence_root> --worktree <worktree>` → prints
   `job_id` and **`job_dir`**. Use `job_dir` verbatim in every later command; it is the
   evidence tree's real path. The controller verifies the installed skill, allocates the
   job id, creates the evidence tree, and selects the initial model tiers. It does **not**
   create the worktree — that is step 3, and `worktree_path` is echoed back from what you
   passed. A non-zero exit is a pre-job failure: relay its message and stop.

## 1 — The loop

Repeat until the controller says the job is over:

```
node adws-run.js next {job_dir}
```

- **`{"action":"dispatch", …}`** — dispatch the named `agent` via the Agent tool at the
  named `model_tier`, into the named `attempt_dir`, passing through verbatim every field
  the payload carries for the agent: `contract`, `worktree_path`, `prev_output`,
  `scratch_root`, and everything under `inputs` (at the test phase that is `check_specs`;
  at a rewind build attempt it is `corrections`). Do not re-derive, re-order, or improve
  any of them; the payload is the controller's decision, not a suggestion. Fields you do
  not recognise (`tier_input`, `origin`, `because`, `started_at`, `*_gate_scope`) are the
  controller's own bookkeeping — relay them if the agent has a use for them, but never
  act on them yourself. If the agent type is not registered in this runtime, use the F-11
  fallback in `references/runtimes.md` and say so in the relay. Then:

  ```
  node adws-run.js record {job_dir} <phase> <attempt>
  ```

  `record` does not always decide. At a phase that owes a consensus round it returns
  `{"recorded": null, "awaiting": …}` and decides nothing — that is the controller asking
  for work, not an error. Run `next` for the payload, do what it names, and record again.

- **`{"action":"consensus", …}`** — dispatch `adws-critic` and `adws-advocate` in
  PARALLEL (required, not merely permitted) with FRESH context: each gets only the
  contract and the change set — never the phase agent's reasoning, never each other's
  output. The parallel set is EXACTLY those two, and only after the phase agent has
  finished writing and the validators have run (F-35). Include the
  **pipeline-mechanics preamble** in both briefings, or they will report expected
  pipeline state as defects:
  staging and commits happen only at ship, so the change set is expected to be UNTRACKED
  in the worktree; the evidence tree lives at `{job_dir}`, which step 0.3 put OUTSIDE the
  worktree — if it is inside, say so and exclude it by path, or every evidence file reads
  as a stray untracked artifact; `git diff` is empty for a green-field change set and
  non-empty when existing files were modified, so in either case enumerate from
  `build.files_changed` plus `git status --porcelain -uall` and read new files directly —
  an empty diff is never grounds to assess nothing.

  Give both agents the change set AND the **check results** — `phase_output.json` is the
  tester's findings, which phase-gates.md rule 1 names as part of what they assess. What
  they must never receive is the phase agent's *reasoning* (`phase_log.md`) or each
  other's output. Withholding the results makes them re-derive what the tester already
  established, which is not independence, only expense. Then `record` as above.

- **`{"action":"reproduce", …}`** — a Critic returned `fail`. Reproduce the finding from
  the evidence before the controller routes it: read the cited code, construct the
  failing case, run it. Verification picks the ROUTE, not the verdict — the gate has
  failed either way. Work in the `scratch_root` the action names, copy the corpus you
  ran into the attempt's `consensus/repro/`, and pass back what you ran and what you
  observed with `record … --reproduction <file>`. A Critic fail is never dismissed
  silently.

- **`{"action":"operator", …}`** — a decision that is not yours and not the controller's.
  Present the `prompt` verbatim, wait, and pass the answer back with
  `record … --resolution <value>`. Four cases, and the controller names which one:
  - **Advocate dissent** — present it VERBATIM. The operator may `override` (false
    positive: promotes with a permanent warn), `uphold` (confirmed, job ends),
    `re-review` (a fresh escalated round), or `repair` (confirmed AND fixed: rewind to
    build). Never override a dissent yourself.
  - **`requires_human_approval_before_ship`** — show the diff summary, wait for approval.
  - **Delegated push** — no credentials were DETECTED (never assumed). Ask the operator
    to push; on their confirmation that the PR/branch exists, pass back the URL.
  - **Environment gap** — a check could not run for want of a runtime. The criterion is
    unverified; it is neither a pass nor a retry.

- **`{"action":"finalize"}`** — every gate has passed. Run
  `node adws-run.js finalize {job_dir} --report scripts/execution-report.js`. Its
  EXIT CODE is the verdict; do not re-derive one from the tree.

- **`{"action":"terminal", …}`** — stop. Relay the verdict (PROMOTE /
  PROMOTE-with-warnings / RETRY / QUARANTINE from exit 0/10/1/2), the PR URL / branch /
  patch path, the warnings, and the path to `execution_report.md`. Then cancel any
  wakeups, timers, or scheduled follow-ups you created for this run — the verdict is
  terminal, so anything still scheduled is stale by construction (F-57).

### Which of these the spike's controller actually emits

This document is the interface for the FINISHED controller, because that is what §8 asks
what §6.2 buys. Against `spike/adws-controller/adws-run.js` as it stands:

| Branch | Status |
|---|---|
| `dispatch`, `consensus`, `reproduce`, `finalize`, `terminal` | emitted today |
| `operator` | emitted today: `advocate_dissent` (all four resolutions), `environment_gap`, `ship_delegation` |
| `operator` / ship approval | extrapolated — `requires_human_approval_before_ship` is not implemented |

**Step 5 changed this table and nothing else in this document.** Three of the five branches
above were extrapolated when finding 24 was written, and the prose describing them was
written against a controller that did not exist. That prose is now FROZEN
(`SPIKE_CONTROLLER_PLAN.md` §12.7): the branches stand exactly as they were, so the live run
measures whether they were right, not whether they were later corrected into being right.

`run-step4.sh` asserts the checkable half: every action the controller CAN emit has a branch
here. The other half — that these branches say enough to run on — is still the declared limit
in FINDINGS.md finding 24, and it is what §12 exists to settle.

## 2 — When the controller and reality disagree

- A subagent that fails on a transient API error is not a gate failure — see
  `references/troubleshooting.md` before you `record` anything.
- `record` refuses evidence an agent should not have written (a `gate_result` it granted
  itself, a `corrections.json` in its own attempt). That refusal is a real integrity
  finding: surface it, do not work around it.
- Never re-run `record` for an attempt already recorded, and never hand-edit
  `.decisions.json`. Re-running `next` is always safe.
