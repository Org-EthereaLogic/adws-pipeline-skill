# ADWS Pipeline Skill — Build Verification & Gap List

**Date:** 2026-07-14 · **Builder:** Claude (Cowork session) · **Governing docs:** DPPD.md v1.0, WBS.md v1.0

**Status (2026-07-14):** WBS 1.0-5.0 merged to `main` via
[PR #1](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/1)
(commit `c333bb9`; feature branch `feat/adws-pipeline-skill-v1` deleted after merge).
Only WBS 6.1-6.4 (live E2E drills, see "Gaps" below) remain open.

**Status (2026-07-18):** post-acceptance, the skill's second production run (first
external field run, agentic-starter-kit issue #103) completed with a clean PROMOTE;
its 7 findings — none touching validator or report logic — were resolved docs/spec-side
and merged via [PR #12](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/12)
with parity 84/84 and both fixture suites green pre/post. See
`docs/field-runs/2026-07-18-issue103-agentic-starter-kit.md` for the run record and
per-finding resolution.

**Status (2026-07-18, run 3):** third production run (agentic-starter-kit issue #104,
fixing the target repo's own CRIT-002 vacuous-gate bug) finished **PROMOTE** (exit 0)
after an initial **false-negative QUARANTINE**: adws-verifier.md's skip semantics
contradicted `artifact-layout.md`'s `{check, pass}` shape and `execution-report.js`'s
`verify_structural` gate, making any `.md`-touching change set unable to promote. Fixed
spec-side (adws-verifier.md; plus SKILL.md ship-staging union wording) — scripts and
parity untouched. FR-10 held: the false verdict was evidence-derived and the retry is
fully recorded (verify attempt_2). Target-repo outcome: PR #118 merged (closes #104),
follow-up #119 filed for marker-scan.sh, dashboard synced via #120. The skill-repo
spec/doc changes (adws-verifier.md, SKILL.md, tracking docs) were merged via
[PR #14](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/14) with parity
84/84. Run record: `docs/field-runs/2026-07-18-issue104-agentic-starter-kit.md`.

**Status (2026-07-18, run 4):** fourth production run (agentic-starter-kit issue #105,
the `test-typescript` swallowed-exit-code bug) — the pipeline's first fully-clean
end-to-end run on a local machine with real `gh` + push credentials: **PROMOTE**
(exit 0) first-attempt on all 7 gates, live `pr` mode, shipped as target-repo PR #121
(merged; the #122 pipefail-residual follow-up was hardened in the same PR after
CodeRabbit review). Skill-side enhancements and the run record merged via
[PR #16](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/16) and
[PR #17](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/17). Run
record: `docs/field-runs/2026-07-18-issue105-agentic-starter-kit.md`.

**Status (2026-07-18, runs 5–6):** fifth and sixth production runs (agentic-starter-kit
issue #106, `npm test` on fresh scaffolds ran a vitest whose include glob never matched
the template's node:test suites) — one issue shipped as TWO gated jobs:
`job_20260718_0006` (**PROMOTE-with-warnings**, commit basis) and, after an independent
post-promote audit whose findings fed a follow-up contract, `job_20260718_0007`
(**PROMOTE**, drift-grader 4/4). Cowork cloud, `patch` mode, cloud→Mac ship path;
target-repo PR #126 (squash-merged, #106 auto-closed), dashboard synced via #127.
No same-day skill-repo record was written; recorded retroactively in
`docs/field-runs/2026-07-18-issue106-agentic-starter-kit.md` (marked retroactive).
Operational finding from these runs — haiku-tier single-file writers may skip writing
their output file under F-11 fallback — was carried forward and codified after run 7.

**Status (2026-07-19, run 7):** seventh production run (agentic-starter-kit issue #107,
devcontainer `post-create.sh` false-success/curl-map/npm-abort robustness bugs) — the
FIRST run orchestrated from this standalone repository rather than the target repo's
vendored copy (Cowork cloud, `patch` mode, F-11 fallback for all ten dispatches):
**PROMOTE** (exit 0, no warnings), 7/7 gates first-attempt, consensus clean at both
gates with exact schemas, drift-grader 4/4, zero rewinds, zero parse failures. Shipped
as target-repo PR #128 (squash-merged, #107 auto-closed), dashboard synced via #129.
Skill change from the run: SKILL.md F-11 now requires dispatch prompts for the
single-file writers (Critic/Advocate/Grader) to instruct explicit file-write +
`date -u` timestamps + existence verification (commit `e9eda50`). Run record:
`docs/field-runs/2026-07-19-issue107-agentic-starter-kit.md`.

**Status (2026-07-19, run 8):** eighth production run (agentic-starter-kit issue #109,
six shell validation-script correctness/portability bugs) — the first run to terminate
on the retry path: **RETRY / TEST_GATE_FAILURE** (build passed on attempt 2; test gate
failed at both tiers; no ship). The retained worktree held all six fixes, a Critic-found
bash 3.2 frontmatter/SIGPIPE fix, and a focused regression suite; the retry was
operator-completed the same day (two fixture fixes: ruff import order, and a venv-shim
replacing a `python3` symlink that silently dropped PyYAML), with the remaining 31 red
template tests confirmed byte-identical to `main` (pre-existing; +8 newly passing, 0 new
failures). Shipped as target-repo PR #130 (squash-merged, #109 auto-closed), dashboard
synced via #131. Review bots: Codacy green after repo-convention nosec/nosemgrep
suppressions; CodeRabbit's two nitpicks applied. Run record:
`docs/field-runs/2026-07-19-issue109-agentic-starter-kit.md`.

## Delivered

| WBS | Deliverable | Status |
|---|---|---|
| 1.0 | Design freeze extracted from ADWS_PRO_source (contract schema, phases.js semantics, artifact tree, skill-pack API) | ✅ |
| 2.1 | `adws-pipeline/SKILL.md` — 172 lines (NFR-3 < 500 ✅) | ✅ |
| 2.2–2.3 | `references/task-contract.md`, `phase-gates.md`, `artifact-layout.md` | ✅ |
| 3.1–3.2 | 9 validator ports in `adws-pipeline/scripts/validators/` — standalone Node ≥ 20, zero external deps (NFR-4 ✅), CLI wrappers, input-shape headers. drift-sentinel inlines UMIF math (both canonical + legacy modes) | ✅ |
| 3.3 | Parity suite `parity/run-parity.js` — 79/79 fixtures identical to originals at acceptance; **now 84/84 under SC-1** (8 packs original-parity, `criteria-to-checks` diverged-by-design v1.1.0 against its own frozen baseline — AC-3.1 narrowed per DPPD §9). AC-3.3 determinism holds for all 9. Run it to regenerate `parity/PARITY_REPORT.md` (gitignored, not committed) | ✅ |
| 4.1–4.3 | 10 agents in `.claude/agents/`: 7 phase agents + critic + advocate + grader (pr.drift_sentinel.spec recreation) | ✅ |
| 5.1 | Ship procedure (SKILL.md §3 + adws-shipper): explicit-path staging, no hook bypass (NFR-5), 3 output modes, protected-branch refusal | ✅ (drill pending, see gaps) |
| 5.2 | `scripts/execution-report.js` — verdict matrix + exit codes (0/10/1/2/3) ported from `execution-report/decide.js`; 4 verdict fixtures + CLI-error path all pass, deterministic | ✅ |
| 6.x partial | Dry read-through by fresh agent: 10/10 gate-state scenarios answered correctly (WBS 2.0 exit criterion ✅). Five spec gaps it found were fixed (named failure reasons, separate rewind budgets, PROTECTED_BRANCH_BLOCKED path, advocate fail=dissent rule, intake warning for doomed direct_branch contracts) | ✅ |

## Deliberate design decisions (deviations from the original, per DPPD)

1. **Contract trimmed** of hosting fields: `tenant_id`, `submitted_by/at`, `max_cost_usd`, duplicate-task-ID registry (server-side store doesn't exist in a skill).
2. **Retry budgets** follow `src/phases.js` (plan/build/review/document/ship/verify = 1, test = 2); DPPD FR-3's "default 2" applies to any unlisted phase.
3. **Tier selection** (FR-12) is risk-driven (contract `risk_level` → `review-risk-assess` recomputation), replacing the original's CTM/CascadeGov env-gated routing. Retry escalates one tier, capped at opus.
4. **Cross-phase rewind** (test→build) is default behavior per AC-2.1 (original gated it behind `ADWS_CROSS_PHASE_RETRY`). Test and verify rewind budgets are independent, 1 each.
5. ~~**skills_clean gate** in the report scans ALL skill traces in the tree (original: latest attempt only) — strictly more conservative, never more lenient.~~
   **Retracted 2026-07-15** (see "Review gate — independent audit" below): this was
   not more conservative, it was a bug. Scanning every historical attempt meant a
   failed attempt_1 permanently failed the terminal gate even after a passing
   attempt_2 — legitimate retry recovery was silently blocked, contradicting FR-3.
   Fixed to match the original: latest attempt per phase only.
6. `PLAN_COHERENCE_BELOW_THRESHOLD` retained in the reason sets for report parity but marked reserved (no gate emits it).

## WBS 6.1–6.4 — live E2E drills (COMPLETE, 2026-07-15)

Executed live against a scratch GitHub repo (`the throwaway scratch repo (since deleted)`) with
`gh` authenticated. Full evidence in `acceptance/DRILL_EVIDENCE.md`; sign-off in
`acceptance/ACCEPTANCE.md`.

| WBS | What | Result |
|---|---|---|
| 6.1 | E2E `pr`-mode, full 7 phases, live PR (AC-5.1, DPPD §1.3) | ✅ job_0001 → **live PR #1**, PROMOTE-with-warn exit 10, signed commit, worktree isolation |
| 6.2 | `direct_branch` protected refusal + patch modes (AC-5.2, AC-5.3) | ✅ job_0002 refused w/ no orphan commit → RETRY; job_0003 patch applies, no push; job_0004 direct_branch push, no PR — all survived adversarial refutation |
| 6.3 | Gate-failure drills (AC-2.1 rewind, AC-2.2 budget exhaustion) | ✅ job_0005 real test FAIL → rewind → recover; job_0006 budget exhausted → BUILD_GATE_FAILURE → RETRY |
| 6.4 | Acceptance sign-off | ✅ 17/17 ACs satisfied (independent verifiers + adversarial refuters + completeness critic); **ACCEPTED** with documented notes |

Post-audit additions: **job_0007** live clean PROMOTE (exit 0, PR #2) after the F-1 fix;
**job_0008** live QUARANTINE (exit 2) via 2× real grader BLOCK. All four verdict-matrix
cells (0/10/1/2) are now demonstrated live.

**Defect found by the drills — F-1 (fixed):** `adws-planner` emitted `reason` per
file-change proposal while `repo-context-scan.js` checks `description`, so every real plan
tripped a spurious build `warn` and clean PROMOTE was unreachable live. Fixed on branch
`fix/f1-planner-description-and-6x-acceptance` (planner + artifact-layout emit `description`;
validator header documents it; no logic change → parity 79/79 preserved), verified live via
job_0007. A minor parity-frozen finding (F-2, `criteria-to-checks` verb-regex gaps) is
documented but not fixed. Honest evidence-scope caveats (no per-phase LLM telemetry;
placeholder timestamps) are recorded in `acceptance/DRILL_EVIDENCE.md`.

**P1 found post-sign-off by an independent audit (fixed):** `execution-report.js` collected
Critic/Advocate consensus but never gated on it — a `completed` job with a recorded Advocate
dissent still reported clean PROMOTE (exit 0), so AC-4.2 was not actually enforced by the
report (the live drills missed it — all live consensus rounds passed). Fixed on branch
`fix/consensus-gate-and-acceptance-corrections`: added a `consensus` gate (Advocate dissent /
Critic fail → gate fail → QUARANTINE on a completed job), deriving the block from evidence not
`failure_reason`. Regression fixtures `quarantine_advocate_dissent` + `quarantine_critic_fail`
(report tests now 10/10); parity unchanged (no validator touched). Full detail in
`acceptance/ACCEPTANCE.md` "Post-sign-off audit".

To install: copy `adws-pipeline/` into `.claude/skills/` (or register per your setup) and
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

## Review gate — independent audit (2026-07-15)

A parallel independent agent audited the merged PR #1 state and disputed the "clean" /
"all done" summary given after merge. It was largely right. Findings and disposition:

**Overstated claims (corrected):**
- "Working tree clean" was true at the moment stated, but re-running the parity/
  execution-report test suites regenerates `execution_report.json/.md` with a fresh
  `generated_at` timestamp and machine-specific `evidence_root`, leaving the tree
  dirty again on the next `git status`. **Fixed**: these derived files are no longer
  git-tracked (`.gitignore`) — they're regenerated by `run-tests.js` and asserted on
  directly, nothing depends on them being committed.
  **Correction (2026-07-15, PR #2 review):** the first pass of this fix only covered
  `execution_report.json/.md`; `parity/PARITY_REPORT.md` has the identical
  `generated_at`-churn defect and was still tracked (`adws-reviewer` caught this on
  PR #2). Also gitignored now — the actual parity evidence is the frozen `expected`
  field committed in each `parity/fixtures/**/*.json`, so nothing is lost; regenerate
  the human-readable report on demand with `node parity/run-parity.js`.
- "Only WBS 6.1-6.4 remains" was incomplete — WBS 5.0's own exit criterion ("AC-5.1-5.3
  pass on a scratch GitHub repository") is itself part of the still-open live-drill
  gap, and DPPD.md was, at that point, still formally "Draft — pending approval" (flipped
  to Approved on 2026-07-16). Both true at the time; WBS 6.x was
  always meant to cover exactly this, but the phrasing implied less was outstanding
  than actually was.
- "Review gate actually ran" was not independently auditable from the repository alone
  (a PR comment plus this doc were the only record, no preserved subagent transcripts).
  The fixes those runs produced are real and independently reproducible regardless.

**Confirmed defects (fixed on `fix/report-gaps-and-ship-order`):**
1. **`execution-report.js` ignored the grader verdict and drift verdict entirely**
   (FR-6, FR-10, US-6, contradicts the verify-phase requirement in SKILL.md §4). The
   `gates` array only ever contained `pipeline_completion`, `verify_structural`, and
   `skills_clean` — `verify/attempt_n/grader/grader_verdict.json` and
   `phase_output.drift_verdict` were never read. Reproduced: a `completed` job with
   `grader_verdict.rubric_result: "fail"` or `drift_verdict: "BLOCK"` still reported
   clean `PROMOTE`, exit 0. **Fix:** added `evalGraderVerdict` and `evalDriftVerdict`
   gates; both scenarios now correctly report `QUARANTINE`, exit 2. Existing
   `completed`-status fixtures (`promote_clean`, `promote_warn`, `promote_unverified`)
   got a `grader/grader_verdict.json` added (they previously had none, which — now that
   the gate exists — would have made them `UNVERIFIED`/exit 10 instead of their
   intended verdicts).
2. **Skill/consensus verdicts were collected from every historical attempt, not the
   latest.** `collectSkillVerdicts`/`collectConsensus` scanned `allAttempts`, while
   `phaseData` (used everywhere else) already tracked latest-attempt-only — an internal
   inconsistency. Reproduced: build attempt_1's skill trace fails, attempt_2 (the one
   that actually shipped) passes cleanly, all 7 phases otherwise pass — report still
   returned `QUARANTINE`, exit 2, permanently, with no way to recover via retry. This
   contradicted FR-3's retry semantics and the original ADWS_Pro behavior (design
   decision #5 above, retracted). **Fix:** both functions now take latest-attempt-only
   input; a superseded failed attempt no longer poisons the terminal verdict. Retry
   count is still surfaced via the existing "required N attempts" warning.
3. **The shipper committed before checking for a protected `direct_branch` target.**
   `adws-shipper.md` staged and committed unconditionally in step 2, then only checked
   for a protected branch in step 3 — by which point the commit already existed on the
   worktree's branch, contradicting AC-5.2 ("leaves no orphan commit"). `SKILL.md` §3
   had the identical ordering bug. **Fix:** both docs now check `target_branch` against
   the protected list FIRST for `direct_branch` mode, before any staging or commit;
   `pr`/`patch` modes are unaffected (unchanged order) since `pr` mode routinely
   targets protected branches by design and `patch` never pushes.

All three fixes verified by direct reproduction against the fixed code (not just
fixture re-runs): grader-fail and drift-BLOCK synthetic jobs now report `QUARANTINE`/
exit 2; the retry-recovery synthetic job now reports `PROMOTE`/exit 0.

## SC-1 scope change (2026-07-15, post-acceptance) — F-2 fixed, X-2 ported, X-3 still deferred

Per DPPD §9 (v1.1). Branch `feat/sc1-f2-verb-regex-x2-entropy-regulator`.

- **SC-1.a / F-2:** `criteria-to-checks` verb regex extended (-ing participles for all
  covered verbs + "pass"), version 1.0.0 → 1.1.0. Pack marked **diverged-by-design** in
  the parity suite (`DIVERGED_PACKS`): verified against its own frozen v1.1.0 baseline,
  never the original; the other 8 packs remain original-parity. Old 9 fixtures re-froze
  byte-identically (strict-superset change, no verdict flips); 5 new fixtures cover the
  fixed forms and warn boundaries. Suite: 84/84 in both live-original and
  frozen-fallback modes.
- **SC-1.b / X-2:** entropy regulator ported as `scripts/entropy-gate.js` (reuses the
  ported drift-sentinel canonical band math, mode pinned to canonical). Signal =
  parse-failure counts per attempt in append-only `entropy_history.jsonl`, recording
  starting at the first failing attempt (zero-anchored histories degenerate to COLLAPSE
  under max-normalization — verified numerically). Bands: SAFE/WATCH proceed, WARN
  escalate one tier, COLLAPSE halt → `STABILITY_BUDGET_EXCEEDED` (RETRY class; no
  execution-report change needed — verified by synthetic job). Fixtures 7/7 incl. a
  recording-rule-compliant COLLAPSE case.
- **SC-1.c / X-3:** remains deferred — no cross-provider API keys; R-3 stays open.
- **Review gate (dogfooded):** reviewer approved (low risk), critic PASS, advocate PASS
  (no dissent). Substantive findings fixed pre-commit: canonical-mode pinning in
  entropy-gate.js, exit-3 orchestrator rule in SKILL.md, `stability_gate`/`entropy-gate`
  added to the phase_manifest shape, compliant COLLAPSE fixture, bundled-scripts
  inventory, DPPD §9 cross-references, this file's stale 79/79 wording.
- **Known limitation (accepted):** `run-parity.js --freeze` still requires
  `ADWS_PRO_source/` even when re-freezing only the diverged pack.

## SC-2 scope change (2026-07-16, post-production-run) — F-3…F-10 from job_20260715_0001

Per DPPD §10 (v1.2), approved R-6. Branch `feat/sc2`, three tranche commits. Full plan:
`SC2_PLAN.md`.

- **SC-2a (F-4, F-6, F-7, F-9, F-10):** docs/prompt only, zero parity risk. Pipeline-
  mechanics preamble in the Critic/Advocate dispatch (SKILL.md + both consensus agents);
  `operator-resolution` tier source; append-only rule 2 amended to write-once-for-phase-
  agents with an exhaustively-enumerated orchestrator post-hoc field set (strengthens
  FR-4); SKILL.md runtimes note + worktree `.lock` troubleshooting.
- **SC-2b (F-3, F-5, F-8):** `execution-report.js` SCHEMA_VERSION 1.0.0 → 1.1.0.
  Consensus gate now downgrades an operator-`override`n dissent to WARN (permanent
  warning, never a clean promote) while `uphold`/unresolved still QUARANTINE; ship
  delegated-push `deferred` sub-state surfaced; multi-attempt warning reworded to gate
  outcomes. Report suite **10 → 13** (new: `promote_resolved_dissent` exit 10,
  `quarantine_upheld_dissent` exit 2, `promote_delegated_push` exit 0), regression-first
  and deterministic across re-runs. `.gitignore` re-includes the fixture trees under
  `artifacts/` (broad rule would otherwise swallow new fixtures); derived
  `execution_report.*` stay ignored.
- **SC-2c (C1, C3, C4, C5; C2 deferred):** mandatory parallel Critic ∥ Advocate dispatch;
  `execution.commit_identity` contract field; prompt-injection rule and secret-redaction
  rule on all 10 agents (+ artifact-layout rule 7). C2 (review-gate Advocate tier bump)
  deferred pending more run data. Codex dispatch aliases added after the run map `luna`
  to Haiku, `terra` to Sonnet, and `sol` to Fable when configured (otherwise Opus), while
  preserving canonical Haiku/Sonnet/Opus evidence and validator inputs.
- **Dogfood review gate:** the pipeline's own reviewer/critic/advocate ran fresh-context
  over the `feat/sc2` diff, followed by an adversarial verification pass on blocker/major
  findings. Advocate **PASS** (no dissent); Reviewer PASS; the Critic independently
  **confirmed the report logic correct** (evalConsensus / normalizeResolution /
  buildWarnings; the 3 new fixtures non-vacuous and deterministic; A3's post-hoc field
  list matching exactly what the code reads; all 10 agents carrying the C4/C5 rules; C3
  not touching git config; NFR-5 untouched). The Critic's one confirmed blocker was that
  the governance reconciliation (this DPPD §10 → v1.2 / WBS / README update) was still an
  UNCOMMITTED working-tree edit, so `git diff main...feat/sc2` shipped code its own
  governing doc still called "PROPOSED / out of scope." Resolved by committing that
  reconciliation as part of the change set (this commit), making the committed diff
  internally consistent.
- **Suites at close:** parity **84/84**, report **13/13**, entropy **7/7** — all green,
  deterministic. `SKILL.md` 249 lines (NFR-3 < 500). Open follow-ups: E2E-2 confirmation
  run (SC2_PLAN step 6) and the C2 tier decision.

## SC-3 scope change (2026-07-24, fusion-harness comparative review) — F-14…F-17

Per DPPD §11 (v1.3), approved R-6 per item (A1–A6, B1). Contract implementation merged
through PR #26; post-implementation reconciliation merged through PR #27 (`149712c`).
Full originating plan and reconciliation ledger: `SC3_PLAN.md`.

- **SC-3a:** pre-change falsifiability baseline reuses `criteria-to-checks.check_specs`;
  only `assertion-failed-runtime-present` is a valid RED. `not-run`/collection errors
  become `gate_weak` warnings, never passes. Build rewinds receive one fresh immutable
  `corrections.json`; `run_manifest.check_defect_repairs` is independently capped at one.
- **A5 reconciliation:** required tests always run the baseline. An explicit
  `policy.falsifiability: false` with `test_policy: required` is a hard intake failure;
  `true` opts `best-effort`/`skip` into the baseline. The orchestrator enforces this
  cross-field rule because frozen `task-normalize` accepts only `task.*`.
- **SC-3b:** advisory `phase_manifest.provenance` remains ignored by
  `execution-report.js`. Present, partial, and absent shapes are now executable fixtures
  under `parity/provenance-fixtures/`; invalid types and unknown fields are rejected by
  the fixture harness without turning provenance into a gate input.
- **Retained contract drill:** `docs/acceptance/SC3_MICRO_DRILL.md` records the
  reproducible A1/A2/A3 drill, wired into local CI. It demonstrates valid RED,
  NOT-RUN → `gate_weak`, a fresh correction round, and immutable correction evidence.
- **Explicit deferral:** the first autonomous seven-phase real-task confirmation remains
  pending a suitable post-SC-3 task. Its complete PROMOTE evidence tree must be copied
  into `docs/acceptance/` before teardown; the contract drill is not represented as that
  production confirmation.
- **Suites after reconciliation:** parity **84/84**, report **13/13**, entropy **7/7**,
  provenance **3/3**, and the SC-3 micro-drill all pass. `SKILL.md` remains under 500
  lines; `execution-report.js` and the verdict taxonomy remain untouched.
- **Pre-push regression closed:** the first linked-worktree pre-push run exposed inherited
  `GIT_DIR` contamination in the micro-drill, which briefly created a local scratch
  `baseline` commit in the source repository. The unpushed commit was removed from the
  branch; repository-local identity/signing overrides were removed; the drill now strips
  repository-scoped Git environment variables before initializing its temporary repo.
  Reproduction with the real `GIT_DIR` injected leaves `HEAD` and the worktree unchanged.
  Tier 1 and the Node 20/24 Tier 2 matrix then passed at the signed PR head and the merged
  tree is recorded by PR #27.

## Maintenance audit (2026-08-05) — terminal-verdict evidence gaps

Merged through PR #29 (`e2e8a5d`). Full-repo audit against the skill-authoring guide and
SWEBOK v4. Two live defects in
`execution-report.js` let a job with recorded failure evidence certify a clean PROMOTE,
in contradiction of hard rule 8 / FR-10 ("the verdict is derived from the evidence, not
the narrative status"). Both were reproduced against a copy of the `promote_clean`
fixture before the fix.

- **Empty attempt directory counted as evidence.** `pipeline_completion` derived its
  `missing` set from directory existence alone, so the F-12 shape — a dispatch that dies
  before writing anything — passed the gate. A phase now counts only when its latest
  attempt has a readable `phase_manifest.json` AND `phase_output.json`; the reason text
  distinguishes "no attempt recorded" from "attempt_n wrote no readable …".
- **Per-phase `gate_result` collected but never evaluated.** The orchestrator's own gate
  decisions were rendered in the Phases table and nowhere else, so a `completed` job whose
  document gate recorded `fail` promoted at exit 0 with zero warnings. New `phase_gates`
  gate over the latest attempt of each phase: any `fail` → gate `fail` (QUARANTINE); any
  `deferred` → `warn` (an F-5 delegated push never closed); any unrecorded decision →
  `unverified`. Decision vocabulary, exit codes, and the other six gates are unchanged.
- **`SCHEMA_VERSION` 1.1.0 → 1.2.0** (additive: one new gate key). Report suite **13 → 15**
  fixtures — `quarantine_missing_phase_evidence` and `quarantine_phase_gate_fail`.
- **Contract gaps closed:** `adws-builder.md` now reads its `corrections.json` input
  (SC-3 A3 had a writer and no reader); the planner's `planning_blocked` /
  `planning_blocked_reason` fields are documented in the plan `phase_output.json` shape,
  removing a rule-8 strict-writer violation; `docs/`- and `parity/`-rooted paths were
  removed from the skill's own markdown (`install.sh` ships neither, so they were broken
  the moment the skill was installed) and `frontmatter-lint.mjs` now rejects that class.
- **Best-practice alignment:** `## Contents` added to the three reference files over 100
  lines; `README.md` Validation now lists all five suites `make local-ci` runs.
- **Suites after the audit:** parity **84/84**, report **15/15**, entropy **7/7**,
  provenance **3/3**, SC-3 micro-drill, plus node-check, shell-lint, and both skill
  lints — all green. `SKILL.md` remains under 500 lines.
- **Local CI at the merged head:** Tier 1 all nine steps PASS and Tier 2 both legs PASS
  (`node20` build+run, `node24` build+run, `linux/arm64`) at `6b49f4e`, the commit squashed
  into `e2e8a5d`. The remote CodeQL check failed in 2s on the account-wide billing lock
  ("the job was not started because your account is locked due to a billing issue") — the
  same non-code failure carried by every merged PR since #24; it is not a required check.
- **Reported, not changed:** the 9 validators' duplicated CLI wrapper (self-containment
  is NFR-4 and `run-parity.js` asserts it); the unreachable `!modeValid` disjunct in
  `patch-compose.js` (dead but inside a byte-for-byte parity port); `drift-sentinel`'s
  `dTx` underflow past ~40 history entries, which is spec-faithful and unreachable given
  the retry budgets; and the redundant `QUARANTINE_REASONS` ⊂ `NO_RETRY_REASONS` branch
  in `decideLifecycle` (verbatim port; both branches already return QUARANTINE).
