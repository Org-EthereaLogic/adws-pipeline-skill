# SC-6 Plan — An Exit for a Dissent That Is Right

**Status:** APPROVED (operator R-6, 2026-08-06, per item) & IMPLEMENTED — merged to `main`
via PR #38 (squash `029ee0d`), which carried M-2 and M-3 in the same commit. `DPPD.md` §16
is the governing record (v1.6); `WBS.md` records the implementation. This document is
retained as the originating plan and verification ledger (`SC5_PLAN.md` is the precedent
format).

**Evidence source:** a production field run against `Org-EthereaLogic/cadence-method-skill`
issue #5 (job `job_20260805_0004`, 2026-08-05/06), shipped as PR #50.

**Evidence boundary — and this time it holds.** Unlike `job_20260805_0003` (SC-5), this
run's evidence tree **survived**: it sits in the target repo's primary checkout at
`artifacts/job_20260805_0004/`, which hard rule 5 keeps outside the worktree, so
`git worktree remove` did not take it. Every claim below was therefore re-derived from
the tree rather than accepted from the orchestrator's summary, and the two that matter
most were re-derived *against* it:

- The concurrent dispatch (F-35) is in the timestamps, not in the self-report:
  `test/attempt_1/phase_manifest.json` records the tester running
  **23:09:56Z → 23:15:42Z**, while `consensus/advocate.json` is stamped **23:13:02Z**
  and `consensus/critic.json` **23:14:06Z** — both inside that window. `attempt_2` and
  both review rounds show the correct serialized shape, so the run is its own
  before/after pair.
- The report's blindness to the repaired dissent (F-38) is in the artifact:
  `execution_report.md` renders `| consensus | pass | 2 round(s) clean |` for a job
  whose `review/attempt_1/consensus/advocate.json` carries a `verdict: "fail"` with a
  full dissent text.

The one thing this plan does NOT claim to have re-derived is the *substance* of the
dissent — whether the four dropped findings were genuinely decision-relevant to the
target repo's downstream work packages. That is a cadence-method-skill judgment, it was
made by that repo's operator, and nothing in SC-6 depends on it. SC-6 is about what the
pipeline does with a dissent the operator has already judged correct.

**Numbering:** continues the findings register (last: F-34, `SC5_PLAN.md` §6). This run
produced **F-35 … F-40**. F-35 and F-36 are docs/prompt defects with no requirement,
story, criterion, or taxonomy movement — they land as **maintenance audit M-2**
(`DPPD.md` §15), the same vehicle as M-1. F-37 … F-40 are SC-6.

**Decision boundary this plan enforces:** SC-6 adds a resolution *action* and makes an
existing gate *see* more evidence. It adds no DECISION, no exit code, no terminal
failure-reason class, and no gate key. The verdict taxonomy is frozen exactly as it was
under SC-4 and SC-5. What changes is which evidence the `consensus` gate is allowed to
look at, and what the operator is allowed to do about a dissent they agree with.

---

