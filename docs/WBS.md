# Work Breakdown Structure (WBS)

**Project:** ADWS Pipeline Skill
**Version:** 1.0
**Date:** 2026-07-14
**Companion document:** `DPPD.md` (requirement/story IDs referenced below)

**Status (2026-07-15):** 1.0–5.0 done and merged to `main` (PRs #1, #2). **6.0 (live E2E)
complete** — drills 6.1–6.4 executed live against a scratch GitHub repo; 17/17 DPPD §4
acceptance criteria satisfied and independently verified. Sign-off: `acceptance/ACCEPTANCE.md`;
evidence: `acceptance/DRILL_EVIDENCE.md`. One defect (F-1) was found by the drills and fixed.
A post-production-run enhancement scope (**SC-2**, findings F-3…F-10 from the first
production run) was **APPROVED (operator R-6, 2026-07-16)** and implemented on branch
`feat/sc2` in three tranches: SC-2a docs/prompt fixes (zero parity risk), SC-2b
evidence-schema & report logic (report suite 10 → 13 fixtures, `execution-report.js`
SCHEMA_VERSION 1.0.0 → 1.1.0), SC-2c perf/security hardening. **Deferred:** C2
(review-gate Advocate tier bump) and the E2E-2 confirmation run (SC2_PLAN step 6),
both pending more production-run data. See `DPPD.md` §10 and `SC2_PLAN.md`.
*(C2 closed 2026-08-05 by SC-4 A9 — the deferral condition is satisfied; run #105
supplies the medium-risk Advocate record. See `DPPD.md` §13 and `SC4_PLAN.md` §4.11.
The E2E-2 confirmation run remains deferred.)*

**Status (2026-07-24):** scope change **SC-3** (findings F-14–F-17 from the fusion-harness
comparative review) was **APPROVED (operator R-6, 2026-07-24, per-item: A1–A6, B1)** and
implemented: SC-3a falsifiability at the test gate (reusing `criteria-to-checks`'
`check_specs` + `adws-tester`, no new DSL), structured `corrections.json`, and a
`check_defect_repairs` record; SC-3b advisory per-phase `phase_manifest.provenance`. Verdict
taxonomy frozen (no new DECISION/exit); 84/84 + 13/13 + 7/7 preserved; `execution-report.js`
untouched. Deterministic provenance fixtures and the retained SC-3 contract micro-drill
are wired into local CI. Contract and fixture reconciliation plus linked-worktree/hook-safe
CI landed through PR #27 (`149712c`) after the implementation in PR #26. The autonomous
seven-phase real-task confirmation is explicitly deferred to the first suitable post-SC-3
task. See `DPPD.md` §11, `SC3_PLAN.md`, and `acceptance/SC3_MICRO_DRILL.md`.

**Status (2026-08-05):** maintenance audit **M-1** (not a scope change — no requirement,
story, AC, or verdict-taxonomy movement) closed two defects by which `execution-report.js`
could certify PROMOTE for a job whose evidence recorded failure: an empty `attempt_n`
directory satisfying `pipeline_completion`, and per-phase `gate_result` being rendered but
never evaluated. Amended under the path SC-3 B2 reserved — additive gate only,
SCHEMA_VERSION 1.1.0 → 1.2.0, regression-first, the 13 existing verdict fixtures unchanged
and green, no new DECISION/exit. Report suite **13 → 15**; 84/84 + 7/7 + 3/3 + the SC-3
micro-drill unchanged. Same pass closed the SC-3 A3 `corrections.json` reader gap in
`adws-builder.md`, documented the planner's `planning_blocked` fields, and removed
non-installed `docs/`/`parity/` paths from the skill (now lint-enforced). Merged through
PR #29 (`e2e8a5d`). See `DPPD.md` §12 and `VERIFICATION.md` "Maintenance audit (2026-08-05)".

**Status (2026-08-05, SC-5):** scope change **SC-5** (findings F-27–F-30 from field run
`job_20260805_0003`, `cadence-method-skill` #4) was **APPROVED (operator R-6, 2026-08-05,
per item A1–A3)** and implemented. `criteria-to-checks` 1.1.0 → **2.0.0**: `check_specs`
now carries every acceptance criterion, typed `behavioral` | `unclassified`, closing the
path by which a lexical miss deleted a criterion from the tester's work list instead of
flagging it (live impact 1 of 8 dropped — orchestrator-reported, not re-derivable; the
mechanism itself is proven from the committed validator). The verb set widened by ~40 families — a 127-verb probe
had found 126 unmatched, including `fail` and `assert` in the validator that gates the test
phase — plus three SC-1 regex artifacts replaced. Rubric and all three counts unchanged;
measured 0 verdict flips and 0 count flips across the frozen corpus. `adws-tester.md`,
`phase-gates.md`, and `SKILL.md` updated so `unclassified` cannot be read as out of scope.
Parity **84 → 88**; 15/15 + 7/7 + 3/3 + the SC-3 micro-drill unchanged; verdict taxonomy
frozen and `execution-report.js` untouched. Post-submission review added F-31…F-34, fixed in
the same PR: `check_id` now flows onto `phase_output.json.checks` so coverage is verified by
id rather than by prose (F-31), and the run's 7-of-8 tally is attributed consistently as
orchestrator-reported across all four documents (F-34). Merged through PR #36 (`51a163d`);
Tier 1 nine-of-nine and Tier 2 both legs PASS at the merged head. See `DPPD.md` §14,
`SC5_PLAN.md`, and `field-runs/2026-08-05-issue4-cadence-method-skill.md`.

**Status (2026-08-06, M-2 + SC-6):** a second field run against `cadence-method-skill`
(issue #5, `job_20260805_0004`) produced findings **F-35–F-40**, split across two vehicles.
Maintenance audit **M-2** (docs/prompt only) bounded the consensus parallel mandate — the
parallel set is exactly `{Critic, Advocate}` and the `Architect →` arrow is a barrier, after
timestamps showed the tester running concurrently with both consensus agents at
`test/attempt_1` — and replaced the tester's mandated `git stash` falsifiability baseline
with a non-mutating one, ending a contract in which the tester was told to perform the
operation the reviewer is forbidden to perform. Scope change **SC-6** (**APPROVED, operator
R-6, 2026-08-06, per item**) gave a *correct* Advocate dissent an exit other than
termination: `resolution.action: "repair"` (operator confirms the dissent, job rewinds to
build carrying it as `corrections.json`, re-runs forward), a fourth independent budget
`operator_directed_rewinds` capped at 1 per gate, `source_attempt` widened to admit
`review/attempt_{n}`, and — because repairing a dissent previously erased it from the report
while overriding one did not — `execution-report.js` now scans superseded attempts, exposes
`superseded_consensus`, quotes each dissent verbatim, and drives the `consensus` gate to
WARN. Superseded evidence warns, never fails, so the latest-attempt gating contract is
intact. `SCHEMA_VERSION` 1.2.0 → **1.3.0**, report fixtures **15 → 16**; parity 88/88,
entropy 7/7, provenance 3/3, and the SC-3 micro-drill unchanged; verdict taxonomy frozen.
This run's evidence tree **survived** (primary checkout, per hard rule 5), so unlike SC-5
every finding was re-derived from evidence rather than attributed. See `DPPD.md` §15–§16,
`SC6_PLAN.md`, and `field-runs/2026-08-05-issue5-cadence-method-skill.md`.

**Status (2026-08-05, SC-4):** scope change **SC-4** (findings F-18–F-26 from an operator
review of FR-12) was **APPROVED (operator R-6, 2026-08-05, per-item: A1–A10, B1–B3)** and
implemented: SC-4a replaces the uniform `Architect` tier column with a per-phase table
keyed by error-propagation cost (plan at opus on every row; document/ship/verify make up
the cost), admits `fable` as the fourth canonical evidence tier as an escalation ceiling
rather than a mandated cell, adds the Codex alias `nova` → fable, rewrites the grader
floor as an absolute now that "the Architect floor" has no referent, defines
ladder-saturation recording, and closes SC-2's deferred C2 (on run #105's medium-risk
Advocate record); SC-4b corrects three fixture manifests recording non-escalating
escalations and re-keys the 15 `run_manifest.model_tiers` maps. `execution-report.js`
untouched; SCHEMA_VERSION stays 1.2.0; suites unchanged at 84/84 + 15/15 + 7/7 + 3/3 +
the SC-3 micro-drill. Merged through PR #31 (`b3bb75a`). Governing version: **DPPD 1.4**.
See `DPPD.md` §13 and `SC4_PLAN.md`.

**Status (2026-07-18):** second production run — first external field run — executed
against `Org-EthereaLogic/agentic-starter-kit` issue #103 in a Cowork/cloud runtime
(agent types unregistered → validated the inline-spec dispatch fallback, now codified
as SKILL.md **F-11**). Verdict **PROMOTE** (exit 0, 7/7 gates, 1 attempt/phase, clean
consensus, zero entropy events). The run's 7 findings were resolved and merged via
[PR #12](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/12) (agent-spec
hardening, artifact-layout rules 8–9, new `references/validator-inputs.md`); field-run
report + per-finding resolution: `docs/field-runs/2026-07-18-issue103-agentic-starter-kit.md`.
**Still deferred:** C2 and the step-6 E2E-2 confirmation run — this run exercised
neither B1 (dissent override) nor B2 (delegated push), so E2E-2 remains open.

**Status (2026-07-18, run 3):** third production run against
`Org-EthereaLogic/agentic-starter-kit` issue #104 (the CRIT-002 vacuous-gate fix; same
Cowork/cloud runtime, F-11 dispatch fallback, patch ship mode). Verdict **PROMOTE**
(exit 0, 7/7 gates, grader 4/4 twice, clean consensus) after a false-negative
QUARANTINE exposed a verifier-spec contradiction — resolved spec-side in this branch
(adws-verifier.md skip semantics; SKILL.md ship-staging union). First live exercise of
the verify RETRY path with tier escalation. Target repo: PR #118 merged, follow-up
#119 filed, dashboard #120. Skill-repo spec/doc sync merged via
[PR #14](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/14) (parity
84/84). Run record:
`docs/field-runs/2026-07-18-issue104-agentic-starter-kit.md`. **Still deferred:** C2
and E2E-2 (B1/B2 unexercised).

