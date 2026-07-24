# SC-3 Plan — Falsifiability & Provenance from the Fusion-Harness Comparative Review

**Status:** PROPOSED — pending operator R-6 approval. **No repository files are changed
by this document**; it is the originating proposal (SC2_PLAN.md is the precedent format).
On approval, the DPPD §11 amendment in §6 below is pasted into `DPPD.md` (→ v1.3) and the
WBS intro gains an SC-3 line.

**Evidence source:** a comparative review of `disler/fusion-harness` (commit `5852f2e`)
against `main`, re-grounded by an adversarial multi-lens review (2026-07-23): **39
findings raised, 38 survived independent refutation** across six lenses (accuracy,
redundancy, state-machine, safety, scope, rejections). This plan adopts **only** the
subset that (a) closes a genuine ADWS gap and (b) clears R-6 per item. The larger
proposed adoption — a new gate DSL, a `GATE_DEFECT` terminal state, dual-perspective
planning, and a broad telemetry stack — is explicitly **rejected** in §5, because the
review established that ADWS already has per-criterion grading (`adws-grader`),
criterion→check derivation (`criteria-to-checks` + `adws-tester`), a frozen verdict
taxonomy, and a deliberately lean core (NFR-2, R-6).

**Numbering:** continues the findings register (last: F-13, host-runtime blindness,
`docs/field-runs/2026-07-20-issue111-agentic-starter-kit.md`). New findings:
**F-14 … F-17**.

**Decision boundary this plan enforces:** the verdict taxonomy in `execution-report.js`
(`PROMOTE`/`RETRY`/`QUARANTINE`, exit `0/10/1/2`, frozen `NO_RETRY_REASONS` /
`QUARANTINE_REASONS`) is **not** extended. Every item below maps onto the *existing*
vocabulary. This is the review's top blocker: an unrecognized `final_status` is silently
forced to `QUARANTINE`, and `failure_reason` is inert on `completed` jobs, so new states
cannot be added "additively."

---

## 1. Findings register (new, from the comparative review)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-14 | design gap (latent defect) | **No falsifiability assertion on acceptance checks.** The test gate derives checks from acceptance criteria and reports pass/fail, but nothing asserts a check *can* fail before the change exists. A **vacuous or NOT-RUN green** (a check that trivially passes, or reports "0 tests passed" because its runtime is absent) is indistinguishable from a real pass — the same vacuous-skip hazard already flagged, and the mirror of F-9's "NOT RUN ≠ green light." | `criteria-to-checks.js` + `adws-tester.md:12-19` (no pre-change red assertion); F-9 (SKILL.md §"Environment & runtimes"); vacuous-skip follow-up (SC2_PLAN.md:44) |
| F-15 | quality / DX | **Retry feedback is unstructured.** A failed gate rewinds to build carrying the findings "as feedback" (free text); the failing checks are not carried forward as a structured record paired with the fix, so the fix instruction and the failure it addresses are not auditable as a pair. | `phase-gates.md:43-52` (cross-phase rewind "carrying the grader's findings as feedback"); no corrections schema in `artifact-layout.md` |
| F-16 | observability gap | **"The check was defective, not the code" is decided but never recorded.** The pipeline distinguishes code-wrong (test-rewind to build) from check-wrong only implicitly; there is no evidence field marking a check/criterion-mapping defect, so a defective check reads as an ordinary code failure in the report. | `phase-gates.md:45-48` records only the code-wrong rewind (`cross_phase_rewinds.test`); the complementary check-wrong case has no counter or record |
| F-17 | audit gap | **No per-phase invocation provenance.** `phase_manifest` records `model_tier` but not the resolved model id, cost, tokens, or real wall-clock; `VERIFICATION.md` records "no per-phase LLM telemetry" as an honest caveat, and the live-drill execution reports/model-cost were lost at teardown. | `VERIFICATION.md:129`; `docs/acceptance/DRILL_EVIDENCE.md` caveats 1-2 (no captured model id/cost/tokens; placeholder timestamps) + teardown lesson (`DRILL_EVIDENCE.md:5`): "copy execution reports into the skill repo before teardown" |

Not adopted from the review (routed to §5, no SC-3 action): the acceptance-gate DSL,
`GATE_DEFECT`/`ALREADY_SATISFIED`/`GATE_WEAK` as new states, dual-perspective planning,
the two-column TUI, and the broad telemetry stack.

---

## 2. Proposed scope: two tranches

### SC-3a — Falsifiability, corrections & check-defect record (docs/spec only; zero parity/report-logic risk)

