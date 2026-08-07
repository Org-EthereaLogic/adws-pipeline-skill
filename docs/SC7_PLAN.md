# SC-7 Plan — The Critic's Half of Consensus

The third field run against `Org-EthereaLogic/cadence-method-skill` (issue #21, WP 5.1,
`job_20260807_0001` → PR #70) promoted with warnings and shipped a correct artifact. It
also improvised in seven places where the spec is silent or wrong, and carried an eighth
defect that the run itself never noticed.

The eighth is the one that names this scope change. Two independent Critics caught two
real, reproducible latent code defects — both confirmed by the orchestrator before it
acted, both fixed, both pinned by regression corpora. Neither left any trace in the
terminal verdict. The report read `consensus: pass — "2 round(s) clean"`.

SC-6/F-38 had already declared the rule that forbids exactly that: *"an Advocate dissent
recorded anywhere in a job's evidence forbids a CLEAN promote."* It built the
superseded-attempt scan to enforce it. But the scan reads `advocate.json` and nothing
else. The Critic — the adversarial half of the same gate — was left out of the
remediation path (F-46) and out of the reporting path (F-52) alike. SC-7 is F-38 finished.

## 1. Findings register (field run job_20260807_0001)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-45 | defect (silent, correctness) | **The tester must consume an artifact it is never given, produced after it runs.** `adws-tester.md` makes `check_specs` the single source of truth and requires echoing `check_id` verbatim; `phase-gates.md` makes id-coverage a gate condition. But the tester's stated inputs are contract + worktree + build output + attempt dir — no `check_specs` — and the phase loop runs validators at step 2, AFTER the step-1 dispatch. Following the letter of the procedure, the tester can only mint its own ids, which cannot join back to the criteria: the coverage gate then fails spuriously or is satisfied by ids that prove nothing. That is the same hand-off hole SC-5/F-31 was written to close, reopened one step upstream. | `SKILL.md:145-157`, `adws-tester.md:8-10,15,48`, `phase-gates.md:32,129-135` (pre-change); the live run inverted the order by hand and said so |
| F-46 | design gap (inverted incentive) | **A correct Critic `fail` at the review gate has no remediation — only job death.** The whole rule was "Critic `fail` → gate fails (retry path)". Rule 4's retry path re-dispatches `adws-reviewer` over UNCHANGED code; the review budget is 1; and no rewind origin admitted a Critic finding. So a Critic that correctly identifies a real code defect at review can only burn the review retry and terminate `REVIEW_GATE_FAILURE`. This is verbatim the inverted incentive SC-6/F-37 removed for the Advocate — the adversarial agent doing its job well being procedurally indistinguishable from the job failing — left in place for the other half of consensus. | `SKILL.md:174`, `phase-gates.md:167`, cross-phase rewind section `:56-89` (pre-change); the live run stopped and asked the operator |
| F-47 | schema/spec gap | **Whether an automatic rewind consumes the destination phase's retry budget is undefined.** The answer was written for two of the four rewind budgets — check-defect "WITHOUT consuming a build retry", operator-directed "It DOES consume an ordinary build retry" — and left unstated for `cross_phase_rewinds.test` and `.verify`. The live run took THREE build attempts against a documented build budget of 1 with no budget accounting anywhere, and nothing flagged it, because nothing asks. Under the stricter reading, F-37's own rule ("when the build retry budget is spent, `repair` is no longer available") should have blocked the third attempt. | `phase-gates.md:70-71,260` vs `:57-64,83-86`; budget table `:31,38` (pre-change) |
| F-48 | schema gap | **A rewind-triggered build attempt has no legal `tier_input.source` and no tier policy.** The enum admitted `retry-escalation`, `entropy-gate`, `operator-resolution`, `operator-tier-override` and their saturated variants; a gate-automatic rewind is none of these. Nor was the tier defined for the rewind's build attempt or for the FORWARD re-run of downstream phases afterwards. The live run escalated its rewind build sonnet → opus and held the forward test attempt at the table tier — inventing both policies, correctly, with nowhere conforming to record either. | `artifact-layout.md:91` (pre-change) |
| F-49 | defect (silent, safety) | **The reviewer's primary instruction returns an empty diff for a green-field change set.** Step 1 was "Read the full diff (`git diff {target_branch}`)". `git diff` never shows untracked files, and `SKILL.md` establishes that at review the change set is EXPECTED to be uncommitted and partly or wholly untracked. For an all-new-files change set that command returns nothing, and no rule told the reviewer that an empty diff means "enumerate and read directly". The failure mode is a reviewer approving an unread change set, and the evidence looks identical to a real review — the same silent-by-construction shape as F-35. The Critic and Advocate carried the untracked *preamble* but likewise no positive enumeration instruction. | `adws-reviewer.md:13` vs `SKILL.md:169-171`; `adws-critic.md:18-21`, `adws-advocate.md:18-20` (pre-change); the run's orchestrator discovered `-uall` and hand-fed the file list |
| F-50 | docs gap | **`check_type` is documented only in the validator source.** `SKILL.md` and `phase-gates.md` name the VALUES (`behavioral` / `unclassified`) but never the key; `validator-inputs.md` documented inputs only. `criteria-to-checks.js:64` was its sole occurrence in the repo. The run guessed `type`, got `undefined`, and spent a round trip inspecting the shape mid-gate. | `criteria-to-checks.js:64`; `phase-gates.md:121`, `SKILL.md:320` (pre-change) |
| F-51 | docs gap | **The documenter under a docs-excluding `allowed_paths` has an undocumented compliant path.** `document-coverage-map` scores changelog 0.5 + documented paths 0.3 + summary 0.2 and passes at ≥ 0.7, so `docs_delta: []` plus a real changelog and summary passes on its own merits. Nothing said so. `adws-documenter.md` said docs go "inside `allowed_paths` only" and stopped, leaving the case where NO doc location is in scope undefined. The run derived the arithmetic and read a prior job to confirm the precedent. Third run to hit an `allowed_paths`/docs conflict (issues #4 and #5 hit it too). | `document-coverage-map.js:44-45,54`; `adws-documenter.md:15` (pre-change) |
| F-52 | defect (FR-7 breach) | **A Critic fail goes invisible the moment a later attempt supersedes it.** `collectConsensus` reads latest attempts only (correct, and deliberate); `collectSupersededDissents` reads `advocate.json` only. Together they mean a Critic fail on a superseded attempt is scored by nothing at all — not even a warn. F-46's remediation makes this strictly worse, because a successful rewind is precisely what produces the clean later round that hides it. The live run promoted reading `consensus: pass — "2 round(s) clean"` for a job whose evidence records two verified Critic findings that CHANGED the shipped artifact. F-38's governing rule held for one half of consensus and not the other. | `execution-report.js:224-243,483,502,555` (pre-change); `execution_report.md` Gates table vs `review/attempt_1/consensus/critic.json`, `job_20260807_0001` |

**Root cause.** F-46 and F-52 are one defect from two sides, and it is the same shape
SC-6 found one scope change earlier. The consensus machinery has a full vocabulary for
the Advocate — three resolutions, a repair rewind, a superseded scan, a warn downgrade,
a documented budget — and almost none for the Critic: `fail` → gate fails, full stop.
Every mechanism SC-6 built was built on `advocate.json`, so when the Critic needed the
same machinery there was none, and when the Critic's objection needed to survive into the
report there was nothing reading its file.

F-47 and F-48 are the bookkeeping that was never written because nobody had defined the
rewind that needed it. They are not independent findings so much as the schema-shaped
hole F-46 was always going to fall into — and, tellingly, the live run fell into it twice
without noticing, because a budget nothing asserts is a budget nothing enforces.

F-45, F-49, F-50, and F-51 share a different root, the same one M-2 named for F-35/F-36:
places where the spec's *requirement* and the spec's *mechanics* were written at
different volumes. "Echo the `check_id`" with the specs never handed over. "Read the full
diff" for a change set that is by design not in the diff. "Docs inside `allowed_paths`
only" with no answer for zero doc paths in scope.

---

## 2. Actions

### M-4 (docs/prompt only; no code, no schema, zero parity risk)

- **A1 (F-45)** — `criteria-to-checks` becomes an explicit PRE-dispatch step at the test
  phase: `SKILL.md` §2 step 1 runs it, asserts `check_specs.length == criteria_count`,
  writes its trace, and passes the specs into the `adws-tester` dispatch.
  `adws-tester.md` adds `check_specs` to its receives list and is told to STOP rather
  than mint its own ids if it was not given them. It is a pure function of the frozen
  criteria, so running it early costs nothing.
- **A2 (F-49)** — `adws-reviewer.md` step 1 becomes *enumerate, then read*: union of
  build `files_changed` and `git status --porcelain -uall` (plain `--porcelain` collapses
  a new directory to one entry), new files read directly, `git diff` for modifications
  only. "An empty `git diff` is not an empty change set." An enumerated set that is empty
  while `files_changed` is not is a FINDING, never an approval. The same one-liner enters
  the Critic's and Advocate's pipeline-mechanics preamble and `SKILL.md`'s consensus
  briefing.
- **A3 (F-50)** — `validator-inputs.md` gains an "Outputs worth naming" section giving
  `check_specs[] = { check_id, criterion, check_type }` with the key named explicitly
  ("not `type`"), plus `review-risk-assess` → `risk_level`. `phase-gates.md` names
  `check_type` inline.
- **A4 (F-51)** — `adws-documenter.md` defines the zero-doc-paths case: never write
  outside `allowed_paths`, record `docs_delta: []` with a substantive changelog entry and
  summary, say in `phase_log.md` which locations were out of bounds. The coverage
  arithmetic is recorded in `validator-inputs.md` so the outcome is derivable without
  opening the validator. `task-contract.md` adds the soft intake warning
  `NO_DOC_PATH_IN_SCOPE` — non-blocking, recorded so an empty `docs_delta` reads as the
  contract's consequence rather than as a documenter that skipped its job.

### SC-7 (spec + evidence schema + report)

- **B1 (F-46)** — new "Critic-fail remediation" section in `phase-gates.md`. The
  orchestrator MUST reproduce the finding before routing it; **verification chooses the
  route, never the verdict** (the gate failed either way). Reproduced code defect →
  rewind to build with `corrections.json` (`classification: "code"`, `source_attempt`
  naming the real origin), tracked in `cross_phase_rewinds.review` at the review gate and
  `cross_phase_rewinds.test` at the test gate, capped at 1 each. Not reproduced →
  ordinary retry with the non-reproduction recorded. The failing attempt closes
  `gate_result: "fail"` with attempt-level `failure_reason: "CRITIC_FAIL_REPAIRED"` —
  an attempt annotation only, exactly like `ADVOCATE_DISSENT_REPAIRED`, never in
  `run_manifest.failure_reason`, never in the terminal classes, never seen by
  `decideLifecycle`. Second fail at the same gate → `{PHASE}_GATE_FAILURE`.
  **No new terminal state, DECISION, or exit code.**
- **B2 (F-47)** — one authoritative rewind budget accounting table in `phase-gates.md`:
  five budgets, each with origin, cap, and whether it consumes a build retry. The
  gate-automatic rewinds (`test`, `review`, `verify`) and the check-defect repair do
  NOT; the operator-directed repair DOES. **Operator-approved, this session.** The
  rationale is recorded with the table: a rewind is not the builder failing, it is the
  pipeline finding a defect the build gate could not see, and charging it to the build
  retry would make the FIRST such finding exhaust the budget and the second impossible —
  while the operator-directed repair needs the charge because nothing else bounds an
  operator who keeps electing `repair`.
- **B3 (F-48)** — `tier_input.source` gains `cross-phase-rewind` and
  `cross-phase-rewind-saturated`. A rewind's build attempt escalates one tier on the
  standard ladder with `value` naming the origin attempt, for F-6's and F-37's reason
  (the previous tier produced work an independent assessor or an executed check faulted).
  The FORWARD re-run of downstream phases is explicitly **not** a retry: fresh attempt at
  the table tier, ordinary `contract.risk_level` / `review-risk-assess` source.
  `cross_phase_rewinds` gains its `review` key in `artifact-layout.md`.
- **B4 (F-52)** — `collectSupersededDissents` → `collectSupersededConsensus`, now reading
  `critic.json` as well and carrying `critic`, `critic_issue`, and `critic_finding`. The
  Critic writes no `dissent`; its objection lives in `findings`, and the two shapes are
  carried separately for a reason found by running this change against the live tree: the
  Advocate's `dissent` is designed to be quoted whole, but a finding's `evidence` is a
  CITATION — the run's was over 2,500 characters — so quoting it into a gate detail made
  the gates table unreadable. `critic_issue` (the one-phrase claim, clipped at 160) feeds
  the terse surfaces; `critic_finding` (issue + evidence, verbatim) feeds the Superseded
  Consensus Rounds section. FR-7 asks that the objection never be silent, not that every
  surface carry all of it. The `consensus` gate's superseded branch warns for either half;
  `buildWarnings` and the section render both.
  Superseded rounds still never FAIL — the latest-attempt gating contract is untouched.
  `SCHEMA_VERSION` 1.3.0 → **1.4.0** (additive: two new fields on an existing array).
  `phase-gates.md` consensus rule 4 restates the governing rule symmetrically.
- **B5** — new report fixture `promote_repaired_critic_fail` (job `job-3d5f82`), the
  Critic-side twin of `promote_repaired_dissent`: Critic fail at `review/attempt_1` with
  `CRITIC_FAIL_REPAIRED`, `build/attempt_2/corrections.json` sourced at
  `review/attempt_1` with `tier_input.source: cross-phase-rewind`, clean
  `review/attempt_2`, `cross_phase_rewinds.review: 1`. Report fixtures **16 → 17**;
  the four prose count sites plus `.githooks/pre-push` updated in the same commit (M-3a).

---

## 3. Invariants held

1. **No new terminal state, DECISION, or exit code.** `CRITIC_FAIL_REPAIRED` is an
   attempt annotation, exactly as `ADVOCATE_DISSENT_REPAIRED` is; the terminal
   failure-reason classes and the PROMOTE/RETRY/QUARANTINE vocabulary are frozen.
2. **The latest-attempt gating contract is untouched.** Superseded evidence WARNS, never
   fails — a failure a later attempt fixed must not permanently fail the job.
3. **Superseded objections never fail; unresolved ones always do.** A Critic fail on the
   LATEST attempt still FAILS the consensus gate exactly as before
   (`quarantine_critic_fail` is unchanged and still exits 2).
4. **Additive schema only.** `superseded_consensus` gains two fields; `tier_input.source`
   and `cross_phase_rewinds` gain values/keys. Existing readers are tolerant
   (`artifact-layout.md` rule 8) and `execution-report.js` reads neither budget.
5. **Every rewind stays bounded.** Four independent budgets, each capped at 1, none
   drawing on another; the one that could loop without a charge (operator-directed) still
   consumes a build retry.
6. **NFR-3 holds.** `SKILL.md` 379 → 403 lines, asserted under 500 by
   `frontmatter-lint.mjs`; the detail lives in the references.
7. **NFR-4 holds.** `execution-report.js` still imports only `fs` and `path`.

## 4. Verification

Every assertion was FALSIFIED before acceptance, per M-3a.

| Claim | How it was falsified |
|---|---|
| The new fixture actually depends on B4 | Reverted the `criticFailed` term in `collectSupersededConsensus` alone: `promote_repaired_critic_fail` flipped to `PROMOTE` / `warn_flag: false` / **exit 0** with `consensus: pass` — reproducing the live-run bug exactly. Restored → 17/17. |
| B4 does not weaken the latest-attempt case | `quarantine_critic_fail` unchanged: QUARANTINE, exit 2. |
| B4 does not disturb the F-38 path | `promote_repaired_dissent` unchanged: PROMOTE, warn, exit 10, `consensus: warn`. |
| The Critic's finding reaches the report | `Superseded Consensus Rounds` renders the Critic column and quotes the finding text verbatim; `Critic fail in review/attempt_1 (superseded)` appears in Warnings. |
| The change produces the right verdict on the RUN THAT EXPOSED IT | Ran the new report against a COPY of the live `job_20260807_0001` evidence tree (the operator's tree was not mutated). Pre-change it recorded `consensus: pass — "2 round(s) clean"`, `superseded_consensus: []`, with `critic: fail` on BOTH `test/attempt_1` and `review/attempt_1`. Post-change: `consensus: warn`, both superseded Critic fails surfaced with their findings, exit 10. |
| Suite sizes are asserted, not narrated | `run-tests.js` cross-checks `CASES` ↔ fixture dirs in both directions; the count moved 16 → 17 in the runner and at all five prose sites in the same commit. |
| NFR-3 | `frontmatter-lint.mjs` reports 403/500. |

Tier 1 nine of nine PASS; Tier 2 (OrbStack, Node 20 + 24) both legs PASS. Suite sizes
now 88 / **17** / 7 / 3 + SC-3 drill.

## 5. Rejected

- **A `resolution` field on `critic.json`** (an operator override for a Critic fail,
  mirroring F-3). Rejected: the Advocate's override exists because a dissent is a
  judgment about INTENT, which the operator is the authority on. A Critic finding is a
  claim about the CODE, and the pipeline can settle it by reproducing it — which B1 now
  requires. An override would let a real defect promote on assertion where a
  reproduction attempt already gives a cheaper, more honest answer. `adws-critic.md`
  keeps its exact-fields contract unchanged.
- **Charging gate-automatic rewinds to the build retry budget.** Considered as the
  uniform rule; rejected by the operator this session. With build's budget at 1 the first
  rewind of any kind would exhaust it and the second would be impossible — the live run
  would have been blocked from fixing a defect it had already verified.
- **Raising build's retry budget to 2 so all rewinds could charge uniformly.** Rejected:
  it changes the per-phase table and every downstream budget assumption to buy a symmetry
  the caps already provide.
- **Failing the consensus gate on a superseded Critic fail.** Rejected for the reason
  F-38 gives: the report certifies the job's FINAL state, and a defect a later attempt
  verifiably fixed must not permanently fail the job. WARN is the whole point.

## 6. Observed, not changed

- **The run's two Critic findings were converse halves of one defect class** (self-slug
  excluded from the reverse scan, then from the forward scan). A `corrections.json`
  carrying a `code` classification could plausibly instruct the builder to check the
  symmetric path, which might have collapsed two rewinds into one. Left alone: it is a
  prompt-quality heuristic, not a gate rule, and encoding "look for the converse" as a
  requirement risks the builder inventing scope the corrections never asked for.
- **The orchestrator verified each Critic finding before spending a rewind**, which the
  pre-SC-7 spec never asked for. B1 now REQUIRES it — this is the one place where the
  live run's improvisation was strictly better than the spec and became the spec.
- **`runKnownBadFixture` spawns siblings without a timeout** in the shipped WP 5.1
  deliverable — noted by the run's Critic as explicitly non-blocking, and by the
  reviewer as correct for byte-stable determinism. Target-repo concern, not a pipeline
  one; recorded here only because the field-run record cites it.
