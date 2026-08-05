# SC-4 Plan — Per-Phase Model Tiers & the `fable` Evidence Tier

**Status:** APPROVED (operator R-6, 2026-08-05, per item A1–A10 and B1–B3) & IMPLEMENTED —
merged to `main` via PR #31 (squash `b3bb75a`).
`DPPD.md` §13 is the governing record (v1.4), and `WBS.md` records the implementation.
This document is retained as the originating plan and verification ledger
(SC3_PLAN.md is the precedent format).

**Evidence source:** an operator-initiated review of FR-12 tier selection (2026-08-05),
prompted by the observation that the plan phase runs `sonnet` at low and medium risk.
The review confirmed the observation is correct for those two rows, and surfaced eight
further defects clustered around the same requirement — a taxonomy that contradicts
itself, a floor rule that loses its referent, an unspecified escalation cap, and three
fixture manifests recording escalations that did not escalate. Unlike SC-2 and SC-3 this
plan has no external comparative source; every finding is grounded in a file:line
citation from this repository.

**Numbering:** continues the findings register (last: F-17, invocation provenance,
`SC3_PLAN.md` §1). New findings: **F-18 … F-26**.

**Decision boundary this plan enforces:** tier selection remains a **documentation
contract enforced at dispatch time**, never a gating concern. No JavaScript in this
repository validates, enumerates, orders, or compares tier values today, and none does
after this change. `execution-report.js` keeps reading `model_tier` as an opaque string;
the nine validators stay tier-blind; the entropy gate keeps emitting bands, not tiers.
This is the invariant that holds the blast radius of a table rewrite at zero, and it is
the reason a fourth tier value costs nothing to admit.

---

