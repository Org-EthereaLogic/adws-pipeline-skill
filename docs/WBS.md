# Work Breakdown Structure (WBS)

**Project:** ADWS Pipeline Skill
**Version:** 1.0
**Date:** 2026-07-14
**Companion document:** `DPPD.md` (requirement/story IDs referenced below)

**Latest (2026-08-08):** audit-driven remediation `M-5a → SC-9 → SC-10 → SC-11 → M-5b`
landed as one stacked series — see `DPPD.md` §20 and `docs/AUDIT_2026-08-08.md`. Parity
**93 → 108**, report fixtures **21 → 24**, provenance **3 → 5**, `SKILL.md` **425 → 359** net (SC-10 cut it to 337; SC-11 added back mandatory procedure);
gate steps 9 → 14. `SCHEMA_VERSION` unchanged. Three security defects (F-63…F-65) fixed and
re-verified; F-17 and the grader-mandate ambiguity closed after five scope changes open.

**SC-12 (2026-08-09):** closes **F-72** — a merged fix does not reach a run until someone
reinstalls, and all three installs were still pre-remediation after §20 merged green. The
skill now ships a content manifest and a self-check the orchestrator asserts at intake;
`make check-installs` and a `post-merge` hook answer the staleness half from the source.
Gate steps 14 → 15. See `DPPD.md` §21.

**SC-13 (2026-08-09):** closes **F-73, F-75…F-79** from two consecutive RETRY runs against
`cadence-method-skill` issue #24, which found eleven real defects, repaired ten, and shipped
nothing. A terminal non-PROMOTE now records `carry_over` with per-file digests and a
successor may adopt that worktree only via `execution.resume_from_job`, which classifies
every path `unchanged`/`changed`/`added`/`removed`; `corrections.json` gains the `guidance` object a
live orchestrator had already invented; a repaired defect must leave a regression check
behind; agents get one scratch root each (shared blocks 2 → 3) and reproductions get a
corpus in `consensus/repro/`; the report stops calling a phase the job never reached
"missing evidence". Report fixtures 24 → 25; parity, `SCHEMA_VERSION` and the verdict
taxonomy unchanged. **F-74** (the one-rewind cap for a Critic-found code defect) closed
WORKING-AS-DESIGNED by operator decision. See `DPPD.md` §22 and `SC13_PLAN.md`.

**M-6 (2026-08-09):** maintenance audit, findings only — **F-80 … F-87**. Nothing under
`adws-pipeline/` moves. Confirms the 2026-08-08 audit's headline concern is answered: the gate
has now gone red **5 times across 4 steps**, three of them steps the M-5a/M-5b/SC-12 wave
added. The open items are budgets rather than detectors — `SKILL.md` has no line budget and
SC-10's considered 337-line floor was erased by +87 lines in ~24 hours; all 19 accepted
guard-ablation survivors carry `class: unpinned` and an owner naming a work package that has
shipped, in two fields the tool never reads; and SC-13's Critical no-eval rule shipped as prose
with nothing asserting it. See `DPPD.md` §23 and `docs/AUDIT_2026-08-09.md`.

**SC-14 (2026-08-09):** closes **F-80, F-82, F-83, F-86**; **F-87 half-closed** (the TOC gap
is fixed and all seven references now carry one; the sibling cross-links were reviewed and
deliberately kept, because every one cites a specific rule rather than serving as navigation —
so the nested-read hazard is mitigated, not removed). Tier-3 review egress now requires a
local host unless `REVIEW_ALLOW_REMOTE=1`, bypasses proxies, and names a userinfo-redacted
destination; the no-eval
rule becomes `SKILL.md` hard rule 9, joins the agents' security block in all ten copies, and is
asserted by a new `no-eval` gate step; `SKILL.md` gets a line-budget ratchet
(`parity/skill-line-budget.json`, seeded at the observed **424** and raised in-commit to 429
for hard rule 9, with the reason recorded — the mechanism's first exercise is the change that
introduced it); `guard-ablation` finally reads its own baseline's `class`/`owner`, caps
`unpinned` entries by budget, and reports the two populations separately. **Triage corrected
F-86 itself:** four of the five entries slated for closure were never debt (`verdict:#5` is a
dead branch), and the one real gap — the legacy YELLOW band — had a fixture *named for it*
that lands in the RED band, which is F-71's shape inside the mechanism built to answer F-71.
Parity **108 → 109**, gate steps **15 → 16**, baseline 19 → 18 entries (2 equivalent, 16
unpinned, budget 16). No validator source edited, no refreeze, no `SCHEMA_VERSION` bump; NFR-3
holds (429 < 500). **F-81, F-84, F-85 remain open, owned by SC-15.** See `SC14_PLAN.md` and
`VERIFICATION.md` §SC-14.

