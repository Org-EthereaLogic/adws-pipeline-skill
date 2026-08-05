# Detailed Project Plan Document (DPPD)

**Project:** ADWS Pipeline Skill — recreate ADWS_Pro's core function as a Claude skill with agent orchestration
**Version:** 1.3 (SC-3 scope change §11, 2026-07-24)
**Date:** 2026-07-14
**Owner:** Anthony
**Status:** Approved — base plan accepted at the WBS 6.4 sign-off (2026-07-15,
`acceptance/ACCEPTANCE.md`); scope changes SC-1 (§9), SC-2 (§10), and SC-3 (§11) approved
per R-6. Governing version: 1.3.
**Companion document:** `WBS.md`

---

## 1. Project Overview

### 1.1 Objective

Recreate the core function of ADWS_Pro — a gated, evidence-producing, seven-phase coding pipeline — as a single Claude skill (`adws-pipeline`) driven by agent orchestration, eliminating the hosting infrastructure (server, dashboard, database, auth, WebSocket layer) that constitutes the majority of the original codebase.

### 1.2 Background

ADWS_Pro (source: `<local ADWS_Pro checkout, not distributed>`) is a Node.js coding-agent runtime implementing:

`plan → build → test → review → document → ship → verify`

A feasibility review (2026-07-14) concluded that the majority of its function ports to a SKILL.md + subagent model (qualitative judgment; no measured parity figure exists — WBS 3.3 and 6.x produce the first measured evidence). The differentiators worth preserving are: gated phase progression, deterministic non-LLM validation, and append-only evidence artifacts. The hosting shell is replaced by Claude Code's native task list, chat, and file system.

### 1.3 Success Criteria

- A complete pipeline run on a sample repository produces a correct, append-only artifact tree and a PROMOTE/RETRY/QUARANTINE execution report.
- The 9 deterministic ported validators produce verdicts identical to the originals on
  shared fixtures. **(Amended by SC-1, see §9):** 8 remain byte-for-byte identical;
  `criteria-to-checks` is deliberately diverged (v1.1.0) and verified against a frozen
  baseline. The 10th validator (the AC-coverage grader) is LLM-graded and has no byte-parity test.
- A `pr` output-mode run opens a real GitHub PR from an isolated worktree.
- No server process, database, or persistent daemon is required.

---

## 2. Scope

### 2.1 In Scope

| ID | Item |
|----|------|
| S-1 | `SKILL.md` orchestrator: phase state machine, retry budgets, task contract, artifact conventions, gate rules |
| S-2 | Task contract template (derived from `specs/ADWS_TASK_CONTRACT.md` / `taskspec.schema.json`) |
| S-3 | Port of the validator skill packs from `src/skills/`: 9 deterministic packs as bundled `scripts/`, plus `pr.drift_sentinel.spec` recreated as a grader subagent (it is LLM-graded in the original) |
| S-4 | Execution-report generator script (PROMOTE / RETRY / QUARANTINE verdict) |
| S-5 | Phase agent definitions (`.claude/agents/`): planner, builder, tester, reviewer, documenter, shipper, verifier |
| S-6 | Consensus approximation: independent-context Critic and Advocate subagents at test/review gates, with per-role Anthropic model-tier assignment and automatic tier selection (FR-12) |
| S-7 | Per-job git worktree isolation via the Agent tool's `isolation: "worktree"` |
| S-8 | Ship phase via `gh` CLI: materialize → commit → push → open PR (plus `direct_branch` and `patch` modes) |
| S-9 | Append-only artifact tree: `artifacts/{jobId}/{phase}/attempt_{n}/` + job-level manifests |

### 2.2 Out of Scope

