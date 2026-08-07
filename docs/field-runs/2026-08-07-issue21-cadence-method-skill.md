# ADWS Pipeline Field Run — 2026-08-07 — cadence-method-skill issue #21

Operator: Anthony (local Mac session, orchestrated by Claude on `claude-opus-5[1m]`).
Target: `Org-EthereaLogic/cadence-method-skill` — issue #21, WP 5.1 "gate-self-test
validator + check registry". Third production run against this repo, following issue #4
(`job_20260805_0003`) and issue #5 (`job_20260805_0004`).

Job: `job_20260807_0001`, `pr` mode, started 2026-08-07T13:29:22Z, completed
2026-08-07T19:02:27Z. Shipped as
[PR #70](https://github.com/Org-EthereaLogic/cadence-method-skill/pull/70) (head
`6791020`, signed), **OPEN at the time of writing**.

## Status — and why this one is citable

Verdict **PROMOTE (with warnings)**, exit 10, 7/7 gates, grader 11/11 acceptance criteria
satisfied, drift PASS, verify structural 4/4.

**The evidence tree survived**, at `artifacts/job_20260807_0001/` in the target repo's
primary checkout (hard rule 5 keeps evidence out of the worktree, so `git worktree
remove` did not take it). Like the issue-#5 record and unlike issue #4, every finding
below was re-derived from the tree rather than attributed to the orchestrator's summary —
and in the decisive case (F-52) the tree contradicts the summary's headline, which is the
whole reason the distinction is worth maintaining.

The tree is local-only: `/artifacts/` is gitignored in the target repo, so it is not in
the PR and will not survive that checkout being cleaned. Retained-for-now, not archived.

## What the run produced

Two deliverables plus a frozen fixture pack, under `allowed_paths: ["scripts/validators/",
"fixtures/"]` — a contract that admits no documentation location at all:

- `scripts/validators/gate-self-test.js` — new; the meta-check that verifies each
  registered check still goes red on its own known-bad fixture.
- `scripts/validators/registry.json` — new; the check registry the 11 WP 5.1 siblings
  will register into.
- 11 frozen corpora under `fixtures/gate-self-test/` (59 files), including two regression
  corpora added mid-run by the rewinds below.

61 files at ship, all inside `allowed_paths`. Risk `medium`, `task_size: small`, 11
acceptance criteria (one soft intake warning: `EXCESSIVE_ACCEPTANCE_CRITERIA`).

## The two Critic catches

Both gates that run consensus caught a real, reproducible latent defect, and they were
converse halves of the same defect class in the same function.

| Gate | Defect | Route taken |
|---|---|---|
| test/attempt_1 | The **reverse** agreement scan built `registeredFixtureRoots` from `siblingEntries` (self-slug filtered out to avoid self-invocation), so the check would false-positive `fixture-without-registry-entry` on its OWN fixture directory as soon as a sibling registered. Masked today only by the single-entry `skipped: not-applicable` early return. | Rewind to build (`cross_phase_rewinds.test`), fixed, regression corpus added, re-run forward. |
| review/attempt_1 | The **converse**: the **forward** existence check also iterated the self-filtered list, so a *broken* self-entry (missing `fixture_root`) passed silently. The test-gate fix had corrected only the reverse direction. | **Undefined in the spec.** The orchestrator stopped and asked the operator, who elected rewind & fix; recorded improvisationally under `operator_directed_rewinds.review`. |

The orchestrator reproduced both findings from the evidence before acting — constructing
a two-entry registry and running the shipped validator against it — which the spec never
asked for and which SC-7/B1 now requires. Both defects were invisible to the nine shipped
corpora and would have broken the gate self-test on the very next WP 5.1 sibling PR.

## Findings (F-45 … F-52)

Eight findings, registered in `SC7_PLAN.md` §1 with per-finding evidence. Summary:

