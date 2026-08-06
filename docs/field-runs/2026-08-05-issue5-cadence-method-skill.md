# ADWS Pipeline Field Run — 2026-08-05/06 — cadence-method-skill issue #5

Operator: Anthony (local Mac session, orchestrated by Claude on `claude-opus-5[1m]`).
Target: `Org-EthereaLogic/cadence-method-skill` — issue #5, WP 1.5 "runtime invocation map"
for skill/agent/hook surfaces. Second production run against this repo, following issue #4
(`job_20260805_0003`).

Job: `job_20260805_0004`, `pr` mode, started 2026-08-05T21:45:54Z, completed
2026-08-06T02:39:30Z. Shipped as
[PR #50](https://github.com/Org-EthereaLogic/cadence-method-skill/pull/50) (head `20c8d25`,
SSH-signed), **MERGED 2026-08-06T02:50:12Z**.

## Status — and why this one is citable

Verdict **PROMOTE (with warnings)**, exit 10, 7/7 gates, 9 validators clean, verify
structural 8/8, target repo `make check` 15/0/0.

**The evidence tree survived.** It is at `artifacts/job_20260805_0004/` in the target
repo's primary checkout — hard rule 5 puts evidence there rather than in the worktree, so
`git worktree remove` did not take it. This is the first field run whose gate claims are
independently re-derivable, and the difference matters: the issue-#4 record had to attribute
its central claim to the orchestrator's self-report, and the SC-5 that followed inherited
that boundary. Every finding below was checked against the tree, and the two that became
SC-6 were checked *against* the orchestrator's summary rather than taken from it.

The tree is local-only — `/artifacts/` is gitignored in the target repo, so it is not in the
PR and will not survive that checkout being cleaned. Treat it as retained-for-now, not
archived.

## What the run produced

Two write targets under a narrowed `allowed_paths` (`docs/runtime-invocation-map.md`,
`docs/design/`) with `docs/reference/source/` explicitly blocked:

- `docs/runtime-invocation-map.md` — new, +226.
- `docs/design/CADENCE_AUTOMATION_PROJECT_PLAN_WBS.md` — one appended v1.10 Revision Record
  row (+1/−0, append-only).

**The same intake conflict as issue #4, resolved the same way.** The issue's literal
`allowed_paths: ["docs/"]` plus the `docs/reference/source/` block is a hard intake failure
under task-contract rule 1 (path overlap), and would also have put the read-only vendored
method in writable scope. Narrowed to the two real write targets. Second consecutive
hand-written contract to trip this rule — the rule is doing its job, and the issue template
that keeps producing `docs/` is the thing worth fixing on the target side.

**A capability gap was closed out of band, and disclosed.** Issue #5's criteria require
verification against live documentation with citations, but the ADWS phase agents have no
web tools. A straight run would have recorded nearly every surface as an unverified open
item — *permitted by the issue's own AC-5*, so it would have PASSED the gate while
delivering almost nothing, then fed an unverified surface set into the WP 1.4 design freeze.
The operator ran the research first (WebSearch/WebFetch plus a `claude-code-guide` agent) and
staged the cited result as read-only evidence at `research_input.md`, which the contract
names as the sole source for live-documentation claims. Recorded in `intake.operator_notes`.
Worth flagging as a pattern: a criterion that permits "unverified" as an outcome can be
satisfied by an agent that cannot verify anything, and the gate cannot tell the difference.

## The run did not go straight through

**The review-gate Advocate dissented, and it was right.** The map silently dropped four
findings the research record marks VERIFIED — including one tagged "Direct NFR-1 input"
(skill discovery budgeted at 2% of context window / 8,000 characters, shared across all
installed skills). Not deferred, not recorded as open items: absent. The reviewer had
independently flagged the same class of defect, and the orchestrator verified it before
presenting (`research_input.md:206` versus zero matches in the map).

The operator confirmed the dissent and chose to **fix** rather than override or uphold.
Build attempt 2 (escalated sonnet → opus on the operator-resolution ladder) restored all
four plus six smaller corrections, including a §4 self-contradiction and the Q5/Q6 tokens
that would have tripped the FR-10 validator WBS 5.1 will build. Re-test and re-review both
came back clean.

