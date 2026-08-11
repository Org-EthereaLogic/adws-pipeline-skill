# Pre-registration — the reasoning A/B (condition 4 of the §6.2 GO)

**Status:** pre-registered. Arm B has run (2026-08-11); arm A has not. Every arm-B number below is
computed and frozen *before* arm A exists. Committed to the repository before the arm A VM launches.

**Artifacts.**
Arm B transcript: `spike/adws-controller/ab/evidence/armB-orchestrator.jsonl`
Arm B launch prompt: `spike/adws-controller/ab/armB-launch-prompt.md`
Arm A launch prompt: `spike/adws-controller/ab/armA-launch-prompt.md` (frozen; arm A has not run)
Measurement script: `spike/adws-controller/ab/measure-ab.js`, SHA-256 in
`spike/adws-controller/ab/PREREGISTRATION.json`, asserted by `run-ab.sh`.

**§0 — AMENDMENTS, made before arm A ran and after the analyzer ran against the real file.**
The body below is the protocol as synthesized. Five clauses did not survive contact with the
transcript. They are amended here rather than edited in place, so the order stays auditable: the
protocol was fixed, then run against arm B, then corrected where running it proved it wrong. Each
amendment was made while arm A did not exist, which is the only window in which a correction is
not a rationalization.

| # | Clause | What running it proved | Amendment |
|---|---|---|---|
| A1 | §5 veto 3, "displacement": `\|Δ(setup growth)\| ≥ \|Δ_I\|` | **Degenerate.** Under §4.4, `setup` spans [turn 0, first anchor), so its growth *is* `I_net` by definition — verified, both 20,379 on arm B. The veto reads `\|x\| ≥ \|x\|` and fires on every possible pair. | **Struck.** Replaced by: displacement fires if the common-scope phases absorbed the intake difference, `Σ Δ(growth over plan+build+test) ≥ \|Δ_I\|`. `measure-ab.js` computes it and reports the degenerate form as `UNEVALUATED — DEGENERATE AS WRITTEN`. |
| A2 | §4.7 NOTIF, and "arm B has two" | **Arm B has one.** T21 (55 tok) qualifies; T20 (49 tok) does not — the user row before it is a `tool_result` for the second async launch, not a `<task-notification>`. §4.7 is a three-clause conjunction and T20 fails clause 3. | Count stands at **1**; consensus round trips are **5, not 4**. The rule is unchanged but will not catch arm A's "dispatched, now waiting" turns either; `measure-ab.js` emits them as `NOTIF_NEAR_MISS` and they are listed, never silently folded in. |
| A3 | §3 S9, "12,687 **B**" | **That is a character count.** UTF-8 is 12,695 B; the 8-token gap is `§` and em dashes in controller JSON. S8's 17,544 B *is* true UTF-8. The pre-registration mixed chars and bytes between two adjacent metrics — §10.9's own prohibition. | **Bytes everywhere.** `measure-ab.js` emits both units on every byte metric and the byte column is the one quoted. |
| A4 | §2, "12,687 B … exceeds step 4's replayed seven-phase 9,146 B (finding 31's prediction, now confirmed)" | **Only on the impure total.** 2 of the 11 calls bundle non-handshake work (T8 bundles `git worktree list` + `find` with the ENOENT probe; T23 bundles a `node -e` dump of `checks[4]`). Pure handshake is **9 calls / 7,493 chars**, which is *under* 9,146. | **The claim is downgraded and split.** Finding 31's prediction is confirmed on the as-run figure and **not** confirmed on the pure-handshake figure. Both are published; the pure figure is the one that describes the interface, and it says the live handshake for three phases costs less than step 4's replayed estimate for seven. |
| A5 | §7.12 contamination grep on the literal `job_20260811_0001` | **False-VOID pathway.** Arm A's clean clone mints the same id from the same date via SKILL.md §0.4's "next free" allocation. | Arm A's **own** `run_manifest.jobId` is excluded from the grep before it runs, not after a hit is seen. |

**Amendments A6–A8, from a post-commit audit, made while arm A had still not run.** The
pre-registration was re-frozen for these: `PREREGISTRATION.json` carries a new `PROTOCOL.md`
digest and a `refrozen` block naming the reason. Re-freezing in the open is the behaviour the
digest exists to force — a silent edit would have shown up as a `run-ab.sh` failure, which is
the point.

| # | Clause | What the audit found | Amendment |
|---|---|---|---|
| A6 | `run-ab.sh`'s pure-handshake assertion | It compared `inbound_chars_pure` (7,493) against a **byte**-denominated 9,146 — **the exact chars/bytes mix A3 was written to stop, inside the driver that asserts A3**. | Compares **7,497 B against 9,146 B**. The conclusion does not change, which is why it is recorded rather than quietly fixed: a unit error that does not move the answer is the kind that survives review. |
| A7 | §2's "one rule is right on both files" | Overstated as uniqueness. **Last-record-per-`message.id` equals max on all six observed transcripts**, with zero non-monotonic rows. Max is not the only rule that works here; it is the one that stays correct if a row ever arrives out of order. | The rule stands as **max-per-`message.id`**, chosen for order-independence, not because it is the only rule that reproduces these numbers. Claimed accordingly. |
| A8 | "the three alternatives the designers proposed" | The table beneath it lists **four**. | Corrected to four. |

