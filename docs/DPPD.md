# Detailed Project Plan Document (DPPD)

**Project:** ADWS Pipeline Skill — recreate ADWS_Pro's core function as a Claude skill with agent orchestration
**Version:** 1.1 (SC-1 scope change §9, 2026-07-15)
**Date:** 2026-07-14
**Owner:** Anthony
**Status:** Draft — pending approval
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
| FR-12 | Model tiers SHALL be selected automatically: the deterministic risk score from `review.risk_assess` maps to a role→tier table (low risk → Haiku/Sonnet, high risk → Opus Architect + Sonnet Critic), and a phase retry SHALL escalate that phase agent's model one tier. The selected tier and its input score SHALL be recorded in the attempt's evidence. |

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
