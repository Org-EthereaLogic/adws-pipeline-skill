# ADWS Pipeline Skill — Acceptance Sign-off (WBS 6.4)

**Date:** 2026-07-15
**Governing docs:** `DPPD.md` v1.0 (§4 acceptance criteria), `WBS.md` v1.0
**Evidence:** `acceptance/DRILL_EVIDENCE.md` + live scratch repo `AJ-EthereaLogic-ai/adws-e2e-scratch` + committed `parity/execution-report-fixtures/`
**Method:** Live E2E drills (jobs 0001–0008) orchestrated per `SKILL.md`, followed by an
independent per-user-story verification workflow (6 verifiers + 3 adversarial refuters +
1 completeness critic), then remediation of the one blocking finding (F-1) and a live
re-drill. See `DRILL_EVIDENCE.md` for the honest scope of "live".

## Acceptance criteria matrix

| AC | Verdict | Backing |
|---|---|---|
| AC-1.1 contract written with objective/criteria/paths/mode | ✅ satisfied | live job_0001 contract |
| AC-1.2 vague task → ask, don't guess | ✅ satisfied | live: `task-normalize` hard-fails on missing required fields + intake hard-failure rules; interactive "ask" is behavioral |
| AC-1.3 `task.normalize` passes on the contract | ✅ satisfied | live re-run, deterministic |
| AC-2.1 failing test gate → rewind to build | ✅ satisfied | live job_0005 (real tester FAIL → rewind → fix → PASS) |
| AC-2.2 budget exhaustion → non-PROMOTE | ✅ satisfied | live job_0006 (BUILD_GATE_FAILURE → RETRY) |
| AC-2.3 phase-order violations impossible by procedure | ✅ satisfied | SKILL.md hard rules + phase-gates.md |
| AC-3.1 9 validators identical to originals | ✅ satisfied | `run-parity.js` 79/79 (live re-run) |
| AC-3.2 each validator writes a trace file | ✅ satisfied | `skills/<id>/skill_trace.json` present per attempt |
| AC-3.3 validators deterministic | ✅ satisfied | double-run identical (live) |
| AC-4.1 Critic & Advocate separate fresh-context subagents | ✅ satisfied | live job_0001/0007 consensus dirs (both roles, parallel dispatch) |
| AC-4.2 dissent recorded verbatim & blocks | ✅ satisfied (after post-sign-off fix) | **was a defect at initial sign-off** — the report collected consensus but did not gate on it; now the `consensus` gate in `execution-report.js` blocks (QUARANTINE) on any recorded Advocate dissent / Critic fail, proven by fixtures `quarantine_advocate_dissent` + `quarantine_critic_fail` (both `completed` status, no `failure_reason`). See "Post-sign-off audit" below. |
| AC-5.1 `pr` mode → live PR URL | ✅ satisfied | live PR #1 (and #2) |
| AC-5.2 protected `direct_branch` refuses, no orphan commit | ✅ satisfied | live job_0002; survived adversarial refutation |
| AC-5.3 `patch` mode → format-patch, no push | ✅ satisfied | live job_0003; survived adversarial refutation |
| AC-6.1 report generated from artifact files only | ✅ satisfied | `execution-report.js` inspected; no network/extra inputs |
| AC-6.2 verdict matrix matches exit-code semantics | ✅ satisfied | all 4 cells live (0/10/1/2: jobs 0007/0001/0002+0006/0008) |
| AC-6.3 every attempt traceable report → evidence dir | ✅ satisfied | report phases/gates map to `artifacts/.../attempt_n/` |

**Initial verification:** independent verifiers marked all 17 ACs satisfied and the three
safety-critical ACs (5.2, 5.3, 2.2) survived adversarial refutation. **However, a
subsequent independent audit found AC-4.2 was NOT actually enforced** (see below) — so the
initial "17/17" was overstated until the fix below. After the fix and re-test: **17/17
genuinely satisfied.**

## Post-sign-off audit (2026-07-15) — one P1 defect found and fixed