**Status (2026-08-05, field-run series):** the external field-run series now stands at
**nine retained records** under `docs/field-runs/`, covering agentic-starter-kit issues
#103, #104, #105, #106, #107, #109, #111, #119, and #135. Verdicts: seven PROMOTE, one
PROMOTE-with-warnings (#119, exit 10 — the first recorded exit-10 in the series), and one
RETRY / `TEST_GATE_FAILURE` (#109, operator-completed the same day). The last two records
(#119 `job_20260719_0003`, #135 `job_20260719_0002`) were merged 2026-08-05 via PRs #22
and #33; the #135 branch had never been pushed and existed only in the operator's local
clone. Per-run detail lives in `VERIFICATION.md`; the earlier per-run status blocks below
(#103, #104) are retained as the point-in-time record and are not extended per run.

A second series runs against `cadence-method-skill` — issue #4 (`job_20260805_0003`,
PROMOTE, source of SC-5) and issue #5 (`job_20260805_0004`, PROMOTE-with-warnings, source of
M-2 and SC-6) — bringing the retained total to **eleven**. The #5 record is the first in
either series whose evidence tree survived the run, so it is the first whose gate claims are
independently re-derivable rather than orchestrator-reported.

**Run numbering (renumbered 2026-08-05):** "run N" counts production runs in **job-ID
allocation order**, spanning 11 runs — run 1 `job_20260715_0001` (no field-run record),
runs 2–4 issues #103/#104/#105, runs 5–6 the two jobs of issue #106, run 7 issue #109,
run 8 issue #107, runs 9–11 issues #135/#119/#111. Runs 7 and 8 were previously
reversed: the labels had been assigned in *completion* order, and issue #109's job was
allocated 07-18 but terminated RETRY and was operator-completed after issue #107's 07-19
job finished. Allocation order is now the single key because it is derivable from the
evidence tree without narrative. Full sequence and rationale: `VERIFICATION.md`.

Effort scale: **S** ≤ half day · **M** ≈ 1 day · **L** ≈ 2–3 days.

---

## 1.0 Requirements & Design Freeze

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 1.1 | Extract task contract fields from `ADWS_TASK_CONTRACT.md` + `taskspec.schema.json`; trim to skill-relevant fields | Approved contract field list | S | — | FR-1, US-1 |
| 1.2 | Define per-phase entry/exit criteria and retry budgets from `src/phases.js` semantics | `references/phase-gates.md` draft | S | — | FR-2, FR-3, US-2 |
| 1.3 | Freeze artifact tree layout (attempt dirs, job-level manifests, trace file shape) | `references/artifact-layout.md` draft | S | — | FR-4, FR-10 |

**Exit criteria:** DPPD §5 confirmed against extracted sources; no open design questions.

## 2.0 Skill Core

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 2.1 | Write `SKILL.md`: trigger description, contract intake, state machine, gate rules, subagent dispatch instructions, model-tier selection table + retry-escalation rule | `SKILL.md` (< 500 lines, NFR-3) | M | 1.1–1.3 | FR-1–FR-3, FR-6–FR-8, FR-12 |
| 2.2 | Write `references/task-contract.md` template with vague-task rejection guidance | Contract template | S | 1.1 | AC-1.2 |
| 2.3 | Finalize `references/phase-gates.md` and `references/artifact-layout.md` | Reference docs | S | 1.2, 1.3 | FR-2–FR-4 |

**Exit criteria:** Dry read-through — a fresh agent given SKILL.md can state the correct next action for each phase/gate state without ambiguity.

## 3.0 Validator Ports

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 3.1 | Port 5 direct-port validators (`criteria.to_checks`, `review.risk_assess`, `document.coverage_map`, `patch.compose`, `verify.evidence_map`) | 5 standalone scripts (NFR-4) | M | 1.3 | FR-5, US-3 |
| 3.2 | Port 4 adapted validators (`task.normalize`, `repo.context_scan`, `ship.mode_select`, `drift.sentinel` with UMIF math inlined) per DPPD §5.2 port notes | 4 standalone scripts | L | 1.3 | FR-5, FR-11 |
| 3.3 | Build fixture parity suite: shared fixtures run against original and the 9 deterministic ported validators, verdicts diffed | Parity report, all-identical _(amended by SC-1: 8 packs identical to originals; `criteria-to-checks` diverged-by-design, verified vs a frozen baseline — 84/84 total)_ | M | 3.1, 3.2 | AC-3.1, AC-3.3, R-2 |

**Exit criteria:** Parity report shows identical verdicts on all fixtures; each script runs standalone under Node 20.

## 4.0 Agent Definitions

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 4.1 | Write 7 phase agents (planner, builder, tester, reviewer, documenter, shipper, verifier) with tool allowlists, evidence-writing duties, and default model-tier assignments | 7 agent files | M | 2.1 | FR-2, FR-4, FR-8, FR-12 |
| 4.2 | Write Critic and Advocate agents (fresh-context inputs, dissent recording rule, role model tiers) | 2 agent files | S | 2.1 | FR-7, FR-12, US-4 |
| 4.3 | Write AC-coverage grader agent (recreation of `pr.drift_sentinel.spec`: per-criterion satisfied/partial/unaddressed/contradicted verdicts over `gh pr diff`) | 1 agent file | S | 2.1 | FR-5, FR-11 |

**Exit criteria:** Each agent, given a fixture phase input, produces evidence files in the correct attempt directory and nothing outside it.

## 5.0 Ship & Report Tooling

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 5.1 | Ship procedure: worktree materialize → explicit-path staging → commit → mode-specific action (`pr` / `direct_branch` / `patch`) via `gh` | Ship section of shipper agent + SKILL.md | M | 3.2 (ship.mode_select) | FR-9, US-5, NFR-5 |
| 5.2 | Port execution-report generator (verdict matrix per ADWS_Pro exit-code semantics, artifact-only inputs) | `scripts/execution-report.js` | M | 1.3 | FR-10, US-6 |

**Exit criteria:** AC-5.1–5.3 pass on a scratch GitHub repository; report generated from a fixture artifact tree matches expected verdicts.

## 6.0 Integration Test & Acceptance

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 6.1 | End-to-end run, `pr` mode, on sample repo: full 7 phases, live PR opened | Run evidence + PR URL | M | 2.0–5.0 | §1.3 success criteria |
| 6.2 | End-to-end runs, `direct_branch` (incl. protected-branch refusal) and `patch` modes | Run evidence | S | 6.1 | AC-5.2, AC-5.3 |
| 6.3 | Gate-failure drills: forced test failure (retry path) and retry-budget exhaustion (termination path) | Run evidence | S | 6.1 | AC-2.1, AC-2.2 |
| 6.4 | Acceptance review against all user-story ACs; record sign-off | Sign-off note in project folder | S | 6.1–6.3 | DPPD §8 |

**Exit criteria:** All DPPD §4 acceptance criteria demonstrated; project accepted or gap list produced.

---

## Dependency Summary

```
1.0 ──► 2.0 ──► 4.0 ──┐
  └───► 3.0 ──► 5.0 ──┼──► 6.0
                      │
        2.0 ─────────►┘
```

3.0 runs in parallel with 2.0 after design freeze. 6.0 starts only when 2.0–5.0 exit criteria are met.

**Total estimated effort:** ~9–12 working days equivalent (heavily compressible with agent execution; parity suite 3.3 and E2E runs 6.x are the critical path).
