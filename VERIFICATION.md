# ADWS Pipeline Skill — Build Verification & Gap List

**Date:** 2026-07-14 · **Builder:** Claude (Cowork session) · **Governing docs:** DPPD.md v1.0, WBS.md v1.0

## Delivered

| WBS | Deliverable | Status |
|---|---|---|
| 1.0 | Design freeze extracted from ADWS_PRO_source (contract schema, phases.js semantics, artifact tree, skill-pack API) | ✅ |
| 2.1 | `adws-pipeline/SKILL.md` — 172 lines (NFR-3 < 500 ✅) | ✅ |
| 2.2–2.3 | `references/task-contract.md`, `phase-gates.md`, `artifact-layout.md` | ✅ |
| 3.1–3.2 | 9 validator ports in `adws-pipeline/scripts/validators/` — standalone Node ≥ 20, zero external deps (NFR-4 ✅), CLI wrappers, input-shape headers. drift-sentinel inlines UMIF math (both canonical + legacy modes) | ✅ |
| 3.3 | Parity suite `parity/run-parity.js` — **79/79 fixtures identical** to originals, 79/79 deterministic (AC-3.1, AC-3.3 ✅). Report: `parity/PARITY_REPORT.md` | ✅ |
| 4.1–4.3 | 10 agents in `.claude/agents/`: 7 phase agents + critic + advocate + grader (pr.drift_sentinel.spec recreation) | ✅ |
| 5.1 | Ship procedure (SKILL.md §3 + adws-shipper): explicit-path staging, no hook bypass (NFR-5), 3 output modes, protected-branch refusal | ✅ (drill pending, see gaps) |
| 5.2 | `scripts/execution-report.js` — verdict matrix + exit codes (0/10/1/2/3) ported from `execution-report/decide.js`; 4 verdict fixtures + CLI-error path all pass, deterministic | ✅ |
| 6.x partial | Dry read-through by fresh agent: 10/10 gate-state scenarios answered correctly (WBS 2.0 exit criterion ✅). Five spec gaps it found were fixed (named failure reasons, separate rewind budgets, PROTECTED_BRANCH_BLOCKED path, advocate fail=dissent rule, intake warning for doomed direct_branch contracts) | ✅ |

## Deliberate design decisions (deviations from the original, per DPPD)

1. **Contract trimmed** of hosting fields: `tenant_id`, `submitted_by/at`, `max_cost_usd`, duplicate-task-ID registry (server-side store doesn't exist in a skill).
2. **Retry budgets** follow `src/phases.js` (plan/build/review/document/ship/verify = 1, test = 2); DPPD FR-3's "default 2" applies to any unlisted phase.
3. **Tier selection** (FR-12) is risk-driven (contract `risk_level` → `review-risk-assess` recomputation), replacing the original's CTM/CascadeGov env-gated routing. Retry escalates one tier, capped at opus.
4. **Cross-phase rewind** (test→build) is default behavior per AC-2.1 (original gated it behind `ADWS_CROSS_PHASE_RETRY`). Test and verify rewind budgets are independent, 1 each.
5. **skills_clean gate** in the report scans ALL skill traces in the tree (original: latest attempt only) — strictly more conservative, never more lenient.
6. `PLAN_COHERENCE_BELOW_THRESHOLD` retained in the reason sets for report parity but marked reserved (no gate emits it).

## Gaps — require Anthony's environment (cannot be done in this sandbox)

| WBS | What | How to run |
|---|---|---|
| 6.1 | E2E `pr`-mode run on a sample repo with a live PR (AC-5.1, DPPD §1.3) | Install the skill + agents into a Claude Code project on a scratch GitHub repo with `gh` authenticated; ask Claude to run a small task through the adws pipeline |
| 6.2 | `direct_branch` (incl. protected-branch refusal drill) and `patch` E2E runs (AC-5.2, AC-5.3) | Same setup; submit contracts with those modes |
| 6.3 | Gate-failure drills: forced test failure (rewind path) and budget exhaustion (termination) | Same setup; seed a deliberate bug |
| 6.4 | Acceptance sign-off | After 6.1–6.3 |

Everything verifiable without a live GitHub environment has been verified. To install:
copy `adws-pipeline/` into `.claude/skills/` (or register per your setup) and
`.claude/agents/*.md` into the target project's `.claude/agents/`.

## Review gate — PR #1 (`feat/adws-pipeline-skill-v1` → `main`)

Dogfooded the pipeline's own review gate against this PR: `adws-reviewer`, `adws-critic`,
and `adws-advocate` each ran fresh-context (contract = DPPD.md/WBS.md, change set = the
diff) per `SKILL.md` §2 step 3. Reviewer PASS, Advocate PASS (no dissent), **Critic FAIL**
with two concrete, reproducible defects. Per the pipeline's own hard rule ("Critic fail →
gate fails"), both were fixed before merge:

1. **`execution-report.js` `evalSkillsClean` silently mislabeled crashed/malformed skill
   traces as passing** (FR-6, FR-10, US-6). A `skill_trace.json` with no `rubric_result`
   normalized to `'unverified'` but was counted in neither the fail nor warn buckets, so
   an all-unverified job fell through to the `PASS` branch with `"N pass"` — a validator
   that never executed reported identically to one that passed cleanly, exit code 0.
   **Fix:** `evalSkillsClean` now counts `unverified` separately and returns the
   `UNVERIFIED` gate status (already defined, previously unreachable in this case) when
   any skill trace has no verifiable verdict, which correctly routes to
   `PROMOTE (WITH WARNINGS)` / exit 10 via the existing `decideLifecycle` unverified-gate
   branch. Regression fixture added: `parity/execution-report-fixtures/promote_unverified/`.
2. **The parity claim (AC-3.1) was unreproducible outside the author's machine.**
   `parity/run-parity.js` compared ported validators against the live originals in
   `ADWS_PRO_source/`, which is gitignored (1.5GB, nested `.git`, not distributed in this
   repo) — a fresh clone or CI run couldn't regenerate or verify `PARITY_REPORT.md`.
   **Fix:** every fixture in `parity/fixtures/**/*.json` now carries a frozen `expected`
   field (the original's actual `execute()` output, captured via
   `node parity/run-parity.js --freeze`, which requires a local `ADWS_PRO_source/`
   checkout to run). `run-parity.js` falls back to comparing the ported script against
   `expected` when `ADWS_PRO_source/` is absent — verified by hiding the source directory
   and confirming 79/79 fixtures still matched. `PARITY_REPORT.md` now states which
   baseline mode ran.

Both fixes verified: `node parity/run-parity.js` (79/79, both with and without
`ADWS_PRO_source/` present) and `node parity/execution-report-fixtures/run-tests.js`
(5/5 verdicts + CLI error path) pass clean.
