# ADWS pipeline skill — simplification analysis vs. the original ADWS

**Date:** 2026-08-10
**Author:** external analysis (Claude Code session), commissioned by the operator
**Question:** the skill run costs more credits and produces more failures/confusion on
`cadence-method-skill` than the original code-based ADWS workflow felt like it did. Where can
we eliminate or refactor to close that gap?

**Method.** Independent deep-reads of both codebases plus the evolution record, then an
**adversarial pass** that tested every proposed cut against this project's own field records
(`docs/field-runs/`, DPPD §§9–22, `AUDIT_2026-08-09.md`). Provenance note: this is an outside
analysis, not an internal audit — it introduces no F-numbers and defers to the audits for the
canonical record. Field-run job IDs below are as cited by the reading agents from
`docs/field-runs/`; verify the exact filenames before acting on any single one.

---

## 1. Headline

The instinct that the skill is over-built is **half right**. There is genuinely removable
machinery — but it is a *small* set, and the adversarial pass **rejected 6 of the 9 largest
proposed cuts**, each time with a reproduced defect from a real `cadence-method-skill` run.

The core finding, stated plainly:

> **The machinery that costs the most is the machinery catching real bugs on this repo.**
> The "multiple failures and credit expenditure" the operator experienced are, to a large
> degree, the *same event* as "the pipeline caught defects and rebuilt." A run that rewinds
> 11 times to repair real bugs is expensive and reads as failure/confusion, but it shipped
> zero of those bugs.

Field evidence the cut-proposals ran into:

- **issue #24** (contract risk = medium): the Critic returned `fail` **five times, every one a
  true positive** — 11 real defects, 10 repaired, **zero shipped**.
- **issue #21** (medium): two Critic catches "invisible to the nine shipped validators."
- **issue #5** (`job_20260805_0004`, merged PR #50): the review-gate **Advocate** caught four
  silently-dropped VERIFIED research findings (one an NFR-1 design-freeze input) that "seven
  gates, nine validators, and a clean `make check` did not."

Every one of those runs was **medium risk** — i.e. inside the tier a "lean lane" would have
run single-sample with no adversary. Those defects would have shipped.

---

## 2. Why it burns credits (precise diagnosis)

It is **not** raw dispatch count on a clean run. A clean skill run is ~12 subagent dispatches
(7 phase agents + 4 consensus + 1 grader); the original is ~16 Claude calls (6 of them cheap
`/commit` message calls). On a clean run they are comparable. The skill costs more because of
four multipliers the original does not have:

| Cost driver | Original ADWS | Current skill |
|---|---|---|
| **Model tier** | all Sonnet, single-sample | Opus planner + **Opus grader every run** + one-tier escalation on every retry |
| **Re-read tax** | phases share the worktree filesystem + a ~10-field `adw_state.json` | **5 of 12 dispatches (Critic, Advocate ×2 gates, grader) re-read the contract + full change set from scratch**, fresh context each time |
| **Retry / rewind** | orchestrator prints "continuing with review" on test failure (`adw_sdlc_iso.py:106-109`) | a rewind re-runs the **entire downstream chain**; real runs hit 18–19 dispatches, modeled worst case 30–45 |
| **Resident context** | trivial subprocess runner (`adw_sdlc_iso.py`, 151 lines, zero domain logic) | orchestrator holds SKILL.md (429 lines) + **~1,782 always-needed reference lines** + ~40 live rules + a 13-counter / 5-family budget model |
| **Orchestrator model** | negligible (Python controller, no LLM) | the top-level session itself runs on a **premium model** — field runs were orchestrated on `claude-opus-5`, `claude-opus-4-8`, and `claude-fable-5`, a large token cost *on top of* the 12 phase dispatches and not captured by the tier table |