| ID | Item | Rationale |
|----|------|-----------|
| X-1 | Dashboard, WebSocket telemetry, REST API, auth, SQLite mirror | Hosting shell; replaced by native Claude Code surfaces |
| X-2 | Entropy/CTM/UMIF live regulator (CascadeGov) | **Shipped under SC-1 (see §9)** as `scripts/entropy-gate.js` — a parse-failure stability gate over the ported drift-sentinel band math, wired into the phase loop. (Originally deferred; the operational signal is JSON parse-failure counts, not token logprobs.) |
| X-3 | Cross-provider Trinity (OpenAI Critic, Gemini Advocate) | Deferred; single-provider consensus approximation in S-6 |
| X-4 | VS Code extension | Client of the removed server |
| X-5 | Benchmark runners, n8n integration, sprint memory | Peripheral to core pipeline function |
| X-6 | Per-phase Docker images / read-only rootfs sandboxing | Claude Code sandbox covers the intent |

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | The skill SHALL normalize a free-form task request into the task contract before any phase runs, rejecting requests that fail normalization. |
| FR-2 | The skill SHALL advance phases strictly in order (plan → build → test → review → document → ship → verify); no phase may be skipped and no later phase may start while an earlier gate is failing. |
| FR-3 | Each phase SHALL have a retry budget (default 2 retries); budget exhaustion SHALL terminate the job with a RETRY or QUARANTINE verdict, never silent continuation. |
| FR-4 | Each phase attempt SHALL write its evidence to `artifacts/{jobId}/{phase}/attempt_{n}/` and SHALL NOT modify any prior attempt directory. |
| FR-5 | The nine deterministic validators SHALL run as scripts (no LLM) and their verdicts (pass/warn/fail) SHALL be recorded in the attempt's evidence. The one LLM-graded validator (`pr.drift_sentinel.spec`) SHALL run as a dedicated grader subagent whose per-criterion verdicts are recorded the same way. |
| FR-6 | A `fail` validator verdict SHALL block phase promotion; a `warn` verdict SHALL be recorded and surfaced in the execution report. |
| FR-7 | Test and review gates SHALL include independent Critic and Advocate subagent assessments started with fresh context; an Advocate dissent SHALL be recorded as a deterministic failure reason, not silently overridden. |
| FR-8 | Build/test execution SHALL occur in an isolated git worktree; the primary checkout SHALL remain untouched until ship. Where the Agent tool's `isolation: "worktree"` is unavailable, the skill SHALL create the worktree explicitly via `git worktree` commands. |
| FR-9 | Ship SHALL support three output modes: `pr` (push + open PR), `direct_branch` (push branch; refuse protected targets), `patch` (format-patch, no push). |
| FR-10 | On terminal completion the skill SHALL generate `execution_report.md` + `.json` with a PROMOTE / RETRY / QUARANTINE verdict derived from recorded evidence only. |
| FR-11 | Verify SHALL run post-ship with zero LLM judgment calls: structural checks, syntax checks, and the drift-sentinel classifier against the shipped diff. |
| FR-12 | Model tiers SHALL be selected automatically: the deterministic risk score from `review.risk_assess` maps to a role→tier table (low risk → Haiku/Sonnet, high risk → Opus Architect + Sonnet Critic), and a phase retry SHALL escalate that phase agent's model one tier. Codex may dispatch those canonical tiers through the aliases `luna` → Haiku, `terra` → Sonnet, and `sol` → Fable when configured (otherwise Opus); recorded evidence SHALL remain normalized to Haiku/Sonnet/Opus. The selected tier and its input score SHALL be recorded in the attempt's evidence. |

### 3.2 Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Validators must be pure functions of their inputs — same fixture in, same verdict out, across runs. |
| NFR-2 | The skill must run with no background process, no database, and no network dependency beyond git/GitHub and the model API. |
| NFR-3 | SKILL.md must stay within practical context budget (target < 500 lines; detail pushed to referenced files per progressive-disclosure convention). |
| NFR-4 | Ported validator scripts must not depend on ADWS_Pro server modules (`src/db.js`, `src/artifacts.js`, etc.); each must run standalone under Node 20. |
| NFR-5 | Git operations must never use `git add -A`/`git add .`, never bypass hooks, and must stage explicit paths (carried over from ADWS_Pro command conventions). |

