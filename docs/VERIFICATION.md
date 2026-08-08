# ADWS Pipeline Skill — Build Verification & Gap List

**Date:** 2026-07-14 · **Builder:** Claude (Cowork session) · **Governing docs:** DPPD.md v1.0, WBS.md v1.0

**Status (2026-07-14):** WBS 1.0-5.0 merged to `main` via
[PR #1](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/1)
(commit `c333bb9`; feature branch `feat/adws-pipeline-skill-v1` deleted after merge).
Only WBS 6.1-6.4 (live E2E drills, see "Gaps" below) remain open.

**Status (2026-07-18, run 2, `job_20260718_0001`):** post-acceptance, the skill's second
production run (first
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
their output file under F-11 fallback — was carried forward and codified after run 8.

**Status (2026-07-18, run 7, `job_20260718_0008`):** seventh production run
(agentic-starter-kit issue #109,
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

**Status (2026-07-19, run 8, `job_20260719_0001`):** eighth production run
(agentic-starter-kit issue #107,
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

**Status (2026-07-19, run 9, `job_20260719_0002`):** ninth production run against
agentic-starter-kit issue #135 — rendered-project `make validate` failures in a clean Linux CI container,
first surfaced by the local `RUN_VALIDATE=1 make ci-orb` gate that GitHub Actions never
exercised while billing-locked. **PROMOTE** (exit 0, no warnings) on the FIRST attempt of
every phase: 7/7 gates, both consensus rounds clean with exact schemas, grader 4/4
satisfied, zero rewinds, zero parse failures. No `entropy_history.jsonl` was created, so
the healthy-missing path fed `drift-sentinel` `{"entropy_history": []}` at verify
(SAFE/pass) — the first recorded exercise of that path. Three files / +40 lines shipped
as target-repo PR #138 (squash `534cf14`, #135 auto-closed), dashboard synced via #139.
Run record: `docs/field-runs/2026-07-19-issue135-agentic-starter-kit.md`.

**Status (2026-07-19, run 10, `job_20260719_0003`):** tenth production run against
agentic-starter-kit issue #119 — the CRIT-001 `marker-scan.sh` vacuous-scan follow-up filed during the
#104/#118 review, where an unguarded `done < <(...)` process substitution let a
governance-loader crash leave `surfaces` empty so the scan ran against zero surfaces
instead of failing. **PROMOTE with warnings** (exit 10) — 7/7 gates on the first attempt
of every phase, 9/9 validators `pass`, both consensus rounds clean, grader 3/4
`satisfied` + 1 `partial`. The warning path, not a clean promote: this is the first
recorded exit-10 verdict in the field-run series. Run record:
`docs/field-runs/2026-07-19-issue119-agentic-starter-kit.md`.

**Status (2026-07-20, run 11, `job_20260720_0001`):** eleventh production run against
agentic-starter-kit issue #111, a seven-item refactoring & optimization epic. Two items were found ALREADY
resolved on `main` by the #110 fix (PR #132) and correctly left untouched — the pipeline
did not manufacture work to look productive. The five remaining items shipped.
**PROMOTE**. Run record: `docs/field-runs/2026-07-20-issue111-agentic-starter-kit.md`.

> **Note on run numbering (renumbered 2026-08-05).** "Run N" now counts **production
> runs in job-ID allocation order**, and every entry carries its job ID so the key is
> checkable. The full sequence: run 1 `job_20260715_0001` (the first production run, no
> field-run record — SC-2's evidence source); runs 2–4 issues #103/#104/#105; runs 5–6
> the two jobs of issue #106; run 7 issue #109; run 8 issue #107; runs 9–11 issues
> #135/#119/#111.
>
> Runs 7 and 8 were previously the other way round. That was not an error in the original
> record — the labels had been assigned in **completion** order, and issue #109's job was
> allocated on 07-18 but terminated RETRY and was operator-completed after issue #107's
> 07-19 job had finished. Allocation order is now the single key because it is derivable
> from the evidence tree without narrative, whereas completion order is not. The two
> orders differ only at this one pair; runs 1–6 were already identical under both.

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
3. **Tier selection** (FR-12) is risk-driven (contract `risk_level` → `review-risk-assess` recomputation), replacing the original's CTM/CascadeGov env-gated routing. ~~Retry escalates one tier, capped at opus.~~
   **Amended 2026-08-05 by SC-4 (DPPD §13):** the seven phase agents no longer share one
   tier — the table is per phase — and the ladder is haiku → sonnet → opus → fable,
   capped at fable, with a saturated source recorded at the cap. `fable` is an escalation
   ceiling and operator opt-in, never a mandated cell.
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

## SC-4 scope change (2026-08-05, operator review of FR-12) — F-18…F-26

Per DPPD §13 (v1.4), approved R-6 per item (A1–A10, B1–B3). Merged through PR #31
(`b3bb75a`). Full originating plan and verification ledger: `SC4_PLAN.md`.

- **SC-4a:** the single `Architect` column — one tier for all seven phase agents — is
  replaced by a per-phase table keyed by error-propagation cost. Plan runs `opus` on
  every row (its errors pass through six downstream gates before anything catches them);
  review takes `opus` from medium; `document` drops to `haiku` at low/medium and the
  mechanical tail (`ship`, `verify`) comes off `opus` at high. Rows remain exactly
  `high|medium|low`, the only shape `review-risk-assess` can key.
- **`fable` admitted, but never mandated.** The fourth canonical tier resolves an
  existing FR-12 self-contradiction — the requirement already permitted `sol` to resolve
  to Fable at dispatch while mandating evidence "normalized to Haiku/Sonnet/Opus", so a
  Fable-executed phase was recorded as `opus`, defeating SC-3 B1's provenance intent. It
  is reachable only by escalating off `opus` or by an explicit
  `operator-tier-override`: the tier returns `400` wherever the calling workspace is
  below its required 30-day retention, and a classifier refusal arrives as HTTP 200 with
  empty content — the F-12 no-evidence shape M-1a reads as QUARANTINE.
- **Grader floor repaired.** "The grader always runs at the Architect floor (opus)" lost
  its referent the moment `Architect` became seven values, and read literally as *haiku*
  against the new low row. Rewritten as an absolute: `opus` on every row, never below.
- **Saturation is now recordable.** An escalation requested at the ceiling keeps its
  tier and records `retry-escalation-saturated` / `entropy-gate-saturated` /
  `operator-resolution-saturated`, so a real escalation is never indistinguishable from
  a no-op. Recording rule only — no gate, budget, or verdict changes.
- **C2 closed (A9).** SC-2 deferred the review-gate Advocate bump pending 2–3 more
  production runs. Four followed, and run 4 (issue #105) records the medium-risk row directly
  (`architect/critic/advocate = sonnet/sonnet/haiku`) with the review gate completing;
  that haiku Advocate then emitted a divergent `findings` shape violating the agents'
  own no-extra-keys rule. The bump is taken at the review gate only; the test-gate
  Advocate stays `haiku`. Whether a medium-risk review-gate *dissent* was ever
  adjudicated is not answerable from retained records — the target-repo evidence trees
  are external and were not copied before teardown (the DRILL_EVIDENCE lesson) — so A9
  rests on recorded Advocate behavior plus the no-retry asymmetry, not on a dissent-path
  observation.
- **Three fixture manifests recorded escalations that did not escalate** (F-26):
  `promote_retry_recovered` build attempt_2 carried `retry-escalation` at the same tier
  as attempt_1, and the `retry` fixture's three test attempts were all `sonnet` with no
  `tier_input` across two retries. Corrected to `sonnet → opus → fable`, which seats the
  repository's only `phase_manifest.model_tier: "fable"` value and gives the widened
  taxonomy a round-trip regression through `execution-report.js` at zero logic cost —
  verified by rendering the report and confirming `fable` reaches the Model-tier column
  rather than being coerced or dropped.
- **Suites after the change:** parity **84/84**, report **15/15**, entropy **7/7**,
  provenance **3/3**, SC-3 micro-drill, plus node-check, shell-lint, and both skill
  lints — all green. `execution-report.js` untouched, `SCHEMA_VERSION` still 1.2.0,
  `SKILL.md` 357 lines (NFR-3 < 500).
- **Local CI at the merged head:** Tier 1 all nine steps PASS and Tier 2 both legs PASS
  (`node20` build+run, `node24` build+run, `linux/arm64`) at `f654c73`, the commit
  squashed into `b3bb75a`. The remote CodeQL check failed in 3s on the account-wide
  billing lock ("the job was not started because your account is locked due to a billing
  issue") — the same non-code failure carried by every merged PR since #24; it is not a
  required check. (Wording corrected in the M-3 post-merge sync: `main` IS protected but
  declares an EMPTY required-checks list, so nothing blocks on CodeQL. See the M-3 section.)
- **Reported, not changed:** `tier_input` is absent from first attempts corpus-wide, not
  only in the two fixtures F-26 names — F-26 is scoped to *retry* attempts, where the
  spec unambiguously requires an escalation to be recorded, and a corpus-wide backfill
  has no finding behind it. The `.claude/agents/*.md` frontmatter `model:` values still
  diverge from the orchestrator table, which remains intentional (frontmatter is the
  F-11 fallback default; the orchestrator always specifies the tier explicitly).
- **Explicit deferral:** live confirmation that a per-phase table and a real
  escalation-to-`fable` behave as specified on an autonomous run. The proof here is
  spec- and fixture-level; no synthetic drill is represented as production confirmation.

## SC-5 scope change (2026-08-05, field run job_20260805_0003) — F-27…F-30

Governing record: `DPPD.md` §14 (v1.5); plan and findings register: `SC5_PLAN.md`.
Field-run record: `docs/field-runs/2026-08-05-issue4-cadence-method-skill.md`.

- **The drop mechanism is confirmed; the run's exact 7-of-8 count is not re-derivable**
  (F-27). The orchestrator reported seven `check_specs` for eight criteria, the omission
  being the criterion phrased "…is specified as…". The contract snapshot was lost with the
  worktree, so that count rests on the run's self-report. What *is* reproducible is the
  mechanism: replaying a reconstruction of the contract (the six acceptance criteria
  verbatim from issue #4 plus the two the operator added) through both versions gives
  **v1.1.0: 8 criteria → 3 specs, rubric `warn`** against **v2.0.0: 8 criteria → 8 specs,
  rubric `pass`**. The reconstruction drops five rather than one because the live contract
  used tightened prose, so treat 3-of-8 as an illustration of the mechanism's reach on raw
  issue-style wording, not as a restatement of the run. Either number makes the same point:
  the omission was silent. The evidence tree recorded the specs that existed and never
  recorded the criterion that did not — `vague_count` reports how many were vague, never
  which, and no consumer compared it against `check_specs.length`.
- **The verb gap was measured, not estimated** (F-28). A 127-verb probe using a neutral
  carrier sentence (to isolate the verb from incidental matches elsewhere in the string)
  found **126 unmatched** under v1.1.0. Among them: the whole specification family, and
  `fail`, `assert`, `skip`, `warn`, `require` — in the validator that gates the test phase,
  which covered `pass` but not `fail`.
- **The widened regex moved nothing it should not have.** Simulated against all 14
  pre-existing fixtures before implementation: **0 rubric flips, 0 count flips**. All seven
  subjective controls stay vague, every previously-verifiable criterion stays verifiable.
  The three F-29 artifact replacements were verified equivalent across every real English
  form of `run`, `set`, and `output` — old and new differ only on the non-words `runn`,
  `runns`, `sett`, `outputt`. This is why A1, A2, and A3 could be taken in one pass: the
  rubric surface was provably untouched.
- **Full coverage did not mute the warn signal.** `warn-unclassified-majority-still-warns`
  exists to hold that invariant: four criteria, four specs, three `unclassified`, verdict
  still `warn` at 1/3. Paired with `unclassified-specs-cover-every-criterion`, which pins
  `check_specs.length === criteria_count` and index-stable `check_id`s.
- **Consumer contracts were corrected, not just the emitter** (F-30). `adws-tester.md` had
  told the agent both that `check_specs` is the single source of truth for the mapping and
  that `test_policy: required` needs a check per criterion — mutually exclusive the moment a
  criterion dropped, with no sanctioned way for the agent to notice. It now states that the
  array covers every criterion and that `unclassified` is a lexical miss, not a licence to
  skip. `phase-gates.md` and `SKILL.md` carry the matching statement, including that a
  length mismatch is a defect rather than an expected narrowing.
- **Freeze limitation (carried from SC-1, unchanged).** `run-parity.js --freeze` exits 3
  without a local `ADWS_PRO_source/` checkout even for a diverged pack, whose baseline is
  captured from the port. The nine `expected` blocks were written by hand from the patched
  CLI's own output and confirmed by a full suite run.
- **Post-submission review (F-31…F-34).** Automated review of the SC-5 change set itself
  raised four valid findings, fixed in the same PR (`e6e7be5`) rather than deferred; full
  detail in `SC5_PLAN.md` §6. The two substantive ones: **F-31** — full emission proves a
  criterion was *delivered* to the tester, not that it was *answered*, since nothing joined
  an executed check back to its spec (`corrections.json` already keyed on `check_id`, so the
  tester schema omitting it was also an internal inconsistency); closed by carrying
  `check_id` onto `phase_output.json.checks` and requiring every emitted spec id to appear
  there at least once. **F-34** — the change set carried two evidence standards for the
  originating run's 7-of-8 tally, this section stating it was not re-derivable while four
  other documents asserted it flatly; now one boundary, stated in `SC5_PLAN.md`. Worth
  recording that F-31 is the same defect class as F-27 one layer downstream: the guarantee
  stopped at the hand-off, which is precisely where the original drop hid.
- **Suites after the change:** parity **88/88** (84 → 88), report **15/15**, entropy
  **7/7**, provenance **3/3**, SC-3 micro-drill, plus node-check, shell-lint, and both skill
  lints — all green. `execution-report.js` untouched, `SCHEMA_VERSION` still 1.2.0,
  `SKILL.md` 367 lines (NFR-3 < 500).
- **Local CI at the merged head:** Tier 1 all nine steps PASS (`run_id`
  `20260805T211223Z`) and Tier 2 both legs PASS (`node20` build+run, `node24` build+run,
  `linux/arm64`; `run_id` `20260805T211228Z`) at `51a163d`, the squash of PR #36. The remote
  CodeQL check failed in 2s on the account-wide billing lock — the same non-code failure
  carried by every merged PR since #24; it is not a required check. (Wording corrected in
  the M-3 post-merge sync: `main` IS protected but declares an EMPTY required-checks list.)
- **Honest scope note.** This closes the mechanism by which a criterion can leave the
  tester's work list unannounced. It does **not** make a lexical classifier good at judging
  vagueness — F-28 widens the allowlist, it does not complete it, and no allowlist can be
  completed. The claim proved here is narrower and more useful: after SC-5, being wrong
  about a criterion's wording never costs the criterion. Retention and the rubric are
  **separate outcomes** and should not be stated as one (F-33): the criterion is retained
  as an `unclassified` spec unconditionally, while `rubric_result` only degrades to `warn`
  when unclassified criteria exceed half the input. A lone misread criterion in a
  well-formed set is retained *and* still verdicts `pass` — it costs nothing at all.

## Maintenance audit M-2 (2026-08-06) — dispatch boundary & baseline safety, F-35…F-36

Governing record: `DPPD.md` §15. Findings register: `SC6_PLAN.md` §1. Field-run record:
`docs/field-runs/2026-08-05-issue5-cadence-method-skill.md`. Docs/prompt only — no code,
no schema, zero parity risk.

- **The concurrent dispatch is proven from timestamps, not from the self-report** (F-35).
  The orchestrator disclosed it, and the evidence tree independently confirms it:
  `test/attempt_1/phase_manifest.json` records the tester at **23:09:56Z → 23:15:42Z**
  while `consensus/advocate.json` is stamped **23:13:02Z** and `consensus/critic.json`
  **23:14:06Z** — both inside the tester's window. `test/attempt_2` (agent finished
  02:05:30Z, consensus 02:08:51Z / 02:09:20Z) and both review rounds show the correct
  serialized shape, so the one run contains its own before/after pair.
- **The spec permitted it.** Nothing in `SKILL.md` or `phase-gates.md` bounded the parallel
  set; the ordering existed only as the parenthetical `Architect → (Critic ∥ Advocate)` and
  as the implicit numbering of the phase-loop steps. A mandate to parallelize written in
  capitals, next to an unstated limit, in a runtime that encourages batching independent
  calls, is a defect in the mandate. Both files now name the set explicitly and state that
  the arrow is a barrier.
- **Why it cannot be caught after the fact.** A Critic or Advocate reading a half-written
  worktree produces a verdict that is indistinguishable, in the evidence, from one reached
  against the finished change set. In this run the Critic caught a `git stash` reset in the
  reflog and its assessment survived on content it had already captured — but that was
  luck, not a control.
- **The tester was told to do what the reviewer is forbidden to do** (F-36).
  `adws-tester.md:30-32` and `phase-gates.md:96` named `git stash push --include-untracked`
  … `git stash pop` as the baseline technique; `adws-reviewer.md:27-31` has prohibited
  `git stash` in the worktree since SC-2, with the correct rationale. The hazard is
  strictly worse at the test gate, where the worktree holds the **only** copy of an
  uncommitted, partly untracked change set: a dispatch that dies mid-stash orphans the
  entire build with nothing to recover from. This is independent of F-35 — serializing the
  dispatch does not make the stash safe.
- **Replaced, not merely warned about.** The baseline is now materialized elsewhere
  (`git archive {target_branch}` into a scratch dir, a worktree/clone created outside the
  pipeline worktree, or `git show {target_branch}:<path>` for targeted checks), and
  `adws-tester.md` carries the prohibition in its own Rules section rather than relying on
  a sibling agent's file to hold the line.
- **Suites unchanged by M-2:** parity 88/88, report 15/15 (at the time of the audit),
  entropy 7/7, provenance 3/3, SC-3 micro-drill, both skill lints — all green. NFR-3 holds.
- **Merged** through PR #38 (`029ee0d`), together with SC-6 and M-3.

## SC-6 scope change (2026-08-06, field run job_20260805_0004) — F-37…F-40

Governing record: `DPPD.md` §16 (v1.6); plan and findings register: `SC6_PLAN.md`.
Field-run record: `docs/field-runs/2026-08-05-issue5-cadence-method-skill.md`.

- **The evidence boundary was met this time.** SC-5's originating run lost its tree, so its
  central tally was orchestrator-reported. This run's tree survived in the target repo's
  primary checkout (`artifacts/job_20260805_0004/`) because hard rule 5 keeps evidence
  outside the worktree. Every SC-6 claim was re-derived from it, and the two central ones
  were re-derived *against* the orchestrator's summary rather than from it.
- **A correct dissent had no exit but termination** (F-37). The resolution set was
  `override` (false positive), `uphold` (→ terminal `ADVOCATE_DISSENT`, quarantine), and
  F-6's fresh re-review (for a *suspected* false positive). None of the three means "you
  are right; fix it and check again." The live operator, agreeing with a dissent that the
  reviewer had independently corroborated, therefore had to invent the path — and the
  invention necessarily landed outside the schema (`corrections.json.source_attempt` had no
  legal value for a review origin; `operator_directed_rewinds` did not exist) and outside
  the report's field of view. Recording the truthful out-of-enum `source_attempt` over a
  conforming false one was the right call by the orchestrator and is now unnecessary.
- **The strongest resolution was the invisible one** (F-38). `execution_report.md` for this
  job renders `| consensus | pass | 2 round(s) clean |` beside a
  `review/attempt_1/consensus/advocate.json` carrying `verdict: "fail"` and a full dissent
  text. The `consensus` gate reads latest attempts only — a deliberate contract
  (`execution-report.js:127-132`), and the right one, since a superseded failure must not
  permanently fail a job a retry fixed. But combined with F-37 it meant that *repairing* a
  dissent erased it while *overriding* one (the dissent was wrong; nothing changed) has
  warned since F-3. The exit-10 this run reported came entirely from the grader and drift
  warns; the dissent contributed nothing. FR-7's "a resolved dissent is never silent" did
  not hold on this path.
- **The fix preserves the contract it exposes.** Superseded dissents WARN; they never fail.
  `promote_retry_recovered` is unchanged and still reaches clean PROMOTE at exit 0, so an
  ordinary successful retry is unaffected. What changed is that a *dissent* — as opposed to
  any other superseded failure — now forbids a clean promote wherever it sits in the tree,
  and is quoted verbatim in a dedicated report section.
- **`ADVOCATE_DISSENT_REPAIRED` is deliberately not a terminal reason.** It annotates the
  superseded attempt's `phase_manifest.failure_reason` and is read by nothing:
  `decideLifecycle` consumes `run_manifest.failure_reason` only, and the terminal
  failure-reason classes are unchanged. It also reads almost opposite to the terminal
  `ADVOCATE_DISSENT` it resembles, which is why the distinction is stated in
  `phase-gates.md` rather than left to the name.
- **"gate-failed — attempt 1: pass"** (F-40). `buildWarnings` hard-coded "gate-failed" into
  the multi-attempt sentence while rendering each prior attempt's real `gate_result`. Under
  ordinary retries every prior attempt has failed, so the assumption held until a rewind
  superseded attempts that had PASSED — which is exactly what an operator-directed repair
  does to build and test. The live report contains the contradiction twice. Priors are now
  labeled by what happened to them, and the lead clause claims "gate-failed" only when
  every prior actually failed, which keeps the B3/F-8 regression string byte-identical.
- **Suites after the change:** report **15 → 16** (`promote_repaired_dissent`, which carries
  the F-38 and F-40 regressions together by modeling the live run's shape — build and test
  each superseded at `gate_result: pass`, review carrying the `repair` resolution, and
  `build/attempt_2/corrections.json` with `source_attempt: "review/attempt_1"`). Parity
  **88/88**, entropy **7/7**, provenance **3/3**, SC-3 micro-drill — unchanged. The 15
  pre-existing report fixtures kept every decision, warn_flag, and exit code; only the
  centrally-asserted `schema_version` string was re-baselined 1.2.0 → **1.3.0**. `SKILL.md`
  **379** lines (NFR-3 < 500).
- **Honest scope note.** SC-6 gives a correct dissent somewhere to go and stops a repaired
  one from vanishing. It does not make the Advocate better at dissenting, and it does not
  help with a dissent nobody notices is correct. Worth recording that the dissent in this
  run came from the **review-gate Advocate at sonnet** — the tier raise SC-2 deferred as C2
  and SC-4 closed as A9. Noticing four *absences* by cross-referencing a 226-line document
  against a 200-line research record is not a haiku-tier task, so A9 has a field data point
  now, though a single run is a data point and not a demonstration.
- **Local CI at the merged head:** Tier 1 all nine steps PASS (`run_id` `20260806T032406Z`)
  and Tier 2 both legs PASS (`node20` build+run, `node24` build+run, `linux/arm64`; `run_id`
  `20260806T032411Z`) at `029ee0d`, the squash of PR #38. The remote CodeQL check failed in
  10s on the account-wide billing lock — the same non-code failure carried by every merged
  PR since #24; it is not a required check (`main` is protected with an EMPTY required-checks
  list, which is the corrected form of a claim this document made twice — see M-3 below).

## Maintenance audit M-3 (2026-08-06) — local CI vs. the codebase it gates, F-41…F-44

Governing record: `DPPD.md` §17. Tooling only — `adws-pipeline/` untouched, no schema, no
skill text. Triggered by an operator question after SC-6: had local CI kept up with the
recent changes? It had not.

- **Every fixture count in the CI was prose** (F-41). `Makefile`, `gate.sh` (twice),
  `.githooks/pre-push`, and `scripts/local-ci/README.md` printed suite sizes that nothing
  compared to anything. `Makefile` read `84` — parity moved 84 → 88 under SC-5 the previous
  day — so the drift was already there before SC-6 added a sixteenth report fixture and
  invalidated the other four.
- **The counts were the symptom; the missing assertion was the defect.** `run-parity.js`
  computed its total by walking `parity/fixtures/`; the report, entropy, and provenance
  runners computed theirs from `CASES.length`. Both are self-consistent by construction and
  neither can detect a shrink: remove a fixture *and* its `CASES` entry and all four suites
  report green with fewer tests, under a banner still claiming the old number. This is
  SC-5/F-27 restated — *a count no consumer compares is not a control* — inside the harness
  whose job is to catch F-27-class defects. The field-run lesson it violates is its own:
  "the fix is not 'watch for it' — it is making the mismatch impossible."
- **Fixed with two independent sources wherever two exist.** The report, entropy, and
  provenance runners now cross-check declared `CASES` names against the fixture files/dirs
  on disk in BOTH directions — an orphan fixture (exists, never run) and a phantom case
  (declared, no fixture) each fail by name. `run-parity.js` discovers from disk and so has
  no second source; it gets `EXPECTED_FIXTURE_TOTAL = 88`, a constant a human must change in
  the same commit as any corpus change.
- **All four were falsified before acceptance.** Hiding `promote_warn` produced both
  directions of the report failure; removing one `patch-compose` fixture produced
  `discovered 87 fixtures, expected 88`. (The falsification of the parity check also
  restored its fixture under the wrong filename, which `git status` caught before the
  commit — noted because it is the reason the fixture tree was re-verified byte-identical to
  HEAD before amending.) A residual blind spot, accepted: `run-parity.js` keys cases by
  filename, so a *renamed* fixture keeps the total at 88 and still validates against its own
  frozen `expected`. That changes a display name, not a verdict, so it is recorded rather
  than fixed.
- **NFR-3 is no longer an honor system** (F-42). "SKILL.md < 500 lines" appears in every
  scope change's Invariants section and was verified by a human running `wc -l` each time —
  357 → 367 → 379 across SC-4/SC-5/SC-6, monotonic, with nothing watching the trend.
  `frontmatter-lint.mjs` asserts it and reports `379/500`, matching `wc -l` semantics so the
  lint's number and the DPPD's number cannot diverge.
- **The ten agent definitions had no lint at all** (F-43). They are installed by
  `install.sh` and registered by Claude Code under their frontmatter `name`, yet nothing
  verified the block existed, that `name` matched the filename stem, that `description` and
  `tools` were present, or that `model` was one of the four canonical SC-4 tiers. The
  failure mode is quiet in the worst way: a typo'd `name` simply fails to register the
  subagent type, F-11's fallback then handles the "unregistered type" case as designed, and
  the operator sees a phase running through the fallback path for no visible reason.
  Falsified against an injected `adws-critik` name and a `claude-3-opus` model.
- **The Tier-3 review prompt would have flagged M-2's fix as a regression** (F-44). Its
  contract-coherence dimension told the reviewer to protect "the mandatory-parallel
  consensus at the test/review gates" — the unbounded phrasing that *was* F-35. It also
  predated SC-5 and SC-6 entirely. Refreshed: the consensus pair is parallel with each other
  and nothing else, `check_specs` carries every criterion and checks carry back `check_id`,
  a dissent recorded anywhere forbids a clean promote while superseded rounds warn and never
  fail, and suite counts in prose may not move without the assertion behind them moving too.
  This tier never blocks, so nothing shipped wrong because of it — but an advisory reviewer
  reasoning from a superseded spec argues for the defect.
- **Suites after M-3:** report **16/16**, parity **88/88**, entropy **7/7**, provenance
  **3/3**, SC-3 micro-drill — every size unchanged and now self-asserting. Tier 1 nine of
  nine PASS; Tier 2 both legs PASS.
- **A stale claim the audit surfaced, corrected in the post-merge sync.** `DPPD.md` §13 and
  this document (twice) asserted that the failing CodeQL check is non-blocking because
  "`main` has no branch protection." `main` IS protected; the reason nothing blocks is that
  its required-status-checks list is EMPTY. Right conclusion, wrong reason — a shape that
  survives review precisely because the conclusion holds. Corrected at all three sites.
- **Honest scope note.** M-3 makes the harness notice its own shrinkage; it does not make
  the suites *bigger*, and coverage of the skill's markdown contracts is still shallow — the
  frontmatter lint checks structure and canonical tiers, not meaning. Nothing here would
  catch a rule that is well-formed and wrong, which is what M-2 and SC-6 were about.
- **Merged** through PR #38 (`029ee0d`), together with M-2 and SC-6. Tier 1 nine of nine and
  Tier 2 both legs PASS at the merged head (`run_id`s `20260806T032406Z` / `20260806T032411Z`).

---

## M-4 + SC-7 (2026-08-07, field run job_20260807_0001) — F-45…F-52

Findings and actions: `SC7_PLAN.md`; narrative: `DPPD.md` §18; run record:
`field-runs/2026-08-07-issue21-cadence-method-skill.md`.

Every assertion was FALSIFIED before acceptance (M-3a discipline — an assertion that has
never been seen to fail is a claim, not a test).

- **The new fixture depends on the change it tests.** Reverting the single `criticFailed`
  term in `collectSupersededConsensus` — nothing else — flips
  `promote_repaired_critic_fail` from `PROMOTE` / `warn_flag: true` / exit 10 /
  `consensus: warn` to `PROMOTE` / `warn_flag: false` / **exit 0** / `consensus: pass`.
  That is the live-run bug reproduced on demand. Restored → 17/17.
- **The latest-attempt contract is intact.** `quarantine_critic_fail` (Critic fail on the
  LATEST attempt) unchanged: QUARANTINE, exit 2. A superseded fail warns; an unresolved
  one still fails.
- **The F-38 path is undisturbed.** `promote_repaired_dissent` unchanged: PROMOTE, warn,
  exit 10, `consensus: warn`, dissent quoted verbatim.
- **The fix produces the right verdict on the run that exposed it.** The post-change
  report was run against a COPY of the live `job_20260807_0001` evidence tree (the
  operator's tree was not mutated — the report writes derived files into the job dir).
  Pre-change that tree records `consensus: pass — "2 round(s) clean"` and
  `superseded_consensus: []` while carrying `critic: fail` on BOTH `test/attempt_1` and
  `review/attempt_1`. Post-change: `consensus: warn`, `2 superseded objection(s)`, both
  findings surfaced, exit 10 in both cases.
- **A rendering defect found by that same run, not by the fixtures.** The Critic's
  `findings[].evidence` in this job exceeded 2,500 characters, and quoting it into the
  gate `detail` made the gates table unreadable. The Advocate's `dissent` is designed to
  be quoted whole; a finding's `evidence` is a citation. The report now carries
  `critic_issue` (the one-phrase claim, clipped at 160) for the terse surfaces and
  `critic_finding` (verbatim) for the Superseded Consensus Rounds section. FR-7 asks that
  the objection never be silent, not that every surface carry all of it. **A synthetic
  fixture would not have caught this** — the fixture's finding is one tidy sentence.
- **Suite sizes are asserted, not narrated** (M-3a). `run-tests.js` cross-checks `CASES` ↔
  fixture directories in both directions; the count moved 16 → 17 in the runner and at all
  five prose sites (`Makefile`, `gate.sh` ×2, `scripts/local-ci/README.md`,
  `.githooks/pre-push`) in the same commit.
- **NFR-3** — `SKILL.md` 379 → 403 lines, asserted under 500 by `frontmatter-lint.mjs`.
  **NFR-4** — `execution-report.js` still imports only `fs` and `path` (`requires-lint`).

**Gate results.** Tier 1 nine of nine PASS. Suite sizes now 88 / **17** / 7 / 3 + SC-3
micro-drill.

**Merged** through PR #41 (squash `a0d725b`), with Tier 1 nine of nine and Tier 2 both
legs PASS at the merged head (`run_id`s `20260807T194011Z` / `20260807T194016Z`).

**Post-merge sync.** The root `README.md` still advertised **15/15** report verdict
fixtures — stale across BOTH SC-6 (15 → 16) and SC-7 (16 → 17) — and listed three
`references/` files where there are four (`validator-inputs.md` has been missing from the
layout since SC-2). Corrected in the sync PR. This is M-3a ("suite sizes are asserted, not
narrated") recurring in the one file M-3 did not reach: the runners cross-check their
declared cases against fixtures on disk in both directions, but nothing asserts the counts
printed in `README.md`, so the two drifted apart for two consecutive scope changes without
a single gate noticing. `docs/acceptance/ACCEPTANCE.md` was reviewed and deliberately left
alone — its counts are dated point-in-time annotations inside post-acceptance blocks, and
its block convention lapsed at M-1 (neither SC-5, SC-6, nor M-3 added one).

**What this does NOT verify.** The same limit M-3 recorded still applies, and SC-7 is
mostly spec text: the frontmatter and requires lints check structure, and the fixtures
check the report's behavior, but nothing here can catch a *rule* that is well-formed and
wrong. B1's requirement that the orchestrator reproduce a Critic finding before spending a
rewind, B2's budget table, and B3's tier policy are all prose that the next field run is
the real test of — exactly as F-45…F-51 were prose that three field runs were needed to
falsify.

---

## SC-8 (2026-08-08, field run job_20260807_0004) — F-53…F-57

Findings and actions: `SC8_PLAN.md`; run record:
`field-runs/2026-08-07-issue22-cadence-method-skill.md`.

The run that prompted this scope change wrote a verdict into the evidence tree that no
validator produced — `rubric_result: "warn"` at the `skill_trace.json` wrapper over an
`output.rubric_result` of `"fail"`, with the operator's rationale in `error` — to route
around a `review-risk-assess` fail it had correctly adjudicated a lexical false positive.
It improvised because the spec left no legal move, and it shipped because nothing in the
toolchain compared the two fields.

Every assertion was FALSIFIED before acceptance (M-3a discipline).

- **The override was never necessary.** Re-running the v2.0.0 validator against
  `job_20260807_0004`'s actual 73-file change set returns **`pass` / `risk medium` /
  `security_sensitive_count: 0`** where v1.0.0 recorded `fail` / `high` / **12**. All
  twelve matches were false positives against two contract-mandated fixture directory
  names. The incident that motivated SC-8 does not occur under SC-8 — and the deliverable's
  `authority.md` → `method-source.md` renames, made solely to appease the validator, were
  never needed either.
- **Exit 0 is reachable again — but not retroactively.** The first draft of this claim was
  wrong and the falsification caught it: re-running the report over a COPY of
  `job_20260807_0002` still exits 10, because the report reads RECORDED evidence and a
  frozen `warn` stays frozen no matter what the validator does today. The honest test
  re-runs the VALIDATOR: that job's 17-file, zero-security change set scored `warn` under
  v1.0.0 (the only warning in its entire terminal report) and scores **`pass`** under
  v2.0.0. Six consecutive runs had exited 10; the cause is removed for future runs only.
- **Each new parity fixture pins a DIFFERENT half of the security fix.** Reverting the
  `TEST_CORPUS_SEGMENTS` check alone fails `pass-fixture-corpus-auth-path` (89/90) while
  `pass-token-substring` stays green; reverting the tokenizer to v1.0.0's substring regexes
  alone fails `pass-token-substring` (89/90) while the corpus fixture stays green, because
  the exclusion still covers it. Neither fixture is redundant, neither is vacuous, and each
  restore returns 90/90.
- **The mismatch check would have caught the live breach.** Run against a COPY of
  `job_20260807_0004` (the operator's tree was not mutated), the post-change report moves
  from PROMOTE / `warn_flag: true` / exit 10 / `skills_clean: warn` to **QUARANTINE / exit
  2 / `skills_clean: fail`**, with `EVIDENCE INTEGRITY: … records rubric_result="warn" but
  its own output.rubric_result is "fail"` named first in Warnings.
- **The check is not vacuous.** Forcing `mismatch = false` — nothing else — flips
  `quarantine_trace_mismatch` to PROMOTE / `warn_flag: true` / **exit 10**, reproducing the
  live bug verbatim, down to the warning text. Restored → 18/18.
- **Honest traces are undisturbed, structurally and not merely empirically.** No fixture in
  the suite carried an `output` key before SC-8, and an absent or unrecognized
  `output.rubric_result` leaves the wrapper's verdict untouched, so the check cannot fire on
  any of the 17 pre-existing fixtures. All 17 pass unchanged.
- **No schema bump.** `skill_verdicts[]` is serialized through an explicit four-field
  projection (`skill_id`, `phase`, `attempt`, `rubric_result`), so the internal
  `trace_mismatch` marker never reaches `execution_report.json`. `SCHEMA_VERSION` stays
  **1.4.0**. A mismatch always produces QUARANTINE, so `decision` already carries the
  outcome machine-readably.
- **Suite sizes are asserted, not narrated** (M-3a). `EXPECTED_FIXTURE_TOTAL` 88 → 93 and
  report `CASES` 17 → 21 moved with their fixtures, along with every prose count site:
  **eight lines across five files** — `README.md` ×2, `scripts/local-ci/gate.sh` ×3,
  `scripts/local-ci/README.md`, `.githooks/pre-push`, `Makefile`.
  `review-risk-assess` joined `DIVERGED_PACKS` as `SC-8, v2.0.0`. *(This sentence read "six
  prose sites" until F-62; the enumeration that followed it listed seven locations and the
  files actually carry eight lines. A count of the count sites was itself wrong — which is
  the joke M-3a keeps telling, and the reason the suite totals have a second source and
  these do not.)*
- **A second stale README count, found by looking rather than by a gate.** `README.md`
  claimed in two places that **8 of the 9** validators are byte-for-byte parity-verified.
  Registering `review-risk-assess` as diverged-by-design makes that **7 of 9**, and nothing
  asserts it — the same defect class SC-7's post-merge sync found in the same file, which is
  now the second consecutive scope change to hit it. Corrected here rather than deferred to
  a sync PR. **Deliberately NOT corrected:** `SC5_PLAN.md` ("the sole diverged-by-design
  pack"), `WBS.md`'s SC-1 amendment, `DPPD.md` §2, and `ACCEPTANCE.md` — these are dated
  point-in-time annotations in historical records, several already stale since SC-5, and
  SC-7 set the precedent of leaving them alone. The live front-door docs are kept current;
  the archive is left as written.
- **NFR-3** — `SKILL.md` 403 → 412 lines, asserted under 500 by `frontmatter-lint.mjs`.
  **NFR-4** — `execution-report.js` still imports only `fs` and `path` (`requires-lint`).

**Review round — F-58, F-59 (two defects in SC-8's first cut).** An independent review
reproduced two boundary counterexamples that contradicted this document and the spec sheet.
Both are recorded in `SC8_PLAN.md` §7 and were fixed before acceptance:

- **F-58 — only one DIRECTION of trace mismatch quarantined.** The check substituted the
  validator's verdict for the wrapper's and let that substitution fail the gate, which works
  only when the concealed verdict is the worse one. Wrapper `warn` over an output of `pass`
  scored CLEAN: **PROMOTE, exit 0**, with the integrity warning printed but gated on nothing.
  The invariant "every mismatch quarantines" was asserted in four documents and tested in one
  direction — the direction where substitution happened to fail the gate by itself. Fixed by
  making the mismatch its own failing term in `evalSkillsClean`; pinned by
  `quarantine_trace_mismatch_inverse`, which reproduces the counterexample and now exits 2.
- **F-59 — malformed `files_changed` entries counted as assessable.** Assessability checked
  only that the array was non-empty. `[null]`, `["a-string"]`, `[{"action":"modify"}]`, and
  `[{"file_path":""}]` all returned `pass` / `risk low`, each inflating `files_changed` while
  invisible to the security scan — so an unreadable change set could select a LOWER tier than
  a readable one. The "missing/malformed → fail" rule was written and never implemented below
  the top-level object. Fixed by `isAssessableEntry` plus the additive `malformed_entries`
  count, with `risk_level: high` for an unassessable set. `action` is deliberately not
  enum-validated (see `SC8_PLAN.md` §7); `pass-unknown-action-assessable` pins that call.

- **The corrected claim was falsified across its whole input space, not at one point.** The
  15-cell matrix of wrapper verdict (`pass`/`warn`/`fail`) × `output.rubric_result`
  (`pass`/`warn`/`fail`/absent/unrecognized) was enumerated and run through the report. All
  **six** genuine disagreements exit **2** with the integrity warning; the three agreements
  behave normally (`pass`/`pass` → 0, `warn`/`warn` → 10, `fail`/`fail` → 2, no warning); and
  absent or unrecognized `output.rubric_result` falls back to the wrapper with no warning
  (→ 0/10/2), which is the tolerant-reader behavior older traces and crashed validators need.
  Two fixtures pin the two directions; the matrix is what establishes the invariant.

**What the review round says about the method.** F-58 is this scope change's own thesis
turned on its author: SC-8 exists because a rule stated since SC-2 was never asserted in
code, and its first cut then asserted a NEW rule in four documents while testing one input
direction. M-3a falsification was applied to the mechanism (revert the term, watch the
fixture flip) but not to the CONTRACT (enumerate the inputs satisfying the claim's
antecedent, check it holds across them). That distinction is the durable lesson here.

**Gate results.** Tier 1 nine of nine PASS and Tier 2 both legs PASS (`node20` build+run,
`node24` build+run, `linux/arm64`). Suite sizes now **93** / **19** / 7 / 3 + SC-3
micro-drill. The regenerated `parity/PARITY_REPORT.md` independently reports "7
original-parity, 2 diverged-by-design", which is the second source for the README
correction above.

**Merged** through **PR #43** (squash `3ab7283`), with Tier 1 nine of nine and Tier 2 both
legs PASS at the merged head (`run_id`s `20260808T150319Z` / `20260808T150325Z`).

**Post-merge sync.** `DPPD.md` gained §19; `WBS.md` gained its SC-8 status paragraph. The
WBS field-run series count was corrected **eleven → thirteen** (nine agentic-starter-kit +
four cadence-method-skill): it had read "eleven" since 2026-08-05 and was stale across SC-7
as well as SC-8. That is the third consecutive scope change to find an unasserted prose count
drifting — M-3a in the runners, SC-7 in `README.md`, SC-8 here — and unlike the suite sizes,
these narrative counts still have no second source that a gate compares them against.
Gitignored `ci_logs/` was pruned from 97 files to 14: both append-only JSONL ledgers are
retained in full (62 gate + 33 orb = every run ever recorded), along with every per-run
`.log` whose `run_id` is cited in `docs/` and the six most recent. Each deleted transcript's
run record survives in the ledgers, verified by checking all 95 ids against them before
pruning.

### Second review round (post-merge) — F-60, F-61, F-62

SC-8 merged as PR #43 at 15:03:10Z; **CodeRabbit's final review landed at 15:06:49Z** with
three actionable comments. The merge was taken while the bot had posted only its summary, so
the "no findings" reading described an unfinished review. Recorded as a process defect in its
own right: a review still running is not a review that found nothing, and nothing forced the
merge to that minute. Follow-up PR #45 carries the fixes.

- **F-60 — case-only transcription changes evaded detection.** The equality test normalized
  both values first, so wrapper `"PASS"` over output `"pass"` promoted at **exit 0** with no
  warning. Every validator prints lowercase; a non-lowercase wrapper cannot have been copied
  from stdout. Comparison is now on the RAW strings, with normalization governing scoring
  only. Pinned by `quarantine_trace_mismatch_case`.
- **F-61 — mismatches in superseded attempts were invisible.** `collectSkillVerdicts` sees
  latest attempts only, so a disagreement written into a superseded attempt was neither
  gated nor warned: **exit 10**. SC-6/F-38 and SC-7/F-52 deliberately keep superseded
  FAILURES out of the gate because a later attempt fixed them — but a superseded failure is a
  fixed defect and a superseded forgery is still a forgery, and a rewind cannot un-write a
  verdict no validator produced. Superseded mismatches now fail the gate (asymmetrically with
  the dissents beside them, which warn) and are named in Warnings. The check also moved above
  the no-outcomes early return, so a mismatch with no scored row cannot pass as `unverified`.
  Pinned by `quarantine_trace_mismatch_superseded`.
- **F-62 — a count of the count sites was wrong.** Both docs said "six prose sites" while
  enumerating seven locations; the files carry eight lines across five. Corrected, and the
  miscount recorded.

**The invariant re-verified across an enlarged space.** §7's 15-cell matrix varied verdict
VALUES but never their LETTERCASE or the attempt the trace sat in. It is now **35 cells**
(wrapper ∈ {`pass`,`warn`,`fail`,`PASS`,`Warn`,absent,unrecognized} × output ∈
{`pass`,`warn`,`fail`,absent,unrecognized}) plus a superseded-placement fixture: **18**
disagreements exit 2, the 3 agreements behave normally, and the 14 tolerant cells honor the
wrapper. Report fixtures **19 → 21**.

**What three rounds say about the method.** F-58, F-60, and F-61 are one defect in three
coats: the claim was "every mismatch quarantines" and the test was whichever mismatch the
implementation made easiest to imagine — direction, then lettercase, then location. §7 wrote
down the lesson (falsify the CONTRACT, not the mechanism) and the next round did not apply
it, because the matrix embodying it was built from the same mental model as the code. An
invariant quantified over "every" needs its input space enumerated along each axis the data
actually varies on; lettercase and attempt-position were axes the first enumeration did not
know it had.

**Review of the follow-up (PR #45), merged only after the review completed.** Five inline
comments: three valid and fixed on the branch — mismatch values were double-quoted
(`rubric_result=""PASS""`, now quoted once via a `quoteRaw` helper); §7's historical report
count had been edited to `18 → 21`, folding two rounds together, and is restored to
`18 → 19`; and `quarantine_trace_mismatch_superseded` carried 2026-07-10 phase manifests
inside a 2026-08-05/06 job window, with skill traces preceding their own phases (twelve files
remapped). One is a **false positive**: the comment reads the fixture's inherited
`adws-lint` trace, which has no `output` by design, while the mismatch it says is missing
lives in the `review-risk-assess` trace and is what drives the gate. One is **inherited and
left alone**: `promote_repaired_critic_fail`, merged under SC-7, has the same mixed-lineage
timestamp defect; the clone is fixed, the source is not, and nothing asserts timestamp
coherence for fixtures — which is why it survived a merge.

**What this does NOT verify.** The same limit SC-7 recorded applies. The fixtures prove the
report detects a mismatch and that the validator no longer false-positives; nothing here
can prove the *rule* is followed. A3's real enforcement is the check, not the prose — which
is the whole point of the finding, and the reason SC-8 asserts the rule rather than merely
restating it. What remains untested is the counterfactual the operator decision rests on:
that removing the override leaves no case where a correct run is blocked by a wrong
validator. The next field run is the test of that, exactly as F-45…F-51 were prose that
three field runs falsified.

## Maintenance audit M-5a (2026-08-08) — minimum trust foundation, F-63…F-69

Full audit evidence: `docs/AUDIT_2026-08-08.md`. Package plan: `docs/M5A_PLAN.md`.

The audit covered 13 field runs, 73 local-CI and 40 OrbStack records, the parity report,
the acceptance evidence, `SKILL.md`, the 10 agent definitions, and every executable in the
repo. Its headline is not about pipeline behaviour but about self-knowledge: **this gate had
never gone red.** 73/73 runs, 657/657 steps, across its entire recorded life — and not as a
logging artifact, since `gate.sh:45` sets `overall=fail` without exiting and `:94-96` emits
the record before the exit. Every finding in the F-register was located by a field run, a
review bot, or a human audit. None was ever located here.

M-5a changes no validator behaviour, no fixture `expected` value, and no schema. It exists
so that SC-9's claims are verified by something that can fail.

### Findings registered

| ID | Finding | Package |
|---|---|---|
| F-63 | A `__proto__` path segment makes `repo-context-scan.execute()` throw *before* its policy loop completes, so the build-phase policy gate is SKIPPED rather than returning `fail`. Reproduced. | SC-9 |
| F-64 | `branch_name` is length-checked only in both ship validators; `--upload-pack=…` and `foo; rm -rf ~` both return `pass` from the documented pre-git gate. `{slug}` is undefined anywhere in the spec. Reproduced. | SC-9 |
| F-65 | `Math.max(...abs)` over an unbounded array (`drift-sentinel.js:244`) throws at 200k entries; no input-size cap exists anywhere. Reproduced. | SC-9 |
| F-66 | Five agents are instructed to write files and hold no `Write` tool. Causation for the three recorded haiku write-failures is likely, not established. | SC-10 |
| F-67 | Predictable `os.tmpdir()` path written with `writeFileSync` in the parity harness — symlink overwrite/unlink at gate-runner privilege. | **M-5a (fixed)** |
| F-68 | `install.sh` `rm -rf` + `cp` destroys user edits with no backup, prompt, or diff. | SC-10 |
| F-69 | `safeReadJson` conflates unreadable/malformed with absent, in the tool whose purpose is tamper-evidence. | SC-11 |

### What M-5a asserts that nothing asserted before

- **The CLI wrapper.** 279 duplicated lines previously covered by one happy-path assertion
  per pack. Now 332 assertions across 11 CLIs: every exit-3 path, both input modes, and the
  documented equivalence of `-` and a file path. Falsified by deleting the object guard from
  one validator — four cases flip **for that pack only**, all eight others stay green.
- **Stdin mode**, which no test had ever exercised. Falsified by making one validator ignore
  `-`: every `stdin-*` case fails, `file-happy` stays green.
- **That the fixture corpus pins the rules it appears to test.** `guard-ablation` mutates
  `execute()` one rule at a time and fails on any mutation the corpus does not notice.
  Measured: 18 mutants, 122 `execute()` calls, **0 survivors, 6 ms**. Falsified by adding an
  unpinned guard to `ship-mode-select` — **2 survivors reported, exit 1**, and they are
  precisely the guard and verdict SC-9/A2 must add. SC-9 therefore cannot ship that rule
  without a fixture pinning it.
- **That the nine wrapper copies cannot drift.** Falsified by a one-character edit: the lint
  names the file and the wrapper line.

### A scope correction worth recording

`guard-ablation`'s first run reported nine survivors, all in the CLI wrapper. True, but
stated in the wrong place — the 93 parity fixtures call `execute()` directly via
`exec-one.js` and never invoke the CLI, so they pin no wrapper line by construction. Nine
permanent baseline entries saying so would drown any real survivor. The wrapper is scoped
out of the sweep and pinned instead by the contract suite and the byte-identity lint, which
narrows the tool's claim to one that is true: *the fixture corpus pins every rule in
`execute()`.*

This is the same discipline F-41 applied to suite sizes — a check that cannot fail for the
right reason is not a check.

### Two corrections to the audit's own first-pass figures

**Parity costs ~4 s per gate run, not 277 s** — the larger number was the cumulative sum
across all 73 recorded runs. So an anti-vacuity sweep has real budget, and `drift-sentinel`'s
env-read-at-call-time impurity costs ~4 s rather than 277 and is not worth "fixing". That
impurity is in fact load-bearing: it is what lets `guard-ablation` set and restore env around
each in-process `execute()` call.

**The duplicated agent boilerplate costs no always-loaded context** — agent definitions load
per dispatch and never co-load. The 9,340 byte-identical bytes are a drift problem, not a
token problem, so the fix is a lint rather than a refactor. `SKILL.md` is where the token
win is (SC-10/A3).

## SC-9 (2026-08-08, audit findings F-63…F-65) — hostile input is input

Plan: `docs/SC9_PLAN.md`. Findings: `docs/AUDIT_2026-08-08.md` §2. Depends on M-5a.

Three defects, all reproduced before the fix and all re-verified after. Each had shipped
through every gate this repo has, because the two suites that would have caught them did
not exist until M-5a: the CLI was covered by one happy-path assertion per pack, and nothing
checked whether a fixture pinned anything.

| Finding | Before | After |
|---|---|---|
| **F-63** — `{}` inherits `Object.prototype`, so a `__proto__` path segment threw *before* the policy loop completed. The build-phase policy gate was **skipped**, not failed. | `adws-validator: execute failed: groupedFiles[dir].push is not a function`, exit 3, no verdict | `rubric=fail`, violations `outside_allowed_paths + in_blocked_path`, exit 0 |
| **F-64** — `branch_name` length-checked only, in both ship validators, which SKILL.md documents as the pre-git gate | `--upload-pack=/tmp/evil` → `pass`; `foo; rm -rf ~` → `pass` | `fail (leading_dash_reads_as_option)` and `fail (illegal_character)`, in both validators |
| **F-65** — unbounded `Math.max(...abs)` spread | `RangeError: Maximum call stack size exceeded` at 200k entries | 500k entries → `band=SAFE` in 41 ms |
| **undercount** — `files_to_ship` counted the build half only; recorded in three field runs and deferred each time | 2 build + 2 docs → `files_to_ship: 2` | `files_to_ship: 4` (`build_files: 2`, `docs_files: 2`) |

### The invariant this package turns on

**Zero pre-existing verdicts moved.** All 20 pre-existing fixtures across the three
diverged packs were re-verified against `git show HEAD:` — every `rubric_result` is
unchanged; only additive keys differ. Corpus 93 → 108 (15 new pins).
`drift-sentinel` did **not** diverge: the fold returns the identical value for every input
the spread survived, so all 16 of its fixtures are byte-identical.

### What went red, and why that is the finding

`guard-ablation` **failed the gate on SC-9's own first cut**, naming four rules the new
fixtures did not pin: the empty-prefix branch of `underPrefix`, both absolute-path guards,
and the malformed-entry count. Three were closed with fixtures. The fourth — an explicit
`startsWith('/')` test — proved to be **dead code**: `/etc/passwd` splits to
`['', 'etc', 'passwd']`, so the empty-segment rule already rejected it. It was deleted
rather than exempted; a redundant guard is a rule readers will trust twice.

This is the first time a check in this repository has failed for a reason nobody wrote a
fixture for. It is also the exact scenario the issue-#22 field record described and no
mechanism addressed: *"deleting the guard left both fixtures green."* Without it SC-9 would
have shipped four unpinned rules and one piece of dead security-shaped code, and every
suite would have been green.

Final: 35 mutants, 409 `execute()` calls, **0 survivors**, 13 ms.

### Harness change

`--freeze` requires `ADWS_PRO_source/`, which is gitignored and absent, so a scope change
that adds output keys could not land at all. Added `--freeze-diverged`: for a diverged pack
the port **is** the reference by definition, so no original is needed. It refuses to touch
a non-diverged pack, so it cannot launder a baseline that is supposed to come from the
original. Refreezing all five diverged packs left `criteria-to-checks` and
`review-risk-assess` byte-identical — independent evidence the freeze path is faithful for
unchanged code.

Validator parity is now **4 of 9** byte-for-byte against the originals, down from 7. The
count fell because scope changes were approved, not because parity degraded, but the honest
number is the smaller one and `README.md` states it.

## SC-10 (2026-08-08, audit findings F-66, F-68) — the agents can write; the skill can shrink

Plan: `docs/SC10_PLAN.md`. No validator changes, no fixture changes, no refreeze.

**F-66 — six agents, not five.** The audit named five agents instructed to write evidence
files while declaring no `Write` tool. Writing the lint found a sixth immediately:
`adws-reviewer`, whose instruction reads "Write to your attempt directory" rather than
"Write EXACTLY one file", and which writes three files. That is why the lint reads the agent
**body** rather than checking a list of names — the list was already wrong on its first day.
All ten agents now declare `Write`; `frontmatter-lint` fails any agent whose body instructs
a write without it.

Causation is stated as a hypothesis, not a finding: `Bash` can write those files, so the
frontmatter alone does not prove the missing tool caused the three recorded haiku
write-failures. The fix stands on its own merits. `adws-advocate` stays at `haiku` — fix the
cause, keep the tier, and record why so a later audit does not "fix" it by raising cost.

**Drift, not tokens.** The evidence-integrity and security paragraphs are byte-identical in
all ten agent files. They cost no always-loaded context (agent files load per dispatch and
never co-load), so the risk is drift: ten copies of a security rule are ten places a
hardening can miss one, and no test reads agent prose. `agent-blocks-lint.mjs` now asserts
both blocks against `references/agent-shared-blocks.md`, which doubles as the text the F-11
fallback must inline verbatim.

**SKILL.md 425 → 337 lines.** Moved to `references/runtimes.md` and
`references/troubleshooting.md`: the macOS bash-3.2 case study, the agent-type fallback, and
both recovery procedures. The failure-reason classes were a near-verbatim duplicate of
`phase-gates.md:403` and became a pointer. What stayed is the operative sentence from each —
a check that could not run is `NOT RUN` and never a valid falsifiability red; container-green
is necessary, not sufficient — because those decide gates while the explanations do not.

The reference index is now checked **both ways**. Previously only "every path SKILL.md names
exists" was asserted; a file could sit in `references/` that nothing pointed at. That
inversion is how reference-grade prose accumulates in an always-loaded file. An advisory
350-line target now warns without failing, so the trend is visible before the 500-line
ceiling — 357 → 367 → 379 → 412 was monotonic and nothing was watching it.

**F-68 — the installer no longer destroys edits.** Stage-and-validate, back up only
installer-owned paths (never a recursive `.claude/` snapshot), show the diff, prompt or
hard-error, then swap by `mv` so an interruption cannot leave a half-written skill directory.
Verified end to end: a local edit to an installed `SKILL.md` causes a non-interactive re-run
to refuse and preserve the edit; `--force` replaces it and the edit survives in the backup.
Backups are never auto-deleted and the output says so — auto-pruning would delete the one
artifact a user reaches for after a bad upgrade.

Gate: 13/13 steps pass.

## SC-11 (2026-08-08, audit finding F-69 + four findings open since SC-3) — evidence that means something

Plan: `docs/SC11_PLAN.md`. Report fixtures 21 → 24, provenance 3 → 5. No `SCHEMA_VERSION`
bump, no new decision, no new exit code, no validator changes, no parity refreeze.

**F-69.** `safeReadJson` caught every error and returned `null`, so `EACCES`, `EISDIR`, a
truncated write and a JSON syntax error were indistinguishable from "never written" — in
the one tool whose purpose is tamper-evident evidence. `ENOENT` is now the only benign
absence; everything else fails the gate through the existing FAIL → QUARANTINE route. The
term sits **above** `evalSkillsClean`'s no-outcomes early return, restating SC-8/A11: an
integrity check underneath an early return gates nothing.

Falsified two ways — restore the catch-all, or disable only the gate term — and in both the
two new quarantine fixtures flip to **PROMOTE exit 0** while `promote_absent_optional` stays
green. That exit 0 is the hole in one number: before SC-11 a corrupted evidence file scored
a clean promote.

**The new fixtures were vacuous on the first cut.** Both initially targeted
`build/attempt_1/phase_manifest.json`, but missing phase evidence already fails
`pipeline_completion`, so the job quarantined with the fix fully reverted — they pinned
nothing. Rebuilt against files whose absence is tolerated (a `skill_trace.json`, a
`consensus/advocate.json`) so the integrity term is the only gate that can produce the
verdict. Same class as *"deleting the guard left both fixtures green"*, reproduced inside
this package's own work and caught only by hand-falsification, because `guard-ablation`
covers validators and not `execution-report.js`. That is the strongest argument for
extending it (M-5b/B6).

**F-17 closed WONTFIX-with-substitute.** Open since SC-3 across five scope changes because
the data is not obtainable — the runtime exposes no per-subagent token or cost accounting.
The split is now explicit: `model_id`/`cost_usd`/`tokens_in`/`tokens_out`/`tool_call_count`
are structurally unavailable, **retained and written null**; `started_at`/`completed_at`/
`wall_clock_s`/`agent`/`model_tier_requested` are obtainable and now **mandatory and typed**.
A first draft proposed deleting the always-null keys; that was withdrawn — removal is a
breaking change to every recorded evidence tree, and only the retained-and-null form lets a
reader tell *not captured* from *field dropped*. Provenance fixtures now include the
mandatory shape and a **rejection** of the shape thirteen field runs actually produced.

**The grader mandate is settled: diff-only.** Its independence comes from not sharing the
pipeline's evidence; reproduction would make the verdict depend on an environment nothing
records; and executing the change is the verifier's job. A criterion satisfiable only by
execution now grades `partial` with `requires_execution: true` when the diff carries no
demonstrating test — the absence of that test *is* the finding. The spec also now states
what a grader `pass` does not mean: coverage, not correctness.

**Archive before teardown.** A first draft would have written `artifacts/{jobId}.tar.gz`
and checked it non-empty; that under-reads the failure. The records show the tree was "not
committed to the PR head and not retained locally" — the archive was not absent so much as
written somewhere disposable, which writing beside the source tree reproduces exactly. Now
three mandatory parts: a durable destination outside the worktree and the checkout, path
and sha256 recorded in `run_manifest`, and **verification by extraction** rather than by
size, since a truncated tarball is non-empty. Teardown is conditional on a verified archive.

This one is prose the orchestrator must follow, not code — nothing mechanically enforces the
durable destination. That gap is recorded rather than papered over.

Gate: 13/13 steps pass.
