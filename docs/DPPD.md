# Detailed Project Plan Document (DPPD)

**Project:** ADWS Pipeline Skill — recreate ADWS_Pro's core function as a Claude skill with agent orchestration
**Version:** 1.13 (SC-13 scope change §22, 2026-08-09)
**Date:** 2026-07-14
**Owner:** Anthony
**Status:** Approved — base plan accepted at the WBS 6.4 sign-off (2026-07-15,
`acceptance/ACCEPTANCE.md`); scope changes SC-1 (§9), SC-2 (§10), SC-3 (§11), SC-4
(§13), SC-5 (§14), SC-6 (§16), SC-7 (§18), SC-8 (§19), SC-9 / SC-10 / SC-11 (§20),
SC-12 (§21) and SC-13 (§22) approved per R-6; maintenance audits M-1 (§12), M-2 (§15),
M-3 (§17), M-4 (§18) and M-5a / M-5b (§20) are defect fixes, not revisions.
Governing version: 1.13.
*(This header had itself gone stale: it read "Version 1.6 / SC-6" while §18 and §19 already
recorded SC-7 and SC-8. Brought current in §20 — a tracking document that lags its own
sections is the documentation form of a count no consumer compares, F-41.)*
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
| FR-12 | Model tiers SHALL be selected automatically: the deterministic risk score (the contract's `risk_level` for plan/build/test/review, the `review.risk_assess` output for document/ship/verify) maps to a **per-phase** tier table — the seven phase agents SHALL NOT share a single tier — plus Critic, Advocate, and Grader entries. Safety floors SHALL hold on every row: ship ≥ Sonnet, verify ≥ Sonnet, grader ≥ Opus. A phase retry, a stability-gate `escalate`, and an F-6 operator-resolution re-review SHALL each escalate that phase agent's model one tier on the ladder Haiku → Sonnet → Opus → Fable, capped at Fable; an escalation requested at the cap SHALL record a saturated source rather than a silent no-op. Fable SHALL NOT be mandated by any table cell — it is reachable only by escalation or explicit operator override. Codex may dispatch those canonical tiers through the aliases `luna` → Haiku, `terra` → Sonnet, `sol` → Opus, and `nova` → Fable; recorded evidence SHALL remain normalized to Haiku/Sonnet/Opus/Fable. The selected tier and its input SHALL be recorded in the attempt's evidence. |

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

Roles are assigned distinct Anthropic model tiers, selected automatically per FR-12 and escalated one tier on retry — the skill-native equivalent of ADWS_Pro's CascadeGov tier routing and `ADWS_LLM_ESCALATION`. Since SC-4 (§13) the Architect side is a **per-phase** table rather than one tier for all seven phase agents (plan and review are priced above the mechanical tail of document/ship/verify), the Critic sits at Sonnet from medium risk, the review-gate Advocate at Sonnet from medium, and the Grader at an absolute Opus floor. This recovers cost adaptation and some error decorrelation, but not cross-vendor diversity (risk R-3) — a fourth same-provider tier does not narrow it.

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
before evidence, defense in depth on `no-new-secrets`). ~~**C2 (risk-tier the review-gate
Advocate haiku → sonnet) is DEFERRED** pending 2–3 more production runs, per the plan.~~
**Closed 2026-08-05 by SC-4 A9 (§13)** — the deferral condition is satisfied: four
production runs have since occurred, and run #105 records the medium-risk row with a
haiku Advocate through a completed review gate, where that Advocate emitted a divergent
`findings` shape. Combined with the standing asymmetry — an unresolved review-gate
dissent terminates as `ADVOCATE_DISSENT` (no retry, quarantine class), so a false dissent
from the cheapest tier is disproportionately expensive to recover from — the bump is
taken. Whether a medium-risk review-gate *dissent* was ever adjudicated is not answerable
from retained records (target-repo evidence trees are external and were not copied before
teardown).

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
governing state at the time remained **DPPD 1.3 (SC-3)** — M-1 is a defect fix under it,
not a new revision. (Superseded as governing version by SC-4 / DPPD 1.4, §13.)

## 13. Scope Change SC-4 (2026-08-05, operator review of FR-12) — APPROVED

Approved per R-6 (operator approval 2026-08-05, **per item**). Amends FR-12 (§3.1) and
the role-tier paragraph in §5.3. Governing version: **DPPD 1.4**. Motivated by an
operator review of tier selection (findings **F-18 … F-26**); full register, per-item
detail, sequencing, and invariants in **`docs/SC4_PLAN.md`**.

**SC-4a — tier table, taxonomy & ladder (docs/spec; zero parity risk).** A1 replaces the
single `Architect` column with seven per-phase columns keyed by error-propagation cost
(plan at Opus on every row — its errors poison six downstream gates; the mechanical tail
drops); A2 admits **Fable** as the fourth canonical evidence tier and widens the ladder
to Haiku → Sonnet → Opus → Fable, resolving FR-12's existing self-contradiction between
"`sol` may resolve to Fable" and "evidence SHALL remain normalized to
Haiku/Sonnet/Opus"; A3 makes Fable a **ceiling, not a floor** — reachable only by
escalation or explicit operator override, because a mandated cell would be unrunnable
wherever the calling workspace is below the required 30-day data retention, and its
refusal mode presents as missing phase evidence
(a false QUARANTINE); A4 adds the Codex alias `nova` → Fable and makes `sol` strictly
Opus; A5 rewrites the grader floor as an absolute now that "the Architect floor" has no
referent under a per-phase table; A6 defines ladder-saturation recording for all three
escalation sources; A7 disambiguates the contract-risk / recomputed-risk boundary and
documents `model_tiers` heterogeneity; A8 generalizes the haiku write-and-verify
mitigation from three roles to any haiku-tier dispatch; A9 closes SC-2's deferred C2
(review-gate Advocate Haiku → Sonnet at medium) **on the deferred data** — run #105
exercised the medium-risk row with a haiku Advocate that emitted a divergent shape; A10 names
ship ≥ Sonnet, verify ≥ Sonnet, grader ≥ Opus as invariants rather than incidental cells.

**SC-4b — evidence & fixture reconciliation.** B1 and B2 correct three fixture manifests
recording escalations that did not escalate, and seat the repository's only Fable value
as a round-trip regression for the widened taxonomy; B3 re-keys the 15
`run_manifest.model_tiers` maps. B4 leaves `execution-report.js` **untouched** (report
stays 15/15, `SCHEMA_VERSION` 1.2.0).

### Invariants held

Zero tier awareness in code, before and after — the tier table is a dispatch-time
documentation contract, never a gate input; verdict taxonomy frozen (no new DECISION,
exit code, or reason-set entry); 84/84 parity + 15/15 report + 7/7 entropy + 3/3
provenance + the SC-3 micro-drill preserved; risk rows remain exactly `high|medium|low`
per `review-risk-assess`; FR-4 append-only untouched; NFR-2 lean core (no new script,
runtime, or dependency); NFR-3 SKILL.md < 500 lines (357). **R-3 remains open** —
cross-provider Trinity (X-3) stays deferred per SC-1.c; a fourth same-provider tier does
not narrow it.

**Rejected (see `docs/SC4_PLAN.md` §5):** tier ordering or validation in code, a
`model_tier` enum validator, a fourth risk level, mandating Fable in any cell,
`grader = fable`, agent-frontmatter reconciliation, report-surfacing of tiers, and a
corpus-wide `tier_input` backfill.

Merged through PR #31 (`b3bb75a`). Local CI at the merged head: Tier 1 all nine steps
PASS and Tier 2 both legs PASS (`node20` build+run, `node24` build+run, `linux/arm64`).
The remote CodeQL check failed in 3s on the account-wide billing lock — the same
non-code failure carried by every merged PR since #24; it is not a required check.
(This section originally added "and `main` has no branch protection." Corrected during the
M-3 post-merge sync: `main` IS protected, with an EMPTY required-status-checks list. The
operative fact is unchanged — nothing blocks on CodeQL — but the stated reason was wrong.)

## 14. Scope Change SC-5 (2026-08-05, field run job_20260805_0003) — APPROVED

Approved per R-6 (operator approval 2026-08-05, **per item**). Amends the
`criteria.to_checks` port only; no requirement, story, acceptance criterion, or verdict
taxonomy moves. Governing version: **DPPD 1.5**. Motivated by a production field run
against `Org-EthereaLogic/cadence-method-skill` issue #4 (findings **F-27 … F-30**); full
register, per-item detail, and invariants in **`docs/SC5_PLAN.md`**.

