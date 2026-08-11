# Spike plan — `adws-run.js` controller (§6.2 of SIMPLIFICATION_ANALYSIS)

**Date:** 2026-08-10
**Type:** time-boxed feasibility spike — throwaway code, learning is the deliverable
**Time-box:** ≤ 2 focused sessions (~1–2 days). Stop when the five questions in §6 are
answered, even if the slice is incomplete. Do **not** grow this into the full controller.
**Touches:** a new `spike/adws-controller/` dir at repo root only. **Does not** modify the
shipped `adws-pipeline/` tree, `SKILL.md`, the agents, or the validators — so it cannot trip
`skill-manifest` (which digests only the shipped tree). Run it on a throwaway branch.

Parent recommendation: [SIMPLIFICATION_ANALYSIS §6.2](SIMPLIFICATION_ANALYSIS.md) — move the
deterministic state machine out of the prose orchestrator into code so the probabilistic model
stops hand-executing counters, budgets, gate decisions, and evidence bookkeeping.

---

## 1. Hypothesis (what the spike proves or kills)

> A dependency-light Node controller can own the ADWS deterministic state machine —
> sequencing, attempt/rewind budgets, validator invocation, gate decisions, evidence-file
> generation, terminal report — and drive a run via a **command/record handshake** with a thin
> model orchestrator, producing an evidence tree that the **existing `execution-report.js`
> scores unchanged.**

If true → §6.2 is viable; the full controller is a mechanical extension and SKILL.md collapses
to a thin interface. If false (handshake too chatty/costly, or evidence incompatible) → §6.2 is
not worth it and the incremental §5 levers are the ceiling. Either outcome is a win for the
spike: it is cheap and it decides.

---

## 2. The central question — the dispatch handshake

This is the crux, and the reason the original's design does not port directly. In the original,
the Python controller **could** invoke the model itself: `subprocess.run(["claude", "-p", …])`
(`adw_modules/agent.py:325`). In a **skill**, phase work is done by subagents dispatched with
the **Agent tool — a model-level tool call a Node script cannot make.** So the controller cannot
"dispatch the planner." It can only own state and *ask* the model to dispatch.

The proposed architecture (to be validated, not assumed):

```
┌─ node adws-run.js next ─────────────┐   emits the next ACTION as JSON:
│  (pure fn of the evidence tree)     │   { action: "dispatch", agent, inputs, attempt_dir }
└─────────────────────────────────────┘   { action: "gate", verdict, next_phase }
                │                          { action: "terminal", verdict, exit_code }
                ▼
   thin SKILL.md orchestrator (the model)
   • on "dispatch": call the Agent tool, write subagent output to attempt_dir
   • then: node adws-run.js record <phase> <attempt> <output.json>
                │
                ▼
┌─ node adws-run.js record … ─────────┐   runs the phase's validator(s), computes the gate,
│  (deterministic state transition)   │   writes phase_manifest.json + updates run_manifest,
└─────────────────────────────────────┘   advances / sets up retry / sets up rewind
```

The controller is a **pure state machine over the filesystem**; the model is a **dumb executor
of dispatch requests.** This mirrors the original's "controller sequences, each step shells to
the model" — with the shell-out replaced by a handshake because the tool boundary moved.