---

## 4. User Stories and Acceptance Criteria

**US-1 — Submit a task**
*As an operator, I want to hand the skill a plain-language coding task so that it is normalized into a formal task contract before work begins.*
- AC-1.1: Given a clear task, the contract file is written with objective, acceptance criteria, target paths, and output mode.
- AC-1.2: Given a vague task (no verifiable outcome), the skill asks for the missing fields instead of guessing.
- AC-1.3: The `task.normalize` validator passes on the resulting contract.

**US-2 — Watch gated progress**
*As an operator, I want each phase to pass its gate before the next begins so that a bad plan never reaches ship.*
- AC-2.1: A failing test gate returns the job to build (within retry budget) rather than proceeding to review.
- AC-2.2: Retry-budget exhaustion terminates the job with a non-PROMOTE verdict.
- AC-2.3: Phase order violations are impossible by procedure (no instruction path skips a gate).

**US-3 — Deterministic validation**
*As a validation lead, I want non-LLM validators at each phase so that gate verdicts are reproducible and auditable.*
- AC-3.1: All 9 deterministic ported validators produce verdicts identical to the ADWS_Pro originals on the same fixtures.
- AC-3.2: Each validator writes a trace file (verdict + metrics) into the attempt directory.
- AC-3.3: Running any validator twice on identical input yields identical output.

**US-4 — Independent review consensus**
*As a technical reviewer, I want Critic and Advocate assessments from independent contexts so that a single line of reasoning cannot self-approve.*
- AC-4.1: Critic and Advocate run as separate subagents that receive the change set but not each other's conclusions.
- AC-4.2: An Advocate dissent is recorded verbatim in evidence and blocks promotion until resolved or the job terminates.

**US-5 — Safe shipping**
*As an operator, I want ship to produce a real PR from an isolated worktree so that my main checkout is never dirtied and protected branches are never pushed to.*
- AC-5.1: `pr` mode ends with a live PR URL recorded in the ship evidence.
- AC-5.2: `direct_branch` mode against a protected branch refuses with a recorded block reason and leaves no orphan commit.
- AC-5.3: `patch` mode produces a `format-patch` file and performs no push.

**US-6 — Auditable outcome**
*As a validation lead, I want an execution report with a PROMOTE/RETRY/QUARANTINE verdict so that job outcomes are decided by evidence, not narrative.*
- AC-6.1: The report is generated by script from artifact files only.
- AC-6.2: The verdict matrix matches ADWS_Pro's exit-code semantics (clean promote / promote-with-warn / retry / quarantine).
- AC-6.3: Every phase attempt in the run is traceable from the report to its evidence directory.

---

## 5. Specifications

### 5.1 Deliverable Layout

```
adws-pipeline/                  # the skill
├── SKILL.md                    # orchestrator: contract, state machine, gates
├── references/
│   ├── task-contract.md        # contract template + field definitions
│   ├── phase-gates.md          # per-phase entry/exit criteria and retry rules
│   └── artifact-layout.md      # evidence tree specification
├── scripts/
│   ├── validators/             # 9 deterministic ported packs, one file each
│   └── execution-report.js     # verdict generator
.claude/agents/
├── adws-planner.md … adws-verifier.md   # 7 phase agents
├── adws-critic.md
└── adws-advocate.md
```

### 5.2 Validator Port Map

| ADWS_Pro skill ID | Phase | Port notes |
|---|---|---|
| `task.normalize` | plan | Strip DB/telemetry hooks; pure input → verdict |
| `repo.context_scan` | build | Path-policy bounds from contract, not env |
| `criteria.to_checks` | test | Direct port |
| `review.risk_assess` | review | Direct port |
| `document.coverage_map` | document | Direct port |
| `ship.mode_select` | ship | Policy table inlined |
| `patch.compose` | ship | Direct port |
| `verify.evidence_map` | verify | Direct port |
| `drift.sentinel` | verify | Deterministic, but depends on internal UMIF modules (`umif-canonical.js`, `umif-entropy.js`) — inline the needed math into the ported script |
| `pr.drift_sentinel.spec` | verify | **Not a script port.** LLM-graded in the original (Architect-tier AC coverage grading). Recreate as a grader subagent; reads diff from `gh pr diff` |