That resolution is what produced SC-6, because **the pipeline had no name for it**. See
below.

## Findings — what this run changed in the pipeline (F-35 … F-40)

Split across two vehicles: **M-2** (docs/prompt, no code) and **SC-6** (spec + schema +
report). Full register in `SC6_PLAN.md` §1; governing records `DPPD.md` §15 and §16.

### F-35 — the consensus parallel mandate stated no boundary (M-2)

The orchestrator disclosed dispatching the tester concurrently with the test-gate Critic and
Advocate. The timestamps confirm it independently:

| | started | assessed / finished |
|---|---|---|
| `adws-tester` (test/attempt_1) | 23:09:56Z | 23:15:42Z |
| Advocate | — | 23:13:02Z |
| Critic | — | 23:14:06Z |

Both consensus agents assessed inside the tester's execution window. `test/attempt_2`
(agent done 02:05:30Z, consensus 02:08:51Z / 02:09:20Z) and both review rounds are correctly
serialized, so the run contains its own before/after pair.

The spec permitted this. `SKILL.md` and `phase-gates.md` mandated Critic ∥ Advocate in
capitals and expressed the ordering only as the parenthetical `Architect → (Critic ∥
Advocate)`. A loud mandate to parallelize plus an unstated limit, in a runtime that
encourages batching independent calls, is a defect in the mandate — not an operator slip.
Both files now state that the parallel set is exactly `{Critic, Advocate}` and that the
arrow is a barrier.

The consequence is invisible after the fact: a consensus agent reading a half-written
worktree produces a verdict indistinguishable, in the evidence, from one reached against the
finished change set. Here the Critic happened to catch the reset in the reflog and its
assessment held on content it had already captured. That is luck, not a control.

### F-36 — the tester was instructed to do what the reviewer is forbidden to do (M-2)

The tester's baseline used `git stash --include-untracked`, which is what briefly emptied
the worktree under the concurrent readers. But `adws-tester.md:30-32` and
`phase-gates.md:96` *named that technique* — while `adws-reviewer.md:27-31` has prohibited
`git stash` in the worktree since SC-2, with the right rationale. The hazard is strictly
worse for the tester: at the test gate the worktree holds the **only** copy of an
uncommitted, partly untracked change set, so a dispatch that dies mid-stash orphans the
entire build. Serializing the dispatch would not have made it safe. Replaced with a
non-mutating baseline, and the prohibition now lives in the tester's own contract.

### F-37 — no exit for a dissent that is CORRECT (SC-6)

This is the finding the run's summary did not name. The resolution set was `override` (false
positive), `uphold` (terminate with `ADVOCATE_DISSENT`, quarantine), and F-6's fresh
re-review (for a *suspected* false positive). None means "you are right; fix it and check
again." **A correct dissent's only sanctioned exit was termination** — the Advocate
succeeding was procedurally indistinguishable from the job failing.

The orchestrator took the undefined path and improvised the bookkeeping honestly: a new
`operator_directed_rewinds` key in `run_manifest.json`, a `corrections.json` with
`source_attempt: "review/attempt_1"` (outside the documented `test|verify` enum), and an
invented attempt-level `failure_reason` of
`ADVOCATE_DISSENT_RESOLVED_BY_OPERATOR_DIRECTED_REWIND`. It flagged all three in
`operator_notes_runtime` and explicitly preferred a truthful out-of-enum value to a
conforming false one. Every one of those calls was right, and none should have been
necessary. SC-6 defines the path as `resolution.action: "repair"`.

### F-38 — repairing a dissent erased it; overriding one never did (SC-6)

`execution_report.md` for this job renders `| consensus | pass | 2 round(s) clean |` beside
a `review/attempt_1/consensus/advocate.json` carrying `verdict: "fail"` and the full dissent
text. The `consensus` gate reads latest attempts only — deliberate and correct, since a
superseded failure must not permanently fail a job a retry fixed — but combined with F-37 it
meant the pipeline surfaced the resolution that changed nothing (`override`, warned since
F-3) and hid the one that changed the shipped artifact. This run's exit-10 came entirely
from the grader and drift warns; the dissent contributed nothing to it.