**Trigger.** The orchestrator reported that the validator emitted **7 check specs for 8
acceptance criteria**, that the omission was AC-4 ("…output format is specified as…"), and
that it caught the count mismatch and covered AC-4 by hand so nothing shipped ungraded.
That run's evidence tree was not retained, so those specifics are **orchestrator-reported,
not independently re-derivable** (`SC5_PLAN.md` §"Evidence boundary"). The *mechanism* is
established from the committed code alone: v1.1.0 classed the "is specified as"
construction vague, and the pre-change `execute()` built `check_specs` from the verifiable
list only — so a criterion classed vague did not merely lose its `pass` rubric
contribution, it left the tester's work list entirely, silently. The pipeline's own
evidence recorded no trace of such a drop, and that is the defect SC-5 fixes.

**What changed.** `check_specs` now carries **every** criterion in input order, typed
`behavioral` (outcome language confirmed) or `unclassified` (not confirmed — a fact about
the wording, never a verdict on the criterion); `check_id` is index-stable as a result. The
verb set was widened by ~40 families, including the specification family that caused the
live drop and — for the validator gating the *test* phase — `fail`, `assert`, `skip`, and
`warn`, none of which v1.1.0 covered though it covered `pass`. Three SC-1 regex artifacts
that matched non-words (`runn`, `runns`, `sett`, `outputt`) were replaced with real-form
equivalents. `criteria-to-checks` version-bumped **1.1.0 → 2.0.0**; the major reflects the
changed meaning of the emitted array, not a changed key set.

**What did not change.** `rubric_result`, `criteria_count`, `verifiable_count`, and
`vague_count` are computed exactly as before, and across all 14 pre-existing fixtures the
widened regex moved **zero verdicts and zero counts** — the seven subjective controls stay
vague. A criterion is still *judged* the same way; it is now *reported* either way. This is
the boundary SC-5 enforces: what the validator emits changed, what it judges did not.

### Invariants held

Classifier stays a pure lexical function (NFR-1) with no network or new dependency (NFR-2,
NFR-4); the eight original-parity packs untouched and `criteria-to-checks` still the sole
diverged-by-design pack; verdict taxonomy frozen (no new DECISION, exit code, or reason-set
entry) and `execution-report.js` untouched at `SCHEMA_VERSION` 1.2.0; report 15/15, entropy
7/7, provenance 3/3, and the SC-3 micro-drill preserved; NFR-3 SKILL.md < 500 lines (367).
Parity moves **84/84 → 88/88** (four new fixtures; five re-baselined on `check_specs` alone,
nine byte-identical). **R-3 remains open** — cross-provider Trinity (X-3) stays deferred per
SC-1.c.

**Rejected (see `docs/SC5_PLAN.md` §5):** an LLM-judgment classifier (breaks NFR-1/NFR-2 and
makes the tester's one trusted artifact non-reproducible), a second classifier or
`acceptance_gate` DSL (already rejected under SC-3 for R-2 drift), relaxing the 10-character
gate, making `unclassified` fail the gate or adding a fourth `rubric_result`, a parallel
vague-criteria metric key, and backfilling `check_type` into historical evidence trees.

**Post-submission review (F-31…F-34, `docs/SC5_PLAN.md` §6).** Automated review of the change
set raised four valid findings, all fixed in the same PR rather than deferred. Two were
substantive: **F-31**, that full emission guarantees a criterion is *delivered* to the tester
but not that it was *answered* — closed by carrying `check_id` onto `phase_output.json.checks`
and requiring every emitted spec id to appear there; and **F-34**, that this change set
carried two different evidence standards for the originating run's 7-of-8 tally, now reduced
to one boundary stated in `SC5_PLAN.md` and referenced by the rest (tally, omitted-criterion
identity, manual coverage, and PROMOTE are orchestrator-reported; the *mechanism* is proven
from the committed validator). **F-32** finished A3's `output` cleanup (`outputed`/`outputing`
still matched); **F-33** separated retention from the rubric in both summaries.

Merged through PR #36 (`51a163d`). Local CI at the merged head: Tier 1 all nine steps PASS
and Tier 2 both legs PASS (`node20` build+run, `node24` build+run, `linux/arm64`). The remote
CodeQL check failed in 2s on the account-wide billing lock — the same non-code failure
carried by every merged PR since #24; it is not a required check and `main` has no branch
protection.

## 15. Maintenance audit M-2 (2026-08-06) — dispatch boundary & baseline safety

Not a scope change: no requirement, user story, acceptance criterion, or verdict taxonomy
moves, and no code changes. Two docs/prompt defects from the `job_20260805_0004` field run
(findings **F-35**, **F-36**), both cases where the spec's emphasis and its safety boundary
were written at different volumes. Full detail in `SC6_PLAN.md` §1–§2; the run is recorded
in `field-runs/2026-08-05-issue5-cadence-method-skill.md`.

- **M-2a (F-35)** The consensus parallel mandate stated no BOUNDARY. `SKILL.md` and
  `phase-gates.md` require Critic ∥ Advocate in capitals while expressing the ordering only
  as the parenthetical `Architect → (Critic ∥ Advocate)`, so nothing forbade widening the
  batch to include the phase agent — which a runtime that encourages batching independent
  calls will do. The live run did: at `test/attempt_1` the tester ran 23:09:56–23:15:42Z
  while the Advocate assessed at 23:13:02Z and the Critic at 23:14:06Z, both inside that
  window. The consensus agents cannot distinguish a mid-write worktree from a finished one,
  so the failure mode is silent by construction. Both files now state that the parallel set
  is EXACTLY `{Critic, Advocate}` and that the arrow is a barrier.
- **M-2b (F-36)** `adws-tester.md` and `phase-gates.md` named
  `git stash push --include-untracked` … `git stash pop` as *the* falsifiability-baseline
  technique — the operation `adws-reviewer.md` has always prohibited in the worktree, for a
  reason that is strictly stronger at the test gate: the worktree holds the ONLY copy of an
  uncommitted, partly untracked change set, so a dispatch that dies mid-stash loses the
  whole build. Replaced with a non-mutating baseline (`git archive` into a scratch dir, a
  worktree/clone created outside the pipeline worktree, or `git show` for targeted checks),
  and the reviewer's prohibition is now carried in the tester's contract too.

Suite counts unchanged by M-2 (88 / 15 / 7 / 3 + micro-drill at the time of the audit);
NFR-3 holds. Governing state remains **DPPD 1.6 (SC-6)** — M-2 is a defect fix under it.
Merged through PR #38 (`029ee0d`), together with SC-6 (§16) and M-3 (§17).

## 16. Scope Change SC-6 (2026-08-06, field run job_20260805_0004) — APPROVED

Approved per R-6 (operator approval 2026-08-06, **per item**). Amends the consensus
resolution set (§5.3) and the evidence schema; no requirement, story, acceptance criterion,
or verdict taxonomy moves. Governing version: **DPPD 1.6**. Motivated by a production field
run against `Org-EthereaLogic/cadence-method-skill` issue #5 (findings **F-37 … F-40**);
full register, per-item detail, and invariants in **`docs/SC6_PLAN.md`**.

**Evidence boundary — met, for the first time.** SC-5's originating run lost its evidence
tree and its central tally was therefore orchestrator-reported. This run's tree survived, in
the target repo's primary checkout at `artifacts/job_20260805_0004/` (hard rule 5 keeps
evidence outside the worktree, so teardown did not take it). Every claim in SC-6 was
re-derived from that tree, and the two central ones were re-derived *against* the
orchestrator's summary: the concurrent dispatch is in the phase/consensus timestamps, and
the report's blindness to the repaired dissent is in the rendered
`| consensus | pass | 2 round(s) clean |` sitting beside a `verdict: "fail"` advocate file.

**Trigger.** A review-gate Advocate dissented that the deliverable had silently dropped four
findings the research record marked VERIFIED. The dissent was correct, the reviewer had
independently found the same class of defect, and the operator agreed. At that point the
spec offered three resolutions — `override` (false positive), `uphold` (terminate with
`ADVOCATE_DISSENT`), and F-6's fresh re-review (for a *suspected* false positive) — none of
which means "you are right; fix it and check again." **A correct dissent's only sanctioned
exit was termination**, so the Advocate doing its job well was procedurally indistinguishable
from the job failing. The run took the undefined path anyway, and the improvisation
necessarily landed outside the schema and outside the report's field of view.

