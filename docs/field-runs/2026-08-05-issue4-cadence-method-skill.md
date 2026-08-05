# ADWS Pipeline Field Run — 2026-08-05 — cadence-method-skill issue #4

Operator: Anthony (local Mac session, orchestrated by Claude on `claude-opus-5[1m]`).
Target: `Org-EthereaLogic/cadence-method-skill` — issue #4, WP 1.3 "validator spec sheet
+ tier-configuration schema". The run used the **globally installed** skill at
`~/.claude/skills/adws-pipeline`, refreshed from this repo via `./install.sh --global`
immediately beforehand (the global copy had been stale in 5 skill files and 2 agent files,
so this was the first live exercise of the SC-4 per-phase model tiers).

Job: `job_20260805_0003`, `pr` mode. Shipped as
[PR #49](https://github.com/Org-EthereaLogic/cadence-method-skill/pull/49)
(head `3bf4fe0`).

## Status — read this before citing the run

**PR #49 is OPEN and unmerged; issue #4 is OPEN.** "Shipped" here means *submitted for
review*, nothing more. The orchestrator's own summary reported verdict **PROMOTE** (exit 0,
no warn flag), 7/7 gates on first attempt, zero retries, valid red baselines for all eight
criteria, and clean Critic/Advocate consensus at both gates.

**Those gate claims are not independently verifiable.** The PR body cites
`artifacts/job_20260805_0003/` in the target repo, but that evidence tree was **not
committed to the PR head and not retained locally** — the worktree was removed per
procedure at the end of the run. An independent verification pass could confirm the shipped
diff, reproduce the target repo's `make check` (15 passed, 0 failed, 0 skipped), and
confirm the 11×4 completeness matrix; it could **not** confirm the gate sequence, the
baselines, or the consensus verdicts. This is the DRILL_EVIDENCE lesson recurring: an
external evidence tree that is not copied before teardown is not evidence. Treat the
7/7-gates claim as the orchestrator's uncorroborated self-report.

After submission, CodeRabbit posted a review with **9 actionable comments** against
`3bf4fe0`. Two of them independently corroborate defects the ADWS reviewer had already
found and disclosed in the PR body (below); the rest are new. The PR therefore has
unresolved review findings and should not be described as a completed delivery.

## What the run produced

Three write targets under a narrowed `allowed_paths`, with `docs/reference/source/`
explicitly blocked:

- `docs/validator-spec-sheet.md` — new; the WP 1.3 spec sheet.
- `docs/design/CADENCE_AUTOMATION_PROJECT_PLAN_WBS.md` — Q4 registered in §7 with a pending
  default; WP 1.4's resolve cell amended `Q1/Q2` → `Q1/Q2/Q4`; one appended v1.9 revision
  row (append-only, verified +1 row / 0 edits).

**Intake conflict resolved at contract time.** The requested contract combined
`allowed_paths: ["docs/", …]` with `blocked_paths: ["docs/reference/source/"]` — a **hard
intake failure** under rule 1, since `docs/` prefixes the blocked path. Resolved by
narrowing `allowed_paths` to the three actual write targets while keeping the explicit
block, so the vendored method is both out of scope and blocked. Worth recording because the
rule fired exactly as designed on a contract a human had written by hand.

## Findings the reviewer surfaced (carried in the PR body, not absorbed)

- **Link-integrity check gives contradictory answers for the all-external case** — the
  verdict table says skipped/exit 30, an edge bullet says pass. The review-gate Advocate
  found this independently of the reviewer; CodeRabbit later found it a third time.
- **ID-namespace resolution states a `fail` rule stricter than method §3.2**, which under
  D-4 would have a downstream validator block legitimate work.

Both were disclosed in the PR body rather than silently fixed, and assigned to WP 5.1.

## What this run changed in the pipeline itself — SC-5

**The validator dropped a criterion.** `criteria-to-checks` emitted **7 check specs for 8
acceptance criteria**. AC-4 — "…output format is specified as…" — was classed `vague`
solely because no form of *specify* was in the outcome-verb regex, and the pre-change
`execute()` built `check_specs` from the verifiable list only. The criterion did not just
lose a rubric contribution: it left the tester's work list entirely.

The orchestrator noticed the 7-vs-8 mismatch, instructed the tester to check AC-4 anyway,
and recorded the artifact in the skill trace — so nothing shipped ungraded, and the grader
returned 8/8 satisfied. **That the run stayed correct is not mitigation.** It stayed correct
because a human-facing summary happened to compare two numbers; the pipeline's own evidence
recorded the seven specs and never recorded the eighth criterion's absence. `vague_count`
reports how many criteria were vague, never which, and no consumer compared it against
`check_specs.length`. A quieter run would have shipped a criterion ungraded with a clean
PROMOTE.

This is the same regex SC-1 patched once already for F-2, which is the tell that the
approach — not the verb list — was wrong. It became scope change **SC-5** (F-27…F-30):
`check_specs` now carries every criterion, typed `behavioral` | `unclassified`, so a lexical
miss costs a `warn` instead of a criterion. See `DPPD.md` §14, `SC5_PLAN.md`, and
`VERIFICATION.md` "SC-5 scope change".

## Lessons

1. **Copy the evidence tree before removing the worktree.** Third time this has cost a
   verifiable claim (DRILL_EVIDENCE, SC-4 F-25, here). The gate record is only as good as
   its retention, and a PROMOTE that cannot be audited is a report, not a result.
2. **A count mismatch that only a human notices is an unrecorded failure.** The fix is not
   "watch for it" — it is making the mismatch impossible (SC-5 A1) and making a residual
   mismatch a stated defect (`SKILL.md`, `phase-gates.md`).
3. **Report submission state precisely.** "Shipped" for an open PR invited a correction that
   a plain "submitted, unmerged, N review findings open" would have avoided.