One further change, made by the prompt judge and recorded here because it altered the run's
setup: the contract fixture is copied to `~/step5/live_contract.json` and arm A's prompt names
*that* path. Naming `spike/adws-controller/fixtures/…` would have put the string `adws-controller`
in front of the orchestrator and given it an ordinary reason to `ls` a directory containing
`thin-skill-sketch.md` and `FINDINGS.md` — a §7.12 VOID reachable through a permitted action. The
copy is asserted byte-identical (sha256 `999ea1fa52093281a4883c776e959263b4798b1cd733a1863f66162d262543ee`).

---

## 1. The question

**Does the orchestrator's per-phase context cost grow enough under the thin controller interface
to consume the instruction-mass margin §6.2's GO is argued from — yes or no?**

The answer "yes" kills the reasoning half of §6.2. It is a reachable answer, and §5 says so below.

---

## 2. The primary metric

**P = mean per-phase orchestrator CONTEXT GROWTH, in tokens, over the matched common phases
{plan, build, test}. The decider is Δ_P = P_A − P_B. Positive = the controller is cheaper per phase.**

Computed from each arm's session JSONL, one code path for both arms:

1. Keep rows with `type=="assistant"` and `isSidechain` falsy.
2. **Group by `message.id`. One group = one TURN.** The JSONL writes one row per content block and
   repeats the byte-identical `usage` object on each. Arm B: 61 assistant rows → **26 turns**
   (inflation 2.35×). Assert every group's `usage` objects are identical and
   `|distinct message.id| == |distinct requestId|` (26 == 26 on arm B), else VOID.
3. `prefix(T) = usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens`
   — the true prompt length, invariant to how the cache splits it. Verified additive on arm B:
   `cache_read(T_i) == prefix(T_{i−1})` to within 5 tokens for all 25 consecutive pairs; zero violations.
4. **Growth of a segment S** = `prefix(first turn AFTER S) − prefix(first turn OF S)`. This is exactly
   the context the turns of S caused to exist — their own output plus every tool result they pulled in —
   counted once, no double-count, no eviction sensitivity.
5. `P = mean growth over the three segments labelled plan, build, test` (§4).

**ARM B, FROZEN: P_B = 5,589 tokens/phase (5,605 / 5,485 / 5,676; spread 3.5%).**

### Why this and not the four alternatives the designers proposed