## 1. Findings register (field run job_20260805_0004)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-35 | defect (silent, safety) | **The consensus parallel mandate states no boundary.** `SKILL.md` and `phase-gates.md` both require Critic ∥ Advocate in capitals ("REQUIRED, not merely permitted"), and express the ordering only as the parenthetical `Architect → (Critic ∥ Advocate)`. Nothing forbids widening the batch to include the phase agent, and a runtime that encourages batching independent calls will do exactly that. The consensus agents then read a worktree the phase agent is still writing — and they cannot tell a mid-write tree from a finished one, so the failure is silent by construction. | `phase_manifest.json` / `consensus/*.json` timestamps at `test/attempt_1` (above); `SKILL.md:158`, `phase-gates.md:136-139` (pre-change) |
| F-36 | defect (data loss risk) | **The tester is instructed to do what the reviewer is forbidden to do.** `adws-tester.md` and `phase-gates.md` named `git stash push --include-untracked` … `git stash pop` as *the* falsifiability-baseline technique, while `adws-reviewer.md` has always prohibited `git stash` in the worktree, with the correct rationale ("a crash mid-stash orphans the uncommitted change set"). The hazard is strictly worse for the tester: at the test gate the worktree holds the ONLY copy of an uncommitted, partly untracked change set. Independently of F-35, a dispatch that dies mid-stash loses the entire build. | `.claude/agents/adws-tester.md:30-32`, `phase-gates.md:96` vs `.claude/agents/adws-reviewer.md:27-31` (pre-change) |
| F-37 | design gap (inverted incentive) | **There is no documented exit for a dissent that is CORRECT.** The resolutions were `override` (false positive), `uphold` (→ terminal `ADVOCATE_DISSENT`, quarantine), and F-6's fresh re-review (for a *suspected* false positive). All three assume the dissent is wrong or the job is over. "The Advocate is right — fix the deliverable and check again" was undefined, so a correct dissent's only sanctioned path was termination: the Advocate succeeding looked, procedurally, like the job failing. The live run took the undefined path anyway and improvised its bookkeeping. | `phase-gates.md` "Consensus" rules 2 and 5 (pre-change); `run_manifest.operator_notes_runtime` and `operator_directed_rewinds` in `job_20260805_0004` |
| F-38 | defect (FR-7 breach) | **Repairing a dissent made it disappear; overriding it did not.** The `consensus` gate reads latest attempts only — a deliberate and correct contract, so a superseded failure cannot permanently fail a job a retry fixed. But combined with F-37's missing path it meant the STRONGEST resolution was the invisible one: the live report reads `consensus: pass — "2 round(s) clean"` for a job whose evidence records a blocking dissent, while an `override` (the dissent was wrong and nothing changed) has warned since F-3. The pipeline surfaced the resolution that changed nothing and hid the one that changed the shipped artifact. FR-7's "a resolved dissent is never silent" did not hold on this path. | `execution_report.md` Gates table vs `review/attempt_1/consensus/advocate.json`, `job_20260805_0004`; `execution-report.js:127-132`, `:438` (pre-change) |
| F-39 | schema gap | **The improvisation had nowhere legal to write itself.** `corrections.json.source_attempt` admitted only `test/attempt_{n} \| verify/attempt_{n}` — the two gate-automatic rewind origins — so a review-gate repair had no conforming value; the orchestrator wrote the truthful `review/attempt_1` out of enum and said so, which was the right call and should not have been necessary. `operator_directed_rewinds` was likewise undocumented, and the `resolution.action` enum had no `repair`. | `artifact-layout.md:135`, `:181` (pre-change); `build/attempt_2/corrections.json` and `run_manifest.json` in `job_20260805_0004` |
| F-40 | defect (self-contradicting output) | **"gate-failed — attempt 1: pass".** `buildWarnings` hard-codes "gate-failed" into the multi-attempt sentence while rendering each prior attempt's actual `gate_result`. Under ordinary retries a prior attempt has always failed, so the assumption held — until a rewind superseded attempts that had PASSED their own gates, which is exactly what an operator-directed repair does to build and test. The live report contains the contradiction twice. | `execution_report.md` Warnings, `job_20260805_0004`; `execution-report.js:723-731` (pre-change) |

**Root cause.** F-37 and F-38 are one defect seen from two sides. The consensus machinery
was built to answer "should this promote?" and answers it well; it was never given a way
to record "this was wrong, we fixed it, here is the proof." Every resolution the spec
offered was terminal in one direction or the other — clear it, or end the job. Once the
only non-terminal response had to be improvised, the improvisation necessarily landed
outside the schema (F-39) and outside the report's field of view (F-38), and the report's
prose assumptions about what a "prior attempt" means broke with it (F-40).

F-35 and F-36 share a different root: both are places where the spec's *emphasis* and the
spec's *safety boundary* were written at different volumes. "Run these in parallel
(MANDATORY)" with the limit left implicit, and "establish a baseline (stash the changes)"
with the prohibition living only in a sibling agent's file.

---

## 2. Actions

### M-2 (docs/prompt only; no code, no schema, zero parity risk)

- **A1 (F-35)** — `SKILL.md` §2 step 3 and `phase-gates.md` "Consensus" rule 1 now state
  that the parallel set is EXACTLY `{Critic, Advocate}`, that the `Architect →` arrow is
  a BARRIER (phase evidence written and validators run before either is dispatched), and
  why the failure mode is silent. The live timestamps are cited in the reference so the
  next reader sees a real instance rather than a hypothetical.