| Item | Change | Files |
|---|---|---|
| A1 (F-14) | **Falsifiability at the test gate, REUSING existing machinery — no new DSL, script, or manifest.** Before honoring a derived check as passing, `adws-tester` runs its checks against the **pre-change** worktree and records a baseline; a criterion whose check does **not** go RED pre-change is `GATE_WEAK` → recorded as an **unverified criterion (warn)**, never counted as a pass. The check set is `criteria-to-checks`' emitted `check_specs` (the single source of truth for criterion→check classification, pinned to v1.1.0); `adws-tester` is the execution surface. | `adws-pipeline/SKILL.md` §"Phase loop"/test, `references/phase-gates.md`, `.claude/agents/adws-tester.md` |
| A2 (F-14, F-9, F-13) | **Red-for-the-right-reason rule.** A baseline RED must record *why*: `assertion-failed-runtime-present` (valid falsifiability) vs. `collection-error`/`NOT RUN` (invalid — runtime absent). A NOT-RUN red is **not** a valid falsifiability baseline (extends F-9); the post-change green stays **necessary-not-sufficient** on non-target hosts (F-13). A green baseline whose check cannot be shown capable of failing is `GATE_WEAK` → gap, **never** "already satisfied / ship nothing." | `adws-pipeline/SKILL.md` §"Environment & runtimes", `references/phase-gates.md` |
| A3 (F-15) | **Structured corrections as ONE fresh, immutable artifact.** On a rewind-to-build, the orchestrator authors a `corrections.json` — `[{check_id, criterion, expected, actual, path, classification: code\|check\|environment\|prerequisite}]` — as a **new file in the new build `attempt_{n}/` tree** (rule-1 append-only: written once, never edited in place; **not** via SC-2 A3's rule-2 post-hoc list, whose members amend files an agent already wrote). It is the single structured representation of the rewind feedback the build agent consumes, replacing the free-text feedback channel so the fix and the failure it addresses are auditable as a pair. | `references/artifact-layout.md` (add `corrections.json` to the attempt-tree schema + file-shapes), `adws-pipeline/SKILL.md`, `references/phase-gates.md` |
| A4 (F-16) | **"Check-defective" record + cap, grafted onto the existing vocabulary.** Add a `cross_phase_rewinds`-style counter (`run_manifest.check_defect_repairs`), capped at **ONE per job** and used **orchestrator-side for cap enforcement only** — exactly like `cross_phase_rewinds.{test,verify}`, which `execution-report.js` does not read. A check repair lands in a **fresh** `attempt_{n}` (FR-4), consumes **no** build retry, and surfaces in the report only **incidentally**, via the existing multi-attempt warning on the fresh test attempt. **No new terminal state, DECISION, or exit code** — it resolves within the existing RETRY/warn vocabulary; a second occurrence terminates on the existing `TEST_GATE_FAILURE`/budget path. A *check-defect-labelled* report line would be a future **additive, regression-first** report field (per B2), never part of SC-3. | `references/phase-gates.md`, `adws-pipeline/SKILL.md`, `references/artifact-layout.md` (`run_manifest` fields) |
| A5 (integration) | **Give falsifiability a contract home — or make it always-on.** Recommended: **always-on** whenever `policy.test_policy: required` (falsifiability is a correctness property, not a preference), so no contract field is needed. If made opt-in instead, it enters as `policy.falsifiability` (boolean) with a `task-contract.md` field-rule row and `task-normalize` awareness — **never** a bare top-level `gate_first` key (`task-normalize` ignores unknown keys, so a bare flag would silently carry no intake coverage). | `references/task-contract.md`, `adws-pipeline/SKILL.md` |
| A6 (housekeeping) | **License-compatibility note.** Independent reimplementation only (no code copied from `fusion-harness`); the repo ships **Apache-2.0**, `fusion-harness` is **MIT**, so any third-party material ever imported must be attributed/relicensed compatibly. (Corrects the review's C4 miscitation — C4 is the prompt-injection rule, not a licensing rule.) | this plan; a note by `LICENSE` only if material is ever imported (none is) |

**Verification (SC-3a):** parity **84/84**, report **13/13**, entropy **7/7** UNCHANGED
(no validator or report logic touched); dogfood the review gate over the doc/spec diff;
one live **micro-drill forcing a vacuous / NOT-RUN green** to confirm A1/A2 classify it
`GATE_WEAK` (unverified), not a pass.

### SC-3b — Invocation provenance (evidence-schema; new fixtures; advisory-only)

| Item | Change | Parity / report impact |
|---|---|---|
| B1 (F-17) | **Per-phase invocation-provenance fields, advisory-only, additive to `phase_manifest`:** `model_id` (the runtime model behind the canonical tier), `cost_usd`/`tokens_in`/`tokens_out` **where the runtime exposes them**, `elapsed_ms` (real `date -u` deltas), `tool_call_count`, and `timeout`/`cancel` flags. **Absent telemetry NEVER implies pass or fail** (mirrors F-9 honesty). Explicitly **not** X-1 hosting telemetry — no dashboard, WebSocket, DB, or background process (NFR-2). Closes DRILL_EVIDENCE caveats 1-2 and the VERIFICATION "no per-phase LLM telemetry" caveat. | New `phase_manifest` schema doc + fixtures for present / absent / partial telemetry; the 9 validator packs and `criteria-to-checks` v1.1.0 baseline untouched (**84/84** preserved) |
| B2 (F-17) | **Keep `execution-report.js` UNTOUCHED in SC-3.** Provenance lives in `phase_manifest` and is surfaced by the orchestrator's terminal relay, **not** the report generator, preserving **13/13**. If operators later want it in `execution_report.md`, that is a *separate* future SC, and only as **additive fields, regression-first** (fixture before logic, `SCHEMA_VERSION` bump, the 13 existing verdict fixtures unchanged and still green, **no** new DECISION/exit). | `execution-report.js` **unchanged**; report suite stays **13/13** deterministic |

**Verification (SC-3b):** `phase_manifest` schema doc + provenance fixtures
(present/absent/partial); **84/84 + 13/13 + 7/7** unchanged; dogfood the review gate.

---

## 3. Sequencing & effort

| Step | Tranche | Effort | Gate |
|---|---|---|---|
| 1 | DPPD §11 amendment recording SC-3 (this plan approved) | XS | operator approval (R-6), **per item** — not the bundle |
| 2 | SC-3a (A1–A6) | S–M — docs/spec | suites green (84/84, 13/13, 7/7) + dogfood review gate + vacuous-green micro-drill |
| 3 | SC-3b (B1) | S — schema + provenance fixtures | suites green + new telemetry fixtures deterministic |
| 4 | Live confirmation run on a real small task exercising A1 (forced RED baseline) + A3 (one correction round) | M | PROMOTE + evidence tree **archived under `docs/acceptance/`** (also closes the DRILL_EVIDENCE "copy reports before teardown" lesson) |

**Branching:** `feat/sc3a-falsifiability-and-corrections`, then `feat/sc3b-provenance` —
two PRs, each through the skill's own review gate, never committing to `main` directly
(dogfooding). Restrict the "run it through the pipeline itself" claim to milestones that
ship executable behavior; the doc/spec-only step 2 uses **edit + re-run parity + dogfood
review gate** (a prose PR's build/test/verify gates are degenerate without a code diff).

---

## 4. Invariants (must hold through all tranches)

1. **84/84 parity** untouched; `criteria-to-checks` stays on its **v1.1.0** baseline and
   becomes the **single source** of criterion→check classification — A1 *consumes* its
   `check_specs`, never re-classifies criteria in a parallel path (R-2: no invisible
   classifier drift).
2. **Verdict taxonomy frozen.** No new `DECISION`, exit code, or entry to
   `NO_RETRY_REASONS`/`QUARANTINE_REASONS`. Report stays **13/13** deterministic. Any
   future report field is additive + regression-first + `SCHEMA_VERSION` bump. (The
   review's top blocker.)
3. **FR-4 append-only** — corrections (A3) and check-defect repairs (A4) land in **fresh
   attempts** or **exhaustively-enumerated** designated fields (extends SC-2 A3), never
   in-place edits; no open-ended mutation of the evidence tree.
4. **NFR-2 lean core** — no new runtime, DSL, background process, or dependency:
   falsifiability reuses `criteria-to-checks` + `adws-tester`; provenance is plain
   manifest fields.
5. **NFR-3** — SKILL.md stays < 500 lines (currently **322**); detail pushed to
   `references/`.
6. **F-9 / F-13 honesty** preserved and extended — NOT-RUN is never a pass and never a
   valid RED; container-green stays necessary-not-sufficient.
7. **R-6** — each *change* item (A1…A6, B1) carries its own §2.1 justification; the
   bundle is **not** approved as a single milestone. (B2 introduces no change — it is the
   constraint "leave `execution-report.js` untouched" — so it carries no separate
   R-6 approval.)

---

## 5. Explicitly NOT in scope (rejected — recorded for completeness)

| Rejected | Why (tied to invariants) |
|---|---|
| **New `acceptance_gate.json` DSL + closed adapter set + dedicated `acceptance-gate.js` runner** (the review's WS-A *mechanism*) | Duplicates `criteria-to-checks` + `adws-tester`; a second, parity-unpinned criterion classifier drifts invisibly from the v1.1.0 baseline (R-2); violates the lean-core value prop (NFR-2, R-6). The *concept* (falsifiability) is kept as A1; the mechanism is not. A ≥15-fixture new DSL for a prose+tiny-script core is itself a proportionality red flag. |
| **`GATE_DEFECT` / `ALREADY_SATISFIED` / `GATE_WEAK` as new terminal states or decisions** | The verdict taxonomy is frozen: an unrecognized `final_status` is silently forced to QUARANTINE, and `failure_reason` is inert on `completed` jobs, so these cannot be added additively. `GATE_WEAK` survives only as a **warn-classification** inside the existing vocabulary (A1); the others are dropped. |
| **Dual-perspective (architect/builder-lens) planning** (WS-F) | **Deferred.** Same-provider dual-lens does **not** deliver the cross-**provider** diversity R-3/X-3 are defined by (SC-1.c: deferred for lack of cross-provider keys), duplicates the existing S-6 Critic∥Advocate consensus, and **cannot be credited toward closing R-3**. Revisit only with cross-provider credentials. |
| **Broad phase telemetry / prompt-provenance stack** beyond B1's narrow slice | X-1 (dashboard/WebSocket/telemetry infra) was a *deliberate* descope, not an oversight; B1 captures only the audit-closing minimum (model id/cost/tokens/wall-clock into the append-only manifest). |
| **Two-column TUI; persistent role memory; `/tmp` evidence; prompt-only immutability; model-generated executable (`uv`) gates** | Unchanged from the review — each collides with append-only evidence (C3/FR-4), worktree isolation (FR-8), or the deterministic-script ethos (NFR-1/NFR-4). Note: the review also narrowed the blanket "shared-checkout parallel writers" rejection — the pipeline **mandates** disjoint-path parallel writers (Critic∥Advocate, S-6); the real hazard is *contending* writers on the *same* path, which stays rejected. |

---

## 6. Ready-to-apply DPPD §11 amendment (paste on approval)

> ## 11. Scope Change SC-3 (2026-07-23, from comparative review) — PROPOSED
>
> Proposed per R-6 (operator approval pending, **per item**). Amends §2: narrowly
> reopens a slice of X-1 for **per-phase invocation provenance** (append-only manifest
> fields only — no hosting infra), and adds **falsifiability** as a test-gate correctness
> property. Version on approval: **DPPD 1.3**. Motivated by the `fusion-harness`
> comparative review (findings **F-14 … F-17**); full register, per-item detail,
> sequencing, and invariants in **`docs/SC3_PLAN.md`**.
>
> **SC-3a — Falsifiability, corrections & check-defect record (docs/spec; zero parity
> risk).** A1 falsifiability at the test gate, **reusing** `criteria-to-checks`'
> `check_specs` + `adws-tester` (no new DSL/runner); A2 red-for-the-right-reason
> (extends F-9/F-13 — a NOT-RUN red is not a valid baseline); A3 structured `corrections`
> as one fresh, immutable `corrections.json` in the new build attempt tree (explicitly
> outside SC-2 A3's post-hoc designated-field list, FR-4-safe); A4
> `run_manifest.check_defect_repairs` counter capped at one/job, resolving within the
> existing RETRY/warn vocabulary (**no** new state/decision/exit); A5 always-on under
> `test_policy: required` (or a validated `policy.falsifiability`); A6 Apache-2.0/MIT
> import note.
>
> **SC-3b — Invocation provenance (evidence-schema; advisory-only).** B1 additive,
> advisory `phase_manifest` fields (model id/cost/tokens/wall-clock/tool-calls; absent ≠
> fail; not X-1 infra). B2 `execution-report.js` left **untouched** (report stays 13/13);
> report-surfacing deferred to a later SC, additive + regression-first only.
>
> **Invariants held:** verdict taxonomy frozen (no new DECISION/exit — the review's top
> blocker); 84/84 parity + 13/13 report + 7/7 entropy preserved; `criteria-to-checks`
> becomes the single criterion→check source (R-2); FR-4 append-only strengthened, never
> weakened; NFR-2 lean core (no new runtime/DSL); NFR-3 SKILL.md < 500 lines. **R-3
> remains open** — dual-perspective planning (WS-F) was **not** adopted; cross-provider
> Trinity (X-3) stays deferred per SC-1.c.
>
> **Rejected (see `docs/SC3_PLAN.md` §5):** acceptance-gate DSL, new terminal states,
> dual-perspective planning, broad telemetry, TUI, persistent memory, `/tmp` evidence,
> model-generated gates.

On approval, also add to the `WBS.md` intro (mirroring its SC-2 paragraph): *"A second
enhancement scope (**SC-3**, findings F-14…F-17 from the fusion-harness comparative
review) proposes falsifiability at the test gate (reusing existing validators) and
per-phase invocation provenance; verdict taxonomy frozen. See `docs/SC3_PLAN.md`."*
