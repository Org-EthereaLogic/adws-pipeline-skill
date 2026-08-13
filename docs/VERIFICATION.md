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

**This is a mandated procedure, not verified behaviour.** Nothing mechanically enforces the
durable destination, the recorded digest, or the extraction check — they are instructions in
`SKILL.md` that an orchestrator must follow, and an orchestrator that skips them fails no
gate. The recorded `sha256` makes a later audit possible; it does not prevent the loss. The
four runs that lost their evidence lost it while following a procedure too, which is exactly
why this gap is recorded rather than papered over: closing it needs a script, and a script
needs a runtime contract for where "durable" lives.

Gate: 13/13 steps pass.

## Maintenance audit M-5b (2026-08-08) — harness improvement, F-11…F-13 backfill, F-70/F-71

Plan: `docs/M5B_PLAN.md`. Independent of every other package; nothing depends on it.

### Register backfill — F-11, F-12, F-13

These three were recorded as `SKILL.md` troubleshooting headings and never given register
rows, so the register jumped F-10 → F-14 and three real findings were invisible to anyone
reading it. Backfilled here at their original dates, with their current homes.

| ID | Finding | First recorded | Now lives in |
|---|---|---|---|
| **F-11** | `adws-*` agent types are not registered in every runtime (e.g. cloud sessions). A phase whose agent type fails to dispatch must be run by a general-purpose subagent with the agent's spec inlined VERBATIM — the fallback changes the transport, never the contract. | field run issue #103 (2026-07-18) | `references/runtimes.md` (moved from SKILL.md by SC-10/A3) |
| **F-12** | A subagent dispatch can die on a transient API error having written no evidence at all. That is not a gate failure: re-dispatch into the same attempt directory and consume no retry budget. Confusing the two burns budget on infrastructure. | field run issue #105 (2026-07-18) | `references/troubleshooting.md` |
| **F-13** | Host-runtime blindness — the test and verify phases run wherever the ORCHESTRATOR runs, which can differ from the target's runtime. A change can PROMOTE green in a Linux/bash-5 container and crash on macOS bash 3.2. Container-green is necessary, not sufficient. | field run issue #111 (2026-07-20) | `references/runtimes.md`; the operative sentence stays in `SKILL.md` |

### F-70 / F-71 — an ID collision in the live record

`docs/SC8_PLAN.md` §7 and `docs/field-runs/2026-08-07-issue22-*.md` both used **F-58** and
**F-59** for different findings. The register definitions keep those IDs (they are cited by
§8 and by this file); the field-run record is renumbered to **F-70** and **F-71**, with a
note at each. No evidence tree was rewritten — SC-8 §6's precedent holds that trees are
append-only history, so only the prose moved.

F-71 is the finding M-5a/A2's `guard-ablation` sweep was built to answer, and SC-9 and
SC-11 each hit its defect class again in their own first cuts.

### The `ci-orb` claim was false

`Makefile` and `.githooks/pre-push` said Tier 2 "closes F-13". It does not: F-13 is a macOS
**bash-3.2** defect and `orb-ci.sh` varies only the **Node** version on `linux/arm64`. The
claim is restated, and Tier 1 gains `bash32-scan`, which actually covers the axis — it
looks for the trigger construct (a bare `"${arr[@]}"` under `set -u`) in the shell scripts
this repo owns.

It went red on its first run: three hits were its own explanatory comments (the same
false-positive class `requires-lint` had, found the same way, so comments are now stripped
first) and three were real sites in `gate.sh`, `orb-ci.sh` and `review.sh`. Those three were
made safe with `${arr[@]+"${arr[@]}"}` rather than waived — all three arrays happen to be
non-empty today, but "happens to be non-empty" is exactly what F-13 punished.

### The tested-tree digest, and the version of it that was wrong

33 of the first 73 recorded gate runs were `dirty: true`, so `git_commit` named a tree that
was never under test. The gate now records `tested_tree`.

The first design hashed `git diff HEAD` plus `git ls-files --others`, and it was **wrong**:
the former omits untracked file *contents* and the latter lists untracked *filenames* only.
Verified directly — two worktrees differing solely in an untracked file's contents produced
**identical** digests under both. A temporary index and `git write-tree` gives a real tree
object covering tracked modifications and untracked contents together, respects
`.gitignore`, and never touches the real index. Verified to distinguish both the content
change and the file's presence.

That correction is recorded rather than quietly fixed, because the broken version looked
entirely plausible and would have shipped a field that appeared to identify the tested tree
while not doing so — the same shape as a fixture that appears to pin a rule and does not.

### M-5b/B4 — the parity headline, corrected

A fixture frozen from the port and one frozen from the original were indistinguishable on
disk, so `PARITY_REPORT.md` could report "identical" for a pack whose baseline was only ever
the port's own output. Every fixture now carries `expected_source`, `--freeze` stamps it, and
the verify path **fails** when a non-diverged pack carries a `port@` baseline.

The report now splits the corpus instead of conflating it: **39 fixtures are original-parity;
69 are frozen-baseline regression.** That is a materially weaker headline than "108/108
identical" and a truer one. It does not re-derive original parity — nothing here can, without
`ADWS_PRO_source/` — it stops the report claiming parity for fixtures that never had it.

### M-5b/B1 — `parity/_harness.js`, and what was left alone

Extracted what is genuinely identical: the M-3a coverage cross-check (written three times),
the `check()` recorder, `listBySuffix`, `withScratchDir`. Left alone: the five per-suite
epilogues and the `runCli` wrappers, which look alike but each name what they tested or
differ in ways that matter. Extracting things that merely look alike is how a helper
accumulates parameters until it is harder to read than the duplication was.

Invariant verified by capturing all six runners' stdout before and after: **every
pre-existing suite is byte-identical.** One line changed, in the `cli-contract` suite M-5a
added this session, where the coverage message harmonized with the other three. It took three
attempts to make that string match exactly — at which point the repo's own rule applies
("when a parser heuristic needs a third patch, delete it and accept the over-report"), so the
harmonized message stands and the difference is recorded rather than tuned away.

Gate: 14/14 steps pass.


## Post-merge record — PR #47 (2026-08-08)

The `M-5a → SC-9 → SC-10 → SC-11 → M-5b` series merged as one stacked PR at `26dbf0d`.
Local CI green at the merged head: Tier 1 14/14, Tier 2 clean-room Node 20 and 24.

**The external review did not run.** CodeRabbit skipped the PR — *"Review skipped: 237 files
exceed the limit of 100"*. That matters more here than usual: this audit's own finding #13
counted **five of the last six field runs** in which post-pipeline external review found what
the pipeline missed, and `SC8_PLAN.md` §8's lesson is that the merge waits for the review bot
to finish. On this PR there was no bot to wait for. The series therefore lands with local
evidence only, and that is a weaker position than any of the individual packages claimed.

The practical lesson is about PR size, not about the bots: a 237-file change is past the
point where the external reviewer that has historically caught the pipeline's misses can
help at all. Splitting the series into separately-mergeable PRs would have kept it under the
limit — but SC-10's dependency on SC-9 (`SKILL.md`, `gate.sh`) and M-5b's on M-5a
(`guard-ablation.mjs`) made that impossible after the fact. **Sequencing that preserves
reviewability is a planning constraint, and this plan did not treat it as one.**

CodeQL failed in ~3 s, as it has on every run in this repository including on `main`, and
reports `no analysis found` — an account-wide billing lock, not a code finding. `main` is
unprotected, so no required check was overridden and no `--admin` merge was used.

**Amendment — the follow-up PR repeated the failure, and worse.** PR #48 carried the entry
above into the record and was merged **while CodeRabbit's review was still running**. The bot
reported `Review failed — The pull request is closed.` So #48 also landed unreviewed, and
this time nothing forced it: the PR was two files, well inside the limit, and the review
would have completed in under a minute.

And PR #49 — this amendment — did not get reviewed either, for a **third distinct reason**:
CodeRabbit's free OSS quota was exhausted (*"Review limit reached… next review available in
57 minutes"*). Three PRs, three different causes, zero external review:

| PR | Cause | Check reported |
|---|---|---|
| #47 | 237 files exceed the 100-file limit | `pass` — "Review skipped" |
| #48 | merged while the review was running | `pass` — then `Review failed: the pull request is closed` |
| #49 | free-tier review quota exhausted | **`pass`** — while no review started at all |

**In all three the check reported `pass`.** A reviewer that skipped, a reviewer that was cut
off, and a reviewer that never started are indistinguishable at the checks list from a
reviewer that read the diff and approved it. That is this repository's own founding
observation — a green signal from a gate that cannot fail carries no information — appearing
in the one place the pipeline had been trusting to compensate for it. The audit counted five
of the last six field runs where external review caught what the pipeline missed; those five
were luck of the quota, not a control.

That is also the same rule broken twice within the hour, the second time by the author of the
sentence recording the first. Worth stating plainly because it is the more useful of the two
data points: #47's gap was a structural consequence of a 237-file stack, which a planning
constraint could prevent; #48's was simple impatience at a green-looking checks list, which
no constraint prevents and only a habit does. **A rule written into a document the same day
it is broken is not yet a control.**

### F-72 — a merged fix does not reach a run until someone reinstalls, and nothing says so

Found by asking, after the merge, whether the changes would affect future runs. They would
not have. **All three installed copies were still the pre-remediation code**, and the
defects reproduced live in them:

| Install | F-63 | F-64 | F-65 |
|---|---|---|---|
| `~/.claude` (global) | `groupedFiles[dir].push is not a function`, gate skipped | hostile branch → `pass` | `RangeError` at 200k |
| `Dev/etherealogic-website` | same | same | same |
| `Dev/agentic-starter-kit` | same | same | same |

Each also carried the pre-SC-10 agents (no `Write`) and a 412-line `SKILL.md` with four
references. `agentic-starter-kit` is the repository nine of the thirteen field runs targeted,
so it was the most likely next consumer of the vulnerable code.

**The gap is structural, not an oversight.** This repository lints its own tree thoroughly —
byte-identity for the CLI wrapper, byte-identity for the shared agent blocks, a bidirectional
reference index, a fixture-corpus ablation sweep — and has **no check whatsoever** that an
installed copy matches the source it was installed from. `frontmatter-lint.mjs` mentions
installation only to forbid referencing dev-only paths from inside the skill. Nothing knows
where the skill is installed, and nothing compares.

That is the same shape as every other finding in this series: a green local gate, and a real
consumer running something else entirely. The parity harness proves the validators in `git`
are correct; it says nothing about the validators that will actually run tomorrow.