An independent parallel agent, auditing the merged state, correctly found that
**`execution-report.js` collected Critic/Advocate consensus but never gated on it.** A
`completed` job with a recorded Advocate `fail` + verbatim dissent still returned
`PROMOTE`, `warn_flag=false`, exit 0 — the dissent appeared only as a text warning. This
contradicted AC-4.2 and my earlier claim that "the report handles it." It is the same
"evidence collected but not gated" class as the grader/drift gaps fixed previously. The
pre-existing `quarantine` fixture passed only because its `run_manifest` already said
`failed`/`ADVOCATE_DISSENT` — it did not prove the report *derives* the block from
consensus evidence.

**Fixed** (branch `fix/consensus-gate-and-acceptance-corrections`): added a `consensus`
gate to `execution-report.js` that reads the latest-attempt `consensus/{critic,advocate}.json`
and evaluates `fail` on any Advocate dissent / Advocate fail / Critic fail; a failed gate
on a `completed` job → QUARANTINE. Two regression fixtures added — `quarantine_advocate_dissent`
and `quarantine_critic_fail`, both with `final_status: completed` and no `failure_reason`,
each now QUARANTINE (exit 2) **via the consensus gate**, proving the verdict is derived from
evidence not narrative (hard rule 8 / FR-10). Report tests now 10/10; parity unchanged (79/79,
no validator touched). `phase-gates.md` §Consensus rule 4 documents the terminal gate.

## Decision

**ACCEPTED** (re-closed after the consensus-gate fix), with these documented notes:

1. **AC-4.2** is now enforced by the report and proven by two `completed`-status regression
   fixtures. A *live* dissent was still never triggered by a drill (all live consensus
   rounds happened to pass); the negative path is proven deterministically, not live.
2. **F-2** (minor, parity-frozen): `criteria-to-checks` verifiable-verb regex omits some
   participle/verb forms; reasonably-phrased criteria can draw a non-blocking test-gate
   `warn`. Fix needs a parity re-baseline; not undertaken.
3. **Live-drill evidence was deleted at teardown** (per the operator's "delete both"
   choice). The job_0001–0008 artifact trees and per-job execution reports were local-only
   and are gone; the live drills are no longer independently reproducible from retained
   files. What remains as retained evidence: this narrative, the acceptance-verification
   **workflow journal** (`acceptance/acceptance-workflow-journal.jsonl`, 10 agent results),
   the still-existing remote PRs #1/#2 + branches, and the deterministic fixture suite that
   covers the same verdict machinery. *(Lesson: preserve execution reports into the skill
   repo BEFORE tearing down the scratch environment.)*
4. **PR internal review gates are self-attested** — the reviewer/critic/advocate ran as
   subagents in the orchestration session, not as GitHub App reviewers; GitHub shows only
   author summary comments, not formal review artifacts.
5. **Evidence-quality caveats** (DRILL_EVIDENCE.md "What live means"): phase manifests carry
   no LLM-invocation telemetry and use placeholder timestamps.
6. **DPPD formal items (operator's call, not mine):** DPPD.md is still headed "Draft —
   pending approval"; and §1.3 says "10 validators" while parity covers the **9**
   deterministic ports (the 10th, `adws-grader`, is LLM-graded by design). These are
   wording/sign-off items for the operator to reconcile.

## Remediation performed during acceptance

- **F-1 fixed** (PR #3): planner emits `description` per proposal → clean PROMOTE reachable, demonstrated live (job_0007). Parity preserved.
- **Consensus gate added** (this branch): AC-4.2 now genuinely enforced by the report. Parity preserved.

## Open (operator's environment / decisions, not code blockers)

- **The remote scratch repo `AJ-EthereaLogic-ai/adws-e2e-scratch` still exists** (verified
  via `gh repo view`) — the earlier deletion did not take effect (the `gh` token lacks
  `delete_repo`). Delete via GitHub web UI (Settings → Danger Zone) or
  `gh auth refresh -h github.com -s delete_repo && gh repo delete AJ-EthereaLogic-ai/adws-e2e-scratch --yes`.
  (Local worktrees + local scratch dir were already removed.)
