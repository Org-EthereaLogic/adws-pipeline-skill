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
  required check and `main` carries no branch protection.
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
  carried by every merged PR since #24; it is not a required check and `main` carries no
  branch protection.
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