### 5.3 Consensus Model (replaces Trinity)

Architect role = the phase agent itself. Critic and Advocate = independent subagents at the test and review gates, each spawned with fresh context containing only the contract and the change set. Reconciliation rule: unanimous pass promotes; Critic fail retries; Advocate dissent blocks pending resolution (FR-7).

Roles are assigned distinct Anthropic model tiers (default: Opus Architect, Sonnet Critic, Sonnet/Haiku Advocate), selected automatically per FR-12 and escalated one tier on retry — the skill-native equivalent of ADWS_Pro's CascadeGov tier routing and `ADWS_LLM_ESCALATION`. This recovers cost adaptation and some error decorrelation, but not cross-vendor diversity (risk R-3).

---

## 6. High-Level Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-1 | Instruction-based gate enforcement is weaker than code enforcement — the orchestrating agent may deviate under long context | Medium | High | Keep SKILL.md gates short and imperative; validators are hard script checks; execution report catches deviations after the fact |
| R-2 | Validator ports drift from original behavior | Medium | Medium | Fixture parity suite (WBS 3.3) run against both implementations before acceptance |
| R-3 | Single-provider consensus is weaker than cross-provider Trinity | High | Medium | Accepted per scope decision; mitigated by independent contexts plus distinct model tiers per role with automatic selection (FR-12); revisit cross-provider as future phase |
| R-4 | Context exhaustion on large jobs across 7 phases | Medium | Medium | Each phase runs as a subagent with its own context; orchestrator holds only state + verdicts |
| R-5 | Git/PR safety errors (wrong branch, protected push) | Low | High | `ship.mode_select` validator runs before any push; explicit-path staging rule (NFR-5) |
| R-6 | Skill is over-built relative to need | Medium | Low | Scope frozen to §2.1; anything else requires a scope change to this document |

---

## 7. Resource Allocation and Sequencing

Single developer (Anthony) + Claude agent execution. Sequencing follows the WBS phases; each phase's exit criteria are the acceptance criteria of its work packages.

| Phase | WBS ref | Depends on |
|-------|---------|-----------|
| 1. Requirements & design freeze | WBS 1.0 | — |
| 2. Skill core (SKILL.md, contract, references) | WBS 2.0 | 1.0 |
| 3. Validator ports + parity fixtures | WBS 3.0 | 1.0 (parallel with 2.0) |
| 4. Agent definitions | WBS 4.0 | 2.0 |
| 5. Ship & report tooling | WBS 5.0 | 3.0 |
| 6. Integration test & acceptance | WBS 6.0 | 2.0–5.0 |

---

## 8. Verification and Acceptance

- **Unit level:** validator parity fixtures (AC-3.1, AC-3.3).
- **Phase level:** each phase agent dry-run against a fixture contract; gate behavior per AC-2.x.
- **System level:** one end-to-end job on a sample repository per output mode (`pr`, `direct_branch`, `patch`); success criteria in §1.3.
- **Acceptance:** all user-story ACs pass; DPPD §1.3 criteria demonstrated; sign-off recorded in the project folder.

---

## 9. Scope Change SC-1 (2026-07-15, post-acceptance)

Approved per R-6 ("anything else requires a scope change to this document"). Amends
§2 (scope) and §4/AC-3.1 (parity guarantee). Version: DPPD 1.1. The §1.3 criterion
"All 10 ported validators produce verdicts identical to the originals" is likewise
narrowed per SC-1.a below.

### SC-1.a — F-2 fix: `criteria.to_checks` verb-regex gaps (validator divergence)