**Sub-questions the spike must settle:**
- **Who owns the worktree?** The controller can shell `git worktree add` deterministically
  (cleaner than SKILL.md's current "prefer the Agent tool's `isolation: worktree`, else create
  explicitly" ambiguity). Recommend: controller owns it. Validate the Agent-tool subagent can
  operate in a worktree the controller created (path passed in the dispatch spec).
- **Is the handshake cheap?** Every phase costs ≥1 `next` + ≥1 `record` round-trip in the
  model's context. If the controller emits *batched* actions (e.g. "dispatch planner, then I'll
  validate") the round-trips stay ~2/phase. Measure it — a chatty handshake that costs more
  orchestrator tokens than the hand-run bookkeeping it removes would **kill the win.**

---

## 3. Scope — the vertical slice

Prove the architecture on the **narrowest slice that exercises every hard part**: `plan → build
→ test`, because that trio is the smallest that contains (a) sequencing, (b) per-phase retry +
model-tier escalation, (c) a **cross-phase rewind** (test→build), and (d) three real validators.

**Control flow — validated with MOCKED phase outputs** (canned `phase_output.json` fixtures, so
no live subagents are needed to test the state machine):
- Sequencing plan → build → test on a "green" fixture set → clean terminal.
- A "test-fails-because-code" fixture triggers exactly **one** test→build rewind:
  `cross_phase_rewinds.test` increments, it does **not** consume a build retry, a
  `corrections.json` (classification `code`) is written into the fresh build attempt, the build
  attempt escalates one tier (`tier_input.source: cross-phase-rewind`). A **second** test-code
  failure terminates `TEST_GATE_FAILURE`. (This is the budget-as-code proof — the exact
  bookkeeping `phase-gates.md:158-175` says is the most double-count-prone in prose.)
- Idempotency: re-invoking `next` on an unchanged tree returns the same action (no double-advance).

**Handshake — validated with ONE live dispatch:** run a real `adws-planner` through
`next → (model dispatches via Agent tool) → record`, producing a real plan `phase_output.json`
and a passing `task-normalize` gate. Proves the protocol works in the harness end to end.

**Evidence compatibility — validated against golden fixtures:** the controller's generated tree
must be scored by the **unmodified** `adws-pipeline/scripts/execution-report.js`. This is
turn-key: **25 golden trees already exist** in `parity/execution-report-fixtures/*/artifacts/`,
covering every terminal state the controller must produce (`promote_clean`, `retry`, and 20+
`quarantine_*`/`promote_*` variants), each with a canonical `run_manifest.json` +
`task_contract_snapshot.json` + scored `execution_report.{json,md}`. The spike **reverse-engineers
the output schema from worked examples** rather than inventing it. Concrete starting targets:
`promote_clean/artifacts/job-2f8c1a` (the happy path) and `retry/artifacts/job-c31f57` (the
rewind path). Exit contract is confirmed in the scorer header: 0 PROMOTE / 10 PROMOTE-with-warn /
1 RETRY / 2 QUARANTINE. `parity/execution-report-fixtures/run-tests.js` is the existing harness
the compat check can piggyback on.

---

## 4. Explicitly OUT of scope (keep the box shut)

- The other four phases (review, document, ship, verify) — mechanical repetition once plan/build/test holds.
- **Consensus** (Critic/Advocate), the **grader**, the **entropy gate** — the state machine
  models them as dispatch-actions later; not needed to prove the architecture.
- The full 5-family rewind model — one rewind (test→build) proves the pattern; the rest is copy-paste.
- Resume/carry-over (SC-13), evidence archive/teardown (SC-11), delegated push (F-5), Codex aliases/fable.
- **Rewriting the real SKILL.md.** The spike produces a *sketch* of the thin interface (§8), not the final prose.
- Production error handling, retries on transient API errors, secret redaction — throwaway quality is expected.

---

## 5. Deliverables

1. `spike/adws-controller/adws-run.js` — throwaway controller: `next` + `record` verbs, plan/build/test state machine, budget-as-code, evidence-file generation, terminal exit-code.
2. `spike/adws-controller/fixtures/` — canned phase outputs (green set + test-fail-code set).
3. `spike/adws-controller/FINDINGS.md` — the answers to §6, the measured handshake round-trip
   count and token estimate, the evidence-compat result, the budget-as-code result, the
   SKILL.md→controller line-delta measurement, and a **go/no-go** for the full controller.
4. A **thin-SKILL.md sketch** (§8) showing what the ~40-rule prose orchestrator collapses to.

---

## 6. Success criteria (falsifiable — these are the five questions)

The spike succeeds if it produces a clear yes/no to each, with evidence:

1. **Handshake works in-harness:** the live `adws-planner` dispatch flows `next → dispatch →
   record` and yields a valid plan output + passing `task-normalize` gate. *(yes/no)*
2. **Evidence is compatible:** the controller-generated tree is scored by the unmodified
   `execution-report.js` with the expected exit code (0/10/1/2), matching a hand-verified
   expectation and the golden-fixture schema. *(byte-diff against a golden tree)*
3. **Budget-as-code is correct:** the test-fail-code fixture produces exactly one test→build
   rewind with the counters, `corrections.json`, and tier-escalation `phase-gates.md` prescribes;
   a second failure terminates `TEST_GATE_FAILURE`. *(assert against the reference table)*
4. **It is idempotent:** re-running `next` mid-state does not double-advance. *(critical — the
   model may call it twice.)*
5. **The win is real and measured:** X lines of SKILL.md + phase-gates prose are replaced by Y
   lines of controller code + Z lines of thin interface, **and** the handshake costs ≤ ~2
   model round-trips/phase (not a token regression). *(the go/no-go number.)*

---

## 7. Handshake protocol sketch (concrete)

```bash
# Intake (model has already normalized the contract to task_contract_snapshot.json)
node adws-run.js init  <contract.json> <target_repo> [--evidence-dir DIR]
  # → creates artifacts/{jobId}/, run_manifest.json, worktree (git worktree add), prints {jobId}

node adws-run.js next  artifacts/{jobId}
  # → {"action":"dispatch","phase":"plan","agent":"adws-planner","attempt":1,
  #    "attempt_dir":"artifacts/{jobId}/plan/attempt_1","inputs":{...},"model_tier":"opus"}

#   model: dispatch adws-planner (Agent tool) into attempt_dir, write phase_output.json
node adws-run.js record artifacts/{jobId} plan 1 <phase_output.json>
  # → controller runs task-normalize, writes skill_trace + phase_manifest, computes gate
  #   {"action":"advance","gate":"pass","next":"build"}   (or "retry"/"rewind"/"terminal")

node adws-run.js next  artifacts/{jobId}
  # → next dispatch action … loop until:
  # {"action":"terminal","verdict":"PROMOTE|RETRY|QUARANTINE","exit_code":0,
  #  "report":"artifacts/{jobId}/execution_report.md"}
```

The model's *entire* job becomes: call `next`, do the dispatch it names, call `record`, repeat.
All counting, gating, tier selection, evidence writing, and verdict logic is code.

---

## 8. Thin-SKILL.md sketch (what §6.2 buys)

**Before (current):** SKILL.md (429 lines) + phase-gates.md (601) + artifact-layout.md (473) +
validator-inputs.md (140) hold ~40 live rules, 13 counters, 5 rewind families, tier tables,
saturation vocabulary — all *interpreted* by the model each run.

**After (target):** SKILL.md ≈ intake + the handshake loop + the human-decision boundaries only:

```
1. Normalize the request into the task contract (references/task-contract.md). Ask on ambiguity.
2. node adws-run.js init <contract> <repo>
3. Loop: run `node adws-run.js next`; on "dispatch", call the named agent into attempt_dir,
   then `node adws-run.js record …`. Repeat until "terminal".
4. Human-decision points the controller SURFACES (it never decides these):
   - Advocate dissent → present to operator, pass resolution back via `record … --resolution`.
   - requires_human_approval_before_ship → show diff, wait, then continue.
   - delegated push (no creds) → operator pushes, confirm back to the controller.
5. Relay the controller's terminal verdict, PR/branch/patch, and execution_report.md path.
```

The deterministic machine leaves the prompt; only genuine **human-in-the-loop** decisions and the
**intake judgment** remain model work. That is the §6.1 "prose engine" problem, solved.

---

## 9. Risks & kill-criteria

| Risk | Signal | Mitigation / kill |
|---|---|---|
| **Chatty handshake costs more than it saves** | > ~2–3 model round-trips per phase, or large per-call context | Measure in §6.5. If the handshake is a token regression, **kill §6.2** — the incremental §5 levers are the answer instead. |
| **Evidence schema drift** | `execution-report.js` mis-scores or errors on controller output | Build against golden fixtures as regression tests from line 1; if the schema can't be matched without editing the scorer, that's a scope expansion — note and stop. |
| **Worktree ownership tangles with Agent-tool isolation** | subagent can't operate in the controller's worktree | Try controller-owned `git worktree add` first; if the Agent tool must own isolation, document the split and re-scope. |
| **Determinism/timestamps** | evidence timestamps must be real UTC (`date -u`), not fabricated | The controller calls real wall-clock (`new Date().toISOString()`) — legitimate; this is a normal Node script, not a workflow script, so `Date`/`Math.random` are available. |
| **Spike creep** | you're building phase 4–7, consensus, or resume | The time-box and §4 out-of-scope list are the guardrail. Answer the five questions and stop. |

---

## 10. Sequencing (inside the time-box)

1. **Skeleton + evidence-compat first** (highest-risk, decides go/no-go): `init` + `next` +
   `record` for `plan` only, mocked planner output, scored by `execution-report.js` against a
   golden tree. *Answers Q2.*
2. **Add build + the test→build rewind**, mocked outputs. *Answers Q3, Q4.*
3. **One live `adws-planner` dispatch** through the real handshake. *Answers Q1.*
4. **Measure** the line-delta and round-trip count; write FINDINGS.md with the go/no-go. *Answers Q5.*

If step 1 already shows evidence incompatibility that requires editing `execution-report.js`, or
step 3 shows a token-regressive handshake, **stop and record the kill** — that is a successful
spike outcome, not a failure.

---

## 11. Status (2026-08-11, after the step-3 branch)

Steps 1, 2 and 3 of §10 are done; **step 4 is not, and step 4 is the one that decides.** The
§6.2 go/no-go is still not callable, but the reason has narrowed: Q1–Q4 are answered, and Q5
is now *half* measured rather than untouched — round trips and handshake payload are real
numbers inside the bar, the line-delta and token-behaviour half is still zero.

Step 1 went through three adversarial rounds; step 2 had two, which between them found four
fail-OPEN defects in the one gate the controller owns outright. **Step 3 found two more in
twenty minutes, and it found them by running a real subagent rather than by reading harder.**
Both had one cause — the controller and the phase agent write the *same file* by instruction,
and the controller read that file's existence as its own act — and neither was reachable from
the mocked path at all: `NEVER_INGEST` means a replayed attempt structurally cannot contain
an agent-written `phase_manifest.json`. One of them meant a live run went terminal with the
planner's output unread; the other meant an agent could grant itself its own gate and the
controller would dispatch the next phase against it. See `FINDINGS.md` findings 18 and 19.

Code and evidence: `spike/adws-controller/` (`adws-run.js`, `verify-canonical.js`,
`mk-risk-trace.js`, `fixtures/`, five drivers, the ingest matrix) and `FINDINGS.md`, which is
the deliverable and carries the detail this section summarises. The one live dispatch's
evidence is archived at `fixtures/live_plan_attempt/` and replayed by `run-step3.sh`, so the
step-3 result is re-checkable without spending another subagent run.

### Against the five questions of §6

| Q | Status | What is actually established |
|---|---|---|
| 1. Handshake works in-harness | **yes**, for one phase | one real `adws-planner` subagent dispatched through `next → dispatch → record` at the tier the controller advertised, into the directory it named, writing a genuine plan (3 files inside `allowed_paths`, 4 criteria mapped); gated `pass` by a `task-normalize` run the controller really performed, on a tree that is CANONICAL OK. Six of the seven phases have still never run live |
| 2. Evidence is compatible | **yes, with the oracle changed** | the controller-generated tree is scored by the unmodified `execution-report.js` at the expected exit code, and for the 25-fixture corpus driven through `init → record → finalize` (MISMATCH: 0, and step 2 removed all three declared limits). See the note on the byte-diff below |
| 3. Budget-as-code is correct | **yes** | one test→build rewind with the prescribed counters, `corrections.json` and tier escalation; a second code failure terminates `TEST_GATE_FAILURE`; the rewind and check-defect budgets are independent and neither consumes a build retry; the F-47 three-build-attempt tree is reproduced with the accounting intact; the retry ladder escalates sonnet→opus→fable and exhausts, matching the `retry` fixture's recorded ladder |
| 4. Idempotent | **yes** | `next` is byte-identical on an unchanged tree (this required a fix — step 1's dispatch stamp moved), a recorded attempt cannot be re-recorded, and a second `finalize` is a no-op. Resume / `carry_over` remain unproven |
| 5. The win is real and measured | **half** — and the half that decides is the missing one | MEASURED: 2 model turns/phase in steady state (`next`→dispatch→`record`, with `record` batching into the following `next`), against this section's "≤ ~2" bar; handshake payload 173/740/400 bytes for `init`/`next`/`record` ≈ 1.1 KB ≈ ~300 tokens per phase, against the 170,249 tokens the plan dispatch it carried actually cost — ~0.2%, so no token regression at the margin. NOT MEASURED: the SKILL.md + phase-gates line-delta, and whether the model's per-phase reasoning shrinks once it stops hand-executing counters. **No go/no-go** |

### Where this plan was not followed, and why

- **Q2's oracle changed.** §6.2 specifies *"byte-diff against a golden tree"*. That was the
  wrong oracle and the spike says so: the golden fixture is deliberately minimal — it
  exercises the scorer's tolerant reader and omits `tier_input`, `stability_gate`,
  `provenance` and the `run_manifest` run-state floor — so matching it byte-for-byte would
  prove the controller is as minimal as a test stub, not that it is a conformant writer.
  `verify-canonical.js` validates against the **writer** contract in
  `references/artifact-layout.md` instead, and measures the gap: the golden tree carries
  **66 violations** of the floor a real orchestrator must emit. Recording that gap is a
  better answer to Q2 than a diff that would have been green for the wrong reason.
- **Deliverable §5.2 (`spike/adws-controller/fixtures/`) arrived in step 2, not step 1.**
  Step 1 read `parity/execution-report-fixtures/` directly, on throwaway copies, and that was
  right for the compatibility question. Step 2 could not: 24 of the 25 corpus test outputs
  carry no `checks` array, so nothing in that corpus can trigger a rewind. The step-2 fixture
  set exists because the routing decision reads a field the corpus does not record.
- **All seven phases are implemented, though §4 scoped the slice to plan/build/test.**
  `pipeline_completion`, `phase_gates` and the FR-12 tier re-key at the review gate cannot be
  exercised on a three-phase tree, and the counterexample that refuted round two lives
  precisely in those gates. The expensive out-of-scope items stayed out — consensus and the
  grader are still read as evidence, never run.
- **Step 2 gave up the "single-sourced from the scorer" property, deliberately and
  partially.** `execution-report.js` has no gate over the test phase's `checks[]` and never
  reads `classification`, so a controller that owns retries and rewinds must own a gate the
  scorer is silent on. The scorer stays authoritative wherever it speaks (its `fail` is
  final; the added layer can only ADD failures), the addition is keyed to the contract's
  declared `policy.test_policy` rather than to the shape of the evidence, and a reduced gate
  is reported on every handshake message. `FINDINGS.md` states this before anything else,
  because concealing it is how round two happened.

### The kill-criteria have not fired

§9 names two conditions that would kill §6.2. Neither has, and step 3 moved the second from
"unmeasured" to "measured and favourable at the margin": the evidence schema was matched
**without editing `execution-report.js`** (the controller `require()`s it and consults its
exported `buildReport()` as a read-only oracle), and the handshake costs ~1.1 KB per phase
against a dispatch that cost 170k tokens. §9's "spike creep" risk is now the *only* live one.
**Step 4 is the entire remaining scope. Do not add rewind families, validators, phases, or
resume logic before the line-delta is counted**: none of them can change the go/no-go, and
Q5's missing half can still kill the whole thing.

The one thing that would justify more live work before step 4 is in `FINDINGS.md` under
step 3's lesson: the mocked path was not a weak test of the two defects step 3 found, it was
**no test of them at all**, and the six phases that have never run live are in exactly the
position the plan phase was in before it ran. That is an argument about *risk*, not about the
go/no-go — it does not override the ordering above.

### Open before any step-4 claim

- The terminal `failure_reason` vocabulary flattens `ADVOCATE_DISSENT` and evidence-integrity
  breaches — which `execution-report.js` itself classifies as non-retriable — into a blanket
  gate-failure reason. Unchanged by step 2. Fixing it needs a classification the controller
  can *source* from the scorer, not re-derive by parsing gate detail strings, which is the
  partial-reimplementation trap round two was built to fix.
- Four step-2 decisions are positions taken where the documents do not settle the question
  (forward-re-run budget, routing precedence, the environment-gap halt, and the attempt-level
  route annotations). All four are marked as decisions in `FINDINGS.md` and are the first
  things an adversarial pass should attack.
- **One deviation from the letter of a shipped rule, which is a question FOR the skill.**
  SC-13/F-76 step 3(b) asks the orchestrator to confirm that a repaired defect's regression
  check is "a NEW row … not a pre-existing row for the same criterion", while
  `artifact-layout.md` tells it to identify that row by the CRITERION's `criteria-to-checks`
  id — and one criterion may legitimately carry several checks. The property is therefore not
  decidable from the id the rule names, and every alternative in the documented row shape is a
  field the tester writes. The spike mints a correction-scoped `REG-{source_attempt}-{k}` id
  for every `code` correction instead (`FINDINGS.md` finding 14). Either the rule or the row
  schema needs an assertion-level identity; this is not a spike-local choice.
- **`make ci` is not evidence about this code.** `scripts/local-ci/gate.sh` validates the
  shipped paths only — correctly, since the spike must not be able to affect them — so a green
  gate says nothing about `spike/`. `run-step2.sh` and `run-step3.sh` each carry their own
  syntax and NUL-byte sweep (finding 15). Every validation claim below rests on the drivers,
  not on `make ci`.
- **A second deviation that is a question FOR the skill, from step 3 (finding 19).**
  `phase_manifest.json` carries `gate_result`, which the agent specs call "the ORCHESTRATOR'S
  designated post-hoc field, never yours" — in a file those same specs instruct the agent to
  write. So the orchestrator's field lives in the agent's file, and nothing about the file
  distinguishes the two authors. An agent that writes `gate_result: "pass"` into its own
  manifest was believed by the controller's sequencing oracle, which then dispatched the next
  phase against a gate the agent granted itself. The spike closes it with `.decisions.json`,
  a controller-owned ledger at the job root, whose verdict is BOUND to the manifest's — a
  disagreement is an evidence-integrity breach, not a re-run. (Two review passes shaped this:
  the first cut keyed authorship to the `provenance` floor *inside* the manifest, which sits
  in the file the agent is told to write; the second stored the verdict in the ledger without
  comparing it, so a recorded `fail` could still be flipped to `pass` after recording.)
  **There is no permission behind the ledger, and that is the deeper finding**: the
  orchestrator and its subagents are the same OS principal, so no orchestrator-owned file is
  protected by anything stronger than the agent's instructions. The ledger does not make
  forgery impossible; it makes forgery require *violating* a prohibition rather than
  *following* an instruction — and both defects step 3 found were agents doing exactly as
  told. **The question for the skill is unchanged by the fix**: `gate_result` is the
  orchestrator's designated field inside the agent's file, so every orchestrator — this
  controller or the prose one — needs a record outside it to know its own decisions. That is
  a gap in the shipped artifact layout, and no code in `spike/` can close it.
- **Two silences the spike has now found in the same shape, one phase apart (findings 16, 17).**
  `execution-report.js` does not evaluate the test gate's `checks[]` (step 2) and does not
  evaluate the plan gate's "per-criterion file-change proposal" (step 3). In both cases the
  recorded corpus cannot satisfy the documented exit criterion — 24 of 25 test outputs carry
  no `checks`, and 0 of 25 plan outputs carry `file_change_proposal`. Separately, all 25
  fixtures record a `plan-coherence` verdict of `pass` over contracts that `task-normalize`
  scores `fail`, with no `output` key for SC-8/F-55's mismatch check to read. **Whether the
  reference documents or the recorded evidence is the contract is not a spike-local call**,
  and it is the largest unresolved question the spike has surfaced. Both gates report a scope
  string on every handshake message meanwhile, which makes the reduction loud but does not
  settle it.