**SC-15 (2026-08-12, PR #81):** closes **F-84, F-85** and adds **F-84b**. Three defects the
live §6.2 arm A runs surfaced in the SHIPPED skill: the build gate's only validator
(`repo-context-scan`) read the PLAN rather than the worktree, so a builder writing outside
`allowed_paths` passed on the plan's good intentions; the drift gate ran AFTER publication, so a
BLOCK rewound a change that already had commits and a live PR; and `artifact-layout` rule 9 was
unenforced prose until `evidence-integrity.js` ran at the terminal report. `SKILL.md` 429 → 456,
recorded in the ratchet with a reason.

**SC-16 (2026-08-13, PRs #87, #86):** closes arm A gaps **4, 8, 10, 12** and **5** via
**F-88**, **F-88b** and **F-89**. F-88 adds `halted`/`OPERATOR_HALT` as a fifth terminal state
with the attempt-level `ROUTE_NOT_EXECUTED` — three live runs had been forced to record an
operator's deliberate stop as `canceled`, which routes to QUARANTINE over a run with nothing to
investigate. **F-88b corrected F-88's own anti-laundering guard** (finding 56): it excluded the
`pipeline_completion` gate wholesale, and that gate answers two questions in one status, so a
halted run with a phase skipped BEHIND the stop reported RETRY and "nothing is wrong with the
run". F-89 gives every validator verdict a `skill_id`/`tool_version` envelope at the CLI
boundary — both values existed in all nine manifests and were printed by none. `SKILL.md`
456 → 469; report fixtures 25 → 27; `cli-contract` 330 → 367.

**SC-17 (2026-08-14, PR #88):** **F-90** extends `guard-ablation` to `execution-report.js` —
the file all three SC-16 defects lived in, and the one target the mechanism had never swept.
109 mutants × 29 report fixtures, **19 survivors and 90 killed**; the baseline gains 18
`unpinned` entries (owner SC-18) and 1 `equivalent`, budget 16 → 34. One survivor was closed
rather than accepted: `skills_clean`'s "a skill invocation failed" branch, which six fixtures
appeared to cover and none reached, because every one returns from an earlier branch. Also
closes arm A gaps **2** and **6** — and gap 6 was misdiagnosed in the record, since the Advocate
was told the OPPOSITE of what this repo believed (finding 57). Report fixtures 27 → 29.
**Findings 56–60 are recorded in `spike/adws-controller/FINDINGS.md`.** See `VERIFICATION.md`
§SC-17/F-90.

**SC-18 (2026-08-14, PRs #90, #91):** **F-91** closes finding 39 / issue #74 — the documented check row could
not express the primary `gate_weak` case. `phase-gates.md` names "passes pre-change (no red
baseline)" as the first `gate_weak` case, but `artifact-layout.md`'s `baseline_reason` enum
(`assertion-failed-runtime-present | collection-error | not-run`) had no value for it, so a
strict reader rejected the honest `baseline_reason: null` and gated a candid tester. Resolved as
**option 2**: `baseline_reason` names why a *red* baseline was red, so it is enum-valued iff
`baseline_pass: false` and `null` when the check passed pre-change — the value 6 of 7 live
non-red rows already carried. Widens the shipped enum to admit `null` (the table was the bug,
not the evidence — SC-16/F-89's authority-in-writing template), rather than adding a redundant
fourth member or reclassifying the check. Docs-only: no validator reads the field, so no code or
fixture changed. This is the same two-places-one-question family as gaps 1/3/7. Gap 11 stayed
open after F-91 — issue #74's option 3 was the required-vs-supplemental split gap 11 needs, and
option 2 deliberately did not settle it; **F-92 closes it (below)**. Fixed in `artifact-layout.md`,
`phase-gates.md`, `adws-tester.md`; recorded in `FINDINGS.md` finding 39.

**F-92** closes arm A gap 11 — the required-vs-supplemental split option 2 deferred. A criterion may
carry several checks (SC-5/F-31) with per-check verdicts, but the gate is stated per *criterion* and
no rule aggregated them; SC-17's proposed "≥1 verified row → verified" was withdrawn for masking a
*required* `gate_weak` behind a verified sibling. F-92 adds a **`check_role`** field
(`required` | `supplemental`) to the test check row and the aggregation rule: `fail` on any row →
`fail`; else a `gate_weak` on any *required* row → `gate_weak` (never masked); else `verified`, with
`supplemental` `gate_weak` rows warned but not blocking — honoring the two pinned constraints (`fail`
dominates; a required row is never masked by a verified sibling). Ratifies arm A3's tester's FIELD
decision while fixing the POLICY the withdrawn rule got wrong. Docs-only, mirroring F-91: no
validator reads `check_role`. Fixed in `artifact-layout.md`, `phase-gates.md`, and
`adws-tester.md`; recorded in `FINDINGS.md` finding 11.

**Arm A gap ledger: twelve documented, eight closed (2, 4, 5, 6, 8, 10, 11, 12); four open
(1, 3, 7, 9).** Gaps 1, 3 and 7 are one shape — two places answer one question and neither
is named authoritative — and gap 6 turned out to belong to that family too, which makes it the
most common defect the spike has found. Gaps 9 and 11 were policy: **9's ruling is proposed and
stands** (`references/` is this repo's documentation location); **11 is now closed by F-92** — its
withdrawn SC-17 ruling was replaced by the required-vs-supplemental `check_role` split, which
defined the missing semantics and let a safe aggregation rule be written (`fail` dominates; a
required row is never masked by a verified sibling). Both were owned by SC-18; **gap 9 is its only
remaining policy gap.**

**Status (2026-07-15):** 1.0–5.0 done and merged to `main` (PRs #1, #2). **6.0 (live E2E)
complete** — drills 6.1–6.4 executed live against a scratch GitHub repo; 17/17 DPPD §4
acceptance criteria satisfied and independently verified. Sign-off: `acceptance/ACCEPTANCE.md`;
evidence: `acceptance/DRILL_EVIDENCE.md`. One defect (F-1) was found by the drills and fixed.
A post-production-run enhancement scope (**SC-2**, findings F-3…F-10 from the first
production run) was **APPROVED (operator R-6, 2026-07-16)** and implemented on branch
`feat/sc2` in three tranches: SC-2a docs/prompt fixes (zero parity risk), SC-2b
evidence-schema & report logic (report suite 10 → 13 fixtures, `execution-report.js`
SCHEMA_VERSION 1.0.0 → 1.1.0), SC-2c perf/security hardening. **Deferred:** C2
(review-gate Advocate tier bump) and the E2E-2 confirmation run (SC2_PLAN step 6),
both pending more production-run data. See `DPPD.md` §10 and `SC2_PLAN.md`.
*(C2 closed 2026-08-05 by SC-4 A9 — the deferral condition is satisfied; run #105
supplies the medium-risk Advocate record. See `DPPD.md` §13 and `SC4_PLAN.md` §4.11.
The E2E-2 confirmation run remains deferred.)*

**Status (2026-07-24):** scope change **SC-3** (findings F-14–F-17 from the fusion-harness
comparative review) was **APPROVED (operator R-6, 2026-07-24, per-item: A1–A6, B1)** and
implemented: SC-3a falsifiability at the test gate (reusing `criteria-to-checks`'
`check_specs` + `adws-tester`, no new DSL), structured `corrections.json`, and a
`check_defect_repairs` record; SC-3b advisory per-phase `phase_manifest.provenance`. Verdict
taxonomy frozen (no new DECISION/exit); 84/84 + 13/13 + 7/7 preserved; `execution-report.js`
untouched. Deterministic provenance fixtures and the retained SC-3 contract micro-drill
are wired into local CI. Contract and fixture reconciliation plus linked-worktree/hook-safe
CI landed through PR #27 (`149712c`) after the implementation in PR #26. The autonomous
seven-phase real-task confirmation is explicitly deferred to the first suitable post-SC-3
task. See `DPPD.md` §11, `SC3_PLAN.md`, and `acceptance/SC3_MICRO_DRILL.md`.

**Status (2026-08-05):** maintenance audit **M-1** (not a scope change — no requirement,
story, AC, or verdict-taxonomy movement) closed two defects by which `execution-report.js`
could certify PROMOTE for a job whose evidence recorded failure: an empty `attempt_n`
directory satisfying `pipeline_completion`, and per-phase `gate_result` being rendered but
never evaluated. Amended under the path SC-3 B2 reserved — additive gate only,
SCHEMA_VERSION 1.1.0 → 1.2.0, regression-first, the 13 existing verdict fixtures unchanged
and green, no new DECISION/exit. Report suite **13 → 15**; 84/84 + 7/7 + 3/3 + the SC-3
micro-drill unchanged. Same pass closed the SC-3 A3 `corrections.json` reader gap in
`adws-builder.md`, documented the planner's `planning_blocked` fields, and removed
non-installed `docs/`/`parity/` paths from the skill (now lint-enforced). Merged through
PR #29 (`e2e8a5d`). See `DPPD.md` §12 and `VERIFICATION.md` "Maintenance audit (2026-08-05)".

**Status (2026-08-05, SC-5):** scope change **SC-5** (findings F-27–F-30 from field run
`job_20260805_0003`, `cadence-method-skill` #4) was **APPROVED (operator R-6, 2026-08-05,
per item A1–A3)** and implemented. `criteria-to-checks` 1.1.0 → **2.0.0**: `check_specs`
now carries every acceptance criterion, typed `behavioral` | `unclassified`, closing the
path by which a lexical miss deleted a criterion from the tester's work list instead of
flagging it (live impact 1 of 8 dropped — orchestrator-reported, not re-derivable; the
mechanism itself is proven from the committed validator). The verb set widened by ~40 families — a 127-verb probe
had found 126 unmatched, including `fail` and `assert` in the validator that gates the test
phase — plus three SC-1 regex artifacts replaced. Rubric and all three counts unchanged;
measured 0 verdict flips and 0 count flips across the frozen corpus. `adws-tester.md`,
`phase-gates.md`, and `SKILL.md` updated so `unclassified` cannot be read as out of scope.
Parity **84 → 88**; 15/15 + 7/7 + 3/3 + the SC-3 micro-drill unchanged; verdict taxonomy
frozen and `execution-report.js` untouched. Post-submission review added F-31…F-34, fixed in
the same PR: `check_id` now flows onto `phase_output.json.checks` so coverage is verified by
id rather than by prose (F-31), and the run's 7-of-8 tally is attributed consistently as
orchestrator-reported across all four documents (F-34). Merged through PR #36 (`51a163d`);
Tier 1 nine-of-nine and Tier 2 both legs PASS at the merged head. See `DPPD.md` §14,
`SC5_PLAN.md`, and `field-runs/2026-08-05-issue4-cadence-method-skill.md`.

**Status (2026-08-06, M-2 + SC-6):** a second field run against `cadence-method-skill`
(issue #5, `job_20260805_0004`) produced findings **F-35–F-40**, split across two vehicles.
Maintenance audit **M-2** (docs/prompt only) bounded the consensus parallel mandate — the
parallel set is exactly `{Critic, Advocate}` and the `Architect →` arrow is a barrier, after
timestamps showed the tester running concurrently with both consensus agents at
`test/attempt_1` — and replaced the tester's mandated `git stash` falsifiability baseline
with a non-mutating one, ending a contract in which the tester was told to perform the
operation the reviewer is forbidden to perform. Scope change **SC-6** (**APPROVED, operator
R-6, 2026-08-06, per item**) gave a *correct* Advocate dissent an exit other than
termination: `resolution.action: "repair"` (operator confirms the dissent, job rewinds to
build carrying it as `corrections.json`, re-runs forward), a fourth independent budget
`operator_directed_rewinds` capped at 1 per gate, `source_attempt` widened to admit
`review/attempt_{n}`, and — because repairing a dissent previously erased it from the report
while overriding one did not — `execution-report.js` now scans superseded attempts, exposes
`superseded_consensus`, quotes each dissent verbatim, and drives the `consensus` gate to
WARN. Superseded evidence warns, never fails, so the latest-attempt gating contract is
intact. `SCHEMA_VERSION` 1.2.0 → **1.3.0**, report fixtures **15 → 16**; parity 88/88,
entropy 7/7, provenance 3/3, and the SC-3 micro-drill unchanged; verdict taxonomy frozen.
This run's evidence tree **survived** (primary checkout, per hard rule 5), so unlike SC-5
every finding was re-derived from evidence rather than attributed. See `DPPD.md` §15–§16,
`SC6_PLAN.md`, and `field-runs/2026-08-05-issue5-cadence-method-skill.md`.

**Status (2026-08-06, M-3):** maintenance audit **M-3** (tooling only — `adws-pipeline/`
untouched) closed four local-CI gaps found by asking whether the harness had kept up with
SC-5/SC-6 (findings **F-41–F-44**). The largest was F-27 recurring inside the harness itself:
four places printed fixture counts that nothing asserted, and no runner checked its own
size, so deleting a fixture together with its `CASES` entry would have left every suite
green under a stale banner. The report, entropy, and provenance runners now cross-check
declared cases against fixtures on disk in both directions; `run-parity.js` carries
`EXPECTED_FIXTURE_TOTAL`. Also: NFR-3 (SKILL.md < 500 lines) is asserted rather than
hand-counted, the ten agent definitions are linted for frontmatter and canonical SC-4 tiers,
and the Tier-3 review prompt — which still told reviewers to defend the unbounded
"mandatory-parallel consensus" that was F-35 — is refreshed through SC-6. All four
assertions were falsified before acceptance. Suite sizes unchanged (88/16/7/3 + drill). The
audit also caught a stale claim repeated since SC-4 — "`main` has no branch protection" —
corrected at all three sites: `main` IS protected, with an EMPTY required-checks list, which
is the actual reason the billing-locked CodeQL check does not block. See `DPPD.md` §17 and
`VERIFICATION.md` "Maintenance audit M-3".

M-2, SC-6, and M-3 were merged together through **PR #38** (squash `029ee0d`), with Tier 1
nine of nine and Tier 2 both legs PASS at the merged head (`run_id`s `20260806T032406Z` /
`20260806T032411Z`).

**Status (2026-08-07, M-4 + SC-7):** a third field run against `cadence-method-skill`
(issue #21, `job_20260807_0001`) produced findings **F-45–F-52**, again split across two
vehicles. The run promoted correctly but improvised in seven places and carried an eighth
defect it never noticed. Maintenance audit **M-4** (docs/prompt only) closed four hand-off
gaps: `criteria-to-checks` is now an explicit PRE-dispatch step at the test phase and the
tester's input list carries `check_specs` — by the old letter the tester was required to
echo ids from an artifact produced after it ran (F-45); the reviewer, Critic, and Advocate
are told to ENUMERATE the change set (`files_changed` ∪ `git status --porcelain -uall`)
because `git diff` is empty for a green-field change set and the old step 1 could approve
an unread tree (F-49); `check_type` is named outside the validator source (F-50); and the
documenter has a defined, compliant path when `allowed_paths` admits no doc location, plus
the `NO_DOC_PATH_IN_SCOPE` intake warning (F-51). Scope change **SC-7** (**APPROVED,
operator, 2026-08-07**) gave the CRITIC the machinery SC-6 built only for the Advocate: a
verified Critic `fail` on a code defect now rewinds to build (`cross_phase_rewinds.review`,
capped at 1, attempt annotation `CRITIC_FAIL_REPAIRED`) instead of dead-ending at
`REVIEW_GATE_FAILURE` (F-46); one authoritative rewind-budget accounting table settles
which of the five budgets charge a build retry — the gate-automatic ones do not, the
operator-directed one does (F-47); `tier_input.source` gains `cross-phase-rewind` and the
forward re-run after a rewind is defined as a table-tier fresh attempt, not a retry (F-48);
and `execution-report.js` now scans superseded attempts for Critic fails, not just Advocate
dissents, so the resolution that CHANGED the artifact can no longer be the invisible one
(F-52). `SCHEMA_VERSION` 1.3.0 → **1.4.0**, report fixtures **16 → 17**; parity 88/88,
entropy 7/7, provenance 3/3, and the SC-3 micro-drill unchanged; verdict taxonomy frozen.
This run's evidence tree also survived, and in the decisive case it CONTRADICTS the
orchestrator's summary — the narrative reported `consensus: pass (2 rounds clean)` while
the tree records `critic: fail` on two superseded attempts. See `DPPD.md` §18,
`SC7_PLAN.md`, and `field-runs/2026-08-07-issue21-cadence-method-skill.md`.

M-4 and SC-7 were merged together through **PR #41** (squash `a0d725b`), with Tier 1 nine
of nine and Tier 2 both legs PASS at the merged head (`run_id`s `20260807T194011Z` /
`20260807T194016Z`). The post-merge sync also corrected the root `README.md`, which still
advertised **15/15** report fixtures — stale across BOTH SC-6 and SC-7 — and listed three
`references/` files when there are four. That is M-3a's finding recurring in the one file
M-3 did not cover: the runners now assert their own suite sizes, but nothing asserts the
counts printed in `README.md`.

**Status (2026-08-08, SC-8):** a fourth field run against `cadence-method-skill` (issue
#22, `job_20260807_0004`) produced findings **F-53–F-57**, and an independent review of the
implementation produced **F-58–F-59**. The run shipped a correct artifact and exercised
SC-7's B1 rewind path successfully on its first live outing — then wrote a verdict into the
evidence tree that no validator produced. `review-risk-assess` was the only validator of the
nine whose HEURISTIC could fail a gate (any path substring-matching `/auth/i`, `/token/i`,
`/policy/i` → `risk_level: high` → `fail`), it fired on two contract-mandated fixture
directory names, and with no legal way to record a wrong validator fail the orchestrator
wrote `rubric_result: "warn"` at the `skill_trace.json` wrapper over an `output.rubric_result`
of `"fail"`. The report read only the wrapper and certified `0 fail, 1 warn`. Scope change
**SC-8** (**APPROVED, operator, 2026-08-08**) decouples the risk SCORE from the gate VERDICT
so heuristics warn and only facts fail — the discipline `criteria-to-checks`,
`document-coverage-map`, and `repo-context-scan` already followed — which makes the `high`
row of the tier table reachable for the first time (F-53) and restores exit 0, dead for six
consecutive runs (F-56); makes security matching per path segment and token with test corpora
excluded, reporting `security_sensitive_paths[]` (F-54); and finally ASSERTS the
trace-transcribes-stdout rule that `artifact-layout.md` had stated since SC-2 and nothing
checked — `execution-report.js` now scores from the validator's stdout and QUARANTINEs on
disagreement, and there is no operator override for a validator verdict (F-55). The review
round then caught the new invariant failing in the untested direction: wrapper `warn` over
output `pass` promoted at exit 0, so the mismatch became its own failing gate term and the
full 15-cell wrapper × output matrix was enumerated (F-58); and malformed `files_changed`
entries counted as assessable, letting an unreadable change set select a LOWER tier (F-59).
Parity **88 → 93**, report fixtures **17 → 19**; `review-risk-assess` v1.0.0 → **v2.0.0** and
diverged-by-design, so README's byte-for-byte claim moves 8-of-9 → **7-of-9**. No new
terminal state, DECISION, exit code, or `SCHEMA_VERSION` (still 1.4.0). Re-run against the
job's real 73-file change set, v2.0.0 returns `pass`/`medium`/`security_sensitive_count: 0` —
all twelve matches were false positives and the override was never necessary. See `DPPD.md`
§19, `SC8_PLAN.md`, and `field-runs/2026-08-07-issue22-cadence-method-skill.md`.

SC-8 was merged through **PR #43** (squash `3ab7283`), with Tier 1 nine of nine and Tier 2
both legs PASS at the merged head (`run_id`s `20260808T150319Z` / `20260808T150325Z`).

**Status (2026-08-05, SC-4):** scope change **SC-4** (findings F-18–F-26 from an operator
review of FR-12) was **APPROVED (operator R-6, 2026-08-05, per-item: A1–A10, B1–B3)** and
implemented: SC-4a replaces the uniform `Architect` tier column with a per-phase table
keyed by error-propagation cost (plan at opus on every row; document/ship/verify make up
the cost), admits `fable` as the fourth canonical evidence tier as an escalation ceiling
rather than a mandated cell, adds the Codex alias `nova` → fable, rewrites the grader
floor as an absolute now that "the Architect floor" has no referent, defines
ladder-saturation recording, and closes SC-2's deferred C2 (on run #105's medium-risk
Advocate record); SC-4b corrects three fixture manifests recording non-escalating
escalations and re-keys the 15 `run_manifest.model_tiers` maps. `execution-report.js`
untouched; SCHEMA_VERSION stays 1.2.0; suites unchanged at 84/84 + 15/15 + 7/7 + 3/3 +
the SC-3 micro-drill. Merged through PR #31 (`b3bb75a`). Governing version: **DPPD 1.4**.
See `DPPD.md` §13 and `SC4_PLAN.md`.

**Status (2026-07-18):** second production run — first external field run — executed
against `Org-EthereaLogic/agentic-starter-kit` issue #103 in a Cowork/cloud runtime
(agent types unregistered → validated the inline-spec dispatch fallback, now codified
as SKILL.md **F-11**). Verdict **PROMOTE** (exit 0, 7/7 gates, 1 attempt/phase, clean
consensus, zero entropy events). The run's 7 findings were resolved and merged via
[PR #12](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/12) (agent-spec
hardening, artifact-layout rules 8–9, new `references/validator-inputs.md`); field-run
report + per-finding resolution: `docs/field-runs/2026-07-18-issue103-agentic-starter-kit.md`.
**Still deferred:** C2 and the step-6 E2E-2 confirmation run — this run exercised
neither B1 (dissent override) nor B2 (delegated push), so E2E-2 remains open.

**Status (2026-07-18, run 3):** third production run against
`Org-EthereaLogic/agentic-starter-kit` issue #104 (the CRIT-002 vacuous-gate fix; same
Cowork/cloud runtime, F-11 dispatch fallback, patch ship mode). Verdict **PROMOTE**
(exit 0, 7/7 gates, grader 4/4 twice, clean consensus) after a false-negative
QUARANTINE exposed a verifier-spec contradiction — resolved spec-side in this branch
(adws-verifier.md skip semantics; SKILL.md ship-staging union). First live exercise of
the verify RETRY path with tier escalation. Target repo: PR #118 merged, follow-up
#119 filed, dashboard #120. Skill-repo spec/doc sync merged via
[PR #14](https://github.com/Org-EthereaLogic/adws-pipeline-skill/pull/14) (parity
84/84). Run record:
`docs/field-runs/2026-07-18-issue104-agentic-starter-kit.md`. **Still deferred:** C2
and E2E-2 (B1/B2 unexercised).

**Status (2026-08-05, field-run series):** the external field-run series now stands at
**nine retained records** under `docs/field-runs/`, covering agentic-starter-kit issues
#103, #104, #105, #106, #107, #109, #111, #119, and #135. Verdicts: seven PROMOTE, one
PROMOTE-with-warnings (#119, exit 10 — the first recorded exit-10 in the series), and one
RETRY / `TEST_GATE_FAILURE` (#109, operator-completed the same day). The last two records
(#119 `job_20260719_0003`, #135 `job_20260719_0002`) were merged 2026-08-05 via PRs #22
and #33; the #135 branch had never been pushed and existed only in the operator's local
clone. Per-run detail lives in `VERIFICATION.md`; the earlier per-run status blocks below
(#103, #104) are retained as the point-in-time record and are not extended per run.

A second series runs against `cadence-method-skill` — issue #4 (`job_20260805_0003`,
PROMOTE, source of SC-5), issue #5 (`job_20260805_0004`, PROMOTE-with-warnings, source of
M-2 and SC-6), issue #21 (`job_20260807_0001`, PROMOTE-with-warnings, source of M-4 and
SC-7), and issue #22 (`job_20260807_0004`, PROMOTE-with-warnings, source of SC-8) — bringing
the retained total to **thirteen** (nine + four). The #5 record is the first in either series
whose evidence tree survived the run, so it is the first whose gate claims are independently
re-derivable rather than orchestrator-reported; every `cadence-method-skill` record since has
kept its tree, and in two cases (#21, #22) the tree contradicts the orchestrator's own
summary. *(Count corrected 2026-08-08: this paragraph had read "eleven" since 2026-08-05 and
was stale across SC-7 as well as SC-8 — the same class of unasserted count M-3a and SC-7's
post-merge sync both found in `README.md`.)*

**Run numbering (renumbered 2026-08-05):** "run N" counts production runs in **job-ID
allocation order**, spanning 11 runs — run 1 `job_20260715_0001` (no field-run record),
runs 2–4 issues #103/#104/#105, runs 5–6 the two jobs of issue #106, run 7 issue #109,
run 8 issue #107, runs 9–11 issues #135/#119/#111. Runs 7 and 8 were previously
reversed: the labels had been assigned in *completion* order, and issue #109's job was
allocated 07-18 but terminated RETRY and was operator-completed after issue #107's 07-19
job finished. Allocation order is now the single key because it is derivable from the
evidence tree without narrative. Full sequence and rationale: `VERIFICATION.md`.

Effort scale: **S** ≤ half day · **M** ≈ 1 day · **L** ≈ 2–3 days.

---

## 1.0 Requirements & Design Freeze

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 1.1 | Extract task contract fields from `ADWS_TASK_CONTRACT.md` + `taskspec.schema.json`; trim to skill-relevant fields | Approved contract field list | S | — | FR-1, US-1 |
| 1.2 | Define per-phase entry/exit criteria and retry budgets from `src/phases.js` semantics | `references/phase-gates.md` draft | S | — | FR-2, FR-3, US-2 |
| 1.3 | Freeze artifact tree layout (attempt dirs, job-level manifests, trace file shape) | `references/artifact-layout.md` draft | S | — | FR-4, FR-10 |

**Exit criteria:** DPPD §5 confirmed against extracted sources; no open design questions.

## 2.0 Skill Core

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 2.1 | Write `SKILL.md`: trigger description, contract intake, state machine, gate rules, subagent dispatch instructions, model-tier selection table + retry-escalation rule | `SKILL.md` (< 500 lines, NFR-3) | M | 1.1–1.3 | FR-1–FR-3, FR-6–FR-8, FR-12 |
| 2.2 | Write `references/task-contract.md` template with vague-task rejection guidance | Contract template | S | 1.1 | AC-1.2 |
| 2.3 | Finalize `references/phase-gates.md` and `references/artifact-layout.md` | Reference docs | S | 1.2, 1.3 | FR-2–FR-4 |

**Exit criteria:** Dry read-through — a fresh agent given SKILL.md can state the correct next action for each phase/gate state without ambiguity.

## 3.0 Validator Ports

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 3.1 | Port 5 direct-port validators (`criteria.to_checks`, `review.risk_assess`, `document.coverage_map`, `patch.compose`, `verify.evidence_map`) | 5 standalone scripts (NFR-4) | M | 1.3 | FR-5, US-3 |
| 3.2 | Port 4 adapted validators (`task.normalize`, `repo.context_scan`, `ship.mode_select`, `drift.sentinel` with UMIF math inlined) per DPPD §5.2 port notes | 4 standalone scripts | L | 1.3 | FR-5, FR-11 |
| 3.3 | Build fixture parity suite: shared fixtures run against original and the 9 deterministic ported validators, verdicts diffed | Parity report, all-identical _(amended by SC-1: 8 packs identical to originals; `criteria-to-checks` diverged-by-design, verified vs a frozen baseline — 84/84 total)_ | M | 3.1, 3.2 | AC-3.1, AC-3.3, R-2 |

**Exit criteria:** Parity report shows identical verdicts on all fixtures; each script runs standalone under Node 20.

## 4.0 Agent Definitions

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 4.1 | Write 7 phase agents (planner, builder, tester, reviewer, documenter, shipper, verifier) with tool allowlists, evidence-writing duties, and default model-tier assignments | 7 agent files | M | 2.1 | FR-2, FR-4, FR-8, FR-12 |
| 4.2 | Write Critic and Advocate agents (fresh-context inputs, dissent recording rule, role model tiers) | 2 agent files | S | 2.1 | FR-7, FR-12, US-4 |
| 4.3 | Write AC-coverage grader agent (recreation of `pr.drift_sentinel.spec`: per-criterion satisfied/partial/unaddressed/contradicted verdicts over `gh pr diff`) | 1 agent file | S | 2.1 | FR-5, FR-11 |

**Exit criteria:** Each agent, given a fixture phase input, produces evidence files in the correct attempt directory and nothing outside it.

## 5.0 Ship & Report Tooling

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 5.1 | Ship procedure: worktree materialize → explicit-path staging → commit → mode-specific action (`pr` / `direct_branch` / `patch`) via `gh` | Ship section of shipper agent + SKILL.md | M | 3.2 (ship.mode_select) | FR-9, US-5, NFR-5 |
| 5.2 | Port execution-report generator (verdict matrix per ADWS_Pro exit-code semantics, artifact-only inputs) | `scripts/execution-report.js` | M | 1.3 | FR-10, US-6 |

**Exit criteria:** AC-5.1–5.3 pass on a scratch GitHub repository; report generated from a fixture artifact tree matches expected verdicts.

## 6.0 Integration Test & Acceptance

| WP | Work package | Deliverable | Effort | Depends on | Traces to |
|-----|--------------|-------------|--------|------------|-----------|
| 6.1 | End-to-end run, `pr` mode, on sample repo: full 7 phases, live PR opened | Run evidence + PR URL | M | 2.0–5.0 | §1.3 success criteria |
| 6.2 | End-to-end runs, `direct_branch` (incl. protected-branch refusal) and `patch` modes | Run evidence | S | 6.1 | AC-5.2, AC-5.3 |
| 6.3 | Gate-failure drills: forced test failure (retry path) and retry-budget exhaustion (termination path) | Run evidence | S | 6.1 | AC-2.1, AC-2.2 |
| 6.4 | Acceptance review against all user-story ACs; record sign-off | Sign-off note in project folder | S | 6.1–6.3 | DPPD §8 |

**Exit criteria:** All DPPD §4 acceptance criteria demonstrated; project accepted or gap list produced.

---

## Dependency Summary

```
1.0 ──► 2.0 ──► 4.0 ──┐
  └───► 3.0 ──► 5.0 ──┼──► 6.0
                      │
        2.0 ─────────►┘
```

3.0 runs in parallel with 2.0 after design freeze. 6.0 starts only when 2.0–5.0 exit criteria are met.

**Total estimated effort:** ~9–12 working days equivalent (heavily compressible with agent execution; parity suite 3.3 and E2E runs 6.x are the critical path).
