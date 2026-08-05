# ADWS Pipeline Skill — Acceptance Sign-off (WBS 6.4)

> **Post-acceptance update (SC-1, 2026-07-15):** after this sign-off, scope change SC-1
> **fixed F-2** and **shipped X-2**, and the parity count moved from 79/79 to **84/84**
> (`criteria-to-checks` is now deliberately diverged-by-design vs a frozen baseline). The
> `79/79` and “F-2 not undertaken” statements below are the point-in-time sign-off record;
> see `DPPD.md` §9 for the current state.

> **Post-acceptance update (SC-2, 2026-07-16):** scope change SC-2 (findings F-3…F-10 from
> the first production run) was **approved (R-6) and implemented** — merged via PR #9. It
> extends AC-4.2's dissent handling — an operator-`override` of a false-positive dissent now
> promotes with a PERMANENT warning instead of blocking, while `uphold`/unresolved still
> QUARANTINE — grows the report suite to **13/13**, and bumps `execution-report.js` to
> SCHEMA_VERSION 1.1.0. The `10/10` and "gate fails on any recorded dissent" statements
> below are the point-in-time record; see `DPPD.md` §10 (v1.2) for the current state.

> **Post-acceptance update (maintenance audit M-1, 2026-08-05):** an audit found two ways
> `execution-report.js` could certify PROMOTE for a job whose evidence recorded failure — an
> empty `attempt_n` directory satisfying `pipeline_completion`, and per-phase `gate_result`
> never being evaluated. Both are fixed; the new `phase_gates` gate makes a recorded phase
> failure QUARANTINE. The report suite grows to **15/15** and `execution-report.js` moves to
> SCHEMA_VERSION **1.2.0**. AC-4.2 and the verdict taxonomy are unchanged; the `13/13` and
> `1.1.0` statements below are the point-in-time record. See `DPPD.md` §12.

> **Post-acceptance update (field run, 2026-07-18):** the skill's first EXTERNAL field
> run (agentic-starter-kit issue #103, Cowork/cloud runtime, patch ship mode) completed
> with a clean **PROMOTE** — 7/7 gates, 1 attempt per phase, unanimous consensus at both
> gates, zero entropy events, grader 4/4. Its 7 findings (all docs/spec-side; validators
> and report logic untouched, parity still 84/84) were resolved and merged via
> [PR #12](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/12), which also
> codified the Cowork agent-type dispatch fallback as SKILL.md F-11. Run record:
> `docs/field-runs/2026-07-18-issue103-agentic-starter-kit.md`. The E2E-2 confirmation
> run (SC2_PLAN step 6) remains deferred — B1/B2 paths were not exercised by this run.

> **Post-acceptance update (field run 3, 2026-07-18):** second external field run
> (agentic-starter-kit issue #104, patch ship mode) finished **PROMOTE** — with the
> pipeline's first live false-negative QUARANTINE and verify-retry recovery: a
> verifier-spec contradiction (skip semantics vs `verify_structural`) quarantined a
> clean change set; the spec was corrected (operator-approved, scripts untouched,
> parity intact) and verify attempt 2 promoted. FR-10's evidence-derived verdict and
> FR-4 append-only retries behaved exactly as designed. Findings and fixes:
> `docs/field-runs/2026-07-18-issue104-agentic-starter-kit.md`, merged via
> [PR #14](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/14)
> (parity 84/84). E2E-2 remains deferred (B1/B2 still unexercised).

**Date:** 2026-07-15
**Governing docs:** `DPPD.md` v1.0 (§4 acceptance criteria), `WBS.md` v1.0
**Evidence:** `DRILL_EVIDENCE.md` + a throwaway scratch repo (created for the drills, since deleted) + committed `parity/execution-report-fixtures/`
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
| AC-3.1 9 validators identical to originals | ✅ satisfied | `run-parity.js` 79/79 at sign-off _(SC-1: now 84/84; `criteria-to-checks` diverged-by-design)_ |
| AC-3.2 each validator writes a trace file | ✅ satisfied | `skills/<id>/skill_trace.json` present per attempt |
| AC-3.3 validators deterministic | ✅ satisfied | double-run identical (live) |
| AC-4.1 Critic & Advocate separate fresh-context subagents | ✅ satisfied | live job_0001/0007 consensus dirs (both roles, parallel dispatch) |
| AC-4.2 dissent recorded verbatim & blocks | ✅ satisfied (after post-sign-off fix) | **was a defect at initial sign-off** — the report collected consensus but did not gate on it; now the `consensus` gate in `execution-report.js` blocks (QUARANTINE) on any recorded Advocate dissent / Critic fail, proven by fixtures `quarantine_advocate_dissent` + `quarantine_critic_fail` (both `completed` status, no `failure_reason`). See "Post-sign-off audit" below. _(SC-2: an operator-`override` resolution now downgrades a false-positive dissent to a permanent warning rather than blocking — see the top SC-2 note.)_ |
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
   `warn`. Fix needs a parity re-baseline; not undertaken at sign-off.
   **Fixed post-acceptance under SC-1** (v1.1.0, diverged-by-design — see `DPPD.md` §9).
3. **Live-drill evidence was deleted at teardown** (per the operator's "delete both"
   choice). The job_0001–0008 artifact trees and per-job execution reports were local-only
   and are gone; the live drills are no longer independently reproducible from retained
   files. What remains as retained evidence: this narrative, the acceptance-verification
   **workflow journal** (`acceptance-workflow-journal.jsonl`, 10 agent results), and the
   deterministic fixture suite that covers the same verdict machinery. (The scratch repo,
   its PRs, and its branches were deleted at teardown.) *(Lesson: preserve execution reports
   into the skill repo BEFORE tearing down the scratch environment.)*
4. **PR internal review gates are self-attested** — the reviewer/critic/advocate ran as
   subagents in the orchestration session, not as GitHub App reviewers; GitHub shows only
   author summary comments, not formal review artifacts.
5. **Evidence-quality caveats** (DRILL_EVIDENCE.md "What live means"): phase manifests carry
   no LLM-invocation telemetry and use placeholder timestamps.
6. **DPPD formal items — RESOLVED:** the DPPD header was flipped from "Draft — pending
   approval" to **Approved** (operator decision, 2026-07-16), recording the WBS 6.4
   acceptance and the R-6-approved scope changes SC-1/SC-2. The companion §1.3 wording was
   already corrected under SC-1 to read **9** deterministic validators with the 10th
   (`adws-grader`) noted as LLM-graded by design. Both sign-off items are reconciled.

## Remediation performed during acceptance

- **F-1 fixed** (PR #3): planner emits `description` per proposal → clean PROMOTE reachable, demonstrated live (job_0007). Parity preserved.
- **Consensus gate added** (this branch): AC-4.2 now genuinely enforced by the report. Parity preserved.

## Teardown

The throwaway scratch repo and all local worktrees/directories used for the live drills
were removed after acceptance. The drill artifact trees were local-only and are not
retained; the retained evidence is this record plus `acceptance-workflow-journal.jsonl`.
