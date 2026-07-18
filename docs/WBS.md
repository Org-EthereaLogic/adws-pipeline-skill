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
#119 filed, dashboard #120. Run record:
`docs/field-runs/2026-07-18-issue104-agentic-starter-kit.md`. **Still deferred:** C2
and E2E-2 (B1/B2 unexercised).

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
