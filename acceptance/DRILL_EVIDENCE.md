# ADWS Pipeline — Live E2E Drill Evidence (WBS 6.1–6.4)

**Date:** 2026-07-15 · **Skill under test:** `/Users/etherealogic_2/Dev/adws-pipeline-skill` (branch `fix/f1-planner-description-and-6x-acceptance`, based on main 4e8e00a)
**Scratch target repo:** https://github.com/AJ-EthereaLogic-ai/adws-e2e-scratch (private)
**Evidence trees:** `<scratch>/artifacts/job_20260715_000{1..8}/` — were gitignored/local-only and **were deleted at teardown**, so the live drills are no longer independently reproducible from retained files. Retained evidence: this doc, `acceptance-workflow-journal.jsonl` (the 10-agent acceptance verification), the still-existing remote PRs #1/#2, and the deterministic fixture suite. *(Lesson: copy execution reports into the skill repo before teardown.)*

## What "live" means here (honest scope — read first)

The phase agents (`adws-planner/builder/tester/reviewer/documenter/shipper/verifier`,
`adws-critic/advocate/grader`) were dispatched as **real subagents** by the orchestrator
following `SKILL.md`; the validators and `execution-report.js` were **run for real**; and
`git`/`gh` operations hit the **live GitHub repo**. However, two honesty caveats a
reviewer must know (surfaced by the acceptance workflow's completeness critic):

1. **The evidence files do not self-contain LLM-invocation telemetry.** `phase_manifest.json`
   records the intended `model_tier` and `agent`, not proof of a model call (no
   captured model id / cost / token counts). So *from the artifacts alone* an auditor
   cannot prove an LLM did the reasoning — the live-ness of the agentic phases is
   attested by this orchestration session, not by the files.
2. **Timestamps in the phase manifests are agent-authored placeholders**, not wall-clock,
   and are internally inconsistent in the earlier jobs (e.g. job_0001 `build/attempt_1`
   started_at precedes `plan/attempt_1`). Treat timeline metadata as synthetic.

**What IS independently reproducible from the committed/live state alone:** the git/gh
side effects (PRs, branches, absence of branches/commits) and every validator/report
output (deterministic; re-runnable). US-3, US-5, and the US-6 report machinery rest on
this solid footing; US-2 (rewind) and US-4 (consensus independence) rest on side-effect
artifacts + the SKILL.md rules.

## Verdict matrix (AC-6.2) — all four cells demonstrated LIVE

| Verdict | Exit | Live job | Reason |
|---|---|---|---|
| PROMOTE (clean) | 0 | **job_0007** (PR #2) | all 7 gates pass, zero warnings |
| PROMOTE (with warnings) | 10 | **job_0001** (PR #1) | build `repo.context_scan` warn (pre-F-1-fix) |
| RETRY | 1 | **job_0002**, **job_0006** | PROTECTED_BRANCH_BLOCKED / BUILD_GATE_FAILURE |
| QUARANTINE | 2 | **job_0008** | PR_DRIFT_SENTINEL_BLOCK (2× real grader BLOCK) |

## 6.1 — `pr` mode, full 7 phases, live PR (job_20260715_0001)

- All 7 phases ran with real agents; every gate passed (plan1 build1 test1 review1 document1 ship1 verify1).
- Consensus (fresh-context Critic + Advocate, haiku) ran at **test** and **review**; unanimous pass, no dissent.
- Grader (opus) graded the PR diff: 3/3 criteria satisfied.
- **Live PR #1:** https://github.com/AJ-EthereaLogic-ai/adws-e2e-scratch/pull/1 (OPEN, `adws/job_20260715_0001/multiply` → `main`).
- Commit `94c5986` is **SSH-signed** (`git log %G? = G`) — hooks/signing honored (NFR-5). Worktree isolation held (primary checkout clean; `origin/main` never got `multiply`, FR-8).
- **Verdict: PROMOTE (with warnings), exit 10.** The lone warn is finding F-1 (below).

## 6.2 — ship modes

- **6.2a `direct_branch` → protected `main` (AC-5.2, job_0002):** shipper ran the protected-branch check FIRST and refused before any staging/commit. Independently verified: worktree HEAD == original `main` `1f20923` (no commit), nothing staged, no branch pushed; `block_reason` recorded. Terminal verdict **RETRY, exit 1** (PROTECTED_BRANCH_BLOCKED). *Survived adversarial refutation (refuted=false).*
- **6.2b `patch` (AC-5.3, job_0003):** `git format-patch` file produced, **applies cleanly** (`git apply --check`), **no push** (no remote branch). *Survived adversarial refutation.*
- **6.2c `direct_branch` → unprotected `develop` (job_0004):** branch `adws/job_20260715_0004/power` pushed (`5008330`), **no PR**. Verified via `git ls-remote` / `gh pr list`.

## 6.3 — gate-failure drills

- **6.3a test rewind (AC-2.1, job_0005):** build/attempt_1 seeded with a real bug (`average` returns `a+b`). Real tester → test/attempt_1 **FAIL** (genuine `AssertionError 10 !== 5`). Rewound to build (`cross_phase_rewinds.test = 1`). Real builder → build/attempt_2 fix. Real tester → test/attempt_2 **PASS** (3/3).
- **6.3b budget exhaustion (AC-2.2, job_0006):** plan proposes an out-of-policy `config/` path; real `repo-context-scan` → **FAIL** on both build attempts (model escalated sonnet→opus). Budget (1 retry) exhausted → terminate **BUILD_GATE_FAILURE** → **RETRY, exit 1**. *Survived adversarial refutation.*

## 6.x — post-audit additions

- **Clean-PROMOTE re-drill (job_0007, PR #2):** after fixing F-1, a fresh full 7-phase live run (add `negate`) reached **PROMOTE clean, exit 0** — all 5 report gates pass, zero warnings. The fixed planner emitted `description` per proposal → `repo.context_scan` returned **pass** (not warn). *(Intake note: criteria 1 & 3 were phrased in verifiable form; see F-2.)*
- **Live QUARANTINE (job_0008):** seeded `clamp` ignoring a bound; the **real opus grader** BLOCKED the shipped diff (criterion contradicted), triggering a verify→build rewind (`cross_phase_rewinds.verify = 1`); the re-built change was still non-compliant, the grader BLOCKED again → 2nd `PR_DRIFT_SENTINEL_BLOCK` → **QUARANTINE, exit 2**. This exercised the grader/drift-BLOCK→quarantine gate path (added in the earlier fix session) on live grader judgment.
- **AC-1.2 enforcement (live):** `task-normalize` **hard-fails** (`rubric_result: fail`) on a task missing required fields (`requested_change`), and `references/task-contract.md` "Hard intake failures" reject empty `acceptance_criteria` — so a vague task is rejected at intake before plan. (The interactive "ask the operator" step is behavioral and inherently not captured in a non-interactive drill.)

## Findings

- **F-0 / P1 (fixed post-sign-off):** `execution-report.js` collected Critic/Advocate
  consensus but never gated on it — a `completed` job with a recorded Advocate dissent
  still returned clean `PROMOTE` (exit 0), the dissent showing only as a text warning.
  This contradicted **AC-4.2** and was missed by the live drills (all live consensus rounds
  passed). Found by an independent post-sign-off audit. **Fix** (branch
  `fix/consensus-gate-and-acceptance-corrections`): added a `consensus` gate deriving the
  block from the consensus evidence (Advocate dissent / Critic fail → gate fail → QUARANTINE
  on a completed job). Regression fixtures `quarantine_advocate_dissent` + `quarantine_critic_fail`
  (both `completed`, no `failure_reason`) now QUARANTINE via the gate. Report tests 10/10;
  parity unchanged (no validator touched). See `acceptance/ACCEPTANCE.md` "Post-sign-off audit".
- **F-1 (fixed):** `adws-planner` emitted `file_change_proposal[].reason` but `repo-context-scan.js:60` checks `p.description`, so every well-formed plan tripped a spurious build `warn` → every real job landed PROMOTE-with-warnings (exit 10), making clean PROMOTE unreachable live. **Fix (PR #3):** planner + `artifact-layout.md` now specify `description`; `repo-context-scan.js` header documents it (no logic change → parity 79/79 preserved). Verified live: job_0007 build gate = pass → clean PROMOTE.
- **F-2 (minor, parity-frozen, not fixed):** `criteria-to-checks.js` verifiable-verb regex covers `return(?:s|ed)?` and other verbs but omits the `-ing` participle (e.g. "returning") and the bare verb "pass", despite its comment claiming `-ing` coverage. Effect: some reasonably-phrased criteria are flagged vague → test-gate `warn`. Non-blocking. Changing the regex would break the frozen parity baseline, so the fix (if desired) needs a parity re-baseline; intake should prefer verifiable phrasing meanwhile.
- **Cosmetic:** skill traces were stamped `version: "1.0.0"` while some validators report `2.1.0` in their manifest (e.g. `task-normalize`); the numeric verdict/metrics are unaffected. Job_0007's traces use the correct versions.