## 1. Findings register (operator review of FR-12)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-18 | design gap | **A single `Architect` column prices all seven phase agents identically.** A plan error propagates through six downstream gates before anything catches it; a `document` error is cheap and locally caught. The table charges the same for both, and at low and medium risk the planner runs `sonnet` — the phase whose errors are most expensive to discover late is priced like the phase whose errors are cheapest. | `phase-gates.md:249-253` (single `Architect (phase agents)` column); `SKILL.md:107-110` (selection step) |
| F-19 | contract defect | **FR-12 contradicts itself on the top tier.** The same requirement sentence permits `sol` to resolve to Fable at dispatch *and* mandates that "recorded evidence SHALL remain normalized to Haiku/Sonnet/Opus". A Fable-executed phase is therefore recorded as `opus`: the manifest misreports which model produced the evidence, which is precisely what SC-3 B1 added provenance fields to prevent. | `DPPD.md:86` (both clauses in one sentence); `phase-gates.md:242`; `artifact-layout.md:62` (three-value constraint) vs. SC-3 F-17 (`SC3_PLAN.md:41`) |
| F-20 | latent availability risk | **A mandated top tier would make a whole risk row unrunnable for some installs.** Fable requires 30-day data retention and returns `400` wherever the calling workspace's effective retention is below that (a zero-data-retention org can lift this per workspace, but nothing in the skill can assume it has); its classifiers can also decline a request (HTTP 200, `stop_reason: "refusal"`, empty content), which reaches the evidence tree as a phase that wrote nothing — the exact shape M-1a's `pipeline_completion` gate reads as QUARANTINE. The skill installs into third-party projects and consumes untrusted repositories, so neither condition is hypothetical. | M-1a missing-phase-evidence gate (`VERIFICATION.md:360-362`); `install.sh` ships the skill into arbitrary target repos |
| F-21 | contract defect | **One Codex alias, two runtime bindings.** `sol` means "opus, or fable when the runtime exposes it" — so the alias does not identify a tier, and two installs can dispatch different models from identical evidence. | `phase-gates.md:242`; `README.md:103`; `DPPD.md:86` |
| F-22 | spec break (introduced by A1) | **The grader floor loses its referent under a per-phase table.** "The grader always runs at the Architect floor (opus)" resolves to a single value only while `Architect` is one column. Against a per-phase low row it reads literally as *haiku* — putting the drift-sentinel grader below its own floor on the most common row. | `phase-gates.md:259` |
| F-23 | design gap | **Escalation at the cap is unspecified.** The ladder is "escalate one tier, capped at opus", with no statement of what a capped escalation *records*. A saturated escalation is therefore indistinguishable in evidence from a no-op — and A1 seats four cells at the ceiling on the high row, making saturation routine rather than exceptional. Root cause of F-26. | `phase-gates.md:130-131,255-256`; `SKILL.md:132-133,170-172`; `artifact-layout.md:94` |
| F-24 | ambiguity | **The risk-source boundary is stated two different ways, and map heterogeneity is undocumented.** `phase-gates.md:229-230` says recompute "from review onward"; `SKILL.md:194-195` says "after review gate passes… for remaining phases". `review-risk-assess` is a review-gate *validator*, so it runs after the reviewer — the reviewer's own tier must come from contract risk. Separately, nothing records that `run_manifest.model_tiers` legitimately mixes entries selected under two different risk levels. Cosmetic under a uniform column; a three-way swing under a per-phase table. | `phase-gates.md:229-230`; `SKILL.md:194-195`; `validator-inputs.md:27` |
| F-25 | latent defect (widened by A1) | **The haiku write-and-verify mitigation is scoped to roles, not to the tier.** `SKILL.md:66-72` requires the explicit write-then-verify instruction only for "the single-file writers (Critic, Advocate, Grader)" — the roles where the issue-#107 failure was *observed*, not the only roles susceptible. A1 seats `document` at haiku, putting a phase agent on the hazard with no mitigation. | `SKILL.md:66-72`; issue-#107 field run (`docs/field-runs/2026-07-19-issue107-agentic-starter-kit.md`) |
| F-26 | evidence defect | **Three fixture manifests record escalations that did not escalate.** `promote_retry_recovered` build attempt_2 carries `tier_input.source: "retry-escalation"` with `model_tier: "sonnet"` — the same tier as attempt_1. The `retry` fixture's three test attempts all record `sonnet` with no `tier_input` at all, across two retries that the spec requires to escalate. Nothing asserts tiers, so both survived every suite. | `parity/execution-report-fixtures/promote_retry_recovered/…/build/attempt_2/phase_manifest.json:8-9`; `…/retry/…/test/attempt_{1,2,3}/phase_manifest.json:8` |

---

## 2. Proposed scope: two tranches

### SC-4a — tier table, taxonomy & ladder (docs/spec only; zero parity/report-logic risk)