- **A2 (F-36)** — `adws-tester.md` step 2 and `phase-gates.md` "Falsifiability" replace
  the stash technique with a non-mutating baseline (`git archive {target_branch}` into a
  scratch dir, a temporary worktree/clone created OUTSIDE the pipeline worktree, or
  `git show {target_branch}:<path>` for targeted checks). `adws-tester.md` gains the
  reviewer's prohibition verbatim in substance, with the test-gate-specific reason (the
  worktree holds the only copy).

### SC-6 (spec + evidence schema + report)

- **A3 (F-37)** — `resolution.action: "repair"` becomes the fourth resolution, with a
  new `phase-gates.md` section "Operator-directed repair of a correct dissent" defining
  the full mechanic: the confirming `resolution`, the attempt-level
  `failure_reason: "ADVOCATE_DISSENT_REPAIRED"` (an ATTEMPT annotation only — it never
  reaches `run_manifest.failure_reason`, the terminal reason classes, or
  `decideLifecycle`, so the taxonomy stays frozen), the rewind to build carrying the
  dissent as `corrections.json`, the F-6 tier escalation, and rule 7's fail-closed case
  (a `repair` still on the latest attempt never completed, so it blocks like `uphold`).
- **A4 (F-37 budget)** — `operator_directed_rewinds: { test, review }`, capped at 1 per
  gate, as the FOURTH independent rewind/repair budget. It draws on none of the other
  three; it does consume an ordinary build retry, which is what bounds the loop. When
  either cap is spent, `repair` is unavailable and only `override`/`uphold` remain.
- **A5 (F-38)** — `execution-report.js` gains `collectSupersededDissents` and a
  `superseded_consensus` array; `evalConsensus` takes it as a second input and
  downgrades to **WARN** on any superseded dissent, slotted after the existing
  override-warn branch and before the pass branch. Superseded rounds never FAIL — the
  latest-attempt contract at `:127-132` is preserved deliberately and its comment
  extended rather than replaced. The governing rule is now one sentence: *an Advocate
  dissent recorded anywhere in a job's evidence forbids a CLEAN promote.* The markdown
  gains a "Superseded Consensus Rounds" section quoting each dissent verbatim (FR-7),
  and `buildWarnings` emits the same line it already emits for latest-attempt dissents.
- **A6 (F-39)** — `artifact-layout.md`: `source_attempt` admits `review/attempt_{n}`;
  `resolution.action` admits `repair`; `operator_directed_rewinds` is documented
  alongside its three siblings; the `run_manifest` shape is restated as a **floor, not a
  ceiling** (extra orchestrator bookkeeping is not drift — a missing DEFINED key is),
  which is what the live manifest's dozen undocumented keys actually needed.
  `adws-builder.md` learns that a `corrections.json` can now originate at review.
- **A7 (F-40)** — `buildWarnings` labels each prior attempt by what happened to it
  (`superseded (gate_result=pass)` vs the failure reason) and only claims "gate-failed"
  in the lead clause when EVERY prior attempt failed. That keeps the B3/F-8 regression
  string byte-identical for the ordinary retry case while ending the contradiction.
- **A8** — `SCHEMA_VERSION` 1.2.0 → **1.3.0** (additive: one new report array, no new
  gate key, no new DECISION, no new exit code) — the amendment path SC-3 B2 reserved,
  holding every condition it set, exactly as M-1 did.

---

## 3. Invariants held

- **Verdict taxonomy frozen.** No new DECISION, exit code, or terminal failure-reason
  entry. `ADVOCATE_DISSENT_REPAIRED` is an attempt-level annotation that no decision
  function reads.
- **Latest-attempt gating preserved.** Superseded evidence warns; it never fails. A
  successful retry can still reach clean PROMOTE (`promote_retry_recovered`, unchanged).
- **Fail-closed on ambiguity.** An unrecognized `resolution.action` is still treated as
  NO resolution, so a malformed repair leaves the dissent blocking.