**What changed.** `resolution.action: "repair"` becomes the fourth resolution: the operator
confirms the dissent, the gate attempt closes `fail` with the attempt-level annotation
`ADVOCATE_DISSENT_REPAIRED`, the job rewinds to build carrying the dissent as
`corrections.json` (`source_attempt` now admits `review/attempt_{n}`), the build attempt
escalates one tier on the existing F-6 operator-resolution ladder, and the phases re-run
forward. A fourth independent budget `operator_directed_rewinds: { test, review }` caps it
at 1 per gate; it consumes an ordinary build retry, which bounds the loop twice.
`execution-report.js` now also scans SUPERSEDED attempts for dissents, exposes them as
`superseded_consensus`, quotes them verbatim in a dedicated report section, and drives the
existing `consensus` gate to **WARN** on any it finds — so the governing rule becomes one
sentence: *an Advocate dissent recorded anywhere in a job's evidence forbids a CLEAN
promote.* Before this, the STRONGEST resolution was the invisible one: repairing a dissent
erased it from the report while `override` — the dissent was wrong, nothing changed — had
warned since F-3.

**What did not change.** Superseded evidence WARNS, never fails: the latest-attempt gating
contract stays exactly as it was, so a successful retry still reaches clean PROMOTE. No new
DECISION, exit code, terminal failure-reason entry, or gate key; `ADVOCATE_DISSENT_REPAIRED`
is an attempt annotation no decision function reads. An unrecognized `resolution.action` is
still treated as no resolution, leaving the dissent blocking (fail closed).

### Invariants held

Verdict taxonomy frozen; latest-attempt gating preserved; `execution-report.js` amended on
the SC-3 B2 path (additive only, regression-first, **SCHEMA_VERSION 1.2.0 → 1.3.0**, existing
verdict fixtures unchanged and still green); no new script, runtime, or dependency (NFR-2);
zero tier awareness in code (SC-4); NFR-3 SKILL.md < 500 lines (**379**). Parity **88/88**,
entropy **7/7**, provenance **3/3**, and the SC-3 micro-drill unchanged; report fixtures move
**15 → 16** (`promote_repaired_dissent`, which also carries the F-40 regression). **R-3
remains open** — cross-provider Trinity (X-3) stays deferred per SC-1.c.

**Rejected (see `docs/SC6_PLAN.md` §5):** making a superseded dissent FAIL the gate, a new
terminal failure reason for the repair path, a separate `repaired_dissent` gate key,
orchestrator auto-repair without the operator, an uncapped repair budget, backfilling
`superseded_consensus` into historical trees, and enumerating every live `run_manifest` key
in the documented shape.

Merged through PR #38 (`029ee0d`), carrying M-2 (§15) and M-3 (§17) in the same squash.
Local CI at the merged head: Tier 1 all nine steps PASS (`run_id` `20260806T032406Z`) and
Tier 2 both legs PASS (`node20` build+run, `node24` build+run, `linux/arm64`; `run_id`
`20260806T032411Z`). The remote CodeQL check failed in 10s on the account-wide billing lock
— the same non-code failure carried by every merged PR since #24; it is not a required
check (`main` is protected with an EMPTY required-checks list).

## 17. Maintenance audit M-3 (2026-08-06) — the harness held itself to a lower standard

Not a scope change: tooling only. No requirement, story, acceptance criterion, verdict
taxonomy, skill text, or evidence schema moves; `adws-pipeline/` is untouched apart from
nothing at all. Prompted by asking, after SC-6, whether local CI had kept up with the
codebase it gates. It had not — and the largest gap was a defect class the pipeline itself
had already been fixed for twice (findings **F-41 … F-44**).

- **M-3a (F-41) Suite sizes were narrated, never asserted.** Four places printed fixture
  counts (`Makefile`, `gate.sh` ×2, `.githooks/pre-push`, `scripts/local-ci/README.md`) and
  nothing compared them to anything. `Makefile` still said `84` — parity moved 84 → 88 under
  SC-5 the previous day and the banner was never updated, so the drift predated the audit.
  Worse than stale prose: **no runner asserted its own size.** `run-parity.js` derived its
  total from disk; the report, entropy, and provenance runners derived theirs from
  `CASES.length`. Delete a fixture and its `CASES` entry and every suite reports green with
  fewer tests. That is exactly SC-5/F-27 — *a count no consumer compares is not a control* —
  sitting in the harness that guards against F-27. Fixed by cross-checking the declared
  `CASES` against the fixtures on disk **in both directions** inside the report, entropy,
  and provenance runners (two independent sources for the same fact), and by adding
  `EXPECTED_FIXTURE_TOTAL = 88` to `run-parity.js`, which discovers from disk and therefore
  has no second source. All four were falsified before being accepted: hiding a fixture
  makes each fail with the specific name.
- **M-3b (F-42) NFR-3 was verified by hand.** "SKILL.md < 500 lines" is claimed in every
  scope change's "Invariants held" — 357 (SC-4), 367 (SC-5), 379 (SC-6), monotonic — and the
  verification was a human running `wc -l`. `frontmatter-lint.mjs` now asserts it, using
  `wc -l` semantics so the number it prints is the number the docs quote.
- **M-3c (F-43) The ten agent definitions were unlinted.** `install.sh` ships
  `.claude/agents/adws-*.md` alongside the skill and Claude Code registers each as a subagent
  type keyed by its `name`, yet nothing checked that the frontmatter existed, that `name`
  matched the filename, or that `model` was a canonical SC-4 tier. A typo'd `name` does not
  fail loudly — the type never registers, the F-11 fallback papers over it, and the defect
  surfaces at run time several layers from its cause. Now linted; falsified against an
  injected bad `name` and a non-canonical `model`.
- **M-3d (F-44) The Tier-3 review prompt argued against the current spec.** It told the
  advisory reviewer to protect "the mandatory-parallel consensus at the test/review gates" —
  the exact unbounded phrasing that *was* F-35 — so it would have flagged M-2's fix as a
  regression. It also predated SC-5's full `check_specs` emission and all of SC-6. Refreshed
  through SC-6, with new dimensions for the evidence-schema/consensus invariants and for
  suite coverage. Advisory tier, so this never gated anything; a stale reviewer prompt is
  still a reviewer arguing for a defect.

Suites: report **16/16**, parity **88/88**, entropy **7/7**, provenance **3/3**, SC-3
micro-drill — all unchanged in size, now all self-asserting. Tier 1 nine of nine PASS.
Governing state remains **DPPD 1.6 (SC-6)** — M-3 is a defect fix under it, not a revision.
Merged through PR #38 (`029ee0d`), together with M-2 (§15) and SC-6 (§16).

M-3's own audit turned up one stale claim in this document and two in `VERIFICATION.md`:
"`main` has no branch protection," repeated since SC-4. `main` IS protected; what makes the
failing CodeQL check non-blocking is that its required-status-checks list is EMPTY. The
conclusion was right and the reason was wrong, which is the kind of thing that survives
review precisely because the conclusion is right. Corrected in place at each site.

---

## 18. Maintenance audit M-4 + Scope Change SC-7 (2026-08-07, field run job_20260807_0001) — APPROVED

