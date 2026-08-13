#!/usr/bin/env bash
# THE REASONING A/B DRIVER — condition 4 of the §6.2 GO. THROWAWAY, like every other driver here.
#
# What this asserts today: that arm B's frozen numbers REPRODUCE. Every figure in
# `ab/PREREGISTRATION.json` is re-derived from the committed transcript by the committed script and
# compared. Nothing here is a sentence in a document that nobody re-checks — the spike has been
# wrong that way four times (findings 22, 27, 29, 34) and once about its own findings file (the
# ENOENT frame count, corrected in PR #76 and now asserted by run-step5.sh S9b).
#
# What this does NOT assert: anything about arm A. Arm A has not run. When it does, this driver
# gains the comparison; until then a missing arm A is the honest state and is printed as such.
#
#   A1  the artifacts are the ones the pre-registration froze (SHA-256, never a size)
#   A2  arm B's integrity assertions still hold on the committed transcript
#   A3  arm B's primary, both segmentations, re-derived and matched
#   A4  arm B's secondaries re-derived and matched
#   A5  the shipped tree arm A reads is unchanged since pre-registration
#   A6  arm A, first run: present or honestly absent
#   A7  arm A, second run: the model was fixed and the effort drifted
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
AB="$REPO/spike/adws-controller/ab"
PREREG="$AB/PREREGISTRATION.json"
MEASURE="$AB/measure-ab.js"
ARMB="$AB/evidence/armB-orchestrator.jsonl"