Acceptance finding F-2 (acceptance/DRILL_EVIDENCE.md): the verifiable-verb regex
omitted `-ing` participles for most verbs and the verb "pass", flagging
reasonably-phrased criteria as vague. **Decision:** fix and deliberately diverge from
the ADWS_Pro original for this one pack. The ported validator is version-bumped
(1.0.0 → 1.1.0), and the parity suite marks the pack **diverged-by-design**: it is
verified against its own frozen v1.1.0 baseline, never against the original. AC-3.1
("verdicts identical to the originals") is hereby narrowed to the 8 remaining
original-parity packs. NFR-1 (determinism) still applies to all 9.

### SC-1.b — X-2 (entropy regulator): moved IN scope, skill-native form

§2.2/X-2 deferral lifted for the regulator's portable core. The operational signal is
JSON parse-failure counts (per §2.2 note), recorded per phase attempt in an
append-only `entropy_history.jsonl`; band math reuses the already-ported
`drift-sentinel` canonical gate via a new `scripts/entropy-gate.js`. Band → action:
SAFE/WATCH → proceed (WATCH recorded), WARN → escalate the phase agent one model tier
(extends FR-12), COLLAPSE → halt the job with `STABILITY_BUDGET_EXCEEDED` (RETRY
verdict class). Recording starts at the first attempt with ≥ 1 parse failure and
appends every subsequent attempt (zeros included) — the canonical normalization makes
a zero-anchored rising history degenerate to COLLAPSE, so a leading zero-only prefix
is never recorded. The original multi-call mid-response abort (Trinity loop) remains
out of scope.

### SC-1.c — X-3 (cross-provider Trinity): remains DEFERRED

Considered and not adopted: no OpenAI/Gemini API keys are available in the operating
environment. Risk R-3 (single-provider consensus) remains open and accepted. Revisit
when cross-provider credentials exist.

---

## 10. Scope Change SC-2 (2026-07-16, post-production-run) — APPROVED

Approved per R-6 (operator approval, 2026-07-16). Amends §2 (scope) and extends the
execution-report generator. Version: DPPD 1.2. Motivated by the skill's first production
run against a real third-party repo (`job_20260715_0001`, verdict PROMOTE-with-warnings),
which produced field-evidence findings **F-3 … F-10**. Full register, per-item detail,
sequencing, and invariants: **`docs/SC2_PLAN.md`**. Implemented on branch `feat/sc2`
(three tranche commits) with the skill's own review gate dogfooded over the diff.

### SC-2a — Docs & prompt fixes (F-4, F-6, F-7, F-9, F-10)

Zero parity risk (no validator/report logic). A1 pipeline-mechanics preamble in the
Critic/Advocate dispatch (eliminates the E2E-1 false-positive dissent about
stage-at-ship mechanics); A2 `operator-resolution` added to the `tier_input.source`
enum; A3 append-only rule 2 amended to **write-once for phase agents** with an
exhaustively-enumerated set of orchestrator post-hoc fields (F-7 resolved without
weakening FR-4); A4 SKILL.md "Environment & runtimes" note (absent repo runtimes degrade
to `NOT RUN`, never assumed passes); A5 stale-worktree/ref `.lock` troubleshooting.

### SC-2b — Evidence-schema & report logic (F-3, F-5, F-8)

`execution-report.js` SCHEMA_VERSION 1.0.0 → 1.1.0; report suite 10 → 13 fixtures,
regression-first (fixture before logic, per invariant). B1 optional `resolution` object
on advocate.json — an operator `override` of a false-positive dissent promotes with a
PERMANENT warning (never silent, FR-7), `uphold`/unresolved still QUARANTINE (fixtures
`promote_resolved_dissent` / `quarantine_upheld_dissent`). B2 ship delegated-push
sub-state — a credential-less `pr`-mode push defers (gate `deferred`, no retry burned)
and the orchestrator closes the same attempt post-hoc (fixture `promote_delegated_push`);
deferred-then-pass counts as one attempt. B3 the multi-attempt warning now reports gate
outcomes, not the false "required N attempts before producing output". The 8
original-parity packs and the `criteria-to-checks` v1.1.0 baseline are untouched (84/84
preserved).