- **Regression-first, additive-only** for `execution-report.js` (SC-3 B2).
- **No new script, runtime, or dependency** (NFR-2). No tier awareness enters code
  (SC-4). Classifier and validators untouched.
- **NFR-3** SKILL.md < 500 lines (**379**).
- Suites: parity **88/88**, entropy **7/7**, provenance **3/3**, SC-3 micro-drill — all
  unchanged. Report fixtures **15 → 16**.
- **R-3 remains open** — cross-provider Trinity (X-3) stays deferred per SC-1.c.

---

## 4. Verification

| Check | Result |
|---|---|
| Tier 1 host gate, all nine steps | PASS |
| Report fixtures | 16/16 + CLI error path, deterministic across re-runs |
| Pre-existing 15 fixtures: decision / warn_flag / exit_code | unchanged (only the centrally-asserted `schema_version` string was re-baselined 1.2.0 → 1.3.0) |
| `promote_repaired_dissent` (new) | PROMOTE / warn_flag true / exit 10; `consensus` gate = **warn**; dissent quoted verbatim in report |
| F-40 regression, in the same fixture | `attempt 1: superseded (gate_result=pass)` for build and test; review's genuinely failed prior still reads `gate-failed — attempt 1: ADVOCATE_DISSENT_REPAIRED` |
| B3/F-8 regression string (`promote_retry_recovered`) | byte-identical — `Phase "build" passed on attempt 2 (attempt(s) 1..1 gate-failed` |

The new fixture models the live run's shape rather than a minimal case: build and test
each carry a superseded attempt that PASSED its own gate (which is what makes it an F-40
regression as well as an F-38 one), review carries the dissent with
`resolution.action: "repair"`, and `build/attempt_2` carries the `corrections.json` with
`source_attempt: "review/attempt_1"`.

---

## 5. Rejected

- **Making a superseded dissent FAIL the gate.** It would break the latest-attempt
  contract deliberately established at `execution-report.js:127-132`, and would mean a
  successfully repaired job quarantines — punishing precisely the behavior SC-6 exists
  to make available.
- **A new terminal failure reason for the repair path.** `ADVOCATE_DISSENT_REPAIRED`
  stays an attempt annotation. A terminal entry would expand the frozen taxonomy for a
  state that is, by definition, not terminal.
- **A new `repaired_dissent` gate key.** The `consensus` gate already owns this
  question; a second key would let the two disagree.
- **Auto-repair without the operator.** The orchestrator deciding for itself that a
  dissent is correct and rewinding is exactly the "never silently override a dissent"
  failure FR-7 forbids, approached from the other side. `repair` is an operator action
  recorded with a rationale, or it is nothing.
- **Uncapping the repair budget.** An operator-driven loop with no cap can rewind
  indefinitely; the 1-per-gate cap plus the build retry it consumes bounds it twice.
- **Backfilling `superseded_consensus` into historical evidence trees.** Same reasoning
  as SC-5's rejection of a `check_type` backfill.
- **Rewriting the `run_manifest` documented shape to enumerate every key the live run
  carried.** The floor/ceiling statement (A6) is the durable fix; an enumeration would
  be stale again after the next run.

---

## 6. Observed, not changed

- `promote_resolved_dissent/artifacts/job-1b2c3d/verify/attempt_1/phase_manifest.json`
  records `model_tier: "haiku"`, below SC-4 A10's `verify ≥ sonnet` floor, while that
  fixture's own `run_manifest.model_tiers.verify` says `sonnet`. SC-4 B1/B2 corrected
  three fixture manifests and did not touch this one. It is inert (no code reads tiers)
  and outside SC-6's approved finding set, so it is recorded here rather than fixed. The
  new `promote_repaired_dissent` fixture honors the floor.
- The target repo's own content questions from this run — the v1.10 Revision Record date
  cell (Reviewer and Grader disagreed on the record; graded `partial`, which is the sole
  reason the run was PROMOTE-with-warnings) and the compression of a 33-event hook
  enumeration to two stated examples — are cadence-method-skill decisions, not pipeline
  defects. They are recorded in the field-run log for that repo's benefit, not here.