| Rejected | Why it lost |
|---|---|
| **`output_tokens` alone** | Blind to the inbound half of §2's kill sentence. The handshake's cost *is* controller JSON entering the model's context — arm B took **12,687 B over 11 controller calls** for a partial three-phase slice, which alone exceeds step 4's replayed seven-phase 9,146 B (finding 31's open prediction, now confirmed). A metric that cannot see that cannot adjudicate the sentence it is supposed to adjudicate. Retained as a mandatory secondary and a sign-agreement veto. |
| **Cost-weighted billable tokens** (`1·in + 1.25·cc + 0.1·cr + 5·out`) | Needs a price table that is not in the record, and the `0.1·cr` term re-charges the whole standing prefix every turn — so ~40–60% of it is the instruction-mass *level*, which is condition 2's already-banked result, not condition 4's question. Its own author required sign-agreement across three weightings, which concedes the point. Retained only as a disclosed two-point sensitivity, never as a decider. |
| **`thinking_tokens` alone** | Closest to the word "reasoning" and the weakest instrument in the file: arm B's per-phase thinking is 1,513 / 89 / 270 — no resolution against any threshold that matters, and the budget is harness-mediated (`effort:"high"` on all 61 rows). It may veto (§5), it may never confirm. |
| **Summed billed input** | `cache_read` re-counts the full prefix every turn, so the sum is ~quadratic in turn count. It measures chattiness, not mass, and it is cache-eviction sensitive. Growth is not. |

**What P is and is not.** P is the total token footprint of one phase transition. It is a **proxy** for
"per-phase decision load" — no field in the usage record measures that. The proxy relation goes in the
headline sentence, not a footnote: findings 12/14/15/18/19/23/27 are seven instances of trusting a proxy
for the property, and this document is not the eighth.

---

## 3. Secondary metrics

All computed per matched phase, by the same script, for both arms. Arm B's values are frozen here.

| # | Metric | Definition | Arm B (plan / build / test) |
|---|---|---|---|
| S1 | **ROUND TRIPS — §9's own kill unit** | count of turns in the segment, excluding NOTIF turns (§4.7) | **3 / 3 / 3 = 3.00 exactly** |
| S2 | **OUTPUT TOKENS** | Σ `usage.output_tokens` | 3,564 / 2,946 / 3,157 (Σ 9,667) |
| S3 | **THINKING TOKENS** | Σ `usage.output_tokens_details.thinking_tokens` | 1,513 / 89 / 270 (Σ 1,872) |
| S4 | **DISPATCH BRIEFING CHARS** | Σ `len(input.prompt)` over `Agent` tool_use blocks | 3,315 / 5,453 / 5,643 (Σ 14,411) |
| S5 | **NON-AGENT TOOL CALLS**, by name | the mechanism metric | 2 / 2 / 2 — all Bash (`record`, `next`) |
| S6 | **INTAKE MASS** `I_net` | `prefix(first dispatch turn) − prefix(turn 0)` | **20,379** |
| S6b | **INTAKE MASS** `I_raw` (disclosure) | `prefix(first dispatch turn) − cache_read(turn 0)` | 29,701 |
| S7 | **SESSION BASELINE** | `prefix(turn 0)`, itemised | 31,320 (inp 2 + cc 9,320 + cr 21,998) |
| S8 | **INSTRUCTION READS** (read ledger) | every Read/Skill of an orchestration document: path, bytes, and the prefix growth of the turn that pulled it in, minus that turn's `output_tokens` | sketch **3,862 tok / 9,700 B**; `task-contract.md` **3,432 tok / 7,844 B**; Σ **7,294 tok / 17,544 B** |
| S9 | **HANDSHAKE VOLUME** | tool_result bytes returned by controller invocations (arm B) / by validators and evidence read-back (arm A) | **12,687 B inbound over 11 calls**; 2,708 B outbound |
| S10 | **SUBAGENT COST** | `toolUseResult.totalTokens` / `.totalToolUseCount` / `.totalDurationMs` per dispatch | planner 102,114 / 31 / 480s; builder 153,239 / 83 / 580s; tester 116,771 / 50 / 471s; **critic + advocate ASYNC → UNRECOVERABLE** |
| S11 | **COVARIATES** | build change-set file count; per-subagent tool count | 4 files; see S10 |
| S12 | **FORBIDDEN READS** | arm A: any read of `spike/**` or `docs/**`; arm B (recomputed, not assumed): any read of `adws-pipeline/**` other than `references/task-contract.md`. A bare `ls` is not a read | must be 0 on both; arm B = 0 |
| S13 | **HUMAN TURNS** | `type:"user"` rows whose `message.content` is a plain string not starting `<task-notification>` | **1** |
| S14 | **TERMINAL STATE** | verbatim gate verdict reached | `TEST_GATE_FAILURE` (issue #74, the `baseline_reason` enum gap) |
| S15 | **REPORT SEGMENT** | size of the trailing no-tool_use run (§4.6) | 1 turn / 7,316 out / 3,130 think = **23.7% of run output** |
| S16 | **EXCLUDED SEGMENTS** | setup, consensus, report — printed, never in P | setup 10 turns / 20,379 growth; consensus 6 turns / 13,744 growth / 7,093 out |

Run totals, printed once for arithmetic checking and forbidden as a headline (§10): 26 turns, 30,863
output tokens, 11,856 thinking, final prefix 82,209.

---

## 4. The segmentation rule

Mechanical, arm-agnostic, keyed only on **Agent dispatches** — the sole orchestrator action both arms
perform. Arm A has no `next` to key on; arm B has no gate-write to key on; arm B is frozen, so no
cooperative sentinel is available to either arm. Do not retrofit one.

1. **Turns** as in §2.2, ordered by the earliest timestamp in the group.
2. **Anchor** = a turn containing ≥1 `tool_use` with `name=="Agent"`. Label it from `input.subagent_type`
   by this frozen map: `adws-planner`→`plan`, `adws-builder`→`build`, `adws-tester`→`test`;
   `adws-critic|adws-advocate|adws-grader`→`consensus`;
   `adws-reviewer|adws-documenter|adws-shipper|adws-verifier`→`post`; anything else (`general-purpose`,
   `Explore`, …) → **not an anchor**, the turn inherits the current label. A helper dispatch is not a
   phase transition. If one turn's Agent blocks map to two different labels → **VOID**.
3. **Collapse:** a maximal run of consecutive `consensus` anchors becomes one anchor at the first of
   them. Adjacency-free, so it survives arm A splitting the pair across turns.
4. **S1 — PRIMARY SEGMENTATION (anchor OPENS its segment).** Turns before the first anchor = `setup`.
   Each anchor and every turn up to (not including) the next anchor carry that anchor's label.
5. **Merge** segments sharing a label (a retried phase's attempts aggregate into one phase total).
6. **Report cut:** scanning backwards from the final turn, relabel every turn containing no `tool_use`
   as `report`; stop at the first turn that has one. Applied identically to both arms.
7. **NOTIF turns** (excluded from S1 round trips only, and listed): zero `tool_use`, `output_tokens < 100`,
   and the immediately preceding user row begins `<task-notification>`. Arm B has two (49 and 55 tokens),
   both inside `consensus`, which the primary excludes.
8. **COMMON SCOPE = {plan, build, test}** — the phases both arms are instructed to run. `setup`,
   `consensus`, `post` and `report` are computed and printed, never in P.
9. **TILING ASSERTION.** Σ|segments| == |turns|, no turn carries two labels; the script **refuses to
   print any number** otherwise and exits non-zero. (The `measure-delta.js` precedent.)
10. **GUARD:** fewer than three anchors covering {plan, build, test} in arm A → the primary is undefined
    and the run is **VOID**, not "arm A was cheap." The cheapest way to win arm A is to not run the pipeline.

**Arm B under S1 (tiles 26/26):**

| segment | turns | growth | out | think | disp chars | non-Agent tools |
|---|---|---|---|---|---|---|
| setup [T0–T9] | 10 | 20,379 | 6,787 | 4,753 | 0 | 10 |
| **plan [T10–T12]** | 3 | **5,605** | 3,564 | 1,513 | 3,315 | 2 |
| **build [T13–T15]** | 3 | **5,485** | 2,946 | 89 | 5,453 | 2 |
| **test [T16–T18]** | 3 | **5,676** | 3,157 | 270 | 5,643 | 2 |
| consensus [T19–T24] | 6 | 13,744 | 7,093 | 2,101 | 9,984 | 3 |
| report [T25] | 1 | n/a | 7,316 | 3,130 | 0 | 0 |

### 4.11 The sensitivity segmentation — S2, and the rule that binds it

**S2 (anchor CLOSES its segment, inclusive).** Segment *k* = every turn after anchor *k−1* through
anchor *k*. Names: `intake+plan`, `to-build`, `to-test`, `to-consensus`, `tail`, plus the same `report`
cut. Common scope under S2 = **{to-build, to-test, to-consensus}**.

S2 charges each segment with *closing the previous gate and opening the next*; S1 charges each phase
with *its own dispatch and its own close-out*. Both tile the same 26 turns; they differ only in which
segments sit at the two ends of the run, and therefore in which are excluded.

**Arm B under S2 (frozen):** `to-build` 5,453 / `to-test` 5,360 / `to-consensus` 7,522 → **P_B(S2) = 6,112**;
RT 3.00; output 3,085 / 3,084 / 5,483 (Σ 11,652); thinking Σ 1,432.
`intake+plan` 11 turns / 24,627 growth; `tail` 5 turns / 7,927 growth.

**THE BINDING RULE: the verdict of §5 must be computed under BOTH segmentations and must be IDENTICAL.
If S1 and S2 return different bands, the result is INDETERMINATE and a replicate is forced — regardless
of how large or how welcome either number is.** Reporting one segmentation's verdict without the other's
is a violation of this document.

---

## 5. The decision rule

Two instruments. **Disjunctive for a kill, conjunctive for a confirm.** Either firing kills; only
agreement confirms; disagreement is INDETERMINATE and forces a replicate.

Let `Δ_I = I_net(A) − I_net(B)` (intake mass difference, tokens; positive = controller cheaper at intake;
`I_net(B) = 20,379`). Let `Δ_P = P_A − P_B` (`P_B = 5,589` under S1, `6,112` under S2).
Let **`n* = Δ_I / (−Δ_P)`** when `Δ_P < 0` — the number of phase transitions at which the controller
stops paying for itself.

### Instrument 1 — §2's kill sentence, in orchestrator tokens

> "a chatty handshake that costs more orchestrator tokens than the hand-run bookkeeping it removes would **kill the win**"

| Band | Verdict | What it means for §6.2 |
|---|---|---|
| `Δ_P ≥ 0` and `Δ_I > 0` | **CONFIRM** | The controller is cheaper at intake *and* per phase. No crossover exists. Finding 25's mechanism argument becomes a measurement at n=1, with every §9 limit attached. |
| `Δ_P < 0` and **`n* < 7`** | **KILL** | The per-phase penalty consumes the interface saving inside a single clean seven-phase run. §2's kill sentence fires. Condition 4 fails; the GO's pessimistic floor is gone and §6.2 is downgraded to conditional-on-the-optimistic-reading — the same downgrade §12.7's top band assigns to a Z′ above 21,274 B. Record the kill and stop; the §5 incremental levers become the answer. |
| `Δ_P < 0` and **`7 ≤ n* < 14`** | **INDETERMINATE, leaning kill** | The margin survives a clean run and not a real one — retries, rewinds and multiple consensus rounds push a real job past 7 transitions. §11 requires arguing from the pessimistic end, so this band is treated as a kill unless a replicate moves it. |
| `Δ_P < 0` and **`n* ≥ 14`** | **CONFIRM, with `n*` published** | The penalty exists and does not bite inside any realistic run. |
| **`|Δ_P| < 1,000` tokens/phase** | **RESOLUTION FLOOR** | n=1 cannot resolve a difference this small (arm B's within-run spread is ±96 tokens, which is a *within-run* figure and understates between-run variance). Verdict is **CONFIRM-AT-FLOOR** only if `Δ_I ≥ 14,000` (a 1,000/phase worst case still gives `n* ≥ 14`); otherwise **INDETERMINATE**. |

**The scale of the bar, so it is a number and not an adjective.** Arm B's measured instruction mass is
7,294 tokens (sketch 3,862 + `task-contract.md` 3,432). Arm A's is predicted at 10,700–13,100 tokens if
it opens `SKILL.md` alone and 46,000–51,000 if it opens all four references SKILL.md names
(30,012 B alone; 124,008 B for the full-document set: `SKILL.md` + `phase-gates.md` 41,195 +
`artifact-layout.md` 34,632 + `validator-inputs.md` 10,325 + `task-contract.md` 7,844).
That predicts `Δ_I ∈ [+4,700, +42,700]`, so at n=9 the per-phase tolerance is between **~520 and ~4,750
tokens**. Against `P_B = 5,589`, the pessimistic bar means **arm B may cost at most ~520 tokens/phase more
than arm A — a 9% difference — before the pessimistic margin is consumed.** That is the resolution this
design must achieve and does not have. Hence the floor, and hence §6.

### Instrument 2 — §9's kill criterion, in round trips

> "> ~2–3 model round-trips per phase, or large per-call context"

- **KILLS** if `RT_B > 3.5` absolute, **or** `RT_B − RT_A > 1.0`.
- **CONFIRMS** only if `RT_A ≥ RT_B`.
- **ALREADY ON THE RECORD, independent of arm A: `RT_B = 3.00` exactly** (3/3/3, identical under S1 and
  S2). `record` and `next` were separate turns at every one of the three phases — T11/T12, T14/T15,
  T17/T18 — and never batched. **FINDINGS.md Q5's "2 model turns per phase in steady state" is an
  inference from step 3 and is falsified by the only live controller run.** Publish that correction
  whatever the A/B returns. Arm B therefore sits **at the ceiling** of §9's band before arm A has run.
- Per-call context, §9's second limb, reported not banded: arm B's max prefix per phase is
  56,613 / 61,796 / 67,082, rising to 82,209 at close.

### Vetoes — any one forces INDETERMINATE from any band

1. **Sign disagreement with output tokens.** Δ(output per phase) disagrees in sign with `Δ_P`.
2. **Thinking veto.** Δ(thinking per phase) disagrees in sign with `Δ_P` *and* `|Δ_think| ≥ 1,000`
   tokens/phase. (Thinking may veto; it may never confirm — one question, one decider; findings 22/29/34.)
3. **Displacement.** `|Δ(setup growth)| ≥ |Δ_I|`, i.e. the intake difference merely moved into or out of
   the phases.
4. **Segmentation disagreement.** S1 and S2 return different bands (§4.11).
5. **Under-briefing.** The orchestrator-side saving is smaller in magnitude than the subagent
   `totalTokens` difference running the other way. Finding 38 is why: 60–84% of steady-state output is
   the dispatch briefing, and arm B *did* under-brief its consensus pair. An arm that briefs badly would
   otherwise win this A/B while producing worse gates.
6. `HUMAN_TURNS(A) > 1` — the run was steered.
7. Any VOID assertion fired (§7).
8. `S12 FORBIDDEN_READS > 0` in either arm.

---

## 6. The replication rule

**n=1 per arm suffices only when all five hold:**

1. The verdict is CONFIRM or KILL (not INDETERMINATE, not CONFIRM-AT-FLOOR).
2. `|Δ_P| ≥ 1,000` tokens/phase.
3. **Leave-one-out stable:** recompute `Δ_P` dropping each matched phase in turn (3 recomputations).
   The sign must not change and `n*` must not cross 7 or 14 in any of them. Arm B's `test` phase is 1.6%
   above its siblings on growth but its `plan` phase is 17× the `build` phase on thinking — this test is
   not a formality.
4. Both instruments agree in direction, both segmentations agree in band, no veto fired.
5. Three matched phases in both arms, with `ATTEMPTS_PER_PHASE` equal (arm B: 1 / 1 / 1).

**A replicate is FORCED when:** any of the above fails; or `ATTEMPTS_PER_PHASE` differs; or arm A's
anchor sequence diverges before three phases; or a covariate guard trips (§7); or a BASELINE-DRIFT
warning fires.

**Which arm to replicate: arm A.** It is the unmeasured one, the cheaper one to repeat, and **the only
thing in this design that can produce a run-to-run variance estimate at all** — today the sole dispersion
figure in existence is arm B's within-run spread, which is a proxy standing in for the property. Two arm A
runs against the existing arm B is the cheapest configuration in which a variance term is measured rather
than assumed. Replicate arm B only if two arm A runs bracket it, and then **only against the frozen
sketch by SHA-256** (§7.9).

**Cost of one replicate, measured from arm B:** ~372,000 subagent tokens (planner 102,114 + builder
153,239 + tester 116,771, plus two unaccounted consensus agents), ~50,000 tokens of orchestrator context,
~40 minutes wall clock, 5 of the 10 dispatches. Budget for it up front; §11 requires arguing from the
pessimistic end, and deciding to replicate *after* seeing a number you dislike is a different act.

**Explicitly NOT a replication trigger:** arm A passing the test gate arm B failed. That divergence is
expected (issue #74's enum gap is caught by the controller's strict `checks[]` reader; arm A's scorer
evaluates `checks[]` at all — findings 16/17), the per-phase scoping absorbs it, and re-running to force
a matching failure is selecting the run to fit the result. It is reported (§9), not repaired.

**The hard limit on what n=1 may do to the record.** A single pair may close condition 4 as "measured
once, direction X, here are the limits". It may **not** re-price the published headroom bracket
(2.36×–12.22× in §11; 2.22×–11.64× after finding 31), may not be quoted as a ratio in
SIMPLIFICATION_ANALYSIS §6.2, and may not retire condition 4's status as an open item.

---

## 7. The frozen list

Everything here is recorded in `spike/adws-controller/ab/PREREGISTRATION.json` before the arm A VM
launches, and re-verified afterwards. **If one of them turns out to have changed, the stated consequence
is not negotiable after the fact.**

| # | Frozen | Verification | If it changed |
|---|---|---|---|
| 1 | **The metric.** `measure-ab.js` SHA-256, and arm B's complete numbers under it (§3, §4). | recorded digest vs recomputed digest printed side by side in the final report | any digest mismatch → the numbers are recomputed under the recorded script, or there is no verdict. **A SHA-256, never a size** — finding 27 is why (`'finalize'`→`'terminal'`, same byte length, walked through a size stamp) |
| 2 | **The shipped tree.** `adws-pipeline/` and `.claude/agents/` at `80f1e95` — **asserted byte-identical to HEAD by the driver, not stated** (verified: empty diff) | tree digest before and after arm A | any edit between pre-registration and the end of arm A → VOID |
| 3 | **The prompt.** Arm A's single human message, its SHA-256, and the clause-by-clause mapping table from arm B's | grep the transcript for the recorded text | any other operator message → run is STEERED, disclosed, veto 6 fires |
| 4 | **Harness config.** `model == "claude-opus-5"`, `version == "2.1.228"`, `effort == "high"` on every assistant row, single value per arm and equal across arms (arm B: all 61 rows) | script assertion | mismatch → **VOID**, re-run both arms inside the same window |
| 5 | **Permission mode.** Pinned to `auto` from the first message; arm B's `default → acceptEdits → auto` toggles all fall inside `setup`, which the primary excludes | `type:"permission-mode"` rows | a mid-phase toggle in arm A → disclosed as an uncontrolled per-tool-call tax on the arm that makes more tool calls |
| 6 | **Session baseline.** One null session ("hi") in each arm's VM before the measured run; record its `prefix(turn 0)`. Arm B's measured run baseline: **31,320** (cr 21,998 + cc 9,320 + inp 2) | assert the two baselines agree within **2,000 tokens** | > 2,000 → BASELINE-DRIFT: a CLAUDE.md, memory file, MCP set or skill listing differs; `Δ_I` is reported with the difference itemised and a replicate is forced |
| 7 | **The contract and slice.** `spike/adws-controller/fixtures/live_contract.json`; plan → build → test with one consensus round; dispatch cap 10 | transcript | — |
| 8 | **The stop condition**, verbatim and symmetric: *"stop the moment the test gate is decided — pass or fail. Do not start review, do not run `execution-report.js`, do not archive."* | transcript | asymmetric stop → run totals are already forbidden (§10); the tail is excluded by §4.6 regardless |
| 9 | **The sketch, for any arm-B replicate:** sha256 `9f00a6c7154d30dc2651592b8765fe336020e9f86a5839c445cbc5c09361fb8f`, 9,700 B. HEAD carries the **patched 11,400 B Z′** — a materially better interface and a different treatment | digest asserted in the run script | a replicate run from HEAD is not arm B and may not be labelled arm B |
| 10 | **Covariate bands.** Per-phase subagent `totalTokens` within 1.5×; build change-set file count within 2× (arm B: 4 files) | S10, S11 | outside band → VOID, replicate forced. Never quote arm B's 3.5% within-run spread as an error bar on `Δ_P` |
| 11 | **The VM, pre-run checklist, in order:** archive arm B's sidechain JSONLs from `~/.claude/projects/**`; `git worktree prune`; remove arm B's worktree and evidence tree; confirm no `artifacts/` in the checkout; record `git worktree list` and `git status`; fresh session | recorded before message 1 | stale state that changes arm A's job-id or worktree path → disclosed; a contamination grep hit → VOID |
| 12 | **Contamination grep**, arm A's whole transcript: arm B's jobId (`job_20260811_0001`), its evidence root, and the strings `thin-skill-sketch`, `FINDINGS`, `SPIKE_CONTROLLER_PLAN` | script | any hit → **VOID**. `FINDINGS.md` is 1,600 lines describing exactly how arm B ran; an arm A that reads it runs with the answer key |

**Arm A's install, and the one thing that will otherwise end the run at zero dispatches.**
`skill-check.js` `findAgentsDir()` looks only at `<SKILL_DIR>/../../agents` and
`<SKILL_DIR>/../.claude/agents`. Copying `adws-pipeline/` alone into a skills directory yields
`intact:false`, `agents_dir:null`, exit 1, and SKILL.md §0 step 3 says *do not start the job*. **Before
the run:** install to `~/.claude/skills/adws-pipeline/` **and** copy `.claude/agents/*.md` to
`~/.claude/agents/`, then assert `node ~/.claude/skills/adws-pipeline/scripts/skill-check.js --json`
returns exit 0 / `intact:true` / `agents_checked:10`. Arm A pays one round trip arm B did not; it lands
in `setup`, which the primary excludes. **If arm A nonetheless aborts at intake, that is a reportable
result about the shipped skill's installability, not a licence to patch the skill and re-run without
saying so.**

**Arm A's prompt** is a literal diff of arm B's, published alongside the result:
- `follow thin-skill-sketch.md` → `use the adws-pipeline skill and follow it; read whatever it directs you to`.
  It must say **use the skill**, not "read `~/.claude/skills/adws-pipeline/SKILL.md`" — a skill body arrives
  as a Skill tool result, not a Read, and an arm that reads the file is not testing a skill.
- forbidden `adws-pipeline/` reads → forbidden `spike/**` and `docs/**` reads (same *shape*, so the read-set
  asymmetry is bounded; arm A's own references are explicitly permitted, since choosing them is the thing
  under test).
- The four closing report bullets, the worktree instruction, the contract, the 10-dispatch cap and the stop
  clause are carried **verbatim**.

---

## 8. The confounds table

| # | Difference between the arms | Bias direction | Controlled? |
|---|---|---|---|
| 1 | Arm B's read set was **capped by its prompt** ("read NOTHING ELSE from `adws-pipeline/`"); arm A chooses freely | favours controller | partial — symmetric-shape prohibition on `spike/`+`docs/`; arm B's 17,544 B is a lower bound and arm A's is an upper bound, stated as such |
| 2 | Arm A must install the skill + agents and run `skill-check` | favours controller | yes — lands in `setup`, excluded from P |
| 3 | Arm A's `SKILL.md` arrives via the **Skill tool result**, not a `Read` | artefactual, favours controller if uncounted | yes — S8 counts Skill result bytes and the cache-creation jump on that turn; assert exactly one `adws-pipeline` Skill invocation |
| 4 | **Finding 37** — arm B's evidence tree landed inside the worktree; four residue events, a falsified mandated briefing clause, an authored exclusion | favours prose (inflates arm B) | partial — largest single arm-B-specific inflation, concentrated in `setup` and `consensus`, both excluded from P. **Do not fix the controller before arm A runs** (§12.7's "no mid-run repair" in a new costume) |
| 5 | **Finding 40** — the literal `init` form crashed with an uncaught ENOENT; T5 alone is 2,417 out / 2,039 thinking | favours prose (inflates arm B's intake) | partial — report `I_net(B)` twice, raw (20,379) and with T5 excluded, naming the turn. Argue from the raw figure |
| 6 | Arm B's **report turn** — 7,316 output / 3,130 thinking, 23.7% of its output, produced solely by the prompt's four reporting demands | favours prose if unmirrored, favours controller if excluded asymmetrically | yes — bullets mirrored verbatim **and** §4.6's mechanical cut excludes `report` from both arms |
| 7 | Arm B dispatched consensus **async**: two NOTIF turns, and `totalTokens` lost for both assessors | **UNKNOWN — SERIOUS** | partial. NOTIF turns excluded from RT and listed. **Work-shifting at the consensus gate — the one gate finding 38 flagged — is undetectable by this experiment unless the archived subagent JSONLs are recovered from the VM first.** Recover them before arm A; if gone, mark UNRECOVERABLE, never estimate |
| 8 | **Terminal states will differ.** Arm B failed on a strict `checks[]` schema read (issue #74); arm A's scorer evaluates neither `checks[]` nor `file_change_proposal` (findings 16/17) and will very likely pass | **UNKNOWN — SERIOUS** | partial — per-phase scoping; run totals forbidden (§10); both terminal states printed side by side as a **quality observation explicitly not measured here** |
| 9 | **Advocate tier.** The controller emitted `advocate: sonnet`; `phase-gates.md` medium row says **haiku**. A dissent routes arm A into `operator` resolution, a branch arm B never entered | **UNKNOWN — SERIOUS** | no — verify arm A's selection from its transcript, do not override. A dissent in one arm and not the other marks the pair path-divergent and forces a replicate |
| 10 | **n=1 with uncontrolled subagent output size.** Arm B's builder touched 4 files / 83 tool calls; the orchestrator's per-phase context is partly a function of what its subagents produced | **UNKNOWN — SERIOUS** | partial — covariate void bands (§7.10); this is the single largest reason the resolution floor exists |
| 11 | **Prompt-cache state.** Arm B's first call already read 21,998 cached tokens; arm A's system prompt differs (the skill listing now contains `adws-pipeline`) | **UNKNOWN** on any level-based or billed metric | yes for the primary — growth is cache-split- and eviction-invariant; plus the null-session baseline assertion (§7.6). Never report a dollar figure as a result |
| 12 | **Permission mode.** Arm B's first two turns ran under `default`/`acceptEdits`; `auto` screens every tool call | favours controller (arm A makes more tool calls) | partial — pinned for arm A; arm B's toggles are inside `setup`; cannot be undone, disclosed |
| 13 | Arm B **entered plan mode** and exited at row 22 | favours prose (adds arm B intake turns) | yes — inside `setup`; arm A's first message worded so plan mode is not triggered |
| 14 | **The contract is self-referential** — `allowed_paths` is `adws-pipeline/references/`, and `file_hints` names `phase-gates.md` and `artifact-layout.md`, three of the four references SKILL.md tells arm A to read | favours controller | partial — record per read whether it was orchestration or task; report instruction mass with and without `file_hints` files; state that this contract is atypical in exactly the way that matters |
| 15 | **The slice is plan→build→test**, excluding the four phases where prose bookkeeping is heaviest (13 counters, 5 rewind families, ship modes, tier escalation, resume) | favours prose (understates the controller's win) | no — stated beside the result |
| 16 | **Arm B's controller took no rewind, no tier escalation, no resume**, and implements 11 of 20 rule families | favours controller | no — stated beside the result. #15 and #16 are opposing and do not obviously cancel |
| 17 | Arm B was a **residue-hunting** run (instrumentation demands a production run would not carry) | favours prose (inflates arm B) | partial — mirrored where mirrorable; the predicted direction is recorded **here**, before the sign is known, so it cannot be raised only when the sign is unwelcome |
| 18 | **Model-serving drift** between the two run dates | **UNKNOWN**, lands entirely on arm A | partial — run arm A as soon as possible; assert §7.4 |

**Confounds with unknown direction and serious severity — #7, #8, #9, #10 — are limits on the verdict,
not footnotes.** Any CONFIRM or KILL published from this experiment carries them in the same paragraph as
the number.

---

## 9. What this cannot show

1. **Which arm is cheaper overall.** `isSidechain` is 0 on all 145 rows of arm B's file — no subagent
   turn is in the data. Arm B's plan dispatch alone cost 102,114 subagent tokens against 3,564
   orchestrator output tokens for the whole plan phase. The orchestrator is a few percent of the bill and
   this experiment sees only that few percent.
2. **Finding 38's mechanism — the one observed instance of the risk this A/B exists to test.** The
   consensus assessors re-derived the tester's results because the sketch withheld `prev_output`. That
   growth happened *inside subagents*, outside the instrument. `DISPATCH_CHARS` is the only
   orchestrator-visible proxy for it, and a proxy is what findings 12/14/15/18/19/23/27 are about.
3. **Causation.** A difference between two single runs is not an attribution to the interface. Model
   nondeterminism, subagent output size and the two prompts' unavoidable asymmetry all move P, and none
   is controlled at n=1. The strongest supportable claim is "under these conditions, one run of each
   differed by X" — the same class of statement as step 3's single 170,249-token dispatch, which
   FINDINGS.md correctly labels "a single observed measurement, not a reproducible one".
4. **Quality.** Neither arm's output is scored. If arm A is cheaper *and* waves through the row arm B
   correctly failed on, the honest reading is that the cheaper orchestrator gates worse. Finding 39 is
   the standing proof that a deterministic validator catches what two independent LLM assessors miss.
5. **Review, document, ship, verify** — four of seven phases, never orchestrated from either document,
   under either interface. Condition 3 is untouched.
6. **Retries, rewinds, dissent resolution, `reproduce`, tier escalation, resume.** None fired live in arm
   B; arm A stops at the test gate before any can.
7. **The finished §6.2 controller.** Arm B ran 11 of 20 rule families. 3.00 round trips and 5,589
   tokens/phase are the *cheapest* handshake the controller has, not evidence about the nine families
   that would make it chattier.
8. **Sampling variance.** No estimate exists for either arm. Arm B's ±3.5% between-phase spread is a
   lower bound on the quantity actually needed.
9. **Generalisation.** One contract, `task_size: small`, `risk_level: medium`, four criteria, a
   documentation-shaped change set, in the repository that owns the pipeline.
10. **Whether "reasoning" shrank.** P measures the per-phase token footprint, not the decision load; and
    the field carrying the word — `thinking_tokens` — is 89–1,513 per phase in arm B and is harness-mediated
    by `effort`. If the arms differ mainly in briefing length (60–84% of arm B's steady-state output), this
    experiment will have measured how long a briefing each interface elicits. Say that plainly rather than
    relabelling it.
11. **Commensurability.** Condition 4 asks whether output-side growth "consumes" a margin denominated in
    input-side instruction mass. Those are one unit only if you price them, and the two defensible ratios
    (1:1 instruction mass, ~5:1 cost) differ ~5-fold in how easily the margin is eaten. Both are published
    as a sensitivity; neither is a decider. Which reading §6.2 should be judged on is a product call, in
    the family of findings 16/17/39.
12. **That reduced instruction mass reduces cost.** Arm B read 1,442,738 cached tokens against 60,210
    created. The byte question and the token question are different questions and neither implies the other.

---

## 10. The rationalization guard

Each item below is a way this result could be spun after the fact. They are named here, before the data
exists, so that doing one later is visibly a violation of a document that already exists in the repository.

1. **Reporting a run total.** Total output, total prefix, total billed input, total cost — as a headline,
   a comparison, or a "for context". The arms end in different terminal states doing different amounts of
   work. **Forbidden outright.**
2. **Reporting the context LEVEL, or any input-inclusive total, as condition 4's answer.** Arm A carries
   30,012 B of SKILL.md in every prompt; any level-based number shows a large controller win that is
   100% step 4's already-banked instruction-mass result. That is condition 2 measured twice and the second
   time called new evidence. The primary is a **delta**, and `measure-ab.js` has no code path that emits a
   combined input+output ratio. Per-call context (§5, instrument 2) is printed under a heading that says
   verbatim: *this re-measures step 4's axis at runtime and is NOT condition 4's answer.*
3. **"The controller is ~1.1× cheaper."** Any figure inside the resolution floor (`|Δ_P| < 1,000`)
   reported as a result rather than as INDETERMINATE. This is §12.2's forbidden **1.157×** in a new
   costume; **1.157× itself remains forbidden**, and arm A's measured read set goes against *both*
   consistent befores (30,012 B and 124,008 B), never the hybrid.
4. **Choosing the segmentation after seeing the numbers.** S1 and S2 and their arm-B values are frozen in
   §4. A reader who disagrees with the anchor map edits it and re-runs; a reader who breaks the tiling
   gets an error, not a smaller number.
5. **Excluding arm B's report turn, or its crash turns, but not arm A's analogues** — or excluding them
   only once the sign is known. §4.6 is mechanical and symmetric; the crash sensitivity is pre-declared
   as a band with the verdict argued from the raw figure.
6. **Reading a null as confirmation.** "No significant difference" will be read as confirming finding 25's
   mechanism argument. It is not. "No difference detected at n=1 with unknown noise" is not "no growth" —
   that is the exact overclaim an audit already forced FINDINGS.md to retract ("cannot flip the sign" →
   "unconfirmed at the pessimistic end").
7. **Quoting a §9 tie as controller support.** If both arms land at ≤3.0 round trips, that limb does not
   discriminate. Say so. And publish the standalone correction either way: **the controller's measured
   steady state is 3.00 round trips per phase, not the inferred 2** — at §9's ceiling, not under it.
8. **Raising arm B's prompt handicap only when the sign is unfavourable.** It is recorded in §8 #17 with
   its predicted direction. Symmetrically: raising arm A's free read set only when *its* sign is
   unfavourable (§8 #1).
9. **Mixing units.** Adding a token delta to the byte margin (9,362 / 21,274 / 9,146 / 11,400 B). An
   earlier draft's claim that byte ratios are tokenizer-independent was already wrong once.
   `measure-ab.js` emits tokens only and carries no byte constants; any recomputation of the headroom
   bracket is a separate, explicitly-labelled step with a stated tokenizer, or it does not happen.
10. **Calling a HEAD-sketch re-run "arm B".** HEAD carries the patched 11,400 B Z′ with most of the ten
    residue events fixed — a better interface and a different treatment (§7.9).
11. **Patching the shipped skill after an arm A intake failure and re-running quietly.** The failure is
    the result. Disclose the patch, or there is no arm A.
12. **Using the gate divergence as evidence in either direction.** Arm A passing where arm B failed is not
    evidence that prose is better, and arm B's failure is not evidence that the controller is better. It
    is issue #74, and it is a quality observation this experiment does not price.
13. **Letting n=1 re-price the record.** A single pair may close condition 4 as "measured once, direction
    X, with these limits". It may not move the published bracket, may not be quoted as a ratio in §6.2,
    and may not retire condition 4 as an open item (§6).

**Same slice, same contract, opposite verdicts, one arm unmeasured for variance — that is the single most
misreadable fact about this pair, and it belongs in the first paragraph of whatever is written when the
numbers land.**