- **F-46** — a correct Critic `fail` at the **review** gate had no remediation but job
  death. Rule 4's retry path re-dispatches the reviewer over unchanged code, review's
  budget is 1, and no rewind origin admitted a Critic finding. This is the F-37 inverted
  incentive, left in place for the other half of consensus. **The run stopped and asked**
  — the same signature SC-6 recorded for the Advocate one scope change earlier.
- **F-52** — a Critic fail goes invisible the moment a later attempt supersedes it. This
  is the finding the tree proves against the narrative. The orchestrator's summary
  reported `consensus: pass (2 rounds clean)` and treated it as a clean result; the tree
  shows `critic: fail` on BOTH `test/attempt_1` and `review/attempt_1`, with the terminal
  report recording `consensus: pass — "2 round(s) clean"` and `superseded_consensus: []`.
  Two verified defects that changed the shipped artifact reached the verdict as nothing
  at all.
- **F-47** — the run took **three build attempts against a documented build retry budget
  of 1** (`build/attempt_{1,2,3}`), with `cross_phase_rewinds: {test: 1, verify: 0}` and
  `operator_directed_rewinds: {test: 0, review: 1}`. Whether a rewind consumes the
  destination phase's retry budget was written for two of the four budgets and unstated
  for the rest, so nothing flagged it.
- **F-48** — `build/attempt_2` and `attempt_3` had no legal `tier_input.source` for a
  rewind, and the run's attempt-level failure reasons were improvised outside every
  documented enum: `CRITIC_FAIL_REWIND_TO_BUILD` at `test/attempt_1` and `CRITIC_FAIL` at
  `review/attempt_1`, both annotated in-line as "attempt annotation, not a terminal
  reason" — the orchestrator correctly recognizing it had nowhere conforming to write.
- **F-45** — the orchestrator ran `criteria-to-checks` BEFORE the tester so the tester
  could echo `check_id`s, inverting the documented dispatch → validate order. Correct
  instinct, undocumented; by the letter of the procedure the tester receives no specs.
- **F-49** — `git status --porcelain` collapsed the untracked fixture directories; the
  orchestrator needed `-uall` and had to tell the reviewer to read files directly,
  because `git diff main` shows nothing for a green-field change set.
- **F-50** — `check_specs[].check_type` was documented only in the validator source; the
  run guessed `type` and got `undefined`.
- **F-51** — `allowed_paths` admitted no documentation location, so the documenter shipped
  `docs_delta: []` with a changelog and summary (coverage 0.7, pass). Compliant, but
  undocumented — the orchestrator derived the arithmetic and read a prior job to confirm
  the precedent. Third run in a row to hit an `allowed_paths`/docs conflict.

## What SC-7 changed

`SC7_PLAN.md` (M-4 A1–A4, SC-7 B1–B5). The load-bearing verification: running the
post-change `execution-report.js` against a **copy** of this job's tree (the operator's
evidence was not mutated) moves it from `consensus: pass — "2 round(s) clean"` to
`consensus: warn` with both superseded Critic fails surfaced and their findings quoted,
exit 10 either way. The run that exposed the defect is the run that demonstrates the fix.

Rendering note found the same way: the Critic's `findings[].evidence` in this run ran past
2,500 characters, so quoting it into the gate detail made the gates table unreadable. The
report now carries `critic_issue` (clipped) for terse surfaces and `critic_finding`
(verbatim) for the Superseded Consensus Rounds section.

## Carried forward, not acted on

- The run's own non-blocking observation: `runKnownBadFixture` spawns sibling checks
  without a timeout. Both the Critic and the reviewer judged this correct for byte-stable
  determinism (a hung sibling surfaces as `check-did-not-fire`, never a false pass).
  Target-repo concern, recorded for PR review, not a pipeline finding.
- PR #70 was OPEN and unmerged when this record was written. The WP-completion tracking
  sync is a separate PR per the operator's established workflow and was not part of the
  run.
