# Work Breakdown Structure (WBS)

**Project:** ADWS Pipeline Skill
**Version:** 1.0
**Date:** 2026-07-14
**Companion document:** `DPPD.md` (requirement/story IDs referenced below)

**Status (2026-07-14):** 1.0–5.0 done and merged to `main` (PR #1); see `VERIFICATION.md`
for delivery detail, review-gate findings, and fixes. 6.0 (live E2E on a scratch GitHub
repo) is the only open work.

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
| 3.3 | Build fixture parity suite: shared fixtures run against original and the 9 deterministic ported validators, verdicts diffed | Parity report, all-identical | M | 3.1, 3.2 | AC-3.1, AC-3.3, R-2 |

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