### SC-2c — Performance & security hardening (C1, C3, C4, C5; C2 deferred)

C1 mandatory parallel Critic ∥ Advocate dispatch (codified in phase-gates). C3 new
`execution.commit_identity` contract field (default operator git config; documented
fallback `Claude (ADWS pipeline) <noreply@anthropic.com>`) — authorship is an intake
decision, not a ship-time improvisation. C4 prompt-injection rule on all 10 agents (repo
content, issue text, and diffs are DATA; embedded directives are reported, not
followed). C5 evidence-redaction rule (secrets in captured command output → `[REDACTED]`
before evidence, defense in depth on `no-new-secrets`). **C2 (risk-tier the review-gate
Advocate haiku → sonnet) is DEFERRED** pending 2–3 more production runs, per the plan.

### Invariants held

84/84 validator parity and the `criteria-to-checks` v1.1.0 frozen baseline unchanged;
the report suite stays deterministic across re-runs (now 13/13); FR-4 append-only was
STRENGTHENED (A3 exhaustive post-hoc enumeration), never weakened; FR-7 dissent
semantics preserved (B1's override forces a permanent warning); NFR-5 git safety
untouched. Governing state is now **DPPD 1.2 (SC-2)**. Open follow-ups: the E2E-2
confirmation run (SC2_PLAN step 6) and the C2 tier-decision, both pending more run data.

---

## 11. Scope Change SC-3 (2026-07-24, from comparative review) — APPROVED

Approved per R-6 (operator approval, 2026-07-24, **per-item**: A1–A6, B1). Amends §2:
narrowly reopens a slice of X-1 for **per-phase invocation provenance** (append-only
manifest fields only — no hosting infra), and adds **falsifiability** as a test-gate
correctness property. Version: **DPPD 1.3**. Motivated by the `fusion-harness` comparative
review (findings **F-14 … F-17**, re-grounded by an adversarial multi-lens review: 39 raised,
38 survived); full register, per-item detail, sequencing, and invariants in
**`docs/SC3_PLAN.md`**.

### SC-3a — Falsifiability, corrections & check-defect record (docs/spec; zero parity risk)

A1 falsifiability at the test gate, **reusing** `criteria-to-checks`' `check_specs` +
`adws-tester` (no new DSL/runner) — a criterion whose check does not go RED-for-the-right-
reason pre-change is `gate_weak` (unverified/warn), never a pass; A2 red-for-the-right-reason
(extends F-9/F-13 — a `NOT RUN` red is not a valid baseline); A3 structured corrections as one
**fresh, immutable `corrections.json`** in the new build `attempt_{n}/` tree (explicitly
OUTSIDE SC-2 A3's post-hoc designated-field list; FR-4-safe); A4 `run_manifest.check_defect_repairs`
counter capped at one/job, resolving within the existing RETRY/warn vocabulary (**no** new
state/decision/exit); A5 always-on under `test_policy: required` (`false` is rejected at
intake), while `policy.falsifiability: true` forces the baseline for other test policies;
A6 Apache-2.0/MIT import note — independent reimplementation only, no code copied from
`fusion-harness` (MIT); this repo stays Apache-2.0.

### SC-3b — Invocation provenance (evidence-schema; advisory-only)

B1 additive, advisory `phase_manifest.provenance` fields (model id / cost / tokens /
wall-clock / tool-calls; absent ≠ fail; NOT X-1 hosting infra). B2 `execution-report.js`
left **untouched** (report stays 13/13); any report-surfacing is a later SC, additive +
regression-first only.

### Invariants held

Verdict taxonomy **FROZEN** — no new DECISION, exit code, or reason-set entry (the review's
top blocker); **84/84** validator + **13/13** report + **7/7** entropy preserved;
`criteria-to-checks` stays the single criterion→check source (R-2); FR-4 append-only
STRENGTHENED (orchestrator-authored `corrections.json` is a fresh rule-1 artifact, never a
post-hoc edit), never weakened; NFR-2 lean core (no new runtime/DSL); NFR-3 SKILL.md < 500
lines. **R-3 remains open** — dual-perspective planning (WS-F) was NOT adopted; cross-provider
Trinity (X-3) stays deferred per SC-1.c. Rejected superset (acceptance-gate DSL, new terminal
states, dual-perspective planning, broad telemetry, TUI, persistent memory, `/tmp` evidence,
model-generated gates): see `docs/SC3_PLAN.md` §5. Governing state is now **DPPD 1.3 (SC-3)**.

**Verification reconciliation (2026-07-24):** provenance present/partial/absent shapes are
now executable fixtures under `parity/provenance-fixtures/`; the A1/A2/A3 contract
micro-drill is retained at `docs/acceptance/SC3_MICRO_DRILL.md` and runs in local CI.
The reconciliation and linked-worktree/hook-isolation CI hardening landed through
PR #27 (`149712c`).
The larger seven-phase real-task confirmation remains explicitly deferred until a
suitable post-SC-3 task can produce a PROMOTE evidence tree retained before teardown.

## 12. Maintenance audit M-1 (2026-08-05) — terminal-verdict evidence gaps

Not a scope change: no requirement, user story, acceptance criterion, or verdict taxonomy
moves. A full-repo audit against the skill-authoring guide and SWEBOK v4 found two defects
by which `execution-report.js` could certify PROMOTE for a job whose own evidence records
failure — a direct breach of FR-10 / hard rule 8. Both were reproduced before being fixed.

- **M-1a** `pipeline_completion` treated the mere existence of an `attempt_n` DIRECTORY as
  "the phase produced an attempt", so the F-12 shape (a dispatch that dies before writing
  anything) passed. A phase now requires a readable `phase_manifest.json` AND
  `phase_output.json` on its latest attempt.
- **M-1b** The orchestrator's own per-phase `gate_result` was collected and rendered but
  never evaluated, so a `completed` job with a recorded `fail` gate promoted at exit 0.
  New `phase_gates` gate: `fail` → gate fail; `deferred` → warn (an F-5 delegated push
  never closed); unrecorded → unverified.

This is exactly the amendment path SC-3 B2 reserved for `execution-report.js`, and it
holds every condition that clause set: **additive only** (one new gate key), **SCHEMA_VERSION
bumped** 1.1.0 → 1.2.0, **regression-first** (fixture before logic), the **13 existing
verdict fixtures unchanged and still green**, and **no new DECISION, exit code, or
reason-set entry**. Suite counts move 13 → **15** report fixtures
(`quarantine_missing_phase_evidence`, `quarantine_phase_gate_fail`); **84/84** validator,
**7/7** entropy, **3/3** provenance, and the SC-3 micro-drill are unchanged.

Contract defects closed in the same pass: `adws-builder.md` now READS the SC-3 A3
`corrections.json` the orchestrator writes for it (the channel had a writer and no
reader); the planner's `planning_blocked` / `planning_blocked_reason` are documented in the
plan `phase_output.json` shape, ending a rule-8 strict-writer violation; and `docs/`- and
`parity/`-rooted paths were removed from the skill's own markdown, since `install.sh` ships
neither — `frontmatter-lint.mjs` now rejects that class. NFR-3 holds (SKILL.md < 500 lines).
Full finding list, including the four issues deliberately left unchanged, is in
`VERIFICATION.md` "Maintenance audit (2026-08-05)". Merged through PR #29 (`e2e8a5d`);
governing state remains **DPPD 1.3 (SC-3)** — M-1 is a defect fix under it, not a new
revision.