| Item | Change | Files |
|---|---|---|
| A1 (F-18) | **Per-phase Architect tiers.** Replace the single `Architect (phase agents)` column with seven phase columns keyed by error-propagation cost: `plan` at `opus` on every row (its output is a short contract and its errors poison six downstream gates — the cheapest place to buy capability), `review` at `opus` from medium (last LLM judgment before ship), `build`/`test` scaling with risk, and the mechanical tail dropping. Rows stay exactly `high\|medium\|low`. | `references/phase-gates.md` §Model-tier selection; `SKILL.md` §Phase loop step 4 |
| A2 (F-19) | **`fable` as the fourth canonical evidence tier**, and the ladder widened to `haiku → sonnet → opus → fable`, capped at `fable`. This **resolves** the FR-12 self-contradiction rather than extending the schema for its own sake: the requirement already permitted Fable at dispatch while forbidding it in evidence. | `phase-gates.md:130-131,255-256`; `references/artifact-layout.md:62,94`; `SKILL.md:171-172`; `docs/DPPD.md:86`; `README.md` |
| A3 (F-20) | **`fable` is a ceiling, not a floor.** No table cell mandates it. It is reachable only by escalating off `opus` on the ladder, or by an explicit operator election recorded as `tier_input: { "source": "operator-tier-override", "value": "fable" }`. Rationale recorded in the spec so a future cost or capability pass does not silently promote it into a cell. | `phase-gates.md`; `SKILL.md` |
| A4 (F-21) | **Codex alias `nova` → `fable`; `sol` becomes strictly `opus`.** A behavior change for existing Codex deployments — today `sol` legitimately resolves to Fable when the runtime exposes it — so it carries its own R-6 justification and is not implied by A2. `nova` continues the existing celestial ladder (`luna`/`terra`/`sol`). | `phase-gates.md:238-242`; `README.md:102-104`; `DPPD.md:86` |
| A5 (F-22) | **Grader floor rewritten as an absolute.** The grader runs at `opus` on every row, independent of any phase tier and never below it, preserving the original `pr.drift_sentinel.spec` policy without depending on a column that no longer exists. | `phase-gates.md:259` |
| A6 (F-23) | **Ladder-saturation semantics**, covering all three escalation sources. At the ceiling the attempt keeps its `model_tier` and records `retry-escalation-saturated`, `entropy-gate-saturated`, or `operator-resolution-saturated`. Recording rule only: the retry is consumed as usual and no gate, budget, or verdict changes. | `phase-gates.md` (retry, stability gate, F-6 re-review); `SKILL.md:132-133,170-172`; `artifact-layout.md` (`tier_input` shape) |
| A7 (F-24) | **Risk-source disambiguation + heterogeneous-map note.** State that contract risk keys plan/build/test/**review** and recomputed risk keys document/ship/verify, with the reason (the validator runs after the reviewer). Record that `run_manifest.model_tiers` is legitimately heterogeneous and that `phase_manifest.model_tier` + `tier_input` is the authoritative per-attempt record. | `phase-gates.md:229-230`; `SKILL.md:194-195`; `artifact-layout.md:62` |
| A8 (F-25) | **Generalize the write-and-verify mitigation** from the three single-file writers to **any dispatch at `haiku` tier**, with a note that the hazard is a property of the tier, not the role. | `SKILL.md:62-72` |
| A9 (C2, from SC-2) | **Advocate `haiku` → `sonnet` at the review gate, medium risk.** Closes SC-2's deferred C2; the test-gate Advocate stays `haiku`. An unresolved review-gate dissent terminates as `ADVOCATE_DISSENT` — no retry, quarantine class — so a false dissent from the cheapest tier can quarantine a good job, and recovery costs an operator interrupt plus an F-6 re-review. **Approved on the deferred data, which does exist.** SC-2 deferred this pending 2–3 more production runs; four have since occurred, and run #105 records the medium-risk row directly — `architect/critic/advocate = sonnet/sonnet/haiku at medium risk`, with the review gate completing (a post-review recompute to `low` followed). That run's haiku Advocate then emitted a **divergent `findings` shape** violating the agents' own "no extra keys" rule, harmless only because `execution-report.js` is a tolerant reader. So the medium-risk Advocate evidence is not absent, and what exists is a recorded output defect from the cheapest tier at exactly the gate whose dissent is no-retry. See §4.11. | `phase-gates.md`; `DPPD.md:300-301`; `SC2_PLAN.md:14,81`; `WBS.md:16-18`; `docs/field-runs/2026-07-18-issue105-agentic-starter-kit.md:38,96-97` |
| A10 | **Safety floors as named invariants**, not merely cells that happen to agree: `ship ≥ sonnet`, `verify ≥ sonnet`, `grader ≥ opus`, on every row. Ship performs irreversible git operations gated on subtle conditionals (detected-vs-assumed push failure, the signed-commit carve-out, protected-branch ordering). Verify carries a conditional-suppression rule — a file with no applicable checker must NOT emit a `checks` entry — whose failure mode is a **false QUARANTINE on a correct change**, compounded by a retry budget of 1. | `phase-gates.md`; rationale from `.claude/agents/adws-verifier.md:26-30`, `phase-gates.md:36` |

**Verification (SC-4a):** parity **84/84**, report **15/15**, entropy **7/7**, provenance
**3/3**, SC-3 micro-drill — all UNCHANGED (no validator or report logic touched); skill
lints green; `SKILL.md` under 500 lines; dogfood the review gate over the doc/spec diff;
manual consistency sweep across every ladder and taxonomy statement, since nothing
machine-checks these against each other.

### SC-4b — evidence & fixture reconciliation (deterministic; regression-first)

| Item | Change | Parity / report impact |
|---|---|---|
| B1 (F-26) | Correct `promote_retry_recovered` build attempt_2: a `retry-escalation` from `sonnet` now records `opus`. | Report suite **15/15** unchanged |
| B2 (F-26) | Correct the `retry` fixture's test attempts: attempt_2 `sonnet` → **`opus`**, attempt_3 → **`fable`**, both with the `tier_input` the spec requires. This makes the `retry` fixture the **only `fable` in the repository's evidence**, giving the widened taxonomy a round-trip regression through `execution-report.js` (`typeof === 'string'` pass-through and the rendered Model-tier column) at zero logic cost. Without it nothing anywhere would catch a future consumer that hard-codes a three-value set. | Report suite **15/15** unchanged; verified `fable` renders in the generated Markdown table |
| B3 | Re-key all 15 `run_manifest.model_tiers` maps to the approved medium row. Only `verify` moves (`haiku` → `sonnet`, per A10); the other six entries already matched. | Mechanical; `model_tiers` is read by zero JavaScript |
| B4 | **Constraint, not a change** (mirrors SC-3 B2; carries no separate R-6 approval): `execution-report.js` stays **untouched**, `SCHEMA_VERSION` stays `1.2.0`, the nine validator packs gain no tier awareness, and `entropy-gate.js` keeps its comment-only mention of tiers. | All suites unchanged |

**Verification (SC-4b):** the report suite re-run after the fixture edits, plus a direct
render check confirming `fable` reaches the Model-tier column of `execution_report.md`
rather than being coerced or dropped.

---

## 3. Sequencing & effort

| Step | Tranche | Effort | Gate |
|---|---|---|---|
| 1 | DPPD §13 amendment recording SC-4 (this plan approved) | XS | **DONE** — operator approval (R-6), per item, recorded in DPPD v1.4 |
| 2 | SC-4a (A1–A10) | S–M — docs/spec | **DONE** — suites green + skill lints + consistency sweep + review gate |
| 3 | SC-4b (B1–B3) | XS — fixture data | **DONE** — 15/15 with a `fable` value round-tripping the report generator |
| 4 | Live confirmation that a per-phase table and a real escalation-to-`fable` behave as specified on an autonomous run | M | **DEFERRED EXPLICITLY** — no synthetic drill is represented as production confirmation; an evidence tree must be archived under `docs/acceptance/` when a suitable task is run |

**Branching:** `feat/sc4-per-phase-tiers`, merged through PR after the skill's review
gate; no direct commit to `main`. Post-merge record sync follows on
`docs/sync-sc4-records`, mirroring the SC-2 / SC-3 / M-1 pattern. Per `SC3_PLAN.md:96-99`
the doc/spec implementation is **edit + re-run suites + dogfood review gate** — a prose
PR's build/test/verify gates are degenerate without a code diff, and no claim is made
that this change was itself driven through the seven phases.

---

## 4. Invariants (must hold through both tranches)

1. **Zero tier awareness in code**, before and after. No JavaScript validates,
   enumerates, orders, or compares tier values. The tier table is a documentation
   contract enforced at dispatch, never a gating concern — this is what holds the blast
   radius of a table rewrite at zero and what makes a fourth tier value free.
2. **Verdict taxonomy frozen** (carries SC-3 invariant 2). No new `DECISION`, exit code,
   or entry to `NO_RETRY_REASONS`/`QUARANTINE_REASONS`. `SCHEMA_VERSION` stays `1.2.0`.
3. **Suite counts unchanged:** parity **84/84**, report **15/15**, entropy **7/7**,
   provenance **3/3**, SC-3 micro-drill.
4. **Risk-row cardinality is exactly 3**, keyed `high|medium|low`, matching what
   `review-risk-assess` emits. This is the only hard structural constraint on the table's
   shape; a fourth risk level would require touching a parity-pinned validator.
5. **Safety floors hold on every row:** `ship ≥ sonnet`, `verify ≥ sonnet`,
   `grader ≥ opus`.
6. **Escalation is monotone, terminating, and self-describing** — one ladder, capped at
   `fable`, and at the cap a recorded escalation is never indistinguishable from a no-op.
7. **Runnability:** no row mandates a tier a conforming runtime may be unable to
   dispatch. This is why `fable` is a ceiling and not a cell.
8. **FR-4 append-only unchanged.** The fixture edits correct illustrative test data; no
   job's evidence tree is mutated and no attempt directory is rewritten.
9. **NFR-2 lean core** — no new runtime, script, dependency, or background process. The
   change is prose plus seven JSON data edits.
10. **NFR-3** — SKILL.md stays < 500 lines (**357** after this change).
11. **R-6** — each change item (A1…A10, B1…B3) carries its own §2.1 justification; the
    bundle is **not** approved as a single milestone. B4 introduces no change (it is the
    constraint "leave `execution-report.js` untouched") and carries no separate approval.
    **A9's deferral condition is satisfied.** SC-2 deferred C2 pending 2–3 more
    production runs; four have occurred, and run #105 exercised the medium-risk row with
    a haiku Advocate through a completed review gate, recording a divergent-shape defect
    from that Advocate. The finer question — whether a medium-risk *review-gate dissent*
    was ever adjudicated — is not answerable from the retained records, because the
    target-repo evidence trees are external and were not copied before teardown (the
    DRILL_EVIDENCE teardown lesson). A9 therefore rests on recorded medium-risk Advocate
    behavior plus the asymmetry argument, not on a dissent-path observation. Stated here
    so a later auditor is not misled in either direction.

---

## 5. Explicitly NOT in scope (rejected — recorded for completeness)

| Rejected | Why (tied to invariants) |
|---|---|
| **A tier-ordering array, comparison, or clamp in JavaScript** | Would make tier a gating concern for the first time, breaking invariant 1 and converting a documentation contract into executable policy. The cap is a dispatch-time rule; B2's `fable` fixture is the cheaper and more honest coverage. |
| **A `model_tier ∈ {…}` validator in the nine-pack** | Same, plus NFR-2. The nine validators are byte-for-byte parity ports pinned by 84 fixtures; adding tier awareness to any of them puts that parity at risk for no gate benefit. |
| **A fourth risk level (e.g. `critical`) to give `fable` a natural home** | `review-risk-assess` emits exactly `high\|medium\|low`; a fourth row would require modifying a parity-pinned validator (invariant 4) to justify a tier that A3 deliberately keeps off the table anyway. |
| **Mandating `fable` in any table cell** | Retention-gated availability (`400` wherever the calling workspace is below 30-day retention) plus refusal-as-empty-content reaching the missing-phase-evidence gate as a **false QUARANTINE** (F-20). Kept as ceiling + operator opt-in (A3). |
| **`grader = fable` at high risk** | The worst available placement: it doubles the single most-scrutinized dispatch on the row, and a refusal yields no `grade.json`, leaving the terminal gate unverified. The grader stays at its absolute `opus` floor (A5). |
| **Reconciling `.claude/agents/*.md` frontmatter `model:` with the table** | The divergence is intentional and already recorded — frontmatter is the fallback default for runtimes that do not register the agent types, and the orchestrator always specifies the tier explicitly. Touching it re-opens a settled decision and would make the fallback path silently disagree with F-11. |
| **Surfacing tier in `execution_report.md` beyond the existing column, or ranking/aggregating tiers in the report** | SC-3 B2's constraint stands: any report change is a separate scope change, additive and regression-first, with a `SCHEMA_VERSION` bump and the existing verdict fixtures unchanged. |
| **Backfilling `tier_input` onto every first attempt in the fixture corpus** | Reported, not changed. `tier_input` is absent from first attempts corpus-wide, not only in the two fixtures F-26 names; F-26 is scoped to *retry* attempts, where the spec unambiguously requires an escalation to be recorded. A corpus-wide backfill is a separate, larger data change with no finding behind it. |

---

## 6. Applied DPPD §13 amendment (historical proposal record)

> ## 13. Scope Change SC-4 (2026-08-05, operator review of FR-12) — APPROVED
>
> Approved per R-6 (operator approval 2026-08-05, **per item**). Amends FR-12 (§3.1) and
> the role-tier sentence in §5.3. Governing version: **DPPD 1.4**. Motivated by an
> operator review of tier selection (findings **F-18 … F-26**); full register, per-item
> detail, sequencing, and invariants in **`docs/SC4_PLAN.md`**.
>
> **SC-4a — tier table, taxonomy & ladder (docs/spec; zero parity risk).** A1 replaces
> the single `Architect` column with seven per-phase columns keyed by error-propagation
> cost (plan at `opus` on every row; the mechanical tail drops); A2 admits **`fable`** as
> the fourth canonical evidence tier and widens the ladder to `haiku → sonnet → opus →
> fable`, resolving FR-12's existing self-contradiction between "`sol` may resolve to
> Fable" and "evidence SHALL remain normalized to Haiku/Sonnet/Opus"; A3 makes `fable` a
> **ceiling, not a floor** — reachable only by escalation or explicit operator override,
> because a mandated cell would be unrunnable wherever the calling workspace is below
> the required 30-day retention, and its refusal
> mode presents as missing phase evidence; A4 adds the Codex alias `nova` → `fable` and
> makes `sol` strictly `opus`; A5 rewrites the grader floor as an absolute (`opus` on
> every row) now that "the Architect floor" has no referent; A6 defines
> ladder-saturation recording for all three escalation sources; A7 disambiguates the
> contract-risk / recomputed-risk boundary and documents `model_tiers` heterogeneity; A8
> generalizes the haiku write-and-verify mitigation from three roles to any haiku-tier
> dispatch; A9 closes SC-2's deferred C2 (review-gate Advocate `haiku` → `sonnet` at
> medium) **on the deferred data, which run #105 supplies**; A10 names `ship ≥ sonnet`,
> `verify ≥ sonnet`, `grader ≥ opus` as invariants rather than incidental cells.
>
> **SC-4b — evidence & fixture reconciliation.** B1 and B2 correct three fixture
> manifests recording escalations that did not escalate, and seat the repository's only
> `fable` value as a round-trip regression for the widened taxonomy; B3 re-keys the 15
> `run_manifest.model_tiers` maps. B4 leaves `execution-report.js` **untouched** (report
> stays 15/15, `SCHEMA_VERSION` 1.2.0).
>
> **Invariants held:** zero tier awareness in code, before and after — the tier table is
> a dispatch-time documentation contract, never a gate input; verdict taxonomy frozen;
> 84/84 parity + 15/15 report + 7/7 entropy + 3/3 provenance preserved; risk rows remain
> exactly `high|medium|low` per `review-risk-assess`; FR-4 append-only untouched; NFR-2
> lean core (no new script or dependency); NFR-3 SKILL.md < 500 lines (357). **R-3
> remains open** — cross-provider Trinity (X-3) stays deferred per SC-1.c; a fourth
> same-provider tier does not narrow it.
>
> **Rejected (see `docs/SC4_PLAN.md` §5):** tier ordering or validation in code, a
> `model_tier` enum validator, a fourth risk level, mandating `fable` in any cell,
> `grader = fable`, frontmatter reconciliation, report-surfacing of tiers, and a
> corpus-wide `tier_input` backfill.

Applied to the `WBS.md` intro (mirroring its SC-2 and SC-3 paragraphs): *"A third
enhancement scope (**SC-4**, findings F-18…F-26 from an operator review of FR-12)
replaces the uniform Architect tier with a per-phase table and admits `fable` as the
fourth canonical evidence tier, as an escalation ceiling rather than a mandated cell;
verdict taxonomy frozen. See `docs/SC4_PLAN.md`."*