Remediated by hand here (all three reinstalled from `fa0ffdd` and re-verified by re-running
the reproductions against each installed copy, not by trusting the installer's output).
**No mechanism was shipped**, so it will recur on the next merge. Candidates: a
`make check-installs` that diffs known install roots against the source tree, or a version
stamp in `SKILL.md` that the orchestrator asserts at intake against the skill it loaded —
the second is stronger, because it catches the case where nobody remembered to run the check.

**Carried forward, not acted on:** the 19 unpinned validator rules tracked in
`parity/guard-ablation-baseline.json`; `execution-report.js` as the largest unswept surface;
archive-before-teardown as a procedure with no mechanical enforcement; that the series was
not reviewable by the tool most likely to catch its defects; that the repository has no
mechanism — only prose — requiring an in-flight external review to finish before a merge;
and **F-72**, that nothing detects a stale install.

### Final state

PR #47 (the stack), #48 (ledger record) and #49 (review-gap amendment) are merged; `main` is
at the merge of #49. Local CI green on merged `main`: Tier 1 14/14, Tier 2 clean-room Node
20 and 24. All three installs updated and verified. `#49` was merged at the operator's
direction with its review gap recorded rather than closed — CodeRabbit was rate-limited and
never started, and the check read `pass`.

## SC-12 (2026-08-09) — an install knows what it is; the source knows if it's current

Plan: `docs/SC12_PLAN.md`. Closes the mechanism half of **F-72**, which was recorded but
unremediated: the three stale installs were fixed by hand and nothing shipped to stop it
recurring on the next merge.

Two mechanisms, because they answer different questions and neither is sufficient alone.

**What is this?** The skill now ships `skill-manifest.json` — a content digest of all 30
files `install.sh` copies, skill tree and agent definitions alike — and
`scripts/skill-check.js`, which verifies an installed tree against it and reports the
`skill_version`. The orchestrator runs it at intake and records the version in
`run_manifest.skill_version`, so **a stale install now says so in the evidence of every run
it touches** rather than in nobody's. An integrity mismatch stops the job; a missing manifest
warns and continues, so installs predating this still work.

**Is it current?** An install cannot answer that — it is offline with respect to its source.
`make check-installs` runs from the repository and compares each registered install,
distinguishing STALE (version differs) from **MODIFIED** (version matches but files don't
match their own manifest — the more dangerous case, because the version string alone looks
correct). `install.sh` self-registers each destination in a gitignored `.adws-installs`.

The version is derived from **content, not git**: a commit hash is chicken-and-egg, since
writing the manifest changes the tree that determines the commit, and it goes stale on a
rebase. `skill-manifest` is a gate step, so a shipped file cannot change without the manifest
being regenerated — otherwise an install could stamp itself with a version that does not
describe its own contents, which is worse than no version at all.

**`check-installs` is deliberately not gated.** It reads machine-local state and would fail
in CI, in a fresh clone, and on any machine that never installed the skill. A step that
cannot pass everywhere is a step people learn to ignore.

Falsified in both directions and at both layers: the manifest goes stale on a skill *or*
agent edit; `skill-check` catches changed, missing and **undeclared** files (a partial
install or leftover staging directory is exactly how a broken install hides); and
`check-installs` reports CURRENT → STALE when the source moves → MODIFIED when the install is
edited. Gate 15/15; all three real installs re-registered at `43e9b6fded7d`.

**The reminder that closes SC-12's own gap.** SC-12 §6 recorded that nothing prompted anyone
to run `check-installs` after a merge — the mechanism existed, the habit did not.
`.githooks/post-merge` now fires exactly when a merge changes the shipped bytes, runs the
check, and prints the result. It never blocks (verified by deleting `check-installs.mjs` and
confirming the merge still exits 0) and never fires when nothing changed (a reminder on every
pull is one nobody reads — the same reasoning that keeps the check out of the gate).

Building it exposed a defect in SC-12: the manifest's `git_commit` moves with HEAD, so the
file was rewritten on every commit and was perpetually dirty. A file that is always modified
is a file whose diffs stop being read. `--write` now leaves it untouched when `skill_version`
is unchanged.

**The hook's first live firing found its own defect.** Pulling the merge of its own PR, it
announced `the skill changed: 904e3aa56dac -> 904e3aa56dac` — the same version on both
sides. The trigger keyed on whether `skill-manifest.json` *changed*, but the manifest carries
`git_commit`, which moves with HEAD, so the file differs on merges that ship nothing. It was
firing on exactly the "nothing changed" case its own property #2 forbids.

Fixed to compare the `skill_version` **value** across the merge rather than the file.
Falsified both ways: a merge that alters only `git_commit` is silent; a merge that changes a
shipped file still fires.

Two things worth noting about how it was found. The defect is one layer up from the churn
already fixed in `--write` — the same root cause (`git_commit` moves with HEAD) surfacing in
a second place, which is the pattern review caught twice in SC-12 and that this repeats a
third time. And it was found by *running* the thing, at the first moment it could have been:
no test in the suite would have caught it, because the suite tests the hook against branches
it constructs, and the case only arises from a real merge where the manifest was regenerated
on the branch.

**What remains:** the hook only helps someone who ran `make install-hooks`. A fresh clone has
none until it does. That is a narrower version of the same gap, and F-72 itself was found by
a question, not by a check.

**Review round.** CodeRabbit reviewed this PR — the first in the series it was able to
finish, the two before it having been skipped for size and cut off mid-review — and found **three
Major** defects. The first: `skill-check.js` held agent definitions to a weaker standard than
the skill tree. With no agents directory it skipped the checks and exited 0 on an install with zero
agents; and it ignored undeclared `adws-*.md` files while the skill tree treats an undeclared
file as a finding, with a comment in the same file explaining why. The asymmetry was the
tell: the rule was written down and then applied to only one of two shipped surfaces. Both
fixed and falsified.

The second: `SKILL.md` step 3 told the orchestrator to record `skill_version` in a
`run_manifest.json` that step 4 creates — a sequencing contradiction in the spec. The third:
`check-installs` hashed only skill files, so an edited or missing agent reached `CURRENT` —
**the identical asymmetry as the first, fixed in one file and missed in the other.** It now
validates both surfaces against the *source* manifest, since an install whose own manifest
was trimmed would otherwise validate against its own omission.

That is the strongest available argument for the practice this series kept failing to follow.
Across #47, #48, #49 and #51, the one PR where the review was allowed to finish is the one
where **three** real defects were found — all of them past the gate, the falsification table
and the author, and two of them the same class fixed in one place and missed in another,
which is exactly what a second reader catches and an author does not.

**A process note.** While falsifying this work I ran `git checkout` on `SKILL.md` to undo a
probe and destroyed an uncommitted edit — the intake assertion this scope change exists to
add. It was caught immediately (the assertion was simply gone) and redone from a backup
copy, which is what the other probes in this session had used. Recorded because it is the
identical failure mode `install.sh` was hardened against three packages ago: a destructive
restore with no backup, applied to work that only existed in the working tree.

---

## SC-13 (2026-08-09) — the pipeline could not keep what it found

Plan: `docs/SC13_PLAN.md`. Field record:
`docs/field-runs/2026-08-09-issue24-cadence-method-skill.md`. Closes **F-73, F-75, F-76,
F-77, F-78, F-79**; **F-74** closed WORKING-AS-DESIGNED by operator decision.

Source: `job_20260809_0003` and `job_20260809_0004` against `cadence-method-skill` issue
#24. Between them the pipeline found eleven real defects, repaired ten, and shipped
nothing. Every one of five Critic `fail` verdicts reproduced as a true positive. Nothing
below is a detection failure.

**Gate.** `make local-ci` PASS, all 15 steps, run `20260809T172303Z`: parity 108/108,
report **25/25**, entropy 7/7, provenance 5/5, SC-3 drill, CLI contract, guard-ablation,
node-check, shell-lint, bash32-scan, frontmatter, requires, cli-block, agent-blocks,
skill-manifest. `skill-manifest.json` regenerated: `904e3aa56dac` → `358f7b7d28a7`, 30
files; `node adws-pipeline/scripts/skill-check.js --json` → `intact: true`.
`make ci-orb` PASS, run `20260809T172313Z`: node20 build/run PASS, node24 build/run PASS,
linux/arm64.

**F-78 is the only change to RUNTIME behaviour, and it is pinned by a fixture that did not
exist.** (`agent-blocks-lint.mjs` also changed, below — that is gate tooling, not anything
a pipeline run executes.)
`missingPhaseEvidence()` now says `not reached — job terminated at {phase}` for a phase no
later phase followed, and keeps `no attempt recorded` for one that a later phase DID follow.
The distinction is worth nothing unless both branches are pinned, so
`quarantine_skipped_phase` (`job-sk1p13`) carries `review` absent while `document` has
evidence and asserts, from one tree, `review (no attempt recorded), ship (not reached — job
terminated at document)`. The `retry` fixture — already the exact shape of a job that
stopped at the test gate — asserts the trailing-hole wording. Falsified by reverting the
function: `retry` and `quarantine_skipped_phase` both fail, the other 23 pass, confirming
the two new assertions are what pin the change and not a byproduct of the existing corpus.

Verdicts, warn flags, exit codes and `SCHEMA_VERSION` (1.4.0) are unchanged across all 25
fixtures. This was deliberate: the report's *judgement* was correct in both field runs and
only its *wording* misled.

**F-77's lint is the interesting half.** Adding a third shared agent block would have been
worth little if it could rot out of one of ten copies, so `agent-blocks-lint.mjs` was
extended from two blocks to three in the same change, and the block was propagated by a
script that extracts it with the lint's own parser rather than by ten hand-edits. Falsified
by deleting the block from one agent file: the lint fails naming that file. This is the
mechanism SC-10/A2 built, used for the first time to land a NEW rule rather than to protect
an existing one.

**What is NOT verified here.** The F-73 resumption path is documentation and orchestrator
procedure — there is no code to test and no fixture to pin it, exactly as the worktree
lifecycle it extends has none. Its live drill is deferred: the next run against issue #24
should carry `execution.resume_from_job: "job_20260809_0003"` against that job's retained
worktree (113 files, branch `adws/job_20260809_0003/add-loose-pointer-drift-validato`) and
produce a `resumed_from` block classifying the two hand repairs as `ungated-carry-over`.
Until that runs, F-73 is *specified* and not *demonstrated*, and this section should not be
read as claiming otherwise.

**What this change cannot fix.** F-76 makes a REPAIRED defect leave a check behind. It does
nothing about the axis nobody has varied yet — nine Critic rounds missed two-document
manifests because no artifact anywhere said manifests can name more than one document, and
`criteria-to-checks` derives checks from criteria prose, which does not enumerate input
shapes. That gap is recorded and unremediated.

**A note on F-75.** The guidance that would have prevented the eleventh defect was written
by the orchestrator, into the right file, in the right directory, at the right moment — and
never read, because the builder's contract enumerated six fields and that was not one of
them. No component misbehaved. The whole defect lived in the space between two correct
components, which is where this project keeps finding them and where no component-level test
looks.

**And then this scope change did it again.** Review found that the first cut told ten
agents to work under `{scratch}/{jobId}/{phase}/attempt_{n}/{agent}/` and never bound
`{scratch}` — no dispatch passed it, no reference defined it. A rule delivered to the right
file with no one required to supply its binding: F-75, committed inside the fix for F-75,
by an author who had just written two thousand words about that failure mode. Everything
here passed its gate both times, because the gate reads files and this defect lived between
them. Recorded rather than quietly corrected, because the lesson is not "be careful" — it is
that this class survives self-review with a green suite, and the only thing that has ever
caught it in this project is a second reader. Eight of nine findings this round were real;
the full list is in `DPPD.md` §22.

### SC-13 tracking sync (2026-08-09, post-merge)

SC-13 merged as PR #55 (`ca0ba53`). Three narrative counts moved with it and are corrected
here: `README.md` and `scripts/local-ci/gate.sh` both said **24** report-verdict fixtures,
and `Makefile` advertised the Tier-1 suite as **108/24/7** — all now **25**, matching the
suite the gate actually runs. The historical counts in `SC3_PLAN.md`, `SC11_PLAN.md`,
`M5B_PLAN.md`, `ACCEPTANCE.md` and the earlier DPPD sections are left alone: those state
what was true when they were written, which is the point of them.

This is the **fourth** consecutive scope change to find an unasserted prose count drifting
(M-3a in the runners, SC-7 in `README.md`, SC-8 in the runner comment, now these three).
The suite sizes themselves are asserted by their harnesses; these narrative restatements
still have no second source that a gate compares them against, and the interval between a
count changing and someone noticing continues to be "the next time a human greps for it."

Gitignored `ci_logs/` pruned 98 files → 16, per the convention set in the SC-8 record
above: both append-only JSONL ledgers retained in full (135 gate + 57 orb records **at the
moment of the prune** — every run ever recorded), plus every per-run `.log` whose `run_id`
is cited anywhere in `docs/` and the six most recent. All 82 deleted transcripts were
verified present in their ledger BEFORE deletion — zero orphans — so no run lost its
record, only its transcript. The ledgers are append-only and every subsequent gate run adds
to them, so those two numbers are a timestamp, not a live count: the paragraph above this
one complains about exactly that, and the first draft of this one said "135 gate + 57 orb"
flatly and was wrong within three gate runs.

Branch cleanup: the eight fully-merged stale remotes (`docs/post-merge-install-record`,
`docs/pr48-review-correction`, `docs/sync-ci-ledger-record`, `docs/sync-sc12`,
`feat/install-integrity`, `feat/post-merge-install-reminder`, `fix/post-merge-trigger`,
`m5b/harness-improvement`) were each re-checked for unmerged commits against `origin/main`
— zero in every case — and deleted along with `feat/sc13-run-disposition`, leaving `origin`
carrying `main` alone until this sync branch was pushed. The repository working tree had
**no** untracked files;
`.adws-installs`, `.vscode/` and `ci_logs/` are gitignored-and-retained by intent, not
oversights, and a blanket `git clean -xdf` would have destroyed the install registry that
`make check-installs` reads.

---

## SC-14 (2026-08-09, audit M-6 findings F-80, F-82, F-83, F-86, F-87) — budgets and assertions

Plan: `SC14_PLAN.md`. Findings: `DPPD.md` §23 (M-6). Evidence base:
`docs/AUDIT_2026-08-09.md`. Three of the five findings are the same shape — a rule was
decided, written down, and given nothing that asserts it.

**Gate at HEAD: 16/16 steps pass** (15 existing + the new `no-eval`), parity **109/109**,
guard-ablation **18 accepted — 2 equivalent, 16 unpinned (budget 16)**, `skill-manifest`
version `358f7b7d28a7` → `3a92cd9c5355`.

### A1 — egress destination guard (F-80)

`scripts/local-ci/review.sh` is the only network egress in the repository and posted the
full branch diff to whatever `OLLAMA_HOST` named, with nothing in the output naming it.
Loopback is now allowed by default; anything else requires `REVIEW_ALLOW_REMOTE=1`; the
destination prints either way. Host parsing strips scheme, userinfo, path, query and port
by parameter expansion (bash-3.2 safe) and matches an exact allowlist.

| Falsification | Result |
|---|---|
| `OLLAMA_HOST=http://evil.example:11434` | **exit 2**, host named, no POST |
| same + `REVIEW_ALLOW_REMOTE=1` | proceeds; `WARNING: sending the branch diff to REMOTE host evil.example` |
| 12 URL forms swept (7 distinct hosts) | `user:pass@evil.example`, `localhost.evil.example`, `127.0.0.1.evil.example`, `evil.example/?x=localhost`, `exfil.attacker.net`, `[2001:db8::1]` all **BLOCK**; `localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`, bare `localhost:11434` all ALLOW |

No substring bypass: the allowlist matches the extracted host exactly, so a loopback name
appearing as a subdomain, in userinfo, or in a query string does not admit it.

### A2 — the no-eval rule becomes a hard rule and an assertion (F-82)

SC-13 classified an agent-authored shell string as Critical and wrote the rule into
`artifact-layout.md:344-352` alone — not a hard rule, not in the agents' security block,
asserted by nothing. Now in all three places.

- `SKILL.md` **hard rule 9** (+5 lines): a `reproduction.command` is a RECORD, never an
  execution channel; automated replay goes through an allowlisted runner keyed by
  `check_id`; `reproduction.files` entries resolve inside the attempt's `consensus/repro/`.
- `references/agent-shared-blocks.md` security block extended, propagated **byte-identically
  to all ten** `.claude/agents/adws-*.md`.
- New `scripts/local-ci/no-eval-lint.mjs`, gate step `no-eval`. Two rules over two scopes,
  because they are different claims: **sinks** (`child_process`, `exec*`, `spawn*`, `eval`,
  `new Function`, `vm`) in the **shipped tree only**; **`command` reads** *everywhere*.

The harness is deliberately exempt from the sink rule: `parity/` spawns `process.execPath`
on fixed script paths and `guard-ablation.mjs` instantiates mutated validator source with
`new Function` by design. Banning those would be a rule the project breaks on first use.
The first cut of this lint did ban them and reported 15 findings, every one legitimate
harness behaviour — recorded because it is the same false-positive class `requires-lint`
and `bash32-scan` each hit on their first cut.

| Falsification | Result |
|---|---|
| `require("child_process")` added to a shipped validator | **fails**, file + line named |
| `repro.command` added to `parity/run-parity.js` | **fails**, file + line named |
| `repro["command"]` (bracket spelling) | **fails**, file + line named |
| new sentence reworded in one agent only | `agent-blocks-lint` **fails** naming file + block |

### A3 — the `SKILL.md` line budget ratchet (F-83)

M-3b recorded the growth as *"357, 367, 379 — monotonic"* and then asserted the **500
ceiling**, which is the point at which the file is already too large. SC-10 cut the file to
337 and recorded that floor as a decision; SC-11/12/13 put back all 88 lines in ~24 hours,
because a decision with no mechanism is a measurement.

`parity/skill-line-budget.json` records `budget` plus a `history` of
`{ value, set_by, reason }`. `frontmatter-lint.mjs` now has three levels: NOTE at 350,
**FAIL above `budget`**, FAIL at ≥ 500 regardless.

**Seeded at 424** — the value audit M-6 observed — per operator decision, so the ratchet
starts where the file actually was and forces no compression pass. **A2 then grew the file
to 429**, and the budget was raised to 429 with the reason recorded in `history`. That is
the mechanism exercising itself on the change that introduced it, and the cost of hard
rule 9 is now visible in the diff rather than absorbed.

| Falsification | Result |
|---|---|
| append one line to `SKILL.md` | **fails**, budget file named |
| raise `budget` without appending `history` | **fails** — budget/history mismatch |
| raise `budget` **and** append `history` | passes |
| `budget: 600` with `SKILL.md` at 509 lines | **fails** at the NFR-3 ceiling |

Lowering the budget toward SC-10's 337 floor is a separate decision with a real prose task
attached; SC-14 deliberately did not take it.

### A4 — the unpinned register is read, ratcheted, and reported (F-86)

**A4a.** The baseline's `_doc` has required `reason`, `class` and — for `unpinned` — an
`owner` since M-5a, and `guard-ablation.mjs` read none of them. M-6 found all 19 entries
carrying `class: unpinned` and `owner: "SC-12 (unscheduled)"` long after SC-12 shipped: a
bulk assignment nobody had to justify and nothing could contradict. The tool now validates
the contract, caps `unpinned` at `unpinned_budget`, and reports the two populations
separately — one is permanent and costless, the other is debt that must shrink, and merging
them into `19 survivor(s)` was the defect.

**A4b — the triage corrected the finding.** The plan proposed closing five `drift-sentinel`
entries with five fixtures. A 931-input sweep across both gating modes, plus branch
instrumentation that throws on entry, found **four of the five were never debt**:

- `verdict:#5` (`:452`, `'fail' → 'pass'`) — **dead branch**. Every return path in
  `computeCTM` sets `zone` to `green`/`yellow`/`red`, so its `else` is unreachable. This was
  the plan's must-land entry and the audit's headline example; it is provably `equivalent`.
  **The audit overstated it and the remediation found that out** — recorded in
  `AUDIT_2026-08-09.md` §2 rather than quietly amended.
- `guard-off:#16` (`:263`, `if (max === 0)`) — reachable but **output-identical**: when
  `max === 0` every `abs` element is already `0`, so the mapped result and the fall-through
  agree, and the fall-through is taken because `max <= 1` holds. Reclassified `equivalent`.
- `guard-off:#6` and `#8` — not reached by any of 931 × 2 inputs, but their unreachability
  rests on an invariant spanning function boundaries that a later edit could invalidate.
  **Left `unpinned`.** Evidence is not proof; leaving them as debt fails closed.

**The one real gap, and the fixture that should have caught it.** `guard-off:#22` covers the
legacy YELLOW band. The pack already held `legacy-yellow-zone.json`, named *"returns warn
when entropy puts CTM in yellow zone"* — but entropy `0.25` gives `ctm 0.08`, below
`CTM_YELLOW` (0.1), so it lands in the **red** band and its own frozen expectation says
`zone: "red"`. Deleting the yellow rule left it green. **A fixture named for the rule it does
not pin is F-71's exact shape, inside the mechanism built to answer F-71.**

Closed by `legacy-yellow-band-reached.json` (entropy `0.18` → `ctm 0.15` → yellow/medium/warn,
entropy flat so `gradient_alert` stays false and the case pins the band alone). Parity
**108 → 109**, `EXPECTED_FIXTURE_TOTAL` updated in the same commit. `guard-off:#22` deleted —
the tool demanded it on its own via the stale-entry rule. Result: **18 entries — 2
`equivalent`, 16 `unpinned`**, all 16 re-owned `SC-12 (unscheduled)` → `SC-15`,
`unpinned_budget` seeded at 16.

| Falsification | Result |
|---|---|
| delete the new fixture | `guard-ablation` reports `guard-off:#22` a new survivor; `run-parity` fails its total |
| delete the yellow rule from the validator | new fixture **red** (`zone: "yellow" !== "red"`); **`legacy-yellow-zone` stays green** |
| strip `owner` from an unpinned entry | **fails**, entry named |
| add `owner` to an `equivalent` entry | **fails**, entry named |
| `class: "probably-fine"` | **fails**, entry named |
| `unpinned_budget: 15` against 16 | **fails**, counts named |

**Recorded, not fixed:** the baseline's `mutation` field is **truncated with an ellipsis** for
long conditions, so `drift-sentinel:guard-off:#0` and `#20` could not be replayed from the
register at all. A register whose entries cannot be reconstructed from the register must be
re-derived to audit. Left to SC-15 with the entries it affects.

### A5 — reference graph hygiene (F-87)

`references/validator-inputs.md` (132 lines) gained the `## Contents` block it was the only
reference over 100 lines to lack, and it is reachable through `task-contract.md`. All seven
references now carry a TOC, which is what makes a partial read safe.

**All thirteen sibling cross-links reviewed and deliberately left alone.** The plan expected
to redirect navigational ones at `SKILL.md`'s index; on inspection every one cites a
*specific* rule — *"`artifact-layout.md` rule 2"*, *"`phase-gates.md` 'Consensus' rule 5"*,
*"the accounting table in `phase-gates.md`"*. Replacing a precise citation with an index
pointer would make the reader hunt. The circular `phase-gates.md` ↔ `artifact-layout.md`
pair stays. **F-87 is therefore half-closed by design**, and the residue is stated rather
than dropped: a 601-line reference reached through a sibling can still be previewed rather
than read, mitigated by TOCs on both ends.

### Invariants held

No evidence-schema change, no `SCHEMA_VERSION` bump, no new terminal state / DECISION / exit
code. **No validator source was edited** — nothing under
`adws-pipeline/scripts/validators/` changed. One fixture added; no existing frozen
expectation rewritten (`legacy-yellow-zone.json` gained a corrective `note`; its `expected`
is history and stays). `cli-block-lint` unchanged (9 validators, 42-line wrapper);
`agent-blocks-lint` still 3 blocks × 10 agents, the security paragraph extended rather than
a fourth block added. `SKILL.md` 429 < 500 (NFR-3) and equal to its recorded budget.

### What review caught — including two security defects in the security fix

An independent review of the first cut returned twelve verdicts, six of them corrections.
Recorded in full because the two most important are indictments of the change itself.

- **The egress guard did not close F-80 (Critical).** `review.sh` validated that
  `OLLAMA_HOST` named a local address — and `curl` still honoured `http_proxy` /
  `https_proxy` / `ALL_PROXY`, which reroute a loopback URL to whatever the proxy names.
  Reproduced: with `http_proxy` set and `NO_PROXY` empty, `curl http://localhost:11434/...`
  exits 7 against the **proxy**, never having tried localhost. **A destination check the
  transport can override is not a check.** Fixed with `--noproxy '*'` on all three Ollama
  call sites (`lib.sh` ×2, `review.sh` ×1); re-verified that with every proxy variable set
  the review now reaches the real local Ollama.
- **The guard printed credentials (Major).** It echoed `$OLLAMA` raw, and the parser
  immediately above it exists *because* the URL may carry `user:pass@`. That message lands
  in `ci_logs/`. A change whose sibling finding (F-81) is *"secret redaction has no
  mechanical enforcement"* was about to write secrets into the repository itself. Fixed:
  output is now `http://[userinfo-redacted]@host:port`, so the presence of userinfo is still
  reported and its value never is.
- **`no-eval` missed two ordinary forms (Major).** `const { command } = repro` and
  `await import('vm')` both passed, while the lint's own header claimed `command` reads were
  caught *everywhere*. Widened to destructuring (plain and renamed) and to every module
  spelling of `vm` / `child_process` (static, dynamic, `require`, with and without the
  `node:` prefix). Eight forms now verified caught. The residual limit — a fully computed
  key, `repro[k]` — is stated in the source rather than papered over.
- **"Silent bumps are impossible" was overstated (Major).** The budget lint compares
  `budget` to the LAST history entry, so *rewriting* that entry instead of appending one
  passes. A file-local check cannot see prior state. Two responses: history values are now
  **monotonic** (the budget cannot be dropped to hide growth and raised again), and the
  claim is narrowed in the budget file's own `_doc` to what is true — growth is *recorded
  and visible in review*, because a rewrite shows as a modified line in `git diff` where an
  append shows as an added one. Not "the record cannot be forged".
- **The 931-input sweep was unreproducible (Major).** It justified two `class` changes the
  gate now enforces, and it lived in a scratch directory. **That is SC-13/F-77's own rule —
  a reproduction that cannot be re-run is a claim, not evidence — broken by the change that
  cites F-77 elsewhere.** The sweep is now `parity/guard-ablation-triage.mjs`, committed
  next to the baseline it justifies. Running it reproduces the recorded classification, and
  it is *more* honest than the scratch version: it refuses to replay `verdict:#5` at all,
  reporting `AMBIGUOUS — 'fail' matches 3 sites`, where the scratch probe silently mutated
  the wrong site and manufactured a false witness.
- **`F-87` was called closed in `WBS.md` and half-closed here (Minor).** The half-closed
  statement is the accurate one; `WBS.md` now says so.

Two verdicts corrected the record rather than the code: the sweep documentation said
"12 host forms" where 12 URL forms cover 7 distinct hosts (now stated precisely), and
`0.0.0.0` was described as loopback when it is the unspecified address — accepted
deliberately because connecting to it reaches a local listener, but the set is now called
*local* rather than *loopback*.

**Tier-2 evidence — resolved.** `orb-ci.sh` clones the *committed* tree, so the first
`make ci-orb` run reported for SC-14 exercised `21b7fa0` — the pre-SC-14 commit — with 15
steps, not the change. The reviewer caught it and confirmed 16/16 on both Node 20 and 24
against an ephemeral snapshot. SC-14 was then committed as **`3ec8e6b`** (signed) on
`sc14/budgets-and-assertions` and Tier 2 re-run against it:

```
[orb] node20: build=PASS run=PASS (6s)
[orb] node24: build=PASS run=PASS (6s)
{"event":"orb_ci","run_id":"20260809T230215Z","git_commit":"3ec8e6bfd20fbd271a34671d379b94af09b64d2a",
 "branch":"sc14/budgets-and-assertions","platform":"linux/arm64","overall":"pass",
 "legs":[{"node":"20","build":"pass","status":"pass","duration_s":6},
         {"node":"24","build":"pass","status":"pass","duration_s":6}]}
```

`ci_logs/20260809T230215Z.orb.log` records **32 `-> PASS` steps — 16 per leg**, `no-eval`
among them, so the container ran the SC-14 gate and not the pre-SC-14 one. This is the
general hazard, worth stating once: **a Tier-2 record proves something about the commit it
names and nothing about an uncommitted tree**, and the two are easy to confuse when the
working tree is dirty. Tier 1 tests the working tree; Tier 2 tests `HEAD`.

### CodeRabbit round (PR #57) — the egress guard was defeated a second time

Eight findings: one Critical, three Major, four Minor. **Six were real.** The Critical is the
one that matters, and it is the same guard failing a second time in the same change.

- **The authority parse was ordered wrong (Critical).** The guard removed userinfo with a
  greedy `##*@` **before** dropping the path, so any `@` later in the URL ate the real host.
  `http://evil.example/path@localhost:11434` parsed as `localhost` and was accepted as local
  while `curl` connected to `evil.example` — a total bypass. Reproduced on three vectors
  (path, query, fragment). Fixed by isolating the RFC 3986 authority first (cut at the first
  `/`, `?`, `#`) and only then stripping userinfo; re-verified that all five bypass vectors
  block and six legitimate local forms still pass. **The same defect sat in the redaction
  helper**, which cut the raw URL at an arbitrary `@`, so the printed destination could have
  disagreed with the guard; it is now built from the parsed authority.
- **Raw `$OLLAMA` survived on the failure path (Major).** The reachability error printed the
  unredacted URL. Failure messages are the ones that get pasted into issues. Now
  `$ollama_display` there too — every output path is redacted, not just the happy one.
- **Agents were told to record command text and never to redact it (Major).** SC-14 added a
  rule that a `command` is a RECORD, and said nothing about what may be inside it. A command
  line carries tokens in flags, environment assignments and credential-bearing URLs as
  readily as captured output does. The shared security block now says so, in all ten copies.
- **`equivalentCount` was a subtraction (Minor).** `entries.length - unpinned.length` counted
  an entry with a missing or misspelled `class` as `equivalent` — the summary line absorbing
  exactly the entries the validation rejects. Now counted explicitly.
- **A stale `113/113` (Minor)** survived in the plan from the original five-fixture proposal;
  the triage moved the total by one, not five. Corrected, with the reason kept.
- One untagged code fence (Minor), tagged.

**Two were declined, with reasons.** The `skill-manifest.json` finding is a **false
positive**: agent entries live in their own `agents` map with bare filenames, which is
exactly what `skill-manifest.mjs` writes and what `skill-check.js` reads — both pass, as does
the gate step. And linking the `validator-inputs.md` TOC entries would make it the only one
of seven references whose Contents block uses links; the suggested diff also wrapped the
anchors in backticks, which would not render as links at all.

**What this round says about the change.** F-80's guard has now been broken twice in review
and neither time by the check itself: once by the transport underneath it (`curl` honouring
`http_proxy`) and once by the parse feeding it. Both times the *rule* was right and something
beneath it was never asked to comply — the pattern already recorded in `SC14_PLAN.md`. A
lexical URL check is a poor instrument for an egress decision, and the honest reading is that
this guard is worth its cost only because the alternative was no check at all. If a third
bypass appears, the answer is not a fourth patch: it is to stop parsing URLs and pin the
destination another way.

### Still open after SC-14

F-81 (secret redaction unenforced, radius widened by SC-11 + SC-13), F-84 (input-dimension
coverage has no owner) and F-85 (cross-job memory is manual) are unremediated and owned by
SC-15 — each needs a decision before it needs code, per `SC14_PLAN.md` "Deferred". The 16
remaining `unpinned` entries are debt with a budget and an owner for the first time, which
is not the same as being closed. **F-87 is half-closed by design**, with the residue stated
in A5 above.

---

## Post-merge sync — PR #57 / SC-14 (2026-08-09)

Merged as `4a03dce` (merge commit) from `sc14/budgets-and-assertions`, three commits:
`3ec8e6b` (implementation), `8cd1cd7` (Tier-2 evidence), `ff4c843` (CodeRabbit round).

**Checks at merge.** Tier 1 16/16 and Tier 2 Node 20/24 both PASS via the `pre-push` hook on
`ff4c843`. CodeRabbit `pass`. **CodeQL `Analyze` failed in 2 s** with *"The job was not
started because your account is locked due to a billing issue"* — the org billing lock
recorded across eight prior runs, not a code result, and not a required check (`main` carries
no branch protection: `GET /branches/main/protection` → 404). Recorded rather than waved past.

**Ledger counts at the moment of this sync** — both JSONL ledgers are append-only and every
later run adds to them, so these are a timestamp and not a live claim:

| Ledger | Records | Outcome |
|---|---|---|
| `ci_logs/local_ci.jsonl` | 152 | 147 pass, **5 fail** |
| `ci_logs/orb_ci.jsonl` | 65 | 65 pass |

The five reds are unchanged from the set M-6 analysed — `guard-ablation` ×2, `requires`,
`bash32-scan`, `skill-manifest` — so SC-14's 13 additional gate runs added no new red. The
latest record carries **16 steps**, which is the SC-14 gate.

**Branches.** `origin` carries **`main` alone**. `sc14/budgets-and-assertions` was deleted by
`gh pr merge --delete-branch`; `docs/sync-sc13` was already gone on the remote from the SC-13
sync; `git fetch --prune` cleared both stale remote-tracking refs locally. No local branch
other than `main` exists, and `git rev-list --count origin/main..origin/docs/sync-sc13`
returns nothing because the ref is gone — checked before pruning, per the SC-13 convention of
re-verifying a branch for unmerged commits rather than trusting its name.

**Untracked files: none.** `.adws-installs`, `.vscode/`, `ci_logs/`, `parity/PARITY_REPORT.md`
and the generated `parity/execution-report-fixtures/*/artifacts/*/execution_report.{json,md}`
are gitignored **and retained by intent** — the first is the install registry
`make check-installs` reads, the last are regenerated by the suite on every run. A blanket
`git clean -xdf` would destroy the registry, which is why this record names them rather than
leaving "clean the untracked files" as an instruction someone could execute literally.

**Stale-count sync.** `AUDIT_2026-08-09.md` now states up front that every count in it is as
of 2026-08-09 *before* SC-14, and notes the two figures SC-14 moved (gate 15 → 16 steps,
parity 108 → 109). `DPPD.md` §23's `parity` line was rephrased from a live claim to a
timestamp — and updated with the fact that SC-14 gave the suite its first recorded red on a
real rule, since deleting the legacy yellow-band rule now turns a fixture red. The SC-13
records at `VERIFICATION.md` §SC-13 and the prune paragraph above are **not** rewritten: they
are history and were already phrased as timestamps.

**Installed copies are STALE — the post-merge hook said so on merge.** All three registered
installs still carry `358f7b7d28a7`; source is now `549226ba94f0`:

```text
[check-installs] source version 549226ba94f0
  ~                           STALE     installed 358f7b7d28a7 ≠ source 549226ba94f0
  ~/Dev/etherealogic-website  STALE     installed 358f7b7d28a7 ≠ source 549226ba94f0
  ~/Dev/agentic-starter-kit   STALE     installed 358f7b7d28a7 ≠ source 549226ba94f0
```

This is F-72's mechanism working as designed. Reinstall is deliberately left to the operator:
it writes into three repositories outside this one.

> **Correction (2026-08-09, made while performing the reinstall).** The paragraph above
> originally read *"SC-14 is the release that fixes two egress defects, and until someone
> runs `./install.sh`, every live run uses a copy that has neither."* **That is false.** The
> egress fixes are in `scripts/local-ci/review.sh` and `scripts/local-ci/lib.sh` — this
> repository's own Tier-3 CI harness. **The harness is not shipped.** `install.sh` and
> `skill-manifest.json` cover 30 files: `adws-pipeline/` (SKILL.md, 7 references, 12 scripts)
> and the 10 agent definitions. No install contains `review.sh` at all, verified by `find`
> across all three. A stale install could not have carried the egress defect because it never
> carried the file.
>
> What SC-14 actually delivers to an install is F-82 and F-87: `SKILL.md` hard rule 9, the
> extended security block in all ten agents (including the `command`-redaction clause added
> in the CodeRabbit round), and the `validator-inputs.md` TOC. F-80, F-83 and F-86 are
> source-repo-only — harness, budget file and baseline.
>
> The reinstall was still correct: those three installs were four scope changes behind. But
> the *reason* recorded here was wrong, and it was wrong in the direction that overstates
> urgency — the F-56 failure mode, a channel firing louder than the facts support. Recorded
> rather than silently edited, because a tracking document that quietly fixes its own false
> claims is worth less than one that shows them.

### Reinstall record — 2026-08-09

All three registered installs taken from `358f7b7d28a7` to `549226ba94f0` with
`./install.sh <target> --force`. Each was verified **intact** (matching its own manifest, so
no local edits to lose) *before* the reinstall; `--force` was required because a
non-interactive run refuses by design, and it backs up first regardless — SC-10/F-68.

| Install | Result | Backup |
|---|---|---|
| `~` (`--global`) | CURRENT `549226ba94f0`, intact, 30 files | `.adws-backup-20260809T233249Z` |
| `~/Dev/etherealogic-website` | CURRENT `549226ba94f0`, intact, 30 files | `.adws-backup-20260809T233253Z` |
| `~/Dev/agentic-starter-kit` | CURRENT `549226ba94f0`, intact, 30 files | `.adws-backup-20260809T233253Z` |

`make check-installs` → *"OK — 3 known install(s) current."* Backups are kept, never pruned
automatically.

**Content verified, not just the version.** A matching `skill_version` is the weaker half of
F-72 — MODIFIED (version right, files wrong) is the more dangerous case — so each install was
checked for the SC-14 changes that actually ship:

| | `~` | website | starter-kit |
|---|---|---|---|
| `SKILL.md` hard rule 9 (F-82) | present | present | present |
| agent `command`-redaction clause | 10/10 | 10/10 | 10/10 |
| `validator-inputs.md` TOC (F-87) | present | present | present |

**`review.sh` is absent from all three**, which is correct and is the subject of the
correction above: F-80's egress fixes are harness-only and have never been part of an install.
"Unregistered copies are not covered" remains true — `check-installs` knows only what
`.adws-installs` records.

---

## Post-merge sync — PR #60 / §6.2 controller spike (2026-08-11)

Merged as `c79260c` (merge commit) from `spike/controller-step1-hardening`, two commits:
`17b8944` (the four fixes the second adversarial review required), `98a67cb` (CodeRabbit
round). This is the first entry in this file for work **outside the shipped tree** — see
"What an install carries" below, which is the point the SC-14 correction above was about.

**Checks at merge.** Tier 1 16/16 and Tier 2 Node 20/24 both PASS via the `pre-push` hook on
`98a67cb`. CodeRabbit `pass`. **CodeQL `Analyze` failed in 2 s** — the same org billing lock
recorded across every prior run, and again not a code result: the job record carries
`"steps": []`, so nothing ran. Not a required check (`main` carries no branch protection:
`GET /branches/main/protection` → 404). Recorded rather than waved past.

**Ledger counts at the moment of this sync** — both JSONL ledgers are append-only and every
later run adds to them, so these are a timestamp and not a live claim. Each row is therefore
anchored to the last record it counts, which is the boundary the number was true at:

| Ledger | Records | Outcome | Through run_id |
|---|---|---|---|
| `ci_logs/local_ci.jsonl` | 163 | 157 pass, **6 fail** | `20260811T043646Z` |
| `ci_logs/orb_ci.jsonl` | 70 | 70 pass | `20260811T043250Z` |

**This round added the sixth red, and it was a real finding.** The five prior reds are the set
M-6 analysed (`guard-ablation` ×2, `requires`, `bash32-scan`, `skill-manifest`); the new one is
`20260811T042034Z` on `main`, dirty — `bash32-scan` catching an unguarded `"${PHASES[@]}"`
under `set -u` in `spike/adws-controller/run-step1.sh` (F-13, the macOS bash-3.2 defect). Two
things worth recording about it. The scan reaches `find . -name '*.sh'`, so it covered a new
directory nobody wired it to; and the hazard was in code written the day before by someone who
had read the rule. Fixed with the documented safe idiom before the branch existed. Latest gate
record carries **16 steps**.

**Branches.** `origin` carries **`main` alone**. `spike/controller-step1-hardening` was deleted
by `gh pr merge --delete-branch`, which also removed the local branch;
`git fetch --prune` cleared the stale remote-tracking ref. No local branch other than `main`
exists. Nothing else was pending: the remote listed exactly two heads before the merge (`main`
and the spike branch), so unlike the SC-13/SC-14 syncs there was no third ref to re-verify for
unmerged commits.

**Untracked files: none.** `.adws-installs`, `.vscode/`, `ci_logs/`, `parity/PARITY_REPORT.md`
and the generated `parity/execution-report-fixtures/*/artifacts/*/execution_report.{json,md}`
are gitignored **and retained by intent**, unchanged from the PR #57 inventory above. The
warning there is repeated because it did not stop being true: a blanket `git clean -xdf` would
destroy the install registry `make check-installs` reads. Also confirmed absent: any
`artifacts/` tree at the repo root — the spike drivers write to `mktemp -d`, so a full matrix
run leaves the working tree clean, and `git status --porcelain` under `parity/` is empty
afterwards even though the matrix copies, chmods and scores all 25 fixture trees.

**What an install carries: nothing from this PR.** `skill-manifest` digests only
`adws-pipeline/`, and the merge touched no file under it — `git diff HEAD~1 HEAD --
adws-pipeline/ parity/` is empty. Source version is unchanged at `549226ba94f0` and
`make check-installs` reports all three registered installs **CURRENT**, so no reinstall is
owed. Stating it explicitly is the SC-14 correction's lesson applied prospectively: the failure
mode there was a record that overstated what a merge delivered to an install, and the honest
default is to say when a merge delivers nothing.

```text
[check-installs] source version 549226ba94f0
  ~                           CURRENT   549226ba94f0
  ~/Dev/etherealogic-website  CURRENT   549226ba94f0
  ~/Dev/agentic-starter-kit   CURRENT   549226ba94f0
```

**Stale-count sync.** `SPIKE_CONTROLLER_PLAN.md` gains a status section recording where the
spike actually stands against its own five questions, including the two places the plan was
not followed and why. `SIMPLIFICATION_ANALYSIS.md` §6.2 gains a one-line pointer to that
status. Neither document is rewritten: the plan's §6 questions and the analysis's
recommendation are the record of what was intended, and editing them to match the outcome
would destroy the only evidence of the difference.

### What the spike round is worth recording here

The §6.2 hypothesis is **not** decided by this round and the spike's own `FINDINGS.md` says so.
What is settled is narrower and belongs in this file because it is a verification result: a
controller-generated evidence tree can be driven through the **unmodified** `execution-report.js`
and scored, and the specific way the previous round got that wrong — a job reaching
`final_status: completed` on a structurally incomplete tree that the scorer then QUARANTINEs,
with **no post-gate mutation involved** — is now refused at three independent layers and pinned
by an asserted regression.

Two process facts, recorded because this repository's argument for its own expense rests on
them (see `SIMPLIFICATION_ANALYSIS.md` §4):

- **Three consecutive rounds of this spike were overturned by an independent pass**, each time
  on a claim the primary pass had explicitly self-checked. The third refutation came with a
  reproducible counterexample.
- **The new fixture-ingest matrix caught a defect in its own driver** on first run:
  `mk-risk-trace.js`, which supplies the FR-12 risk trace the minimal fixtures lack, was
  *overwriting* the `review-risk-assess` trace of `quarantine_trace_mismatch{,_inverse,_case}`
  — the exact file each of those three fixtures hides its defect in. All three silently turned
  clean and promoted. This is the second time a spike harness was found mutating a fixture
  while claiming to replay it (the first was the runtime `chmod` in the previous round). Both
  times the harness was wrong before the controller was, which is an argument for fixture
  corpora that encode defects the harness has to preserve rather than merely read.

---

## Post-merge sync — PR #62 / §6.2 controller spike, step 2 (2026-08-11)

Step 2 of the §6.2 spike (retries and rewinds) merged as `c9d517f` (squash of three commits
on `spike/controller-step2-retries-rewinds`). Same shape as the PR #60 entry: throwaway code
under `spike/`, **nothing shipped**.

### What an install carries from this PR: nothing

`git diff --stat -- adws-pipeline/ parity/` is empty across all three commits, so
`skill-manifest` — which digests only `adws-pipeline/` — is unchanged and
`make check-installs` reports the three known installs still CURRENT at the pre-existing
digest. No reinstall is required or implied by this merge.

### Checks at merge

| Check | Result |
|---|---|
| `make ci` gate (Tier 1) | PASS, 16/16 — run_id `20260811T062234Z` |
| `make ci` orb (Tier 2, Node 20 + 24) | PASS |
| `run-step1.sh` / `-negative` / `run-counterexample.sh` | exit 0 |
| `run-step2.sh` | exit 0, 103 assertions over twelve jobs |
| `run-ingest-matrix.js` | exit 0 — 25 fixtures, MISMATCH 0, LIMIT 0 |
| CodeQL `Analyze (javascript-typescript)` | fail in 2s, **zero steps executed** — the account billing lock, not a code result |
| `git status --porcelain` after a full driver run | clean |

Ledger state after the final validation run on merged `main`: 45 gate logs, 29 orb logs in
`ci_logs/` (both counts true through run_id `20260811T062234Z`; a later run moves them).

### The result worth recording, and it is not a flattering one

Step 2 answered the plan's Q3 (budget-as-code) and Q4 (idempotency) with assertions. It also
**gave up a property step 1 had**: `execution-report.js` has no gate over the test phase's
`checks[]` and never reads `classification`, so a controller that owns retries and rewinds
must own a gate the scorer is silent on.

**Every defect found in step 2 landed in exactly that gate**, and every one was the same error
— treating "no failure detected" as "a success was established":

- an automated review found that F-76's regression-coverage check identified a check row by its
  whole serialized value, so a *changed* pre-existing row discharged the repair's debt while the
  new assertion never ran;
- an independent verification round then found **two fail-OPEN cases**: rows carrying nothing
  but a `check_id` passed the gate outright, and after the first fix, simply *renaming* the old
  assertion still discharged the debt.

Three successive row identities failed for one reason: **every candidate was a field the tester
writes, and the tester is the party the check constrains.** The controller now mints the
regression id itself. That is a deviation from the letter of SC-13/F-76 and is recorded as a
question for the skill rather than a spike-local choice — as written, F-76 asks the
orchestrator to verify a property the evidence schema cannot express.

### A limit of every "make ci PASS" claim in this file, for spike code

`scripts/local-ci/gate.sh` validates the **shipped** paths. That is correct — the spike must
not be able to affect them — but it means a green gate has never been evidence about
`spike/`. A NUL byte in `adws-run.js` and all four defects above survived several green runs.
`run-step2.sh` now ends with its own `node --check` / `bash -n` / NUL-byte sweep. Any future
verification claim about spike code has to say which of the two gates it rests on.

### Process facts, continuing the PR #60 entry

- **Step 2 went through two review rounds and both found real defects**, bringing the running
  count to five consecutive spike rounds overturned by an independent pass. In every case the
  primary pass had explicitly self-checked the claim that fell.
- **My own fixtures could not catch any of the four**, because I wrote them from the same
  understanding that produced the code. The two counterexample fixtures now in the corpus
  (`test_bare_ids`, `test_pass_renamed_structural`) were both constructed by reviewers.
- The second CodeRabbit pass was **rate-limited**, so commits 2 and 3 of the PR are unreviewed
  by it. The check reported `pass`; that status was not a review, and is recorded here so the
  green check is not later read as one.

## Post-merge sync — PR #64 / §6.2 controller spike, step 3 (2026-08-11)

Step 3 of the §6.2 spike — **one live `adws-planner` dispatch**, which answers the plan's Q1
— merged as `1ce5307` (squash of three commits on `spike/step3-live-dispatch`). Same shape as
the #60 and #62 entries: throwaway code under `spike/`, **nothing shipped**.

### What an install carries from this PR: nothing

`git diff --stat ba2f9d2..1ce5307 -- adws-pipeline/ parity/` is empty, so `skill-manifest` —
which digests only `adws-pipeline/` — is unchanged and `make check-installs` reports the three
known installs still CURRENT at the pre-existing digest. No reinstall is required or implied.

### Checks at merge

| Check | Result |
|---|---|
| `make ci` gate (Tier 1) | PASS, 16/16 — run_id `20260811T133742Z` |
| `make ci` orb (Tier 2, Node 20 + 24) | PASS — run_id `20260811T133752Z` |
| `run-step1.sh` / `-negative` / `run-counterexample.sh` / `run-step2.sh` | exit 0 |
| `run-step3.sh` (new) | exit 0, 69 assertions over sixteen jobs (the driver reports its own count; see the PR #66 entry for why the first figure was wrong) |
| `run-ingest-matrix.js` | exit 0 — 25 fixtures, MISMATCH 0, LIMIT 0 |
| `verify-canonical.js` on the live tree | CANONICAL OK |
| CodeQL `Analyze (javascript-typescript)` | fail in 3s, **zero steps executed** — the account billing lock, not a code result |
| `git status --porcelain` after a full driver run | clean |

Ledger state after the final validation run on merged `main`: 52 gate logs, 36 orb logs in
`ci_logs/`.

### The result: Q1 answered, and the reason it was worth running

One real `adws-planner` subagent through `next → Agent tool → record`, at the tier the
controller advertised, into the directory it named, against a detached `git worktree` so it
could not reach the checkout. Gate `pass` from a `task-normalize` run the controller really
performed; tree CANONICAL OK. Evidence archived at
`spike/adws-controller/fixtures/live_plan_attempt/` and replayed by `run-step3.sh`, so the
result is re-checkable without spending another subagent run.

**The live dispatch found two defects in twenty minutes, in code two adversarial rounds had
already read closely.** Both had one cause — the controller and the phase agent write the
*same file* by instruction, and the controller read that file's existence as its own act:

- the run went **terminal before `record` ran**, because the planner writes
  `phase_manifest.json` with `gate_result: null` exactly as `adws-planner.md:21` instructs,
  and the sequencing oracle read that as an undecided verdict;
- an agent writing `gate_result: "pass"` into that same file was **believed**, and `next`
  said dispatch `build` — the builder would have run against a gate the planner granted
  itself.

Neither was reachable from the mocked path: `NEVER_INGEST` means a replayed attempt
structurally cannot contain an agent-written `phase_manifest.json`. **The mock was not a weak
test of that behaviour — it was no test of it at all**, and nothing in the mocked suite could
have revealed which. The six phases that have still never run live are in exactly the position
the plan phase was in before it ran.

### A finding that cost no dispatch, and is the sharpest of the three steps

Running the plan gate's own validator over the fixture corpus: **all 25 fixtures record
`plan-coherence: pass` over contracts `task-normalize` scores `fail`** — `promote_clean`
included, the tree this spike has driven to PROMOTE since step 1. Every one of those traces
omits the `output` key SC-8/F-55's mismatch check reads, so the check built to catch exactly
this is **inert against all of them, including the four fixtures built to test mismatch
detection**.

This does not make the corpus wrong to score as it does — they are scorer fixtures, and a
hand-authored `pass` is a legitimate stimulus. It means the corpus cannot be used as evidence
that a real run's plan gate ever passed. Reproduce with the one-liner in `FINDINGS.md`
§Reproduce.

### Two questions this spike now raises FOR the skill

1. **SC-13/F-76 row identity** (from step 2, unchanged): the property F-76 asks the
   orchestrator to confirm is not decidable from the id the rule names.
2. **`gate_result` lives in the agent's file** (new): it is the orchestrator's designated
   post-hoc field, inside a file the agent specs instruct the agent to write. Every
   orchestrator — the prose one included — therefore needs a decision record outside that
   file to know its own decisions. The spike added `.decisions.json` for itself; the shipped
   artifact layout has no equivalent.
   **There is no permission behind such a record.** The orchestrator and its subagents are the
   same OS principal, so no `chmod` separates them and the boundary is a contract ("never
   write outside your attempt directory"). A ledger does not make forgery impossible — it
   makes forgery require *violating* a prohibition rather than *following* an instruction. Both
   defects above were agents doing exactly as told, which is the class it closes.

### Process facts, continuing the PR #60 and #62 entries

- **Step 3 went through two review rounds and both found real defects**, bringing the running
  count to **seven** consecutive spike rounds overturned by an independent pass.
- Both rounds landed on the *same fix*, twice: the first version of finding 19's fix keyed
  authorship to the `provenance` block **inside** the agent-written manifest (rejected — a
  discriminator inside the forgeable region is not an authorization record); the second stored
  the verdict in the ledger **without comparing it** to the manifest, so a recorded `fail`
  could still be flipped to `pass` after recording. Writing up a weakness in prose is not a
  substitute for closing one that costs fifteen lines.
- One review request was **declined with reasons rather than implemented**: a test asserting
  that a forged ledger plus an agent-authored `gate_result` cannot advance the job would
  assert something false. The driver instead asserts the three cases that hold and declares
  the fourth (a *consistent* forgery of both files) as a limit.
- The third CodeRabbit pass was **rate-limited**, so commit `0716d1c` is unreviewed by it. The
  check reported `pass`; that status was not a review. Same as #62, and recorded here for the
  same reason.
- `make ci` remains **not evidence about `spike/`** — it validates the shipped paths only.
  `run-step2.sh` and `run-step3.sh` each carry their own syntax and NUL sweep. `run-step3.sh`'s
  NUL check was itself wrong on first run (`grep $'\x00'` is an empty pattern in bash and
  matched all 68 files); fixed to the python3 method `run-step2.sh` already used.

### Where §6.2 stands

**Q1–Q4 answered; Q5 half measured and still undecided.** Round trips are 2 model turns per
phase in steady state and the handshake payload is ~1.1 KB per phase against the 170,249
tokens the dispatch it carried cost (~0.2%) — both inside the plan's bar. The SKILL.md
line-delta and the token-behaviour half are **zero measured**. **Step 4 decides**, and
`SPIKE_CONTROLLER_PLAN.md` §11 says not to add rewind families, validators, phases, or resume
logic before it.

## Post-merge sync — PR #66 / §6.2 spike, `finalize` on the sequencing oracle (2026-08-11)

Merged as `7c3e5ad`. A follow-up to #64 opened by an **independent post-merge audit** whose
verdict was *"partially confirmed — the merge and most reported checks are real, but the
ledger hardening is incomplete."* It was right; both cases were reproduced before anything
was changed. Throwaway code under `spike/`, **nothing shipped**
(`git diff --stat -- adws-pipeline/ parity/` empty; installs unaffected).

### The defect

`cmdFinalize` decided terminal readiness by walking the manifests itself — step 1's shape,
which survived every round since because `next` and `record` were both on `expectedNext()`
and **nobody asked whether `finalize` was.** It was not, so the `.decisions.json` ledger #64
introduced was bypassable by calling one verb instead of another:

| tree | `next` said | `finalize` did |
|---|---|---|
| seven clean phases, ledger **deleted** | `dispatch plan/attempt_1` | exit **0**, `completed`, scorer **PROMOTE** |
| seven clean phases, ledger says test **failed** | `terminal` / **QUARANTINE** | exit 0, **`completed`** |

`finalize` now asks `expectedNext()` and nothing else: it refuses when the oracle still wants
a dispatch (leaving `final_status` untouched), and takes the oracle's verdict when there is
one, so an integrity halt terminates in the QUARANTINE class rather than as a retriable
`failed`. `run-step3.sh` S5b drives a real seven-phase job and asserts both rows.

### The pattern, now named in the plan

Findings 12, 14, 15, 18, 19 and 22 are **one error in six costumes**: a check that establishes
*something else*, read as establishing the thing that matters. `SPIKE_CONTROLLER_PLAN.md` §11
carries the operational form — *check that a new verb consults the oracle before it consults
the tree; that is three defects from the same omission.*

### Two reporting corrections, both from the same audit

- **The step-3 assertion count was published as 58. The true figure is 69.** Both were wrong:
  `grep -c PASS` also matched the final `STEP 3 PASS` banner (the audit counted 57 and was
  closer), and four checks in S1 were *silent on success*, so they never emitted a PASS line
  at all. The driver now reports its own count, every check prints on both branches, and the
  two figures agree by construction. **A count derived by grepping prose is not a measurement**
  — the same class of error as the findings above, in the reporting rather than the code.
- **The `170,249`-token denominator behind the ~0.2% handshake figure is not in the evidence
  tree.** It is the Agent tool's own `subagent_tokens` report; the controller writes token
  fields as `null` per SC-11/A3 because they are structurally unavailable to an orchestrator
  in this runtime. It is a **single observed measurement, not a reproducible one**, and
  `FINDINGS.md` now says so at the point the number appears. An audit checking the archived
  manifest will correctly find nulls there.

### Two audit findings accepted without change

- **The live dispatch is not independently reproducible.** The raw Agent-tool event and the
  complete live tree were not retained, and `fixtures/live_plan_attempt/README.md` already
  discloses that the agent-authored manifest is *transcribed* from the run rather than copied
  (`record` overwrote the original in place). The archived output replays to a real
  `task-normalize` pass, which is what `run-step3.sh` asserts; the historical dispatch itself
  is not re-derivable and should not be described as if it were.
- **"Everything green" applied to local and relevant checks, not to hosted status.** CodeQL
  failed in 3s with zero steps executed on every PR in this series — the account billing lock.
  Recorded here so the phrase is not read as covering it.

### Review coverage on this PR

CodeRabbit reviewed `7c3e5ad` and reported **no actionable comments** — a real review this
time, unlike the rate-limited `pass` on #64's final commit and on #65. The distinction is in
the check's description string (`Review completed` vs `Review rate limited`) and is worth
checking before reading a green CodeRabbit status as coverage.

### Checks at merge

| Check | Result |
|---|---|
| `make ci` gate (Tier 1) | PASS, 16/16 — run_id `20260811T143856Z` |
| `make ci` orb (Tier 2, Node 20 + 24) | PASS — run_id `20260811T143906Z` |
| all six drivers | exit 0; `run-step3.sh` 69 assertions over sixteen jobs |
| `run-ingest-matrix.js` | exit 0 — 25 fixtures, MISMATCH 0, LIMIT 0 |
| CodeQL | fail in 3s, zero steps — billing lock, not a code result |
| `git status --porcelain` after a full driver run | clean |

### Where §6.2 stands — unchanged by this PR

Q1–Q4 answered; **Q5 half measured and still undecided**; step 4 decides. This PR fixed a
defect in step 3's implementation and corrected two published numbers. It moved no question.

## Post-merge sync — PR #68 / §6.2 spike, step 4 — the go/no-go (2026-08-11)

Merged as `7d50b2c`, squashed, branch `spike/step4-line-delta` deleted. **This closes the
§6.2 controller spike**: all four steps of `SPIKE_CONTROLLER_PLAN.md` §10 are done and all
five questions are answered. Throwaway code under `spike/`, **nothing shipped**
(`git diff --stat -- adws-pipeline/ parity/` empty throughout; installs unaffected).

### What an install carries from this PR: nothing

Same as #60/#62/#64/#66. `skill-manifest` digests only `adws-pipeline/`, and nothing there
changed. An install made before this merge and one made after are byte-identical.

### The verdict, and the two numbers that disagree

Q5 asks whether "X lines of prose are replaced by Y lines of code + Z lines of interface".
Measured:

| | |
|---|---|
| **X** | 705 of 1,030 lines in Q5's own scope (68.4%); **1,300 of 1,643** across all four orchestrator-facing documents (79.1%) |
| **Y** | **1,526** lines covering 11 of 20 rule families; **~1,704** projected (linear, not a floor) |
| **Z** | **151** |

As a **line** delta that is a net **increase of ~212 lines** — the kept prose lives inside the
151-line interface, not beside it. As **instruction mass the orchestrator must load and
interpret per run**, it is a reduction on both ends of a bracket nobody has instrumented,
with the measured handshake included in each:

| scenario | before | after + handshake | of before | headroom |
|---|---|---|---|---|
| full-document — each reference read once | 124,008 | 25,944 | **20.9%** | **12.22×** |
| no-reference — `SKILL.md` only, ever | 30,012 | 18,100 | **60.3%** | **2.36×** |

Handshake: **8,738 bytes** over a complete seven-phase run, **16 controller messages
measured**; 2 model turns per phase **inferred** from step 3's live dispatch — step 4's run
was shell-driven over canned outputs with no model in the loop.

**GO on the architecture, argued from 2.36×**, under four conditions recorded in the plan's
§11: the win is relocation and not reduction; the margin is a bracket whose low end sits near
§9's own "~2–3 round trips" bar rather than far above it; a go is not a clearance to skip live
validation of the six phases that have never run; and Q5's unmeasured reasoning half is
**load-bearing at 2.36×** rather than merely qualifying, which makes it the highest-value
experiment left — ahead of any unimplemented rule family.

### The finding that matters most, because it is about this document's own genre

**Finding 23: the plan's own success criterion asks for the wrong measurement.** Lines are a
proxy; instruction mass is the property. That is the *seventh* appearance of the error
findings 12/14/15/18/19/22 named, and it had been sitting in `SPIKE_CONTROLLER_PLAN.md` since
the plan was written. A reader who takes Q5 literally reads this spike's own numbers as a
**no-go**.

**Finding 26** is the cleanest single datum for §6.1: `references/validator-inputs.md` is
**140 of 140 lines machine work** — an entire shipped reference whose only content is telling
a probabilistic model how to assemble nine deterministic function calls.

### The defect this PR shipped and then fixed (finding 27)

The first cut stamped `controller_bytes` into `.step4-handshake.json` and compared it, and
the commit message called that "self-invalidating". It was not:

```
action: 'finalize'  ->  action: 'terminal'      # same length, byte-for-byte
```

Size unchanged at 88,913, the check passed, and a stale 8,738 was reported for a controller
that no longer produced it. **File size is a proxy for file content — finding 23's error,
committed in the commit that named finding 23.** Now SHA-256, an absent digest reads stale,
and `run-step4.sh` S5 runs that exact probe as a regression.

Worth recording for the same reason the #62 entry recorded its round: **CodeRabbit and an
independent audit found this defect separately, on the same day, and neither was the author
who had just finished writing the rule he broke.**

### Four reporting overstatements, retracted in place

The same audit found four. All are corrected in the documents rather than quietly edited out,
because the retraction is the useful part:

| claim | correction |
|---|---|
| 12.2× headroom beside a 31.2% reduction | Took the favourable half of two different scenarios. Both now carry the handshake; the verdict is argued from 2.36×, and `run-step4.sh` S3 asserts **both** ends so the flattering pairing cannot come back. |
| "1,704 + 151 + the 343 lines that stay" | Double count — the 307 kept lines are **inside** the 151. Increase is ~212 lines, not ~555. |
| "floor on the finished controller" | **Linear projection.** Fixed plumbing pushes it up; shared prose and the branching of the absent families push it down; which dominates is unknown. |
| "tokenizer-independent, both sides divide by the same constant" | Removed. JSON and English prose do not share a bytes-per-token ratio, and no tokenizer was run. |
| 124,008 as observed per-run context | A full-document **scenario**. The directive counts show `SKILL.md` points into each reference by name; they do not show a directive is followed or that a whole file enters context. |
| finding 25's "cannot flip the sign" | Overstated a mechanism argument as a result. Now condition 4. |

### Review coverage on this PR

CodeRabbit **did** review (`0dd61d5`) and filed finding 27 as a major comment, now addressed
and the thread resolved. It did **not** review the two later commits — the head shows `pass`
with `Review rate limited`, which is the [[coderabbit-rate-limit-false-pass]] pattern.

**A correction to a claim made on this PR:** it was first reported here as "unreviewed"
because the head commit carried no CodeRabbit check run. That applied the rule by half — a
green tick does not mean the head was reviewed, but a rate-limited head does not mean nothing
was. The corrected form: `0dd61d5` reviewed, `b4b75fb` and `8fd9c54` not.

### Checks at merge

| Check | Result |
|---|---|
| `make ci` gate (Tier 1) | PASS, 16/16 — run_id `20260811T165525Z` |
| `make ci` orb (Tier 2, Node 20 + 24) | PASS — run_id `20260811T165535Z` |
| all eight drivers | exit 0; `run-step4.sh` 40 assertions |
| `run-ingest-matrix.js` | exit 0 — 25 fixtures, MISMATCH 0, LIMIT 0 |
| CodeQL | fail in 8s, zero steps executed — billing lock, not a code result |
| `git status --porcelain` after a full driver run | clean |

The limit recorded in the #62 entry still holds and is why the driver count matters:
`make ci` validates the shipped paths only and **says nothing about `spike/`**. Every
validation claim above rests on the drivers, which carry their own syntax and NUL sweep.

### Where §6.2 stands

**Decided.** Q1–Q5 answered; the recommendation in
[SIMPLIFICATION_ANALYSIS §6.2](SIMPLIFICATION_ANALYSIS.md) now carries the GO and its four
conditions. What remains open is not the decision: the two questions the spike raised **for
the skill** (SC-13/F-76 row identity, and `gate_result` living in the agent's file), the
findings 16/17 question of whether the reference documents or the recorded evidence is the
contract, and — before any real build — one contract run end to end from
`thin-skill-sketch.md`, which is the assumption everything else rests on and the least
trustworthy number in step 4 (finding 24).

---

## Post-merge sync — PR #70 / §6.2 controller spike, step 5 part 1 (2026-08-11)

Step 5's **prerequisite** — the `consensus` and `reproduce` actions, and the operator
dissent-resolution branch they enable — merged as `8adb0f8` (squash of one commit on
`spike/controller-step5-consensus`). Same shape as the #60/#62/#64/#68 entries: throwaway
code under `spike/`, **nothing shipped**.

This is the prerequisite named in [SPIKE_CONTROLLER_PLAN.md §12.3](SPIKE_CONTROLLER_PLAN.md)
and not step 5 itself. Step 5 asks whether an orchestrator can RUN from
`thin-skill-sketch.md`; three of that document's five branches described a controller that did
not exist, so they could not be exercised. They can now. **Nobody has run one yet.**

### What an install carries from this PR: nothing

`git diff --stat 4bca0db..8adb0f8 -- adws-pipeline/ parity/` is empty, so `skill-manifest` —
which digests only `adws-pipeline/` — is unchanged at `549226ba94f0` and `make check-installs`
reports all three known installs still CURRENT. No reinstall is required or implied.

### Checks at merge

| Check | Result |
|---|---|
| `make ci` gate (Tier 1) | PASS, 16/16 — run_id `20260811T195705Z` |
| `make ci` orb (Tier 2, Node 20 + 24) | PASS — run_id `20260811T195715Z` |
| all seven drivers | exit 0; `run-step5.sh` 112 assertions |
| `run-ingest-matrix.js` | exit 0 — 25 fixtures ingested, MISMATCH 0, LIMIT 0 (10 driven end to end; the rest halted or refused with a recorded reason) |
| CodeQL | fail in 2s, **zero steps executed** — [[codeql-billing-lock]], not a code result |
| `git status --porcelain` after a full driver run | clean |

The #62 limit still holds and is why the driver count is the claim that matters: `make ci`
validates the shipped paths only and **says nothing about `spike/`**.

**Two `orb_ci` failures in today's ledger are mine and are environmental.** The first two
attempts ran with the OrbStack daemon stopped, so both legs failed at `build` with a docker
socket error before any test executed. The daemon was started and the same commit then passed
both legs. Recorded here so the ledger's fail count is not mistaken for a code result.

### Review coverage on this PR: none — and the review that mattered happened before it

CodeRabbit filed **no review and no comments** on #70, and the only check run on the head is
the billing-locked CodeQL job. By the standard this file has applied since the
[[coderabbit-rate-limit-false-pass]] entry, that is an unreviewed merge and is recorded as one.

What replaced it happened earlier: an **independent audit of the pre-commit working tree**
contradicted the branch's own central claim ("the new consensus routes work correctly") and
found two fail-OPEN defects, both fixed before the commit was made — findings 33 and 34, with
35 following from the same pass. So the fifth consecutive round's decisive catch again came
from outside, but from a pre-commit audit rather than from PR review, and the PR itself went
in with neither.

**That is a gap worth naming rather than smoothing over.** The pre-commit audit is not a
substitute for review of what was actually merged: it read the tree *before* the fixes for
33–35 existed, so the code that landed carries three changes no second party has looked at.

### What step 5 part 1 established, and what it did not

**Established.** The controller emits all three actions with the F-3/F-6/F-37/F-46 routes
behind them; the two documented attempt annotations `CRITIC_FAIL_REPAIRED` and
`ADVOCATE_DISSENT_REPAIRED` are written for the first time; the terminal severity for an upheld
dissent is **sourced** from the scorer's exported `NO_RETRY_REASONS` rather than re-derived,
which is what the open `failure_reason` item asks of any fix; replay behaviour is unchanged.

**Not established.** That the sketch's *prose* for those branches is sufficient to orchestrate
from — no model was in the loop, and every "live" arm in `run-step5.sh` means the live-mode
code path with staged files, not a dispatched subagent. Condition 3 is untouched.

### The three findings a reviewer should carry forward

- **Finding 28** — `resolution` is finding 19 one file over, and **the scorer reads this one**.
  An Advocate writing its own `resolution: override` clears its own dissent through
  `evalConsensus`, gate passes, no operator involved. That makes it two of two
  orchestrator-owned fields living inside agent-written files, with no permission behind
  either. A second data point for the boundary argument in
  [SIMPLIFICATION_ANALYSIS §6.2](SIMPLIFICATION_ANALYSIS.md).
- **Finding 34** — the **fifth** instance of one cause: two places answering one question,
  agreeing until a new case makes them differ (cf. findings 22 and 29). `route: 'terminal'`
  never terminated because `expectedNext` reads the annotation, not the route. The terminal
  routes that existed before step 5 were correct by coincidence of vocabulary.
- **Finding 35** — a **third** scorer silence, joining 16 and 17: `collectConsensus` builds a
  consensus row from *either* file, so a one-voter round scores like a unanimous one. Whether
  `execution-report.js` should require both roles is not a spike-local call.

### Where §6.2 stands

**Unchanged: decided, GO, four conditions.** Nothing in this PR bears on Q1–Q5. What it moves
is the *next* experiment: §12's live run is now runnable, and its stopping rule (§12.7) is in
force — the sketch is frozen, and finding 32 records a residue event predicted **before** the
run that should find it.

One number moved the wrong way and is recorded rather than buried: the replayed seven-phase
handshake grew 8,738 → 9,146 bytes and Z grew 9,362 → 9,700, taking no-reference headroom from
**2.36× to 2.22×**. Small, nowhere near §9's bar, and it moved for a prerequisite that adds no
capability to the run being measured. The live run's cost remains unmeasured.

### ci_logs ledger (a timestamp, not a live claim)

| file | lines | verdicts | last run_id |
|---|---|---|---|
| `ci_logs/local_ci.jsonl` | 196 | 190 pass, **6 fail** | `20260811T195705Z` |
| `ci_logs/orb_ci.jsonl` | 102 | 100 pass, **2 fail** | `20260811T195715Z` |

Both counts are true through the run_ids named; a later run moves them. The 6 local failures
pre-date this PR; the 2 orb failures are the daemon-down runs described above.

**Branches.** `origin` carries **`main` alone** — `spike/controller-step5-consensus` was
deleted at merge and the stale remote-tracking ref pruned locally. No worktrees.
**Untracked files: none.** `.adws-installs`, `.vscode/`, `ci_logs/`,
`parity/PARITY_REPORT.md` remain gitignored.

---

## Post-merge sync — PR #72 + #73 / §6.2 spike step 5, the run (2026-08-11)

Two merges since the #70 entry, both throwaway code under `spike/`, **nothing shipped**:

- `80f1e95` (#72) — finding 36, from the pre-run review the operator asked for.
- `c2aa2c3` (#73) — **the step-5 run itself.** Verdict: **Z CONFIRMED**.

`git diff --stat 036ff0a..c2aa2c3 -- adws-pipeline/ parity/` is empty, `skill-manifest`
is unchanged at `549226ba94f0`, and `make check-installs` reports all three known installs
CURRENT. No reinstall is required or implied.

### The result

| | |
|---|---|
| Z at run time | 9,700 B / 155 lines |
| Z′ after patching every residue event | **11,400 B / 176 lines** |
| Ceiling (§12.1) | 21,274 B — **1.87×** headroom |
| §12.7 band | **< 14,000 B → Z CONFIRMED** |

The GO's pessimistic floor holds. `run-step5.sh` S9 asserts the band rather than stating it,
and `.step5-residue.json` records a **SHA-256** of the sketch it measured (finding 27), so a
same-length edit reads stale.

**How the run was isolated, because it nearly was not.** The `adws-pipeline` skill is a
**user-level** install (`~/.claude/skills/`), so *every* session on the development machine
carries the 429-line `SKILL.md` in its skill list — the document the after arm is measured
against. §12.4 assumed a fresh session was sufficient isolation; it is not. The run was
executed in an OrbStack VM with a clean `~/.claude` and a fresh clone. The repo carries the ten
`adws-*` agent definitions in `.claude/agents/` but no `.claude/skills/`, so the VM had exactly
what the run needed and nothing it was measuring against — `SKILL.md` present as a *file* (a
reach is detectable and countable) and absent as a *skill* (it cannot load silently).

### Checks at merge

| Check | Result |
|---|---|
| `make ci` gate (Tier 1) | PASS, 16/16 |
| `make ci` orb (Tier 2, Node 20 + 24) | PASS |
| all seven drivers | exit 0; `run-step5.sh` **133 assertions** |
| `run-ingest-matrix.js` | exit 0 — 25 ingested, MISMATCH 0 |
| Drivers re-run inside the VM (Linux, Node 24) | `run-step5.sh` and `run-step3.sh` pass, matrix 0 MISMATCH |
| CodeQL | fail in 1–3s, zero steps executed — [[codeql-billing-lock]] |

### Review coverage: still none from CodeRabbit, and the pattern is now three deep

Neither #72 nor #73 drew a CodeRabbit review or comment. Recorded, as #70's entry recorded it.

What has actually caught things across these three PRs, in order: an **independent audit** of a
pre-commit tree (findings 33, 34, 35), a **self-review before spending dispatches** (finding
36 — the weak form, and it found a mechanical defect), and a **live run by an uncontaminated
orchestrator** (findings 37–40). The third was the most productive by a wide margin, and it is
the only one that exercised the system rather than reading it. That is step 3's lesson holding
at a larger scale: *the six phases that have never run live are in exactly the position the
plan phase was in before it ran.*

### The four findings, and which are ours to fix

- **37** — one wrong argument in the sketch (`init <contract> <target_repo>`, where the
  controller's second positional is `evidenceRoot`) produced **four of the ten residue
  events**, including a mandated consensus briefing that was factually false on the run.
  *Fixed in the sketch.*
- **38** — finding 25's named risk occurred **in the block finding 25 named**: the consensus
  briefing, compressed past the point where "check results" survived. *Fixed in the sketch.*
- **39** — the documented check row cannot express the primary documented `gate_weak` case.
  **Not ours** — a shipped-document disagreement, opened as
  [#74](https://github.com/Org-EthereaLogic/adws-pipeline-skill/issues/74) and a fourth member
  of the findings 16/17 family.
- **40** — two controller defects the harness could not reach: an uncaught `ENOENT` where a
  controlled error belongs, and `worktree_path` emitted as `""` **silently**, on the one field
  that enforces isolation. *Open, in `spike/`.*

### Where §6.2 stands

**GO, four conditions, and condition 2's load-bearing assumption is now measured.** Condition 4
said the reasoning A/B was the highest-value experiment left "ahead of any unimplemented
family"; §12 argued Z had to go first because it was the only open item that could flip the
sign. It did not flip: Z′ is 1.87× under the ceiling.

**Condition 4 is now unambiguously the top of the list**, and one input to it moved: finding 38
is the first observed instance of per-phase work *growing* under the thin interface — two
assessors re-derived what the tester had established. That is a quality cost, not yet a token
measurement, and it is exactly the mechanism finding 25 named.

Still unmeasured after this run: the **live handshake cost** (finding 31's prediction is open —
the run's controller messages were never counted), both arms of the reasoning A/B, and four of
the seven phases, which have still never been orchestrated from this document.

**Branches.** `origin` carries **`main` alone** — `spike/step5-finding36` and
`spike/step5-run` were deleted at merge and their stale refs pruned. No worktrees **in this
checkout**; the retained `adws-step5` VM still holds the run's detached experiment worktree,
which is the point of retaining it. **Untracked files: none.**

---

## Correction to the step 5 record (PR #76)

An independent audit of the **merged** step 5 record confirmed the verdict — it reproduced the
digest, the arithmetic, the 1.866× headroom, the five dispatches and the four instruction reads
— and found **one factual error**: finding 40 said the uncaught `ENOENT` leaked *five*
`adws-run.js` line numbers. The captured stack carries **four** (291, 1545, 2361, 2384).

The count was corrected, but the useful part is what replaced it. **The crash reproduces**, so
the number is a measurement and not a memory:

```
node spike/adws-controller/adws-run.js next /nonexistent/job_dir
```

`run-step5.sh` **S9b** now takes the frame count from that stack and requires finding 40's
sentence to agree with it — the same shape as S9's verdict arithmetic, and the same lesson as
findings 22/29/34: one place answers the question and the other is checked against it. A prose
claim that can be derived should be derived. S9b is *supposed* to fail if the `ENOENT` defect is
ever fixed: the count goes to zero and finding 40's first half must be rewritten, not re-passed.

**Nothing about the verdict moved.** Z′ is unchanged at 11,400 B / 176 lines, the band is still
`Z_CONFIRMED`, and no controller or sketch byte changed — `adws-run.js` is untouched since
`80f1e95`, which is what made the line numbers reproducible in the first place.

### Checks at merge

| Check | Result |
|---|---|
| `make ci` gate (Tier 1) | PASS, 16/16 — run_id `20260811T220035Z` |
| `make ci` orb (Tier 2, Node 20 + 24) | PASS — run_id `20260811T220045Z` |
| all seven drivers | exit 0; `run-step5.sh` **135 assertions**, 0 failed |
| `run-ingest-matrix.js` | exit 0 — 25 ingested, MISMATCH 0 |
| CodeQL | fail in 1–3s, zero steps executed — [[codeql-billing-lock]] |

### The pattern this extends

The audit ledger for §6.2 now reads: pre-commit audit (findings 33–35), self-review (36), live
run (37–40), **post-merge audit (this correction)**. Each caught something the previous stage
structurally could not — and this one is the first to catch an error in a document that had
already shipped, which is the only stage that can. Three of the four were adversarial reads by
something that had not written the thing it was reading.

---

## The reasoning A/B — arm B measured, arm A pre-registered (PR #77)

Condition 4 of the §6.2 GO asked for "two live runs of the same contract, one under each
orchestrator." **One of them had already happened.** Step 5 was a live run under the controller,
and its session transcript survived in the `adws-step5` VM with a `usage` record on every turn.
The controller arm was therefore measured **for zero dispatches** — what was missing was an
instrument, not a run.

| Arm B (controller), measured | |
|---|---|
| Per-phase context growth `P_B` | **5,589 tokens/phase** — plan 5,605 / build 5,485 / test 5,676 |
| Round trips per phase | **3.00 exactly**, against §9's kill band of "~2–3" |
| Instruction mass | 7,294 tok / 17,544 B |
| Live handshake | **12,695 B / 11 calls** as run; **7,493 chars / 9 calls** pure |
| Orchestrator share of run output | **14.8%** (30,863 against 177,047 from five subagents) |

### What was pre-registered, and why it is committed before arm A runs

`spike/adws-controller/ab/PROTOCOL.md` fixes the metric, two segmentation rules that must agree or
the result is indeterminate, numeric kill bands, the replication rule, 8 vetoes, 18 confounds with
their bias directions, 13 named ways the result could be spun afterwards, and the prediction being
tested. `run-ab.sh` (42 assertions) re-derives every arm-B figure from the committed transcript
under the committed script and asserts the protocol's own SHA-256, so a later edit reads as an edit.

**It was amended five times before being committed**, each amendment forced by running it against
arm B. Two are worth naming: one veto turned out to be a **tautology** (`setup` growth *is* `I_net`
by definition, so the displacement veto fired on every possible pair), and one claim this
repository would otherwise have published as confirmed was **downgraded** — the live handshake
exceeds step 4's replayed estimate only on the as-run figure; 2 of its 11 calls bundle diagnostics,
and the pure interface cost is *under* it.

### The trap that would have produced a confident wrong answer

An assistant JSONL row is not a model turn. The transcript writes one row per content block and
repeats the same `usage` object on each — 61 rows are **26** turns, and summing per row inflates
output tokens **2.71×**. The obvious fix (first row per `message.id`) is wrong in the *other*
direction on the subagent transcripts, where the rows of a turn carry partial streaming usage:
first-wins undercounts the advocate **10×**. The rule used is the **maximum-output record per
`message.id`** — chosen for order-independence, not uniqueness: last-record-per-id returns the same
total on all six observed transcripts. Finding 41.

What is checkable from this repository is that `run-ab.sh` re-derives every published figure from
the committed transcript. The cross-checking that happened before publication — three separate
computations of arm B's totals, which agreed — is a **process note, not repository evidence**; the
working files were not committed, and an earlier draft of this entry stated it as though it were.

### The setup defect, predicted and then confirmed

`skill-check.js` locates agents at `<skill>/../../agents` or `<skill>/../.claude/agents`. Copying
`adws-pipeline/` alone into `~/.claude/skills/` satisfies neither: `intact:false`, exit 1, and
SKILL.md §0.3 says **do not start the job**. Arm A's first setup did exactly that and would have
aborted at zero dispatches. Caught by a design agent reading the script before the run; fixed by
using the shipped `install.sh --global`. Finding 45.

### Checks at merge

| Check | Result |
|---|---|
| `make ci` gate (Tier 1) | PASS, 16/16 — run_id `20260811T230953Z` |
| `make ci` orb (Tier 2, Node 20 + 24) | PASS — run_id `20260811T231003Z` |
| all eight drivers | exit 0; `run-ab.sh` **42 assertions**, `run-step5.sh` **135** |
| `run-ingest-matrix.js` | exit 0 — 25 ingested, MISMATCH 0 |
| CodeQL | fail in 1–3s, zero steps executed — [[codeql-billing-lock]] |

### Arm A is a handoff, and that is a harness limit rather than a choice

Arm A must be a fresh top-level session in a VM with the skill installed — the same arrangement
that produced arm B, which is itself the control. Launching a nested `claude` from inside a Claude
Code session is blocked by the harness's own guardrail, so an operator starts it. Everything else
is prepared: `adws-arma` is an OrbStack clone of arm B's machine, sanitized of arm B's transcripts,
worktree and evidence tree, with the skill installed and `skill-check.js` returning `intact:true`.
The two VMs differ in the presence of the installed skill and in nothing else either arm reads.

**Also closed here:** §12.8 deliverable 3, the step 5 evidence archive, which was never delivered.
It is now at `spike/adws-controller/fixtures/live_step5_run/`.

### Re-frozen after a post-commit audit, before arm A ran (PR #78)

An independent audit confirmed the arm-B measurements by recomputing them from the raw JSONL —
including all five subagent transcripts — and re-ran all eight drivers and the matrix. It found
three things wrong in the supporting material, none of which moves a result:

| Correction | Where |
|---|---|
| The pure-handshake assertion compared **7,493 chars against a byte-denominated 9,146** — the exact unit mix amendment A3 exists to forbid, **in the driver that asserts A3**. Bytes are 7,497 and still under 9,146. | `run-ab.sh`, amendment A6 |
| "One rule is right on both files" claimed uniqueness. **Last-record-per-`message.id` returns the identical total on all six observed transcripts**, zero non-monotonic rows. Max is chosen for order-independence, not because it is the only rule that works. | `FINDINGS.md` finding 41, amendment A7 |
| "the three alternatives" heads a table of **four**. | `PROTOCOL.md` §2, amendment A8 |

One claim in the entry above was also scoped down: the three independent computations of arm B's
totals did happen and did agree, but the working files were not committed, so that is a **process
note and not repository evidence**. What the repository can show is that `run-ab.sh` re-derives
every published figure from the committed transcript.

**The freeze behaved as designed.** Editing `PROTOCOL.md` broke `run-ab.sh`'s digest assertion
immediately, so the edit could not be silent; `PREREGISTRATION.json` now carries the new digest, the
old one, and a `refrozen` block naming the reason. Re-freezing while arm A does not yet exist is a
correction. The same edit after arm A ran would be a rationalization, and `PROTOCOL.md` §10 already
says so.

| Check | Result |
|---|---|
| `run-ab.sh` | **43 assertions**, 0 failed |
| `run-step5.sh` | 135 assertions, 0 failed |
| `make ci` gate / orb | PASS — run_ids `20260811T234939Z` / `20260811T234949Z` |

---

## Arm A ran, and the pre-registration voided the pair (PR #79)

Arm A completed the slice on 2026-08-12: **test gate PASS**, 4/4 acceptance criteria with genuine
RED pre-change baselines, five dispatches of the ten-cap, Critic pass, Advocate pass with no
dissent. Zero forbidden reads, zero contamination hits, and the installed skill byte-identical
before and after — verified by digest, because arm A's own contract edits the files the installed
skill is made of.

**Then the frozen list fired, and condition 4 stays open.**

| Rule, pre-registered | What it caught |
|---|---|
| **§7.4 — VOID** | Arm B ran `claude-opus-5`; arm A ran **`claude-fable-5`**. A `/model` command in an earlier session in that VM had saved Fable 5 as the default *for new sessions*. Effort (`high`) and version (`2.1.228`) matched. Declared from the config check alone, **before** the comparison was computed |
| §4.11 — binding | S1 → CONFIRM-AT-FLOOR, S2 → CONFIRM. Different bands → INDETERMINATE |
| §6.3 — leave-one-out | Dropping the build phase flips `Δ_P` to **−128.5** |
| §5 — resolution floor | `Δ_P` = 996 — **four tokens** under the pre-registered 1,000 floor |
| §10.7 | Instrument 2 is a **3.00–3.00 tie**; a tie does not discriminate |

Four independent reasons, every one written down before the data existed. That is the whole value:
each would have been available afterwards as a rationalization, and none of them is now.

### Two results survive the void

**Finding 47 — the prose orchestrator opened every reference.** Given a free choice (the prompt
deliberately did not steer it) arm A read `SKILL.md` via the Skill tool plus **all four**
references it names — **124,008 B**, exactly the full-document reading §11 carries as the
optimistic end of its bracket. It declined the other three references, each for a stated reason.
Against arm B's 17,544 B that is **7.07×**, and bytes-read is the cross-arm quantity least
disturbed by the model mismatch. **§12.2's open question is answered**: the pessimistic before —
30,012 B, a model that opens no reference — is counterfactual for a real prose run.

**Six gaps in the shipped skill**, the mirror of step 5's ten residue events against the sketch:
the pre-git `ship-mode-select` trace has nowhere defined to live; the jobId date is unspecified
between local and UTC; the worktree-mechanism preference contradicts the single persistent tree
that build, test and both assessors must share; there is **no vocabulary for an operator-directed
partial run**; `skill_trace.version` has no documented content; and the Advocate omitted a key its
own definition requires. Plus the parity corpus going red on a stale `schema_version` literal
(correctly recorded `gate_weak`, not laundered into a pass), and **F-17's "structurally unavailable
telemetry" claim being outdated for this runtime** — the same fact that made arm B's subagent
accounting possible.

### One defect found after the data, and deliberately not folded in

§5's veto 6 trips on `HUMAN_TURNS > 1`; the metric counts plain-string user rows, and two of arm
A's three are local-command wrappers for `/clear`. The run was not steered. Amendments A1–A8 were
made while arm A did not exist; this one was found afterwards, so it is **recorded and labelled
post-data** rather than amended silently. `PROTOCOL.md` §10.4 is about precisely that difference.

### Checks at merge

| Check | Result |
|---|---|
| `run-ab.sh` | **57 assertions**, 0 failed — the void and the indeterminate verdict are asserted, not stated |
| `run-step5.sh` | 135 assertions, 0 failed |
| all eight drivers | exit 0 |
| `run-ingest-matrix.js` | exit 0 — 25 ingested, MISMATCH 0 |
| `make ci` gate / orb | PASS |
| CodeQL | fail in 1–3s, zero steps executed — [[codeql-billing-lock]] |

**To close condition 4:** one more arm A run on `claude-opus-5`, with the model asserted before the
first message rather than after the last. `run-ab.sh` now asserts cross-arm model equality, so the
same drift cannot pass silently twice.

---

## Arm A, second run: the model was fixed and the effort drifted (PR #80)

The model VOID was closed. `settings.json` pinned to `claude-opus-5`, the launch carried
`--model claude-opus-5`, and the model was correct on every turn of the run. **Then `effort` came
back `xhigh` against arm B's `high`** — a `/effort` command in the session had saved xhigh as the
new default, exactly as `/model` had saved Fable 5 the run before. §7.4 freezes three keys, and
fixing one moved the failure to the next.

**Effort sets the thinking budget**, which is a large share of what the primary metric measures:
arm A2's per-phase thinking is 2,240 / 1,380 / 1,793 against arm B's 1,513 / 89 / 270. The
uncontrolled variable inflates the arm predicted to be more expensive, so this confound points *at*
the expected answer — the least defensible kind to accept.

### The pair where everything else worked

Recorded as information about the instrument, under a void that forbids reading it as information
about the controller:

| | arm A2 | arm B |
|---|---|---|
| `P` (S1) / (S2) | 8,656 / 9,437 | 5,589 / 6,112 |
| Round trips per phase | 3.67 | 3.00 |
| Terminal state | test gate FAIL | test gate FAIL |

Both segmentations agreed on the band. Leave-one-out was sign- and band-stable. Both instruments
agreed in direction. The terminal states matched for the first time. `PROTOCOL.md` §10.13 stands:
a void pair may not re-price anything, and these numbers are published with that sentence attached.

### What the run found in the shipped skill, which the void does not touch

The eight most consequential items the run produced — a mix of documentation gaps and surprising
validator behaviour, ordered by weight rather than by the run report's own a–h/1–6 split. The
canonical accounting is `spike/adws-controller/FINDINGS.md`, which separates the two kinds, marks
which of arm A1's six reproduced here, and gives the union as **nine distinct gaps** rather than
the fourteen an earlier reading of this section produced by adding the two lists:

- **`repo-context-scan` validates the plan, not the build.** Its input is
  `plan_output.file_change_proposal`, so the build gate's only validator never inspects what the
  builder actually changed. The orchestrator checked the real change set itself — nothing in the
  skill told it to. **A builder writing outside `allowed_paths` would pass the build gate on the
  plan's good intentions.**
- `provenance` defines two disjoint key sets: the documented shape lists eight fields, and the
  "obtainable, and therefore MANDATORY" list below names five others, none of which appear in the
  shape.
- No attempt-level `failure_reason` exists for a route determined but not executed:
  `CRITIC_FAIL_REPAIRED` asserts a repair that never happened, `TEST_GATE_FAILURE` asserts a budget
  exhaustion that did not occur. Written `null`, with the reason recorded.
- No `final_status` for halted-mid-run; the four terminal states do not include one.
- The mandated `resolveWithinRoot` check rejected all three of the Critic's `reproduction.files`
  because they were recorded job-relative rather than attempt-relative. **An honest evidence-drift
  bug is indistinguishable at that check from a path-escape attempt.**
- `decideLifecycle` answered a mistyped probe confidently — passed the manifest's field names
  instead of the function's, fell through to the unknown-state branch, and returned QUARANTINE.
  A wrong answer that looks exactly like a right one.
- Agent-tool worktree isolation is *available* but semantically wrong (per-agent, auto-cleaned, so
  it cannot carry the change set across build → test → consensus). §1's "where unavailable, create
  explicitly" does not cover "available but wrong".
- `skill_trace.version` still has no source: the orchestrator grepped four validator scripts
  looking for a constant that none of them prints.

### Checks at merge

| Check | Result |
|---|---|
| `run-ab.sh` | **68 assertions**, 0 failed — both voids asserted, not stated |
| all eight drivers | exit 0; `run-step5.sh` 135/0 |
| `run-ingest-matrix.js` | exit 0 — 25 ingested, MISMATCH 0 |
| `make ci` gate / orb | PASS |

**To close condition 4:** `--model claude-opus-5 --effort high` on the command line, and no
in-session `/model` or `/effort`. `run-ab.sh` now asserts both keys across arms.

## PR #81 — SC-15: the build gate sees the build, the drift gate runs before publication

Three defects two live arm-A runs surfaced, fixed in the shipped skill. Not a spike change: this
is `adws-pipeline/`, and its merge is gated on arm A3 (see "Sequencing" below).

### What changed, and what evidence forced it

| Fix | Forced by | Shape of the defect |
|---|---|---|
| `repo-context-scan` v2.1.0 takes `actual_changes` from the worktree | arm A2 surprise 1 | The build gate's only validator read `plan_output.file_change_proposal`. SKILL.md correctly declared it the build gate's validator; the script correctly declared its input the plan. **Neither file contained the error** — the composition validated intentions. A builder writing outside `allowed_paths` passed on the plan's good intentions; the live orchestrator caught it only by diffing the change set on its own initiative. |
| `adws-grader` moved to ship, pre-git; verify gains a receipt binding | `SKILL.md:289` vs `:327` | Ship published, then verify's grader `fail` rewound to build — after commits and a live PR existed. No rewind can un-publish, so the job either left the artifact standing or produced a second one. The grader now grades the candidate, the last moment the answer is free, and verify binds the published diff's SHA-256 to `run_manifest.candidate_sha256`. |
| `scripts/evidence-integrity.js` makes `artifact-layout.md` rule 9 executable | arm A2's own evidence | Rule 9 has forbidden placeholder `*_at` values since SC-13, in prose. A grep for `_at` across all nine validators returns nothing. The run wrote `"performed_at": "--"`, and the tree passed every gate the skill has. |

### Checks

| Check | Result |
|---|---|
| `make local-ci` | **PASS**, 17/17 steps (new step `evidence`) |
| parity corpus | **116/116**, 0 failures — +7 repo-context-scan pins for the actuals pass |
| `evidence-integrity` suite | 9 verdicts + directory walk + CLI error path, deterministic |
| guard-ablation | PASS — `repo-context-scan` 19 mutants, **0 survivors** |
| `run-step5.sh` | 135 assertions, 0 failed |
| `run-ab.sh` | **68 assertions, 1 failed — §A5, deliberately.** See Sequencing. *(Resolved: merged as `6b84b47` after arm A3 ran; A5 re-frozen to `66fab10d…` in `842ab33`, and the driver is 91/0 on main.)* |

**Falsifiability of the new check.** `evidence-integrity.js` returns `fail` on
`fixtures/live_armA2_run` (38 files, 47 `*_at` fields, exactly 1 violation — the `--`) and `pass`
on `live_step5_run`, `live_armA_run` and `live_plan_attempt`. One dirty tree, three clean, and the
dirty one is the one a human audit found by hand. The fixture is NOT repaired: it is the record of
a real run, and editing it to satisfy the new check would destroy the evidence that motivated it.

**A regression the ablation gate caught.** The actuals-absent `warn` floor initially masked the
short-description rule — `warn-short-description.json` produced its verdict for the new reason, so
disabling the old rule changed nothing and guard-ablation reported it unpinned. Fixed by giving
that fixture matching `actual_changes`, so it once again pins what its name claims.

### Sequencing — this branch must not merge before arm A3 *(RESOLVED — see the post-merge sync at the end of this file)*

The live A/B contract's `allowed_paths` are `adws-pipeline/references/` and
`adws-pipeline/scripts/execution-report.js`. This branch edits the first, so merging it replaces
the document arm A3 reads and the two arms would no longer share a stimulus. `run-ab.sh` §A5
asserts exactly that ("the tree arm A reads is unchanged since pre-registration") and now fails
with `d17cca5a…` against the frozen `fe1657c8…`. **The assertion is not defeated and the digest is
not updated here.** Two frozen keys have already drifted out from under this experiment; a third
caused by the experimenter's own repairs would be the least excusable. Merge order: arm A3 → close
condition 4 → merge this → re-freeze A5's digest in the same commit.

**To close condition 4:** `--model claude-opus-5 --effort high` on the command line, and no
in-session `/model` or `/effort`.
## Arm A, run 3 — the two operator keys were fixed, and the harness moved

**VOID on §7.4, third run, third key.** Model `claude-opus-5` and effort `high` on all 81 assistant
rows, both **equal to arm B's** — the two drifts the operator controls are closed. `version` was
`2.1.229` against arm B's `2.1.228`: the CLI updated itself between 2026-08-11 and 2026-08-12.

| run | drifted key | cause | fixable by pinning? |
|---|---|---|---|
| A1 | model | a saved `/model` default | yes — and it was |
| A2 | effort | a saved `/effort` default | yes — and it was |
| A3 | **version** | **the harness updated itself** | **no** |

**The incremental path is closed.** §7.4 row 4's pre-registered remedy is "mismatch → VOID, re-run
**both arms** inside the same window". Arm B is a recording on a version that no longer exists, so
no arm-A-only run can close condition 4 again, however carefully it is pinned. Confound 18
anticipated this ("model-serving drift between the two run dates", direction UNKNOWN) and mitigated
it only with "run arm A as soon as possible" — which failed because arm A took three attempts, and
every attempt spent fixing one drift bought time for the next.

### The pair that passed everything

Recorded under §10.13, which forbids a void pair from re-pricing anything:

| | arm A3 | arm B |
|---|---|---|
| `P` (S1) / (S2) | 10,398.67 / 12,370 | 5,588.67 / 6,111.67 |
| Band S1 / S2 | **CONFIRM / CONFIRM — they agree** | — |
| Round trips per phase | 5.33 | 3.00 |
| `I_net` | 65,514 | 20,379 |
| Terminal state | test gate **PASS**, 5 dispatches, 0 retries | test gate FAIL |

Both segmentations agreed (§4.11's binding rule, satisfied for the first time). Leave-one-out was
sign- **and** band-stable across all six drops. Baseline drift 253 of 2,000. Attempts matched at
1/1/1. Four of §6's five n=1 conditions hold; the fifth fails **only** because veto 7 fired.
Every stability check the protocol asks for passed, on a pair whose harness was uncontrolled —
which is the case for keeping the harness freeze in a different section from the stability checks.
Stability is not validity.

### The analyzer returned CONFIRM on it

`measure-ab.js` checked that each arm's harness was single-valued *within that arm* and never
compared the arms to each other. §7.4's "**and equal across arms**" lived only in `run-ab.sh`, as an
assertion hand-written once per arm-A run — and arm A3's did not exist yet. Both halves were
correct; the analyzer held both transcripts and never asked the question. It printed
`verdict: "CONFIRM"` with zero vetoes fired.

That is the composition defect from PR #81's finding 51, third instance in a week, first one that
was ours. Amended: the analyzer now compares model/version/effort across arms and routes any
mismatch into veto 7 (→ VOID).

**Why the post-data amendment is not a rationalization.** §10.4 forbids amending after the data.
This one passes a directional test: it can only **add** voids — it cannot turn a VOID into a
verdict, move a band, or change a number, verified by recomputing both arms under the new script
and diffing the full arm blocks (byte-identical). It moved this pair from CONFIRM to VOID, away
from the outcome the experimenter wants.

### Checks

| Check | Result |
|---|---|
| `run-ab.sh` | **91 assertions, 0 failed** (was 68; +23 for the A8 block and the amended verdicts) |
| `run-step5.sh` | 135 / 0 |
| `make local-ci` | PASS |
| transcript transfer | `orbctl pull`, SHA-256 verified identical host and VM (`7959cc34…`) |
| arm A3 evidence tree | rule-9 **clean** — 13 files, 24 `*_at` fields, 0 violations |
| arm B numbers under the amended script | byte-identical to the frozen ones |

### Consequence for PR #81

**PR #81 is unblocked** *(and has since merged as `6b84b47`)*. It was held because merging would replace the tree arm A3 reads. Arm A3
has now run against the frozen tree, so that risk is discharged; and since condition 4 now requires
a fresh both-arms window with its own freeze, the old `fe1657c8…` digest no longer gates anything.
The re-run should read the corrected skill — that branch fixes three real defects in the shipped
document, including the one two of three arm A runs found on their own. *(Corrected 2026-08-12,
finding 54: this line read "three of the eleven documented gaps are fixed". The union is twelve,
and none of the three was a numbered gap — they were a surprise, an ordering defect, and finding
50. The recommendation stands; the arithmetic behind it did not.)*

## Post-merge sync for PRs #81 and #82 (SC-15 + the arm A3 void)

Both landed on 2026-08-12. This section is the current state; the entries above are what was true
when each PR was open, and are left as written.

| PR | Merge | What it was |
|---|---|---|
| [#81](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/81) | `6b84b47` | SC-15 — the build gate sees the build, the drift gate runs before publication, rule 9 becomes executable |
| [#82](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/82) | `842ab33` | arm A run 3 — VOID on §7.4's third key, and the analyzer that missed it |

**Merge order was forced by the record, not by preference.** #82's findings are numbered 52 and 53
and reference finding 51, which exists only in #81. Merging #82 first would have left FINDINGS.md
jumping from 49 to 52 and citing a finding that was not there. #81 first, then #82 rebased — the
two conflicted in `FINDINGS.md` and `VERIFICATION.md` because both inserted at the same anchor, and
both sides were kept in chronological order.

### State of main at `842ab33`

| Check | Result |
|---|---|
| `make local-ci` | **PASS, 17/17 steps** |
| `run-ab.sh` | **91 assertions, 0 failed** (68 before the A8 block) |
| `run-step5.sh` | **135 assertions, 0 failed** |
| `make ci-orb` | PASS, Node 20 and 24 |
| parity corpus | **116/116** |
| CodeQL | fail in 2–9s on both PRs — *"the job was not started because your account is locked due to a billing issue"*. Not code, not required; confirmed from the job annotation rather than assumed |

### The one assertion that was deliberately left red, and is now green

`run-ab.sh` §A5 pins the tree arm A reads. #81 changed `adws-pipeline/`, so A5 fired — and was left
failing for the life of that branch. Updating the digest to land a fix would have been a third
harness drift, self-inflicted, on an experiment already voided twice by drift.

It is re-frozen now, in `842ab33`, to `66fab10d…` — and the old value is **kept, not overwritten**.
`digests.shipped_tree.superseded` records `fe1657c8…`, that all three arm A runs read it, and why it
changed. The live digest pins the tree for the *future* both-arms window §7.4 requires; it pins
nothing about the runs already recorded.

### Housekeeping

- Branches `fix/publish-last-and-actuals-gate` and `spike/arm-a3-version-void` deleted local and
  remote; `main` is the only branch. No worktrees, no unignored untracked files.
- `ci_logs/*.jsonl` are **retained** — `scripts/local-ci/README.md` describes them as append-only
  evidence and cites run counts from them. Per-run `.log` files older than the current sprint are
  pruned; two are cited by name in committed docs (`20260809T230215Z.orb.log`) and are kept.
- README's validation block synced: parity `109/109` → **`116/116`**, the `evidence-integrity`
  suite added, and `evidence-integrity.js` listed in the scripts tree.

### Condition 4 remains OPEN, and cannot be closed the way it was being attempted

§7.4's pre-registered remedy for a harness mismatch is **re-run both arms inside the same window**.
Arm B is a recording on Claude Code 2.1.228, which no longer exists, so no further arm-A-only run
can close it. The next attempt needs one window containing a fresh arm B on the thin sketch and a
fresh arm A on the shipped skill — and arm A should read the **corrected** skill at `842ab33`, since
pricing the prose arm against defects that are already fixed would measure the wrong artifact.

## Finding 54 — the gap count, corrected

Found on 2026-08-12 while auditing what the sprint left open, by reading the gap list against the
sentence that summarized it.

| | Was | Is |
|---|---|---|
| Union of documented gaps | eleven | **twelve** (nine after arm A2, plus arm A3's three; the list numbers 1–12) |
| Closed by SC-15 | "three of the eleven" | **zero** |

The arithmetic error and the false claim occupied the same sentence in
[`docs/SPIKE_CONTROLLER_PLAN.md`](SPIKE_CONTROLLER_PLAN.md) §13.5 and in this document, and the
count alone in [`FINDINGS.md`](../spike/adws-controller/FINDINGS.md). All three are corrected in
place, and each names what it used to say.

**What SC-15 actually fixed**, none of which is a numbered gap:

| Fix | Where it came from |
|---|---|
| `repo-context-scan` reads the build, not the plan | a *surprise*, recorded by arm A2 and again by arm A3 — never on a gap list |
| The drift gate runs before publication | reading `SKILL.md`, not from any arm A run |
| `artifact-layout.md` rule 9 becomes executable | finding 50, from arm A2's evidence tree |

**Verification of the corrected number.** The twelve are: gaps 1–6 from arm A1, 7–9 new in arm A2
(five of A1's six reproduced), 10–12 new in arm A3 (four of the nine reproduced). Each is a
numbered item under "What arm A{1,2,3} found in the SHIPPED skill" in `FINDINGS.md`. Checked
against the shipped tree at `3d09d03`: gap 1's trace location is still undefined (`SKILL.md:150`
requires the pre-git run and names no path for its trace), and `skill_trace.version` — gap 5 — is
still an empty string in the shape at `artifact-layout.md:393` with no documented content. Both
would have had to close for the old claim to be even partly true.

**Nothing recomputed.** No gate, metric, veto, or void reads a gap count; `make local-ci`,
`run-ab.sh`, `run-step5.sh`, and the parity corpus are untouched by this correction and were re-run
to confirm it.

**The two gaps this sprint does close** are handled in the work that follows, and they are closed
because a run needed them, not to move the number: gaps 4/8/12 with one lifecycle state for a
deliberate stop, and gaps 5/10 with one validator output envelope.

## SC-16/F-86 — a lifecycle state for a deliberate stop

Closes arm A gaps **4, 8 and 12** — the only three of the twelve that share one root cause: the
skill had no concept of a run that stopped on purpose while healthy.

| Gap | Hole | Close |
|---|---|---|
| 4 (job) | `final_status` had no honest member; `canceled`/`OPERATOR_CANCEL` is no-retry AND quarantine-class | `halted` / `OPERATOR_HALT`, in neither class |
| 8 (attempt) | a route determined and not executed had no reason; `CRITIC_FAIL_REPAIRED` asserts a repair that never ran | attempt-level `ROUTE_NOT_EXECUTED` + `route_determined` |
| 12 (mechanism) | `carry_over` is written at a terminal state; a halt produced none, so `resumable: true` was unreachable | `halted` IS terminal, so §5 step 4 runs |

**Gap 12 needed no new rule.** The shipped/not-shipped test for `resumable` was already correct and
already unreachable — a halt before ship is `resumable: true`, a halt after ship is `false` with the
reason, and neither line changed. What was missing was a terminal state to evaluate it from.

### The guard, and why it is not the obvious one

`halted` must not become a way to walk a failed gate out of QUARANTINE. The obvious guard is the
`gateFail` the `completed` branch uses. It is wrong here, and the fixture would not have said so.

`evalPipelineCompletion` returns FAIL whenever `final_status !== "completed"` or any phase lacks
evidence — both true of every halt, by construction. The naive guard therefore quarantines 100% of
halts. The shipped guard skips `pipeline_completion` and reads only gates that evaluated something.

**Ablation (falsifiability, not assertion).** Removing the `pipeline_completion` exclusion:

| Fixture | With exclusion | Without |
|---|---|---|
| `retry_operator_halt` | RETRY, exit 1 | **QUARANTINE, exit 2 — breaks** |
| `quarantine_halt_with_failed_gate` | QUARANTINE, exit 2 | QUARANTINE, exit 2 — still green |

The anti-laundering fixture passes under both guards, so it is vacuous alone. Only the pair pins the
behaviour. Recorded as finding 55: this is finding 51's fourth instance and the first authored in
this repo rather than found in someone else's.

### No schema bump

`SCHEMA_VERSION` stays `1.4.0`. `halted` maps onto the EXISTING decisions and exit codes — RETRY/1
clean, QUARANTINE/2 with a substantive failed gate. The report's contract with its readers is the
decision vocabulary and the exit codes; a fifth accepted input value that produces no new output
does not change it.

### State

| Check | Result |
|---|---|
| `make local-ci` | PASS, 17/17 |
| execution-report fixtures | **27/27** (was 25) + CLI error path, deterministic |
| `run-ab.sh` | 91 assertions, 0 failed |
| `run-step5.sh` | 135 assertions, 0 failed |
| parity corpus | 116/116 |
| `SKILL.md` | 468 lines; budget raised 456 → 468 with a reason, in this commit |

`run-ab.sh` §A5 fired on the tree change, as designed. The digest is re-frozen in the same commit
that caused it, with the prior value kept under `superseded.prior` — the second re-freeze, and both
are now a chain rather than an overwrite. It pins the tree for the future both-arms window; it pins
nothing about the three recorded arm A runs, each void on §7.4 independently.

**Gap ledger: twelve documented, three closed (4, 8, 12). Nine open: 1, 2, 3, 5, 6, 7, 9, 10, 11.**