FAILS=0
PASSES=0
assert() { # <label> <actual> <expected>
  if [ "$2" = "$3" ]; then printf '  PASS  %s (%s)\n' "$1" "$2"; PASSES=$((PASSES+1))
  else printf '  FAIL  %s: expected [%s], got [%s]\n' "$1" "$3" "$2"; FAILS=$((FAILS+1)); fi
}
# JSON.parse, not require(): the measure report lands in a temp file with no .json suffix and
# require() would try to execute it as JavaScript.
jget() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const k=process.argv[2].split(".");let x=j;for(const p of k)x=x==null?x:x[p];process.stdout.write(String(x))' "$1" "$2"; }
pget() { jget "$PREREG" "$1"; }
sha() { node -e 'const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$1"; }

echo "### A1 — the artifacts are the ones the pre-registration froze"
# A digest, never a size. A same-length edit to the transcript or the script must read stale, which
# is finding 27's lesson applied to the experiment that cites it.
assert "measure-ab.js"          "$(sha "$MEASURE")"                     "$(pget digests.measure_ab_js)"
# The protocol itself is frozen. Editing it after arm A runs is the move §10 exists to make
# visible, so this assertion is SUPPOSED to fail on any edit — including a well-meant one.
assert "PROTOCOL.md"            "$(sha "$AB/PROTOCOL.md")"              "$(pget digests.PROTOCOL_md)"
assert "armB transcript"        "$(sha "$ARMB")"                        "$(pget digests.armB_orchestrator_jsonl)"
assert "armA launch prompt"     "$(sha "$AB/armA-launch-prompt.md")"    "$(pget digests.armA_launch_prompt_md)"
assert "armB launch prompt"     "$(sha "$AB/armB-launch-prompt.md")"    "$(pget digests.armB_launch_prompt_md)"
assert "the contract both arms run" "$(sha "$REPO/spike/adws-controller/fixtures/live_contract.json")" "$(pget digests.live_contract_json)"

echo
echo "### A2 — arm B's integrity assertions still hold"
REPORT="$(mktemp)"; trap 'rm -f "$REPORT"' EXIT
node "$MEASURE" --arm B "$ARMB" --json > "$REPORT" 2>/dev/null
rget() { jget "$REPORT" "$1"; }
B=arms.B
# The single most consequential fact about this data: 61 assistant ROWS are 26 model TURNS, and the
# usage object is repeated verbatim on every row of a turn. Summing rows inflates output by 2.71x.
# A row is a proxy for a response; findings 12/14/15/18/19/23/27 are what happens to proxies here.
assert "assistant rows in the file"        "$(rget $B.integrity.assistant_rows_total)" "61"
assert "which are this many model turns"   "$(rget $B.integrity.turns)"                "$(pget arm_b.integrity.turns)"
assert "message.id and requestId agree"    "$(rget $B.integrity.message_id_equals_request_id_count)" "true"
assert "usage is identical within a turn"  "$(rget $B.integrity.usage_identical_within_message_id)" "true"
assert "prefix additivity violations"      "$(rget $B.integrity.additivity.violations.length)" "0"
assert "sidechain rows (subagents are NOT in this file)" "$(rget $B.integrity.sidechain_rows_in_file)" "0"
assert "harness single-valued"             "$(rget $B.integrity.harness.single_valued)" "true"
assert "model"                             "$(rget $B.integrity.harness.models.0)"   "$(pget arm_b.harness.model)"
assert "version"                           "$(rget $B.integrity.harness.versions.0)" "$(pget arm_b.harness.version)"
assert "effort"                            "$(rget $B.integrity.harness.efforts.0)"  "$(pget arm_b.harness.effort)"

echo
echo "### A3 — arm B's primary, re-derived under BOTH segmentations"
# The verdict must not depend on which segmentation is chosen (PROTOCOL §4.11). Both are computed
# every time so that picking one after seeing arm A is not available as a move.
S1=$B.segmentations.S1.primary
S2=$B.segmentations.S2.primary
assert "S1 tiles every turn exactly once"  "$(rget $B.segmentations.S1.tiling.ok)" "true"
assert "S2 tiles every turn exactly once"  "$(rget $B.segmentations.S2.tiling.ok)" "true"
assert "P_B under S1"                      "$(rget $S1.P)" "$(pget arm_b.primary_S1.P)"
assert "  plan growth"                     "$(rget $S1.per_phase.plan.growth)"  "$(pget arm_b.primary_S1.per_phase_growth.plan)"
assert "  build growth"                    "$(rget $S1.per_phase.build.growth)" "$(pget arm_b.primary_S1.per_phase_growth.build)"
assert "  test growth"                     "$(rget $S1.per_phase.test.growth)"  "$(pget arm_b.primary_S1.per_phase_growth.test)"
assert "P_B under S2"                      "$(rget $S2.P)" "$(pget arm_b.primary_S2.P)"
# S2's spread is 35%, S1's is 3.4% — the same run. That is why the resolution floor exists and why
# the leave-one-out check in §6.3 is not a formality.
assert "S1 within-run spread %"            "$(rget $S1.within_run_spread_pct)" "$(pget arm_b.primary_S1.within_run_spread_pct)"
assert "S2 within-run spread %"            "$(rget $S2.within_run_spread_pct)" "$(pget arm_b.primary_S2.within_run_spread_pct)"

echo
echo "### A4 — arm B's secondaries, including §9's own kill unit"
# §9 kills §6.2 above "~2-3 model round-trips per phase". The controller's measured steady state is
# 3.00 — at the ceiling of that band, not under it. FINDINGS.md Q5 inferred 2 from step 3's mocked
# path; the only live run says 3, and `next` and `record` were never batched.
assert "round trips: plan"   "$(rget $S1.round_trips_per_phase.plan)"  "$(pget arm_b.round_trips_per_phase.plan)"
assert "round trips: build"  "$(rget $S1.round_trips_per_phase.build)" "$(pget arm_b.round_trips_per_phase.build)"
assert "round trips: test"   "$(rget $S1.round_trips_per_phase.test)"  "$(pget arm_b.round_trips_per_phase.test)"
assert "round trips: mean"   "$(rget $S1.round_trips_mean)"            "$(pget arm_b.round_trips_per_phase.mean)"
assert "intake mass I_net"   "$(rget $B.secondary.S6_intake_mass.I_net)" "$(pget arm_b.intake_mass.I_net)"
assert "session baseline"    "$(rget $B.secondary.S7_session_baseline.prefix)" "$(pget arm_b.session_baseline_prefix)"
assert "instruction mass, tokens" "$(rget $B.secondary.S8_instruction_reads.total_attributed_tokens)" "$(pget arm_b.instruction_reads.total.tokens)"
assert "instruction mass, bytes"  "$(rget $B.secondary.S8_instruction_reads.total_content_bytes_utf8)" "$(pget arm_b.instruction_reads.total.bytes)"
assert "handshake calls, as run"  "$(rget $B.secondary.S9_handshake_volume.controller.n_calls)" "$(pget arm_b.handshake.as_run.calls)"
assert "handshake inbound bytes"  "$(rget $B.secondary.S9_handshake_volume.controller.inbound_bytes_utf8)" "$(pget arm_b.handshake.as_run.inbound_bytes)"
# Amendment A4: 2 of the 11 calls bundle non-handshake work, so the pure interface cost is lower —
# and it lands UNDER step 4's replayed seven-phase estimate rather than over it. Finding 31's
# prediction is confirmed on the as-run figure and not on the pure one; both are published.
assert "handshake calls, pure"    "$(rget $B.secondary.S9_handshake_volume.controller.n_calls_pure)" "$(pget arm_b.handshake.pure.calls)"
# Amendment A6. This comparison used inbound_chars_pure (7,493) against a BYTE-denominated 9,146 —
# the exact chars/bytes mix amendment A3 was written to stop, in the driver that asserts A3. The
# byte figure is 7,497 and the conclusion is unchanged, which is why it is worth naming: a unit
# error that does not move the answer is the kind that survives review.
PURE_B="$(rget $B.secondary.S9_handshake_volume.controller.inbound_bytes_utf8_pure)"
assert "pure handshake bytes"     "$PURE_B" "$(pget arm_b.handshake.pure.inbound_bytes)"
assert "pure handshake chars"     "$(rget $B.secondary.S9_handshake_volume.controller.inbound_chars_pure)" "$(pget arm_b.handshake.pure.inbound_chars)"
assert "  and BYTES are UNDER step 4's replayed seven-phase BYTES" \
  "$(node -e 'process.stdout.write(String(Number(process.argv[1])<Number(process.argv[2])))' "$PURE_B" "$(pget arm_b.handshake.step4_replayed_seven_phase_bytes)")" "true"
assert "forbidden reads"     "$(rget $B.secondary.S12_forbidden_reads.strict_count)" "$(pget arm_b.forbidden_reads)"
assert "human turns (an unsteered run has exactly one)" "$(rget $B.secondary.S13_human_turns.count)" "$(pget arm_b.human_turns)"

echo
echo "### A5 — the tree arm A reads is unchanged since pre-registration"
# Arm A's operating instruction IS this tree. If it moved between pre-registration and the run, the
# two arms did not read the same document and the pair is void.
# RE-FROZEN 2026-08-12 when SC-15 (PR #81) landed. This assertion now pins the tree for the FUTURE
# both-arms window §7.4 requires; the value the three recorded arm A runs actually read is kept
# under digests.shipped_tree.superseded. It fired on PR #81 while that was still a branch and was
# deliberately NOT updated then — defeating it to land a fix would have been a third harness drift,
# self-inflicted. It is updated now because arm A3 has run and its pair is void regardless.
TREE="$(cd "$REPO" && find adws-pipeline .claude/agents -type f | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256 | cut -c1-64)"
assert "shipped tree digest" "$TREE" "$(pget digests.shipped_tree.value)"

echo
echo "### A6 — arm A"
ARMA="$AB/evidence/armA-orchestrator.jsonl"
if [ -f "$ARMA" ]; then
  assert "arm A has run, and the pre-registration says so" "$(pget arm_a_status)" "RUN THREE TIMES 2026-08-12 — all THREE VOID on §7.4, one per frozen key: model, then effort, then version; see arm_a, arm_a2, arm_a3"
  assert "arm A transcript digest" "$(sha "$ARMA")" "$(pget digests.armA_orchestrator_jsonl)"
  CMP="$(mktemp)"; node "$MEASURE" --arm B "$ARMB" --arm A "$ARMA" --json > "$CMP" 2>/dev/null
  cget() { jget "$CMP" "$1"; }
  # §7.4 froze the harness config as EQUAL ACROSS ARMS. The analyzer checks single-valuedness
  # WITHIN an arm; the cross-arm comparison is asserted here, and it is the assertion that
  # decides this pair. Arm A ran on claude-fable-5 because a /model command in an earlier VM
  # session had made Fable 5 the default for new sessions — a setting, not a choice made for
  # this run, and exactly the class of drift §7.4 exists to catch.
  MA="$(cget arms.A.integrity.harness.models.0)"; MB="$(cget arms.B.integrity.harness.models.0)"
  assert "arm A model"  "$MA" "$(pget arm_a.harness.model)"
  assert "arm B model"  "$MB" "$(pget arm_b.harness.model)"
  assert "§7.4: the models are EQUAL across arms — this is the VOID" \
    "$(node -e 'process.stdout.write(String(process.argv[1]===process.argv[2]))' "$MA" "$MB")" \
    "$(pget arm_a.models_equal_across_arms)"
  assert "effort matches across arms"  "$(cget arms.A.integrity.harness.efforts.0)"  "$(cget arms.B.integrity.harness.efforts.0)"
  assert "version matches across arms" "$(cget arms.A.integrity.harness.versions.0)" "$(cget arms.B.integrity.harness.versions.0)"
  # Since the post-arm-A3 amendment the ANALYZER sees the model mismatch itself, so this
  # verdict is VOID where it used to read INDETERMINATE. The §4.11 band disagreement that
  # produced the old string is still true and is still asserted three lines below.
  assert "the analyzer's own verdict"   "$(cget comparison.verdict)" "$(pget arm_a.verdict)"
  assert "S1 band"                      "$(cget comparison.instrument_1.S1.band)" "$(pget arm_a.instrument_1.S1_band)"
  assert "S2 band"                      "$(cget comparison.instrument_1.S2.band)" "$(pget arm_a.instrument_1.S2_band)"
  assert "  and they disagree, which §4.11 makes binding" \
    "$(node -e 'process.stdout.write(String(process.argv[1]!==process.argv[2]))' "$(cget comparison.instrument_1.S1.band)" "$(cget comparison.instrument_1.S2.band)")" "true"
  # Leave-one-out was pre-registered as "not a formality" (§6.3). Dropping the build phase flips
  # the sign of Δ_P. One of three phases decides the direction, at n=1.
  assert "leave-one-out sign stability" "$(cget comparison.leave_one_out.sign_stable)" "false"
  assert "a replicate is forced"        "$(cget comparison.replication.replicate_forced)" "true"
  # Clean on everything the run itself controlled.
  assert "arm A forbidden reads"        "$(cget arms.A.secondary.S12_forbidden_reads.strict_count)" "0"
  assert "arm A contamination hits"     "$(cget arms.A.contamination.any)" "false"
  rm -f "$CMP"
fi

ARMA2="$AB/evidence/armA2-orchestrator.jsonl"
if [ -f "$ARMA2" ]; then
  echo
  echo "### A7 — arm A, second run: the model was fixed and the EFFORT drifted"
  assert "arm A2 transcript digest" "$(sha "$ARMA2")" "$(pget digests.armA2_orchestrator_jsonl)"
  CMP2="$(mktemp)"; node "$MEASURE" --arm B "$ARMB" --arm A "$ARMA2" --json > "$CMP2" 2>/dev/null
  c2() { jget "$CMP2" "$1"; }
  MA2="$(c2 arms.A.integrity.harness.models.0)"; EA2="$(c2 arms.A.integrity.harness.efforts.0)"
  EB="$(c2 arms.B.integrity.harness.efforts.0)"
  assert "arm A2 model — fixed"                "$MA2" "$(pget arm_a2.harness.model)"
  assert "  and now EQUAL across arms"          "$(node -e 'process.stdout.write(String(process.argv[1]===process.argv[2]))' "$MA2" "$(c2 arms.B.integrity.harness.models.0)")" "$(pget arm_a2.models_equal_across_arms)"
  # §7.4 freezes THREE keys, not one. Fixing the model moved the drift to the next key rather
  # than removing it: /effort saved xhigh as the new default exactly as /model had saved fable.
  # Effort sets the thinking budget, and thinking is a large share of what P measures — arm A2's
  # per-phase thinking is 2240/1380/1793 against arm B's 1513/89/270 — so this drift plausibly
  # inflates the arm predicted to be more expensive. A confound pointing AT the expected answer
  # is the one it is least defensible to accept.
  assert "arm A2 effort"                        "$EA2" "$(pget arm_a2.harness.effort)"
  assert "arm B effort"                         "$EB"  "$(pget arm_b.harness.effort)"
  assert "§7.4: efforts are EQUAL across arms — this is the SECOND VOID" \
    "$(node -e 'process.stdout.write(String(process.argv[1]===process.argv[2]))' "$EA2" "$EB")" \
    "$(pget arm_a2.efforts_equal_across_arms)"
  # Recorded because it is information about the INSTRUMENT, under a void that forbids reading it
  # as information about the controller (PROTOCOL §10.13).
  assert "observation: the two segmentations agree" "$(node -e 'process.stdout.write(String(process.argv[1]===process.argv[2]))' "$(c2 comparison.instrument_1.S1.band)" "$(c2 comparison.instrument_1.S2.band)")" "$(pget arm_a2.observation_not_a_result.segmentations_agree)"
  assert "observation: leave-one-out is sign-stable" "$(c2 comparison.leave_one_out.sign_stable)" "$(pget arm_a2.observation_not_a_result.leave_one_out_sign_stable)"
  assert "arm A2 forbidden reads"               "$(c2 arms.A.secondary.S12_forbidden_reads.strict_count)" "0"
  assert "arm A2 contamination hits"            "$(c2 arms.A.contamination.any)" "false"
  assert "a replicate is still forced"          "$(c2 comparison.replication.replicate_forced)" "true"
  rm -f "$CMP2"
else
  # An absent arm is stated, never assumed away. Condition 4 stays open until this file exists.
  assert "arm A has not run, and the pre-registration says so" "$(pget arm_a_status)" "NOT RUN — the VM is prepared and the prompt is frozen"
  echo "  (condition 4 remains OPEN: one arm measured, one arm pre-registered and unrun)"
fi

ARMA3="$AB/evidence/armA3-orchestrator.jsonl"
if [ -f "$ARMA3" ]; then
  echo
  echo "### A8 — arm A, third run: the operator's two keys were fixed and the HARNESS moved"
  assert "arm A3 transcript digest" "$(sha "$ARMA3")" "$(pget digests.armA3_orchestrator_jsonl)"
  CMP3="$(mktemp)"; node "$MEASURE" --arm B "$ARMB" --arm A "$ARMA3" --json > "$CMP3" 2>/dev/null
  c3() { jget "$CMP3" "$1"; }
  eq() { node -e 'process.stdout.write(String(process.argv[1]===process.argv[2]))' "$1" "$2"; }
  MA3="$(c3 arms.A.integrity.harness.models.0)";   MB3="$(c3 arms.B.integrity.harness.models.0)"
  EA3="$(c3 arms.A.integrity.harness.efforts.0)";  EB3="$(c3 arms.B.integrity.harness.efforts.0)"
  VA3="$(c3 arms.A.integrity.harness.versions.0)"; VB3="$(c3 arms.B.integrity.harness.versions.0)"
  # The two keys an operator controls, finally both correct AND equal across arms.
  assert "arm A3 model — still fixed"            "$MA3" "$(pget arm_a3.harness.model)"
  assert "  and EQUAL across arms"               "$(eq "$MA3" "$MB3")" "$(pget arm_a3.models_equal_across_arms)"
  assert "arm A3 effort — fixed this time"       "$EA3" "$(pget arm_a3.harness.effort)"
  assert "  and EQUAL across arms"               "$(eq "$EA3" "$EB3")" "$(pget arm_a3.efforts_equal_across_arms)"
  # §7.4 froze THREE keys. The third is the one nobody controls: the CLI updated itself
  # between 2026-08-11 and 2026-08-12. Confound 18 pre-registered this with direction UNKNOWN
  # and mitigated it only with "run arm A as soon as possible" — which failed because arm A
  # took three attempts. §7.4 names the literal "2.1.228", a version that no longer exists to
  # run against, so the pre-registered remedy is NOT another arm-A run.
  assert "arm A3 version"                        "$VA3" "$(pget arm_a3.harness.version)"
  assert "arm B version"                         "$VB3" "$(pget arm_b.harness.version)"
  assert "§7.4: versions are EQUAL across arms — this is the THIRD VOID" \
    "$(eq "$VA3" "$VB3")" "$(pget arm_a3.versions_equal_across_arms)"
  # The analyzer must now reach that verdict on its OWN. Before the amendment it returned
  # CONFIRM on this pair: it held both transcripts and never compared them.
  assert "the analyzer votes VOID by itself"     "$(c3 comparison.verdict)" "VOID"
  assert "  and names the reason"                "$(c3 comparison.cross_arm_harness.mismatches.0)" \
    'HARNESS_VERSION_NOT_EQUAL_ACROSS_ARMS (§7.4) A=["2.1.229"] B=["2.1.228"]'
  assert "  on the version key ALONE"            "$(c3 comparison.cross_arm_harness.mismatches.1)" "undefined"
  # Information about the INSTRUMENT, under a VOID that forbids reading it as information
  # about the controller (§10.13). This is the first pair to pass every stability check the
  # protocol asks for, which is the argument for freezing the harness SEPARATELY from those
  # checks: stability is not validity.
  assert "observation: the segmentations AGREE"   "$(eq "$(c3 comparison.instrument_1.S1.band)" "$(c3 comparison.instrument_1.S2.band)")" "$(pget arm_a3.observation_not_a_result.segmentations_agree)"
  assert "observation: leave-one-out sign-stable" "$(c3 comparison.leave_one_out.sign_stable)" "$(pget arm_a3.observation_not_a_result.leave_one_out_sign_stable)"
  assert "observation: leave-one-out band-stable" "$(c3 comparison.leave_one_out.band_stable)" "$(pget arm_a3.observation_not_a_result.leave_one_out_band_stable)"
  # §6's five n=1-sufficiency conditions: FOUR hold, and the fifth fails for exactly one
  # reason — veto 7, the harness void. Asserted per-condition rather than on the rollup,
  # because the rollup ("a replicate is forced") is true here for a reason that has nothing
  # to do with the measurement's stability and everything to do with its validity.
  assert "observation: n=1 condition 1 (verdict is confirm/kill)" "$(c3 comparison.replication.conditions.1_verdict_is_confirm_or_kill)" "true"
  assert "observation: n=1 condition 2 (|delta_P| over floor)"    "$(c3 comparison.replication.conditions.2_abs_delta_P_at_or_above_floor)" "true"
  assert "observation: n=1 condition 3 (leave-one-out stable)"    "$(c3 comparison.replication.conditions.3_leave_one_out_stable)" "true"
  assert "observation: n=1 condition 5 (matched phases/attempts)" "$(c3 comparison.replication.conditions.5_three_matched_phases_equal_attempts)" "true"
  assert "  and condition 4 fails ONLY because veto 7 fired"      "$(c3 comparison.replication.conditions.4_instruments_and_segmentations_agree_no_veto)" "false"
  assert "  so a replicate is forced by the VOID, not by instability" "$(c3 comparison.replication.replicate_forced)" "true"
  assert "observation: baseline drift is small"   "$(c3 comparison.baseline_drift.fired)" "false"
  assert "arm A3 forbidden reads"                 "$(c3 arms.A.secondary.S12_forbidden_reads.strict_count)" "0"
  assert "arm A3 contamination hits"              "$(c3 arms.A.contamination.any)" "false"
  rm -f "$CMP3"
fi

echo
echo "### $((PASSES+FAILS)) assertions run, $FAILS failed."
if [ "$FAILS" -eq 0 ]; then
  cat <<'EOF'
### A/B PASS — every frozen number reproduces from the committed transcripts under the committed
###   script. Arm B: 26 turns (not 61 rows), P_B = 5,589 tokens/phase under S1 and 6,112 under S2,
###   3.00 round trips per phase, I_net 20,379, instruction mass 7,294 tok / 17,544 B.
###
### NO PAIR IS A VERDICT, and these assertions are what say so. Arm A ran THREE times and
###   §7.4 voided all three, once per frozen key:
###     run 1  model    claude-fable-5 vs claude-opus-5   a saved /model default
###     run 2  effort   xhigh vs high                     a saved /effort default
###     run 3  version  2.1.229 vs 2.1.228                the CLI updated itself overnight
###   The first two were operator error and were fixable by pinning. The third is not: nobody
###   controls when the harness updates, and §7.4 names the literal "2.1.228", which no longer
###   exists to run against. The pre-registered remedy in §7.4 row 4 is "re-run BOTH arms
###   inside the same window" — not another arm-A run. Condition 4 stays OPEN, and no
###   arm-A-only run can close it.
###
### RUN 3 IS THE ONE THAT PASSED EVERY STABILITY CHECK: both segmentations CONFIRM, leave-one-out
###   sign- AND band-stable across all six drops, both instruments agreeing, baseline drift 253
###   of 2,000, matched 1/1/1 attempts, and four of §6's five n=1 conditions met. It is still
###   VOID. Stability is not validity, which is why the harness freeze is a separate section
###   from the stability checks.
###
### AND THE ANALYZER MISSED IT. Before the 2026-08-12 amendment, measure-ab.js checked that each
###   arm was single-valued and never compared the arms to each other, so it returned CONFIRM on
###   run 3 while holding both transcripts. §7.4's "and equal across arms" lived only here, in a
###   driver assertion hand-written per run. Both halves were correct; the composition never
###   asked the question.
###
### NOT established here: which arm is cheaper overall — subagents are ~85% of the run's output
###   tokens and are outside this instrument entirely.
EOF
  exit 0
fi
echo "### A/B FAIL — $FAILS assertion(s) failed"
exit 1