**Quantification (parallel independent audit, 19 retained jobs through 2026-08-09).** Sourced
from a local `artifacts/` tree (gitignored, not in the repo), so the *shape* is corroborated by
the committed field-run summaries but the exact counts are not independently reproducible here:
**309 model-role artifacts across 19 jobs — 16.3 per job** (172 phase attempts + 120 consensus
+ 17 grader). **All 172 phase records carry `cost`/`token` = `null`**, so exact credits cannot
be measured from evidence at all — a finding in itself. Outcomes: **4 RETRY, 11
PROMOTE-with-warnings, 4 clean promotes.** The two issue #24 RETRY jobs produced **27 model-role
outputs, ran ~6 h 52 m combined, and shipped nothing.** Of 172 phase attempts, **64 used Opus,
4 the `fable` tier** (see §3.2 for the distinction between the `fable` *tier* and the
orchestrator's `claude-fable-5` *runtime model*).

**Root cause.** The pipeline grew by permanently bolting one always-resident mechanism onto a
single orchestrator for each past incident, and it applies maximum-rigor machinery *uniformly*
to every task. Cost and cognitive load scale with **accumulated mechanism count**, not with
task difficulty. The original's "dumb orchestrator, smart prompt, single-sample, forgiving"
character was replaced by a heavyweight superstructure in which most machinery never fires but
every rule must still be recognized on every run.

**Original architecture, for contrast.** `adw_sdlc_iso.py` `subprocess.run`s each phase and
branches only on return codes; all reasoning lives in the slash-command prompts
(`implement.md` is 12 lines: "Read the plan, think hard, implement"). Test pass/fail reaching
Python is **model-self-reported JSON**, not a deterministic exit-code gate. The only pre-merge
gate is a structural non-None check on 8 state fields. That is why it felt agile — it was
single-sample and forgiving, and it had no deterministic validation, no consensus, no evidence
tree, and no quarantine. Those absences are exactly the differentiators the skill exists to
add; the skill is not "the original plus bloat," it is "the original plus the assurance layer,
plus the accreted cost of running that layer uniformly."

---

## 3. Safe to cut now (adversary-endorsed — zero field-demonstrated loss)

Three changes survived scrutiny. Real simplification, no capability lost.

### 3.1 Delete the step-0 entropy / stability regulator (MODIFY of original proposal)

Remove the pre-dispatch stability gate: `scripts/entropy-gate.js`, SKILL.md phase-loop **step
0** (lines ~163–173), and the `escalate` / `halt` / `saturated` / exit-3 bookkeeping. It has
never fired, `WARN→escalate` is already covered by ordinary retry-escalation, `COLLAPSE→halt`
yields the same RETRY-class terminal that retry-budget exhaustion already produces, and its
one live effect is a *false-positive* tier bump that costs money before dispatch.

- ⚠️ **Keep** the step-6 parse-failure accounting **and** the verify-phase `drift-sentinel`
  validator. The adversary caught that they consume the same `entropy_history.jsonl`;
  `drift-sentinel` is a **ported original-parity pack** (part of the 88/88 parity suite), and
  deleting the accounting silently degrades it to a permanent `[] → SAFE` no-op at verify.
- Optional further trim: replace the drift-sentinel band math *at verify* with a single fixed
  cumulative parse-failure ceiling (one counter, one threshold) — but do not delete the
  accounting outright.
- **Record correction:** the "0-for-139" figure is **139 CI validator-suite executions**, not
  139 field jobs. The real field record is ~15 jobs. Fix this citation in the audit so it is
  not read as field evidence.

### 3.2 Remove the `fable` 4th tier + Codex `luna/terra/sol/nova` aliases (partial of R7)

No *phase-escalation* consumer — every run is all-Claude, capped at Opus; the Codex drill was
deferred. The internal `fable` *tier* appears in the committed evidence only in one seeded
parity fixture (`parity/.../job-c31f57/test/attempt_3`); no validator logic keys on it.

> **Correction (from the parallel audit).** Two claims collided and both were partly wrong. My
> first draft and the adversarial R7 said "zero field presence"; the parallel audit said "four
> reached Fable." The truth splits on a name collision: `fable` names **two different things**.
> (a) The internal ADWS *tier* `haiku→sonnet→opus→fable` — a phase-agent escalation ceiling;
> this is what §3.2 removes, and it still has no real escalation consumer. (b)
> `claude-fable-5`, the actual model an operator ran the **orchestrator session** on for issue
> #107 and #109. Those field-run mentions are (b), not (a). The parallel audit's "4 reached
> Fable" (if from `model_tier: fable` phase records) would be (a) and cannot be reproduced from
> committed evidence — the only committed `model_tier: fable` is the seeded fixture. Net: (a)
> is safe to remove; (b) is a *separate, larger* finding — operators are running the
> orchestrator on premium models (§2, new cost-driver row), which §3.2 does **not** touch.

- Must be **one consistent edit**: cap the ladder at Opus (retry-escalation saturates at Opus
  one tier earlier), drop `fable` from the phase-gates and artifact-layout tier enums, re-seed
  the SC-4 B2 retry parity fixture off `fable`, and confirm `execution-report.js` still
  round-trips the tier column as a pass-through string. A leftover `fable`/Codex reference
  re-opens F-19 (evidence misreporting the executing model).
- This is a **capability decision** (drops latent Codex cross-tool dispatch + the above-Opus
  operator escape hatch), not pure cleanup. Scope it back in behind a real Codex/above-Opus
  run if one ever appears.

### 3.3 Relocate only the detachable war-story narrative (MODIFY of R6)

Move the *detachable* historical narrative — episode counts, "the third time," field-run
pointers — to a `references/rationale.md` the orchestrator does not load at runtime. Examples:
the four-evidence-losses paragraph (~381–384), "which two consecutive RETRY jobs had to
reconstruct in prose" (~121), "a live run silently dropped 1 of 8 criteria" (~415).

- **Keep, inline and readable, the one-line "why" for the three safety-critical orderings:**
  ship-mode-select-before-git, protected-branch-check-before-commit, verify-archive-before-teardown.
  A bare tag pointing at an unloaded file is *worse* than the sentence it replaces — the model
  cannot read the tag's target at the moment it decides sequencing.
- Realistic reduction is **~5–10%**, not the 35–45% first proposed: the 337→424 line regrowth
  was mostly *operative* additions (resume classification, carry-over schema, scratch_root),
  not narrative padding. Frame this as "trim re-accumulated narrative under the F-83 line
  budget," not as reopening the SC-10 floor.

---

## 4. Looks like bloat, is load-bearing — DO NOT cut

Recorded so the effort is not re-spent. Each was rejected against a reproduced field defect.

| Proposed cut | Why it fails | Field evidence |
|---|---|---|
| **Risk-scaled lean lane** dropping consensus for low/medium tasks | Every real run *was* medium risk — inside the lane; the risk signal already under-estimates (issue #22 was contract-medium, review-risk `high`) | issue #24 (11 true-positive Critic fails), #21 (2 catches all validators missed), #5 (Advocate catch) all route single-sample under the lane and ship |
| **Drop the Advocate** | It catches *intent/omission* defects the Critic passes vacuously; opt-in-for-high-risk would have *excluded* the run that proved it (issue #5 ran at medium/Sonnet) | issue #5: 4 silently-dropped VERIFIED findings, violating no acceptance criterion, caught only by the Advocate |
| **Collapse the 5 rewind budgets into one** | The families route to *different terminal verdicts* (drift → QUARANTINE vs. test → RETRY); a single cap-1 budget loses which family exhausted, and the confusion cited was already fixed by the accounting table (F-47) | `job_20260807_0001` legitimately spent `cross_phase_rewinds.test` and `operator_directed_rewinds.review` concurrently |
| **Skip consensus re-runs / the review-gate "overlap"** | The review gate is a second independently-contexted pass; on a non-rewinding run the delta since test is *always zero*, so delta-gating disables it on essentially every run | `job_20260807_0004`: review Critic caught an unscoped identifier grammar (false-failing RFC-2119/ISO-8601) on a **zero-delta** change set. `job_20260809_0004`: defect 11 was manufactured by the fix for defect 9 — caught by the retry re-run |
| **Merge the 7 reference files** | `validator-inputs.md` is not a duplicate — it holds orchestrator-tree/cross-tool synthesis no script header can hold (the drift-sentinel raw-JSONL false-SAFE gotcha; the exit-code-vs-verdict category error). Merging phase-gates+artifact-layout worsens the F-87 partial-read risk | SC-11 placed the exit-code table here to fix an outright exit-3 error in SKILL.md; the drift-sentinel mapping note prevents a silent false-SAFE at verify |
| **Demote the drift-sentinel verify BLOCK to warn** | The ~11-dispatch rewind is owned by the **grader** (which the proposal wanted to keep); it is conditional-on-failure, so it is *never on the routine path* — demoting saves zero routine cost and surrenders the last post-ship AC gate | grader fired productively every run (4/4 … 12/12); F-70 shows it already at the *edge* of adequacy (12/12 while structurally blind), i.e. it needs more teeth, not less |

Two removals from R7 also failed and belong here: **the SC-13 resume path** (the scenario
already occurred — issue #24 `job_0004` adopted `job_0003`'s retained worktree and improvised
unschema'd vocabulary; that improvisation *is* F-73, and RETRY + mandatory worktree retention
fires routinely) and **the check-defect repair branch** (its absence caused the F-55
illegal-override on issue #22 — it is the legal test-gate analog of SC-8's "fix the tool,
re-run, no override" doctrine).

---

## 5. Real efficiency levers — preserve every catch (NOT yet verified)

These attack cost without removing a defect-catch. Two were outside the adversarial set
(priority 10–11), so verify each against a real trace before implementing.

1. **Targeted rewind re-run** *(untested — likely the biggest safe win)*. On a rewind, re-run
   only the downstream phases whose inputs actually changed, gated by the append-only evidence
   that proves what changed — instead of re-running build→test→review→document→ship→verify
   including consensus rounds. This directly attacks the 18–45 dispatch ballooning that
   dominates credit burn. **Verify first** against the issue #24 rewind trace: confirm that a
   skipped downstream phase's inputs were provably unchanged.

2. **Cut the re-read tax.** Give the Critic, Advocate, and grader a pre-assembled change-set
   digest (files + diffs + check results) instead of each fresh-context agent re-deriving it
   from the worktree. Same adversarial catch, materially fewer input tokens per dispatch — and
   these are 5 of the 12 dispatches on a clean run.

3. **Resident-context diet.** The ~2,200 always-loaded lines are a per-run tax on every
   dispatch that inherits orchestrator context. Reference *consolidation* is unsafe (§4), but
   the §3.3 narrative trim and the §3.1/§3.2 rule removals shrink the resident surface without
   touching a validator.

4. **Risk-scale the Opus grader** *(untested — priority 11)*. The grader runs at Opus on every
   full run. Down-tiering it for genuinely low-risk verify *may* be safe, but it overlaps the
   rejected R1 reasoning and F-70's "already at the edge" finding — treat as speculative, keep
   full strength on anything touched by the §4 evidence.

---

## 6. Stronger structural directions (from a parallel independent audit)

A second read-only audit (current `f5dfe498` vs. archive `ca1eabd`, 19 cadence jobs)
**corroborated the central finding** — "the cadence evidence argues strongly against
eliminating independent review" — and added a sharper diagnosis plus four directions that go
beyond §5's incremental levers. These are more ambitious than §3's cuts and, where noted,
better answers to the *confusion* complaint than trimming ever will be.

### 6.1 The confusion driver, named precisely: **the orchestration engine is prose**

The single largest source of execution confusion is that the main model is asked to *interpret*
a deterministic state machine from prose — retry counters, five rewind budgets, immutable-artifact
rules, model escalation, consensus resolution, resumption, archive verification, terminal
lifecycle classification. **Deterministic bookkeeping is being performed by a probabilistic
orchestrator.** The original put exactly this — sequencing and state transitions — in Python.
This reframes §2's "resident context" driver: the problem is not only *how much* the orchestrator
holds, but that it must *execute* it by hand every run.

### 6.2 Move orchestration into code — a `adws-run.js` controller *(structural; largest confusion win)*

> **Status (2026-08-11, after step 4 — the spike is complete). Verdict: GO.** The time-boxed
> feasibility spike is finished — [`SPIKE_CONTROLLER_PLAN.md` §11](SPIKE_CONTROLLER_PLAN.md)
> for the summary, `spike/adws-controller/FINDINGS.md` for the evidence. All five questions
> are answered. Evidence compatibility holds against the unmodified `execution-report.js`
> (Q2); the budget/rewind bookkeeping this section calls "hand-run" is code with the
> accounting asserted (Q3, Q4); one real `adws-planner` subagent was dispatched through the
> handshake and its evidence gated (Q1); and the win is measured (Q5) as a **bracket**,
> because nobody instrumented a real run's context. With the measured handshake included on
> both ends: the orchestrator's instruction mass falls to **20.9%** of before if each
> reference is read once, and to **60.3%** if the model never opens one — **12.22× and 2.36×
> headroom** against the kill criterion. The GO is argued from the pessimistic end.
>
> **The GO carries four conditions**, in the plan's §11: the win is a relocation of the
> interpretation burden and not a reduction in artifact size (the repository grows by ~212
> lines); the margin is a bracket rather than a point, and its low end sits near §9's bar
> rather than far above it; a go on the architecture is not a clearance to skip live
> validation of the six phases that have never run; and whether the model's per-phase
> *reasoning* shrinks is unmeasured — which at 2.36× is load-bearing rather than merely
> qualifying, and is the highest-value experiment left. This recommendation is left as
> written below; the spike is the test of it, not a revision to it.
>
> Four results cut against the section's own framing and belong here rather than only in the
> spike.
>
> **1. Moving a gate into code does not by itself make it stronger.** Step 2 had to implement
> one test-gate condition `execution-report.js` does not evaluate, and all four defects found
> by two review rounds landed in exactly that condition — each a fail-open where the code
> checked for the absence of a failure instead of the presence of a success. The
> deterministic-machine-in-code argument holds for *counters and sequencing*, which are now
> demonstrably correct. It does not extend for free to *judgement the scorer never made*.
>
> **2. The section's premise that a controller can own the deterministic machine has a
> boundary the spike found by crossing it.** Step 3's two defects were both the same shape:
> `phase_manifest.json` carries `gate_result`, which the agent specs call the orchestrator's
> designated field — *in a file those same specs instruct the agent to write*. So the
> orchestrator cannot tell its own decisions from its agents' claims by reading the evidence
> tree, and the controller needed a record outside it. **That is not fixed by moving
> orchestration into code**, because there is no permission boundary to lean on either: the
> orchestrator and its subagents are the same OS principal, so the separation is a contract
> ("never write outside your attempt directory") whichever way §6.2 is decided. A prose
> orchestrator has exactly the same hole and no ledger; the code one at least made it visible
> and testable. That is a real argument *for* this recommendation, and it is a different one
> from the token/confusion argument the section makes.
>
> **3. The mocked oracle was not a weak test of the above — it was no test of it.** Both step-3
> defects were unreachable from `record --from`, because a replayed attempt structurally
> cannot contain an agent-written manifest. Two adversarial rounds had read that code. This is
> the strongest single data point the spike has produced about how much of §6.2 can be
> validated without live dispatches, and the answer is: less than it looks.
>
> **4. "Largest confusion win" is right; "simplification" is not.** Step 4 counted it. 1,300
> of the 1,643 lines in the four orchestrator-facing documents (79%) are deterministic machine
> work — and `references/validator-inputs.md` is 140 of 140, an entire shipped reference whose
> only content is telling a probabilistic model how to assemble nine deterministic function
> calls. But those 1,643 lines of prose become roughly 1,704 lines of controller code plus a
> 151-line interface that absorbs the residue: **the repository gets bigger, by about 212
> lines.** This section sits in a document about simplification, and on a line count §6.2 is
> the opposite of one. What it removes is the mass a probabilistic model must load and
> *interpret* every run, which is the §6.1 problem — a different claim, and the only one the
> measurement supports.

Create a dependency-light Node controller owning profile/phase selection, worktree lifecycle,
attempt counters and rewind budgets, validator invocation, model-dispatch accounting, evidence-file
generation, resume checkpoints, ship, and terminal reporting. `SKILL.md` becomes a *thin*
interface: intake, controller invocation, and the human-decision boundaries.

- **Why it's coherent, not a reversion:** the skill *already* ships ~2,700 lines of deterministic
  Node (9 validators + `execution-report.js`, which already reads the evidence tree to derive the
  verdict). Extending that scorer into a controller that also *writes* the tree and *sequences*
  phases is the natural next step, and it removes the LLM tokens currently spent generating
  `phase_manifest.json`/`phase_log.md`/validator wrappers by hand (§6.4).
- **Honest tension:** DPPD §1.1 set out to be a "pure SKILL.md + subagent" skill with no runtime
  engine. A controller partially re-introduces one. That is a deliberate product decision — but
  the precedent (Node validators + report) means it is a matter of degree, not a betrayal of the
  design. This is the biggest lift here; treat it as its own project, not a quick edit.

### 6.3 Reorder: **grade acceptance *before* ship**, verify only the artifact after *(strong, novel)*

Today the order is document → ship → verify, and the Opus grader evaluates acceptance coverage
**only after a commit/push/PR exists** — so a grader BLOCK becomes a *post-ship* rewind with the
more complex carry-over semantics that §4/§5 both flagged as expensive. Move semantic AC-grading
to **before** ship; make post-ship verify confirm only the remote artifact + digest. This
**keeps the grader's BLOCK teeth** (so it does *not* contradict §4's rejection of *demoting* the
grader) while removing the costliest rewind class from the routine failure path. This is a better
answer, superseding the R9 "demote the verify BLOCK" discussion (§4, rejected): reorder the gate, don't weaken it.

### 6.4 Replace model agents on mechanical phases with code *(dispatch reduction, low risk)*

Several phases dispatch an LLM for work that needs no judgment:

- **`adws-shipper` → deterministic code** driven by the already-computed `ship-mode-select` +
  `patch-compose` results. Shipping is git mechanics gated on validators that already ran — it
  should not be an LLM dispatch at all.
- **Structural verify → code** (artifact exists, paths in-bounds, syntax) — already zero-judgment.
- **Evidence files → controller-generated**, not agent-authored (removes the per-attempt token
  spend on bookkeeping and the agent-authored validator wrapper).
- **`test_policy: skip` → a deterministic `NOT RUN` record**, not a dispatched tester.
- **Documentation conditional** on a deterministic change-impact check, instead of always running
  the document phase to emit an empty delta.

### 6.5 Workflow profiles with the Critic **always on** — the *safe* version of the lean lane

The parallel audit proposes `patch` / `standard` / `assured` profiles, with the current
twelve-dispatch workflow becoming `assured` (not the universal default). Crucially this is **not**
the §4-rejected lean lane: `standard` keeps the **Critic required on every run** and makes only
the *Advocate*, grader, and documentation conditional.

- **Where it's safer than the rejected R1/R3:** the defects in issue #21 and #24 were Critic
  catches — `standard` keeps the Critic, so those still fire.
- **Where the §4 risk persists:** issue #5 was an *Advocate* catch at *medium* risk. Any
  conditional-Advocate trigger ("ambiguity, dissent, semantic-documentation, elevated risk") must
  be **conservative**, because the Advocate exists to catch what you did *not* anticipate — and
  the risk signal already under-estimates at the boundary (issue #22). Recommend: fire the
  Advocate whenever the task involves research/synthesis/omission-prone deliverables, not only on
  "high risk." This is an **operator decision** with the same posture caveat as §7.

### 6.6 Enforceable cost ceilings (given `cost`/`token` = `null`)

Because runtime cost telemetry is unavailable (all 172 phase records carry `null`), govern with
controls the system can always *observe*: `max_model_dispatches`, `max_high_tier_dispatches`,
`max_rewinds`, `max_elapsed_minutes` — with **operator approval required before exceeding any
ceiling.** This is the one control that would have stopped the issue #24 pair at, say, 15
dispatches / 3 hours instead of 27 / ~7 h with nothing shipped. Pairs naturally with the §6.2
controller (which is what would count dispatches).

### 6.7 Incremental resumption

Persist phase validity by contract-digest + changed-file-digest; on a rewind or successor job,
**resume at the earliest invalidated phase** (skip plan when the contract is unchanged; resume at
build/test), preserve prior regression checks, and distinguish a novel defect from a recurrence.
This is §5.1 (targeted rewind) generalized to cross-job resumption, and it keeps the §4-protected
resume path while making it *incremental* instead of a fresh seven-phase loop.

### What the parallel audit agrees must **not** be copied from the original

The original is a composability *reference*, not a safe base: its full SDLC deliberately
**continued past failed tests** ("might be flaky", `adw_sdlc_iso.py:93`), invoked Claude with
`--dangerously-skip-permissions` (`adw_modules/agent.py:325`), and its ship path directly
checked out, merged, and pushed `main`. The target design is **original-style executable
composition + the current worktree, validator, regression, evidence, and git safeguards** — not
a revert.

---

## 7. The strategic fork (the operator's call, not an optimization)

There is a legitimate version of the original's feel that none of §3–§5 delivers: the
original's cheap, forgiving, "continue anyway" character is a **different risk posture, not a
free optimization.** The original shipped defects and relied on human review; the skill catches
them and rebuilds. If `cadence-method-skill` work would rather ship-fast-and-review-manually
than pay the pipeline to guarantee correctness, that is a valid choice — but it is a choice to
be *less rigorous* (an **opt-in lean mode**: single-sample, no consensus, tests warn-not-block),
and it should be made deliberately, not backed into by deleting gates one at a time. Its
explicit trade-off: lean-mode runs ship the class of defect §1 documents the adversary catching.

---

## 8. Summary

| # | Change | Verdict | Effort | Credit effect | Risk |
|---|---|---|---|---|---|
| 3.1 | Delete step-0 entropy regulator (keep step-6 + verify drift-sentinel) | **CUT** | med | removes a per-attempt step, a script, a false-positive tier bump | none demonstrated |
| 3.2 | Remove `fable` *tier* + Codex aliases (not the orchestrator's runtime model) | **CUT** | low | removes an alias layer + a tier enum value | drops latent Codex/above-Opus capability |
| 3.3 | Relocate detachable war-stories (keep safety whys inline) | **CUT** | low | ~5–10% SKILL.md resident context | loses at-a-glance history only |
| 6.3 | Grade acceptance **before** ship; verify only the artifact after | **REFACTOR** | med | removes the costliest rewind class (post-ship) from the routine path, keeps grader teeth | ordering change; regrade if artifact differs post-ship |
| 6.4 | Replace mechanical-phase agents with code (shipper, structural verify, evidence gen, skip→NOT-RUN, conditional docs) | **REFACTOR** | med | drops LLM dispatches + per-attempt bookkeeping tokens for zero-judgment work | none if code mirrors current deterministic outputs |
| 6.6 | Enforceable cost ceilings (dispatches / high-tier / rewinds / minutes) | **ADD** | low | caps runaway jobs (issue #24 would have halted at ~15/3 h, not 27/~7 h) | needs operator-approval UX |
| 5.1 / 6.7 | Targeted rewind re-run → incremental cross-job resumption | **VERIFY** | med | attacks 18–45 dispatch ballooning — biggest safe lever | miss an interaction if inputs mis-classified unchanged |
| 5.2 | Pre-assembled change-set digest for consensus/grader | **VERIFY** | med | fewer input tokens on 5 of 12 dispatches | none if digest is complete |
| 6.2 | Move orchestration into a `adws-run.js` controller; SKILL.md → thin interface | **STRUCTURAL** | high | removes hand-run bookkeeping + evidence-gen tokens; biggest *confusion* win | partial re-introduction of a runtime engine (DPPD §1.1 tension) |
| 6.5 | Profiles (`patch`/`standard`/`assured`) with **Critic always on** | **OPERATOR DECISION** | med | `standard` avoids Advocate/grader/docs when not needed | conditional Advocate must be conservative (issue #5) |
| — | Lean lane / drop Advocate / collapse budgets / skip consensus / merge refs / demote verify BLOCK / drop resume / drop check-defect | **DO NOT CUT** | — | — | ships reproduced field defects |
| 7 | Opt-in lean mode (deliberate lower-rigor posture) | **OPERATOR DECISION** | med | large, on lean runs only | lean runs ship defects consensus would catch |

**Net.** Two independent audits converge: the honest savings from *removing* machinery are
modest (§3), because the expensive parts are catching real defects on this repo (§4). The large,
safe wins are **refactors, not deletions** — grade-before-ship (§6.3), mechanical-phases-to-code
(§6.4), targeted/incremental re-runs (§5.1/§6.7), and above all moving the deterministic state
machine out of the prose orchestrator into a controller (§6.2), which attacks the *confusion*
complaint directly. Making the skill *feel* like the original is a posture change (§7) or the
`standard` profile (§6.5), not a cleanup — and the field record says the rigor is earning its
cost on exactly the repo where the pain was felt.