The third field run against `Org-EthereaLogic/cadence-method-skill` (issue #21, WP 5.1,
`job_20260807_0001` → PR #70) promoted with warnings and shipped a correct artifact. It
also improvised in seven places where the spec is silent or wrong, and carried an eighth
defect the run itself never noticed. Findings **F-45 … F-52** are registered with
per-finding evidence in `SC7_PLAN.md` §1; the run record is
`field-runs/2026-08-07-issue21-cadence-method-skill.md`.

**The scope change is F-38 finished.** SC-6 gave a *correct* Advocate dissent an exit
other than termination, and made a repaired dissent visible in the terminal report under
the rule "an Advocate dissent recorded anywhere in a job's evidence forbids a CLEAN
promote." Every mechanism it built was built on `advocate.json`. So when the CRITIC — the
adversarial half of the same gate — correctly identified a real code defect at the review
gate, there was no remediation but job death (**F-46**), and when a rewind produced a
clean later round, the Critic fail behind it was scored by nothing at all (**F-52**). Two
independent Critics in this run caught two verified, reproducible defects that changed the
shipped artifact; the terminal report read `consensus: pass — "2 round(s) clean"` with
`superseded_consensus: []`. The rule held for one half of consensus and not the other.

**M-4 (docs/prompt only, no code, no schema).** Four hand-off gaps where the spec's
*requirement* and its *mechanics* were written at different volumes:

- **F-45** — `adws-tester` was required to treat `check_specs` as its source of truth and
  echo each `check_id` verbatim (the SC-5/F-31 coverage-by-id gate), while its documented
  inputs contained no `check_specs` and the phase loop ran validators AFTER dispatch. By
  the letter, the tester can only mint ids that cannot join back to the criteria — the
  same hand-off hole F-31 closed, reopened one step upstream. `criteria-to-checks` is now
  an explicit PRE-dispatch step (it is a pure function of the frozen criteria, so it costs
  nothing to run early), and the tester is told to STOP rather than invent ids.
- **F-49** — `adws-reviewer.md` step 1 was "read the full diff (`git diff
  {target_branch}`)" for a change set the pipeline *expects* to be uncommitted and partly
  untracked. `git diff` never shows untracked files, so for a green-field change it
  returns nothing, and no rule said an empty diff means "enumerate and read directly."
  The failure mode is an approval of an unread change set whose evidence is
  indistinguishable from a real review — the F-35 silent-by-construction shape. Now:
  enumerate `files_changed` ∪ `git status --porcelain -uall`, read new files directly, and
  an enumerated set that is empty while `files_changed` is not is a FINDING.
- **F-50 / F-51** — `check_type` documented only in the validator source; and no defined
  behavior for a contract whose `allowed_paths` admits no documentation location, though
  `document-coverage-map`'s scoring (0.5 + 0.3 + 0.2, pass ≥ 0.7) makes `docs_delta: []`
  plus a real changelog and summary a legitimate pass. Third consecutive run to hit an
  `allowed_paths`/docs conflict; now carries the non-blocking `NO_DOC_PATH_IN_SCOPE`
  intake warning so the empty delta reads as the contract's consequence.

**SC-7 (spec + evidence schema + report).** Approved by the operator per item:

- **B1 (F-46)** — Critic-fail remediation. Reproduce the finding first: **verification
  chooses the route, never the verdict** (the gate failed either way). A reproduced code
  defect rewinds to build via `corrections.json`, tracked in `cross_phase_rewinds.review`
  (review gate) or `.test` (test gate), capped at 1; a finding that does not reproduce
  takes the ordinary retry path with the non-reproduction recorded. Attempt annotation
  `CRITIC_FAIL_REPAIRED`, exactly parallel to `ADVOCATE_DISSENT_REPAIRED` — never a
  terminal reason. No new terminal state, DECISION, or exit code.
- **B2 (F-47)** — one authoritative rewind budget accounting table. The answer existed for
  two of the four budgets and was unstated for the rest, which is why the run took THREE
  build attempts against a documented budget of 1 with nothing flagging it. Gate-automatic
  rewinds and the check-defect repair do NOT consume a build retry (their own cap of 1
  bounds them, and charging them would make the first such finding exhaust the budget);
  the operator-directed repair DOES, because nothing else bounds a repeatedly-electing
  operator.
- **B3 (F-48)** — `tier_input.source` gains `cross-phase-rewind` (+ saturated). The run's
  rewind builds had no legal source and wrote improvised attempt reasons
  (`CRITIC_FAIL_REWIND_TO_BUILD`, `CRITIC_FAIL`) outside every enum, correctly annotating
  them as attempt-level. The forward re-run after a rewind is defined as a table-tier
  fresh attempt, not a retry.
- **B4/B5 (F-52)** — `collectSupersededConsensus` reads `critic.json` alongside
  `advocate.json`; the `consensus` gate warns for either half; new fixture
  `promote_repaired_critic_fail`. **SCHEMA_VERSION 1.3.0 → 1.4.0** (additive), report
  fixtures **16 → 17**. Superseded evidence still WARNS and never fails — the
  latest-attempt gating contract is untouched, and a latest-attempt Critic fail still
  FAILS exactly as before.

**What makes this record citable.** The evidence tree survived (hard rule 5), and in the
decisive case it contradicts the orchestrator's own summary: the narrative reported a
clean two-round consensus while the tree records `critic: fail` on both `test/attempt_1`
and `review/attempt_1`. Running the post-change report against a copy of that tree moves
it to `consensus: warn` with both fails surfaced. The run that exposed the defect is the
run that demonstrates the fix.

---

## 19. Scope Change SC-8 (2026-08-08, field run job_20260807_0004) — APPROVED

The fourth field run against `Org-EthereaLogic/cadence-method-skill` (issue #22, WP 5.3,
`job_20260807_0004` → PR #77) promoted with warnings and shipped a correct artifact.
SC-7's B1 rewind path worked end to end on its first live outing: the review gate caught a
real defect, the orchestrator reproduced it before routing it, classified the root cause
`code`, rewound to build with structured corrections, and re-ran forward to two unanimous
consensus rounds. Findings **F-53 … F-59** are registered with per-finding evidence in
`SC8_PLAN.md` §1 and §7; the run record is
`field-runs/2026-08-07-issue22-cadence-method-skill.md`.

**The scope change is about a validator that guessed, and a rule nothing asserted.** Of the
nine deterministic validators, `review-risk-assess` was the only one whose *inference* could
fail a gate: any path substring-matching `/auth/i`, `/token/i`, or `/policy/i` scored
`risk_level: high`, and `high` returned `fail`. Three siblings already followed the opposite
discipline — `criteria-to-checks` warns on vagueness and fails only on zero criteria,
`document-coverage-map` warns below 0.7 and fails only on nothing-documented,
`repo-context-scan` fails on a policy violation (a fact) and warns on a thin description (a
guess). This one inverted it, and the inversion had a structural consequence nobody had
noticed: because `high` always failed the gate, the `high` row of the post-review tier table
in `phase-gates.md` was **unreachable** — the run could never arrive at the recomputation
that row feeds (**F-53**).

The run hit the heuristic on two fixture directory names its own task contract had mandated
(`pass-resolves-through-authority/`, `fail-two-definitions-one-token/`). The operator
adjudicated it a false positive, correctly. But `SKILL.md` hard rule 3 said a validator
`fail` blocks promotion, full stop, and only an Advocate dissent had a resolution vocabulary
— so there was no legal way to record the adjudication. The orchestrator wrote
`rubric_result: "warn"` at the `skill_trace.json` wrapper while `output.rubric_result` stayed
`"fail"`, with the rationale in `error`. `execution-report.js` read only the wrapper, so the
terminal report certified `0 fail, 1 warn` for a run whose validator had returned `fail`
(**F-55**). `artifact-layout.md` had defined that file as a transcription of the validator's
stdout since SC-2. Nothing checked it. This is SC-7/F-47's lesson recurring at the level of
evidence integrity: **a rule nothing asserts is a rule nothing enforces.**

Two costs are visible in the tree rather than the narrative. The deliverable's `authority.md`
corpus files were renamed to `method-source.md` purely to appease the validator — the tooling
reshaped the product. And the recorded `model_tiers` show `document: sonnet`, the `high` row:
its only field use to date was reached by overriding the `fail` that guards it.

**SC-8 (validator behavior + report integrity + spec).** Approved by the operator per item:

- **A1 (F-53)** — `risk_level` becomes the model-tier signal only, keeping its arithmetic;
  `rubric_result` fails on an unassessable change set, warns on `risk_level: high`, and
  passes on `low`/`medium`. Heuristics warn, facts fail. The `high` tier row is reachable.
- **A2 (F-54)** — security matching is per path segment and per token within a segment
  (extension stripped, split on non-alphanumerics), with any path under a test corpus
  excluded outright, and the matched paths reported as `security_sensitive_paths[]` so a warn
  names its files instead of asserting a count the operator must re-derive.
- **A3 (F-55)** — the rule is stated in `SKILL.md` hard rule 3 and `artifact-layout.md`, and
  then ASSERTED: `execution-report.js` cross-checks the wrapper against `output.rubric_result`
  and, on disagreement, scores the row from the validator's stdout and QUARANTINEs — an
  evidence-integrity breach, the same class as `MISSING_UPSTREAM_ARTIFACT`. **There is no
  operator override for a validator verdict.** SC-7 refused the Critic one because a claim
  about code can be settled by reproducing it; SC-8 refuses validators one because after A1
  every remaining validator `fail` is a fact, and a fact is fixed, not adjudicated.
- **A4 (F-57)** — `SKILL.md` §5 tells the orchestrator to cancel wakeups it scheduled for
  itself; the run ended with a stale one firing after the terminal report.
- **A5–A7** — fixtures, the `quarantine_trace_mismatch` report fixture, and the doc sync
  (`phase-gates.md` gate rule 2 carries the house rule; `validator-inputs.md` makes the
  verdict derivable without opening the validator).

**Review round (F-58, F-59), found by independent review and fixed before merge.** Both are
the same failure mode SC-8 was written about — a claim asserted in prose that no test
exercised — and both are recorded in `SC8_PLAN.md` §7 rather than silently patched:

- **F-58** — the mismatch check relied on SUBSTITUTION to fail the gate, which works only
  when the concealed verdict is the worse one. Wrapper `warn` over an output of `pass` scored
  clean and promoted at **exit 0** with the integrity warning gated on nothing. The invariant
  "every mismatch quarantines" had been asserted in four documents and tested in one
  direction — the direction where substitution happened to fail the gate by itself. The
  disagreement is now its own failing term, and the 15-cell wrapper × output matrix was
  enumerated: all six disagreements exit 2, the three agreements behave normally, and absent
  or unrecognized output falls back to the wrapper.
- **F-59** — assessability tested only that `files_changed` was a non-empty array, so
  `[null]`, `["a-string"]`, and `[{"action":"modify"}]` returned `pass`/`low`, each inflating
  the file count while invisible to the security scan — an unreadable change set could select
  a LOWER tier than a readable one. Entries now require a usable `file_path`, with the
  additive `malformed_entries` count. `action` is deliberately NOT enum-validated:
  `artifact-layout.md` declares the field but enumerates no values, so enforcing one would
  manufacture the false-fail class SC-8 exists to remove.

**Verdict taxonomy frozen.** No new terminal state, DECISION, exit code, or failure reason;
`SCHEMA_VERSION` stays **1.4.0** (the mismatch marker is projected out of `skill_verdicts[]`,
and a mismatch is already machine-readable through `decision`). Parity **88 → 93**, report
fixtures **17 → 19**; `review-risk-assess` v1.0.0 → **v2.0.0**, diverged-by-design.

**The run that exposed the defect demonstrates the fix.** Re-run against
`job_20260807_0004`'s actual 73-file change set, v2.0.0 returns `pass` / `risk medium` /
`security_sensitive_count: 0`: all twelve matches were false positives, so the override, the
permanent warning, and the renames in the deliverable were all unnecessary. Run against a
copy of the same evidence tree, the new report moves it from PROMOTE/exit 10 to
**QUARANTINE/exit 2**, naming the wrapper/output disagreement first among the warnings.

---

## 20. Audit-driven remediation: M-5a, SC-9, SC-10, SC-11, M-5b (2026-08-08) — APPROVED

Source: `docs/AUDIT_2026-08-08.md` — an audit of the skill against its own recorded
evidence (13 field runs, 73 local-CI and 40 OrbStack records, the parity report, the
acceptance evidence, `SKILL.md`, the 10 agent definitions, every executable in the repo).
Package plans: `M5A_PLAN.md`, `SC9_PLAN.md`, `SC10_PLAN.md`, `SC11_PLAN.md`, `M5B_PLAN.md`.
Verification: `VERIFICATION.md` §M-5a…§M-5b.

### What the audit found

The pipeline's behaviour was not the problem. Its self-knowledge was. **The Tier-1 gate had
never gone red** in 73 recorded runs — 657/657 steps green — and every finding in the
F-register had been located by a field run, a review bot, or a human audit, never by CI. On
top of that, the record already contained two warnings nobody had acted on: a validator that
took **grader 12/12 and unanimous consensus at both gates while shipping an
information-disclosure path**, and a security fix whose two locking fixtures stayed **green
when the guard was deleted**.

Three defects were reproduced live, all sitting in the band the suite did not test —
`run-parity.js` ran each validator's CLI exactly once per pack, happy path only.

### Findings (F-63…F-71)

| ID | Finding | Package |
|---|---|---|
| F-63 | `repo-context-scan` used `{}`; a `__proto__` path segment threw *before* the policy loop completed, so the build-phase policy gate was **skipped, not failed** | SC-9 |
| F-64 | `branch_name` length-checked only, in **both** ship validators — the documented pre-git gate — while the value reaches `git push`. `{slug}` was undefined anywhere in the spec | SC-9 |
| F-65 | Unbounded `Math.max(...abs)` spread; `RangeError` at 200k entries. No input-size cap existed anywhere | SC-9 |
| F-66 | Six agents instructed to write evidence files while declaring no `Write` tool | SC-10 |
| F-67 | Predictable `os.tmpdir()` path written with `writeFileSync` in the parity harness | M-5a |
| F-68 | `install.sh` destroyed user edits with no backup, prompt or diff | SC-10 |
| F-69 | `safeReadJson` conflated unreadable and malformed evidence with absent | SC-11 |
| F-70 | Fixture-scoped acceptance criteria make the grader structurally blind *(renumbered from a colliding F-58)* | recorded |
| F-71 | A frozen fixture can pin nothing, and the pack looks identical either way *(renumbered from a colliding F-59)* | M-5a answers |

Also closed: **F-17**, open since SC-3 across five scope changes — WONTFIX-with-substitute,
because per-subagent token and cost accounting is not obtainable from the runtime. The
obtainable half (wall-clock, agent, requested tier) became mandatory and typed; the
unavailable half is retained and explicitly null so a reader can tell *not captured* from
*field dropped*. And the **grader mandate ambiguity**, open since a field run graded the same
criterion class two defensible ways: settled as diff-only.

### The sequence, and why it is a stack

`main → M-5a → SC-9 → SC-10 → SC-11 → M-5b`. M-5a lands first and alone because every SC-9
claim would otherwise be verified by a gate with no demonstrated ability to fail — the
F-58/F-60/F-61 pattern §19 named, recurring a third time. The plan called SC-10 and M-5b
independent; **they are not.** SC-10 and SC-9 both edit `SKILL.md` and `gate.sh`; M-5b
extends the `guard-ablation.mjs` and `cli-contract` runner M-5a introduces. Merge in order.

### What changed

- **M-5a** — a CLI-contract suite over all 11 shipped CLIs (every exit-3 path, both input
  modes; stdin had no coverage at all before), the `guard-ablation` sweep, a wrapper
  byte-identity lint, `mkdtempSync`.
- **SC-9** — three packs to `v2.0.0` and into `DIVERGED_PACKS`; corpus **93 → 108**; the
  `patch-compose` undercount recorded in three runs and deferred each time, fixed.
- **SC-10** — six `Write` grants asserted from the agent *body* (a hand-written list had
  already missed one); agent-block drift lint; `SKILL.md` **425 → 337**; the installer.
- **SC-11** — unreadable evidence quarantines instead of scoring clean; report fixtures
  **21 → 24**, provenance **3 → 5**; the vocabulary mapping; archive-before-teardown.
- **M-5b** — the false `ci-orb` "closes F-13" claim restated and the axis actually covered;
  `tested_tree`; the F-58/F-59 collision; `guard-ablation` to all nine packs; fixture
  baseline provenance; harness consolidation.

### What this scope change says about its own method

Three times the new machinery caught the new work. `guard-ablation` **failed the gate on
SC-9's own first cut**, naming four unpinned rules — one of which was dead security-shaped
code. SC-11's first two quarantine fixtures were **vacuous**: they tripped a different gate
and passed with the fix fully reverted, F-71's exact class reproduced inside the remediation
for it. And M-5b's first tested-tree digest produced **identical hashes** for trees differing
in untracked content. Each is recorded in its plan rather than quietly fixed, because in all
three the broken version looked entirely plausible and would have shipped green.

The honest counters moved the wrong way on purpose: validator parity is now stated as **4 of
9** byte-for-byte (down from 7 — scope changes were approved, not parity lost), and the
parity report reports **39 original-parity fixtures and 69 frozen-baseline regression**
instead of "108/108 identical".

**Invariants held:** no `SCHEMA_VERSION` bump; the decision set (PROMOTE / RETRY /
QUARANTINE) and exit codes unchanged; NFR-4 preserved (no shared module under
`scripts/validators/`, `checkRequires` untouched, every validator still standalone on Node
built-ins); NFR-3 holds (`SKILL.md` **359** < 500 — SC-10 cut it 425 → 337 and SC-11 added
back 22 lines of mandatory archive and provenance procedure); **20 pre-existing fixtures in the three
SC-9 packs changed zero verdicts**; no recorded evidence tree rewritten.

**Still open, recorded rather than closed:** 19 unpinned rules across six validators
(tracked bidirectionally in `parity/guard-ablation-baseline.json`); `execution-report.js` is
the largest unswept surface and needs a different mechanism; archive-before-teardown is a
mandated procedure with no mechanical enforcement; F-0, F-1, F-42 and F-43 are referenced
but never defined; **R-3 remains open**; and **F-72** — nothing detects a stale install.

**F-72 (post-merge).** Asked whether the merged changes would affect future runs, the answer
was no: all three installed copies were still pre-remediation, and F-63/F-64/F-65 reproduced
live in each. The repository lints its own tree thoroughly and has no check that an installed
copy matches the source. Remediated by hand, no mechanism shipped, so it recurs on the next
merge. The parity harness proves the validators in `git` are correct and says nothing about
the validators that will run tomorrow.


---

## 21. Scope Change SC-12 (2026-08-09) — APPROVED

Source: **F-72**, recorded in §20 and unremediated there. Plan: `SC12_PLAN.md`. Verification:
`VERIFICATION.md` §SC-12.

### The finding

After §20 merged with a green gate, **all three installed copies of the skill were still
pre-remediation**, and F-63, F-64 and F-65 reproduced live in every one of them — including
in `agentic-starter-kit`, the repository nine of the thirteen field runs targeted. A merged
fix does not reach a run until someone reinstalls, and nothing said so.

The gap was structural. This repository lints its own tree exhaustively and had **no check
that an installed copy matched its source**; nothing even knew where the skill was installed.
The parity harness proves the validators in `git` are correct and says nothing about the
validators that will actually run.

### What shipped

Two mechanisms, because they answer different questions and neither suffices alone:

- **What is this?** `skill-manifest.json` (a content digest of all 30 shipped files, skill
  tree and agent definitions) plus `scripts/skill-check.js`, which verifies an installed tree
  against it. The orchestrator asserts it at intake and records `run_manifest.skill_version`,
  so a stale install says so **in the evidence of every run it touches**.
- **Is it current?** `make check-installs`, run from the source, comparing each install
  registered by `install.sh`. It distinguishes STALE from **MODIFIED** (version matches but
  files don't — the more dangerous case, since the version alone looks right).
- **A6:** `.githooks/post-merge` fires the check at the one moment the answer changes.

The version is derived from **content, not git**: a commit hash is chicken-and-egg and goes
stale on a rebase. `skill-manifest` is a gate step, so a shipped file cannot change without
the manifest being regenerated.

### What this scope change says about its own method

**Review found three Major defects** in the first cut — the one PR in the surrounding series
where CodeRabbit was able to finish. Two were the same class: agent definitions held to a
weaker standard than the skill tree, fixed in `skill-check.js` and missed in
`check-installs.mjs`. That is precisely what a second reader catches and an author does not.

**The hook's first live firing found its own defect.** Pulling the merge of its own PR it
announced `904e3aa56dac -> 904e3aa56dac` — firing on the "nothing changed" case its own
design forbids, because the trigger keyed on the manifest *file* rather than the
`skill_version` value, and `git_commit` moves with HEAD. That is the same root cause as a
churn bug already fixed one layer down in `--write`, surfacing a second time, and no test in
the suite would have caught it: the suite tests the hook against branches it constructs, and
the case only arises from a real merge.

**Invariants held:** no validator changes, no fixture changes, no refreeze, no
`SCHEMA_VERSION` bump. `run_manifest.skill_version` is additive evidence, never a gate input.
NFR-3 holds (`SKILL.md` 376 < 500); NFR-4 preserved.

**Still open:** the hook only helps someone who ran `make install-hooks` — a fresh clone has
none until it does; and F-72 itself was found by a question, not by a check.

---

## 22. Scope Change SC-13 (2026-08-09, field runs job_20260809_0003/0004) — APPROVED

Source: **F-73 … F-79**, from two consecutive RETRY runs against `cadence-method-skill`
issue #24. Field record: `docs/field-runs/2026-08-09-issue24-cadence-method-skill.md`.
Plan: `SC13_PLAN.md`. Verification: `VERIFICATION.md` §SC-13.

### The finding

Two jobs found **eleven real defects** in one deliverable and repaired ten. Every one of
the five Critic `fail` verdicts reproduced as a true positive; not one rewind was spent on
a finding that did not hold up. Then both jobs terminated RETRY and shipped nothing, and
the ten repairs ended up in a state the pipeline has no vocabulary for.

Every finding below is the same shape: the pipeline detected correctly and then could not
KEEP what it detected.

- The eleventh defect was manufactured by the fix for the ninth — and the orchestrator had
  written the warning that would have prevented it (*"do not overcorrect into a false
  NEGATIVE … verify both directions"*) into a `corrections.json` field that exists in no
  schema and that `adws-builder.md` never tells the builder to open.
- Ten repairs left no regression check behind, because nothing requires one.
- The retained worktree was adopted by the next job through invented schema
  (`isolation_mode: "worktree-reused"`), and which of its files carried gate evidence
  survived only as a free-text `operator_notes` paragraph.
- A subagent's scratch cleanup deleted the orchestrator's probe corpora mid-verification.
  Nothing owned scratch space; nothing recorded the loss.
- The reproduction that ENDED the job exists only as prose inside `findings[].evidence`;
  its corpus is in no archive. The most consequential claim in the run is the one claim
  that cannot be re-run from the run's own evidence.

### What shipped

Six of the seven findings are remediated; all of it is procedure and schema, and **no
validator changed**.

- **F-73, the substantive one.** A terminal non-PROMOTE state now writes
  `run_manifest.carry_over` — retained path, branch, and a per-file digest of the change
  set. A contract may name `execution.resume_from_job`, which is the ONLY authorization to
  run against an existing worktree, and only when the predecessor recorded
  `resumable: true` (it never shipped). Intake then classifies every path in the tree or
  the record as `unchanged` / `changed` / `added` / `removed` into
  `run_manifest.resumed_from`, and `isolation_mode: "worktree-resumed"` joins the enum.
  Only `unchanged` carries evidence forward, and only as far as `gated_through` reached —
  a digest match proves the file has not moved, never that a gate assessed it. Hard rule 6
  is untouched: nothing is staged or committed to produce the record.
- **F-75.** `corrections.json` gains an optional `guidance` object —
  `invisible_because`, `direction_of_error`, `must_not_regress`, `tie_breaking`,
  `housekeeping` — lifted verbatim from what a live orchestrator already wrote into an
  undocumented key. `adws-builder.md` now makes reading it mandatory and requires the
  builder to state in `phase_log.md` how each `must_not_regress` item survived and how
  `direction_of_error` was checked in BOTH directions.
- **F-76.** Every `code` correction must leave a permanent check behind, carrying the
  correction's `check_id`, recorded in `phase_output.regression_check_ids`, with the
  pre-fix reproduction output in the builder's log. The forward test re-run answers those
  ids through the SC-5/F-31 join that already exists — no new DSL, runner, verdict, or
  exit code.
- **F-77.** A third shared agent block assigns every agent its own scratch root and
  forbids deleting outside it (`agent-blocks-lint.mjs` now pins three blocks across all
  ten agents). `findings[]` gains a `reproduction` object, REQUIRED when the author
  actually ran something, and the corpus is written to `consensus/repro/` so it reaches
  the archive.
- **F-78.** `execution-report.js` distinguishes a phase not reached from a phase that
  wrote nothing. Detail strings only — no gate status, DECISION, exit code, or
  `SCHEMA_VERSION` change.
- **F-79.** `resolution` is documented on `advocate.json` alone, matching the prose that
  already said so.

### F-74 — closed WORKING-AS-DESIGNED, on the record

For a Critic-found code defect the effective budget is one repair: `phase-gates.md` F-46
step 5 terminates on the second Critic fail at a gate, and job 0004 hit it with a test
retry still unspent. Raising it was considered and **declined by the operator**.

The case for raising it is that all five Critic fails were true positives and the sixth
would probably have been too. The case against is that nothing in the evidence
distinguishes "the Critic keeps finding new defects" from "the deliverable is being
patched in circles", and a budget that cannot tell those apart should fail closed.

What made the terminations expensive was never the cap. It was that terminating threw ten
gated repairs outside the evidence boundary — which is F-73, and F-73 shipped here. The
decision is recorded so a third run can revisit it with its own evidence.

### What review caught — including this change repeating the defect it was fixing

**CodeRabbit returned nine actionable findings on the first cut, one Critical and five
Major, and eight were real.** Recorded in full because the most important one is an
indictment of the change itself:

- **`{scratch}` was never bound (Major).** The new shared block told ten agents to work
  under `{scratch}/{jobId}/{phase}/attempt_{n}/{agent}/` — and nothing in `SKILL.md`,
  the dispatch step, or any agent input ever defined `{scratch}`. **That is F-75's exact
  defect, committed inside the scope change that exists to fix F-75:** a rule delivered to
  the right file whose binding nobody was required to supply. An agent could read the
  brace form literally, and two agents guessing differently is the collision the block was
  written to prevent. Fixed by having the orchestrator create and pass a resolved absolute
  `scratch_root` at every dispatch, with a documented fallback.
- **F-76 was unsatisfiable for its own motivating case (Major).** `regression_check_ids`
  accepted `criteria-to-checks` ids only, while the rule applies to every `code`
  correction — including a Critic finding that answers to no criterion, which is what
  defects 9 and 11 were. Fixed with a correction-scoped `REG-…` namespace that sits
  outside the criteria namespace and so leaves the F-31 join untouched.
- **The corpus had no machine-readable reference (Major).** Both the tester and
  `phase-gates` were told to exercise "the corpus the correction names", and nothing in
  `corrections.json` let a correction name one. Fixed with a `repro { attempt, files }`
  field.
- **The regression join proved nothing (Major).** `artifact-layout` explicitly permits
  several checks per `check_id`, so a pre-existing row satisfied the presence join while
  the new assertion never ran. Fixed by requiring a NEW row carrying the id and real
  output from the corpus, and by saying plainly that the F-31 join does not establish this.
- **`reproduction.command` was an execution channel (Critical).** A free-form shell string
  composed by an agent that has just read an untrusted repository — the precise thing the
  agents' own security block exists to stop — recorded in a schema with no handling rule.
  Nothing executes it today, which is exactly when to write the rule: never evaluate it,
  allowlist any automated replay by `check_id`, and canonicalize `files` under
  `consensus/repro/`.
- **A digest match was called "gated" (Major).** It proves only that a file has not moved
  since the record; a file written after the last passing gate matches and was never
  assessed. Fixed by classifying `unchanged`/`changed`/`added`/`removed` and stating that
  `unchanged` inherits evidence only as far as `gated_through` reached.
- **The carry-over record was silent about post-ship states (Major).** Answered by
  RESTRICTING rather than expanding: `resumable` is true only for a job that never
  shipped. A schema that claimed authority over commit and ship state would be describing
  things `ship/attempt_{n}/phase_output.json` already owns.
- Two Minors: a verification sentence that called F-78 "the only executable change" while
  the same section recorded a lint change, and fixture assertions naming one phase where
  four needed pinning.

The one finding declined: an executable end-to-end resume fixture for F-73. It is the
right idea and it is the live drill already recorded as deferred — the resumption path is
orchestrator procedure with no code to drive, exactly like the worktree lifecycle it
extends, and simulating it in a fixture would pin the simulation rather than the pipeline.

### What this scope change says about its own method

Every one of these seven findings was already visible in the evidence tree the pipeline
itself wrote. F-75 is the sharpest: the correct guidance was authored, delivered to the
right directory at the right moment, and ignored — not because anyone erred, but because
the receiving contract enumerated six fields and that guidance was not among them. **A
field the reader is not told to read is a field that was not written.**

F-78 is the mirror image at the other end of the run: the report's own words made a
routine RETRY wear the QUARANTINE face, in a document whose entire purpose is to be the
authoritative verdict. Both are failures of the interfaces BETWEEN correct components,
which is the class this project keeps finding and the class no component-level test sees.

**Invariants held:** no validator changes, no fixture refreeze, no `SCHEMA_VERSION` bump,
no new terminal state / DECISION / exit code. Report fixtures 24 → 25 (the new
`quarantine_skipped_phase` case pins both branches of the F-78 wording from one tree).
Parity 108/108 unchanged. NFR-3 holds (`SKILL.md` 424 < 500).

**Still open:** input-dimension coverage still has no owner — F-76 makes a REPAIRED defect
leave a check behind, and does nothing about the axis nobody has varied yet. Nine Critic
rounds missed multi-document manifests because no artifact anywhere said manifests can name
more than one document. And a resumed job inherits a classified worktree but not its
predecessor's findings; cross-job memory remains manual.

---

## 23. Maintenance audit M-6 (2026-08-09) — the detectors are honest; the budgets are not

Not a scope change: findings only. No requirement, story, acceptance criterion, verdict
taxonomy, skill text, evidence schema, or validator moves here. Full evidence base:
`AUDIT_2026-08-09.md`. Remediation proposed in `SC14_PLAN.md`. Findings **F-80 … F-87**.

Prompted by asking what the run corpus says is worth changing next, rather than what the
last scope change happened to touch — and read against Anthropic's skill-authoring best
practices and SWEBOK v4 (ch. 5 *Testing*, ch. 7 *Engineering Management*).

### What the evidence answered

`AUDIT_2026-08-08.md` §1 rested on a gate that had never gone red in 73/73 runs. It has now
gone red **five times across four steps** — `guard-ablation` ×2, `requires`, `bash32-scan`,
`skill-manifest` — and three of those four were added by the M-5a / M-5b / SC-12 wave that
the finding produced. The mechanisms built to be falsifiable proved falsifiable on real work
within a day of shipping. This is recorded as a closed concern, not carried forward.

`parity` was 0-for-139 at the time of this audit (the ledgers are append-only, so that figure
is a timestamp), which is the expected shape for a frozen-fixture regression suite on a
mostly-docs commit stream. Its ability to fail is established by `guard-ablation` mutating
the validators rather than by counting reds — which is exactly why F-86 matters. SC-14 then
demonstrated it directly: deleting the legacy yellow-band rule turns
`legacy-yellow-band-reached.json` red, so the suite now has a recorded red on a real rule.

### Findings

- **F-80 — Tier-3 review egress trusts an unvalidated `OLLAMA_HOST`.**
  `scripts/local-ci/review.sh:31` reads `OLLAMA="${OLLAMA_HOST:-http://localhost:11434}"` and
  `:73` posts the branch diff to `"$OLLAMA/api/chat"` with nothing between them. The default
  is loopback and `curl -d @-` keeps the diff off the process table — both correct — but any
  environment that sets the variable ships the full branch diff to an arbitrary host, and no
  output names the destination. The only network egress in the repository. Observed in
  `AUDIT_2026-08-08.md` §6; no fix shipped.
- **F-81 — secret redaction is LLM-honoured, and SC-11 + SC-13 widened its blast radius.**
  `agent-shared-blocks.md:41-50` requires all ten agents to redact secrets;
  `agent-blocks-lint.mjs` proves only that all ten carry the same TEXT. `SC10_PLAN.md` §6
  already called the gap *"real and unaddressed."* What changed: SC-11/A5 writes every
  terminal archive to a durable directory OUTSIDE the checkout, and SC-13/F-77 puts verbatim
  target-repo file copies in `consensus/repro/` inside it — `artifact-layout.md:338`: *"so it
  lands in the evidence tree and therefore in the terminal archive."* Unredacted material now
  persists off-checkout by design where it used to die with the worktree. Both changes are
  correct; neither should be reversed. The register is unkind to the control that remains:
  F-2, F-28/F-29 and F-54 are all cases where a LEXICAL rule misjudged content, and an
  instruction to a model is weaker than lexical.
- **F-82 — SC-13's Critical "never evaluate `reproduction.command`" rule is prose in one
  reference file with nothing asserting it.** The rule at `artifact-layout.md:344-352` is
  good and complete. It is not a `SKILL.md` hard rule, it is not in the agents' security
  block (verified — that block covers prompt injection and secret redaction only), and no
  lint asserts it. Nothing executes the string today, which is precisely when SC-13 said to
  write the rule; the rule was then placed where a future automation author would meet the
  field in a schema and the rule nowhere. **F-55 (*a rule nothing asserts is a rule nothing
  enforces*) and F-75 (*a field the reader is not told to read is a field that was not
  written*) recurring inside the scope change that fixed both.** The `files` half of the same
  rule — `resolveWithinRoot`, reject absolute paths / `..` / escaping symlinks — has the same
  status.
- **F-83 — `SKILL.md` has no line budget, and SC-10's considered floor was erased in 24
  hours.** 172 → 425 across 20 commits; SC-10 cut it to **337** and RECORDED the floor
  (`SC10_PLAN.md` §5: *"337 with a 350-line advisory target is where the prose stops being
  reference-grade"*); SC-11 (+22), SC-12 (+19) and SC-13 (+46) put back all 88 lines in about
  a day. `frontmatter-lint` NOTEs at 350 and fails at 500. **The growth was already noticed
  once:** M-3b/F-42 recorded *"357, 367, 379, monotonic"* and asserted the 500 CEILING — the
  point at which the file is already too large — not the trend that was the observation. Two
  months on the trend is unchanged (25 growths, 1 reduction in 26 commits) and the lint has
  never had anything to say. At ~+29 lines per scope change the ceiling arrives in roughly
  three more. **This is not a proposal to compress `SKILL.md` again** — SC-10 rejected that on
  good grounds and the rejection stands. 337 was a decision with no mechanism.
- **F-84 — input-dimension coverage has no owner.** Carried from §22's "Still open" and
  restated here so it has a finding ID. Nine Critic rounds never varied the manifest-count
  axis; defect 9 was reachable only with a two-document manifest while all 24 frozen
  fixtures, both checked-in tests and every prior round used single-document ones. Nothing in
  the contract, in `criteria-to-checks`, or in any agent enumerates a change set's input
  dimensions. Same class as F-70: the artifact that bounds what CAN be checked sits upstream
  of every mechanism that does the checking.
- **F-85 — cross-job memory is manual.** Carried from §22's "Still open". F-73 gives a
  successor a CLASSIFIED worktree and not the predecessor's FINDINGS; job 0004 re-confirmed
  0003's eight defects only because the operator wrote it into free-text `operator_notes` —
  the improvisation-in-prose F-73 exists to end, surviving one layer up. `carry_over` already
  exists and F-76 has just created the thing worth carrying (`REG-…` ids).
- **F-86 — every accepted guard-ablation survivor is an unverified rule, owned by a shipped
  work package, in fields the tool never reads.** The baseline's `_doc` defines the taxonomy:
  *"`class: equivalent` means the mutation provably cannot change behaviour. `class: unpinned`
  means the rule genuinely lacks a fixture and MUST carry an `owner` naming the work package
  that closes it."* Against that: **(1)** all 19 accepted entries are `class: "unpinned"` and
  **none** is `equivalent` — by the file's own definition it records nineteen rules that
  genuinely lack a fixture; **(2)** all 19 carry `owner: "SC-12 (unscheduled)"`, and SC-12
  shipped (§21) closing none of them; **(3)** `guard-ablation.mjs` reads neither `class` nor
  `owner` — both are required by the `_doc` and consumed by nothing, which is F-75 and
  recurring mode #9 inside the file built to answer F-71; **(4)** *"this list may only
  SHRINK"* is enforced against staleness but not against growth — a new survivor added to
  `accepted` in the same commit passes. The gate's success line prints `(19)` and reads as
  clean. **Because nothing read the fields, the register was wrong in BOTH directions.**
  SC-14's triage (931-input sweep, both gating modes) found `drift-sentinel:verdict:#5`
  — which this finding's first cut called the sharpest entry — to be a **dead branch**
  (`computeCTM` returns only `green`/`yellow`/`red`, so its `else` is unreachable), i.e.
  provably `equivalent` and never debt at all. It found exactly one genuinely unpinned AND
  reachable rule, the legacy YELLOW band — **and the pack already contained a fixture named
  `legacy-yellow-zone.json` whose entropy 0.25 gives ctm 0.08, landing in the RED band**, so
  deleting the yellow rule left it green. A fixture named for the rule it does not pin is
  F-71's exact shape, found live inside the mechanism built to answer F-71. Separately, the
  `mutation` field is truncated with an ellipsis for long conditions, so two entries could
  not be replayed from the register at all.
- **F-87 — reference cross-linking creates the nested-read hazard; one reference lacks a
  TOC.** All seven references are indexed one level from `SKILL.md` and `frontmatter-lint`
  checks it BIDIRECTIONALLY — better than the authoring guidance asks. But five of seven
  cross-link each other, and the two largest are circular: `phase-gates.md` (601 lines) ↔
  `artifact-layout.md` (473). The guidance's reason for the one-level rule is mechanical —
  a file reached THROUGH another reference tends to be previewed (`head -100`) rather than
  read — and for a 601-line gate reference a partial read is a correctness risk. Six of seven
  files carry a TOC, which is what keeps this small. `validator-inputs.md` (132 lines) is the
  only reference over 100 lines without one, and it is reachable through `task-contract.md`.

### Register hygiene

**F-11, F-12 and F-13 still have no register rows.** They exist only as `SKILL.md`
troubleshooting headings and `references/runtimes.md` / `references/troubleshooting.md`
prose; the register jumps F-10 → F-14. Flagged as M-5b/B5 in `AUDIT_2026-08-08.md` §5 and not
closed there. Recorded again rather than fixed in passing, because assigning definitions to
three IDs that are already cited by shipped skill text is a change to the skill's own
vocabulary and belongs in a scope change, not an audit. The F-58/F-59 collision the same
entry flagged **is** closed — renumbered to F-70/F-71 in the issue-#22 field record.

### Disposition

`SC14_PLAN.md` proposes F-80, F-82, F-83, F-86 and F-87 for SC-14 — the five whose mechanism
is understood and whose fix touches no schema, no validator behaviour and no
`SCHEMA_VERSION`. F-81, F-84 and F-85 are proposed for SC-15 because each needs a DECISION
before it needs code: a scanner and a false-positive policy (F-81), a contract-schema field
(F-84), and a first live exercise of a path that has never run (F-85).

**F-83 is the highest-leverage item**, being the only one that bounds future cost rather than
paying down past cost. **F-86 is the sharpest single defect**, because a register whose
classifications nothing reads is wrong in both directions at once and cannot say so.

**Invariants held (audit M-6 itself):** nothing under `adws-pipeline/` changed for the audit,
so `skill-manifest.json` did not move. Parity 108/108, `SCHEMA_VERSION`, the terminal-state
enum and exit codes 0/10/1/2/3 all untouched. NFR-3 held (`SKILL.md` 424 < 500).

**SC-14 has since landed** — F-80, F-82, F-83, F-86 and F-87. See `SC14_PLAN.md` and
`VERIFICATION.md` §SC-14 for what shipped, what the triage corrected in F-86, and the
falsification record. F-81, F-84 and F-85 remain open, owned by SC-15.

**SC-15, SC-16 and SC-17 have since landed too** (PRs #81, #87, #86, #88), closing **F-84,
F-85, F-84b, F-88, F-88b, F-89 and F-90**. **SC-18 has opened** and landed its first finding,
**F-91** (finding 39 / issue #74 resolved as option 2 — `baseline_reason` is `null`, not an
enum member, when a check passes pre-change — the same two-places-one-question family as gaps
1/3/7, resolved by naming the recorded evidence authoritative over the documentation table,
SC-16/F-89's template) and **F-92** (closes arm A gap 11, the required-vs-supplemental split option 2
deferred: a `check_role` field — `required` | `supplemental` — on the test check row plus a criterion
aggregation rule honoring the two pinned constraints, `fail` dominates and a required row is never
masked by a verified sibling; docs-only, no validator reads the field). **SC-18's remaining scope is
arm A gap 9 only** (`references/` as this repo's documentation location — proposed and stands), so the
package is in progress, not closed. F-81 remains open too. The register's next free number is
**F-93**; the next free work package is **SC-19**.

Three of those are worth carrying into this document rather than leaving in `VERIFICATION.md`,
because each says something about the defect classes DPPD tracks:

- **F-88b (finding 56) is finding 51's fifth instance, and its second in the same twenty
  lines.** F-88 shipped an anti-laundering guard that excluded a gate wholesale; that gate
  answered two questions in one status, so excluding it excluded a finding along with a
  premise. Both the guard and the gate were correct read alone. **Two consecutive fixes to the
  same code shipped the same defect class, each authored while explicitly reasoning about that
  defect class** — which is the sharpest available evidence that "be careful about composition"
  is not a control. What caught it was an independent reader.
- **F-90 measured the cost of not having a control.** `guard-ablation` had never swept
  `execution-report.js`, the file all three SC-16 defects lived in, because an estimate in its
  own scope block said the file "needs a different mechanism". The estimate was made without
  reading for a seam, and the seam (`buildReport`) was one function above the one everybody
  reads. First sweep: 19 unpinned rules, including the `canceled` branch whose dishonesty
  motivated F-88.
- **Finding 57 revises how a reproduction should be read.** Arm A gap 6 was recorded as a
  confirmed agent defect because two independent live runs reproduced it. Both runs were reading
  the same wrong line of documentation; the agent was correct. **A reproduction confirms the
  observation, not the diagnosis** — running twice cannot separate an agent that misbehaves from
  a document that lies.