Fixed without touching the contract it exposed: superseded dissents WARN, never fail, and
are quoted verbatim in a new report section. *An Advocate dissent recorded anywhere in a
job's evidence forbids a clean promote.*

### F-39 / F-40 — the schema and the prose that broke with it (SC-6)

`source_attempt` now admits `review/attempt_{n}`; `resolution.action` admits `repair`;
`operator_directed_rewinds` is documented as the fourth independent budget; the
`run_manifest` shape is restated as a floor rather than a ceiling (the live manifest carried
a dozen sensible undocumented keys). And `buildWarnings` no longer renders
`attempt(s) 1..1 gate-failed — attempt 1: pass` — which this run's report contains twice,
because an operator-directed rewind supersedes build and test attempts that *passed* their
own gates.

## What worked, and is worth saying

- **The consensus gate earned its cost.** The Advocate caught a silent omission that seven
  gates, nine validators, and a clean `make check` did not. The reviewer found the same
  class independently. This is the strongest evidence yet for the Critic/Advocate pair.
- **A9 has a data point.** The dissent came from the **review-gate Advocate at sonnet** —
  the tier raise SC-2 deferred as C2 and SC-4 closed as A9. Noticing four *absences* by
  cross-referencing a 226-line document against a 200-line research record is not a
  haiku-tier task. One run is a data point, not a demonstration.
- **The falsifiability gate degraded honestly.** 11 checks: 9 `verified`, 2 `gate_weak`
  (CHK005, CHK006 — criteria about how *absences* are recorded, which have no red-for-the-
  right-reason baseline). Recorded as unverified warns, not quietly passed.
- **Evidence retention finally held**, without a procedure change — hard rule 5 already put
  it in the right place. The issue-#4 lesson was about a tree that was never outside the
  worktree to begin with.

## Carried forward, unresolved

1. **The v1.10 Revision Record date cell.** Reviewer and Grader disagree on the record. The
   row reads `2026-08-05` (live UTC when attempt 1 appended it); the commit is authored
   `2026-08-06T02:31:42Z`. The Reviewer ruled no re-stamp, citing the Revision Record's own
   preamble ("rows are history: they record what was true when written"). The Grader graded
   the criterion **partial** on a sharper point: as shipped, `2026-08-05` is
   indistinguishable from an `America/Los_Angeles` local-clock stamp — the exact ambiguity
   the v1.7 row was appended to eliminate. That partial is the sole reason this run is
   PROMOTE-with-warnings rather than clean. A target-repo content decision, not a pipeline
   defect; the instrument if it is settled is an appended correction row, not an edit.
2. **Residual carry-forward in the map**, non-blocking: the research's 33-event hook
   blocking enumeration is compressed to two examples (26 event tokens absent). The
   decision-relevant PreToolUse/PostToolUse pair is carried verbatim, and unlike the dissent
   case the omission is **stated, not silent** — which is the distinction that matters. A
   one-line §12 stated-limits entry would close it.
3. **Issue #6 (the WP 1.4 design freeze)** still carries the stale "Q1 and Q2 resolved"
   criteria an earlier audit flagged, now that WP 1.4's row reads Q1/Q2/Q4. Merging #5
   unblocked it; the criteria need correcting before it runs.

## Lessons

1. **A pipeline whose best outcome requires improvisation has a spec hole.** The
   orchestrator's three improvisations here were each individually correct and each
   individually outside the schema. That pattern is the signal — not the improvisation
   itself.
2. **Emphasis is not a boundary.** Both M-2 findings are places where the spec shouted one
   thing (parallelize; establish a baseline) and left the limit implicit or in a sibling
   file. Capitals do not scope a rule.
3. **Check the report against the evidence, not the summary against itself.** The run's own
   summary was candid about the process defect it knew of and silent about the two larger
   ones, which were visible only by reading `execution_report.md` next to
   `review/attempt_1/consensus/advocate.json`.
