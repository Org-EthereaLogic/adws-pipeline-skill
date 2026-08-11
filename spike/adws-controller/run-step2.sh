#!/usr/bin/env bash
# STEP 2 driver — retries and rewinds. THROWAWAY.
#
# Answers the plan's Q3 (budget-as-code) and Q4 (idempotency) with assertions, not prose.
# Every scenario drives the controller over MOCKED dispatch outputs from
# spike/adws-controller/fixtures/ (the plan's §5.2 deliverable, which step 1 did not need)
# and checks the exact bookkeeping references/phase-gates.md prescribes.
#
# The reference for §S3 is the F-47 defect itself: "A live run took three build attempts
# against that budget [of 1] with no accounting because the answer was written for only two
# of the five." S3 reproduces that tree and asserts the accounting holds.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CTRL="$REPO/spike/adws-controller/adws-run.js"
SCORER="$REPO/adws-pipeline/scripts/execution-report.js"
VERIFY="$REPO/spike/adws-controller/verify-canonical.js"
MKTRACE="$REPO/spike/adws-controller/mk-risk-trace.js"
FIX="$REPO/spike/adws-controller/fixtures"
SCRATCH="$(mktemp -d)"

FAILS=0
assert() { # <label> <actual> <expected>
  if [ "$2" = "$3" ]; then printf '  PASS  %s (%s)\n' "$1" "$2"
  else printf '  FAIL  %s: expected [%s], got [%s]\n' "$1" "$3" "$2"; FAILS=$((FAILS+1)); fi
}
assert_match() { # <label> <actual> <regex>
  if printf '%s' "$2" | grep -qiE "$3"; then printf '  PASS  %s (matched /%s/)\n' "$1" "$3"
  else printf '  FAIL  %s: [%s] did not match /%s/\n' "$1" "$2" "$3"; FAILS=$((FAILS+1)); fi
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s);const k=process.argv[1].split(".");let x=v;for(const p of k)x=x==null?x:x[p];process.stdout.write(x===undefined?"<absent>":String(x))}catch(e){process.stdout.write("<unparseable>")}})' "$1"; }
# read a dotted path out of a file in the job tree
jfile() { node -e 'const fs=require("fs");try{let x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));for(const p of process.argv[2].split("."))x=x==null?x:x[p];process.stdout.write(x===undefined?"<absent>":String(x))}catch(e){process.stdout.write("<unreadable>")}' "$1" "$2"; }
attempts() { ls -d "$1/$2"/attempt_* 2>/dev/null | wc -l | tr -d ' '; }

newjob() {
  # execFileSync with an argument ARRAY: execSync would re-split the command string on
  # whitespace, so a checkout path containing a space would break `init` and every later
  # assertion would fail with an unrelated message.
  node -e 'const {execFileSync}=require("child_process");const [c,f,o]=process.argv.slice(1);process.stdout.write(JSON.parse(execFileSync("node",[c,"init",f,o]).toString()).job_dir)' \
    "$CTRL" "$FIX/contract.json" "$1"
}
# `next` then `record`, echoing nothing; returns record's stdout
step() { # <job> <phase> <attempt> <fixtureDir>
  node "$CTRL" next "$1" >/dev/null 2>&1
  node "$CTRL" record "$1" "$2" "$3" --from "$4"
}
# the test-phase mock = the variant's checks + a clean consensus round (the variable under
# test is the tester's classification, not the Critic's verdict)
#
# Each mock gets its OWN mktemp dir. These helpers run inside `$( )`, so a counter
# incremented here never reaches the parent shell — a fixed name would have every variant
# copying over the last one's files, which is the silent-stale-fixture bug the ingest matrix
# already caught once in mk-risk-trace.js.
mktest() { # <variant> -> prints a composed dispatch dir
  local d; d="$(mktemp -d "$SCRATCH/mock_XXXXXX")"
  mkdir -p "$d/consensus"
  cp "$FIX/$1/phase_output.json" "$FIX/$1/phase_log.md" "$d/"
  cp "$FIX/consensus_clean/critic.json" "$FIX/consensus_clean/advocate.json" "$d/consensus/"
  printf '%s' "$d"
}
# the review mock needs the review-risk-assess trace FR-12 keys document/ship/verify to.
# mk-risk-trace runs the REAL validator on the job's own latest build output.
mkreview() { # <job>
  local d; d="$(mktemp -d "$SCRATCH/review_XXXXXX")"
  cp -R "$FIX/review/." "$d/"
  local last; last="$(ls -d "$1"/build/attempt_* | sort -V | tail -1)"
  node "$MKTRACE" "$last/phase_output.json" "$d" >/dev/null || return 1
  printf '%s' "$d"
}
tail_phases() { # <job> — review .. verify at attempt 1, then finalize is the caller's
  local rv; rv="$(mkreview "$1")" || return 1
  step "$1" review 1 "$rv" >/dev/null || return 1
  step "$1" document 1 "$FIX/document" >/dev/null || return 1
  step "$1" ship 1 "$FIX/ship" >/dev/null || return 1
  step "$1" verify 1 "$FIX/verify" >/dev/null || return 1
}

echo "### S1 — ONE test->build rewind, then promote (plan §3, the budget-as-code case)"
J1="$(newjob "$SCRATCH/s1")"
step "$J1" plan 1 "$FIX/plan" >/dev/null
step "$J1" build 1 "$FIX/build_initial" >/dev/null
T1OUT="$(step "$J1" test 1 "$(mktest test_fail_code)")"
assert "test/1 gate"            "$(printf '%s' "$T1OUT" | jget gate_result)"     "fail"
assert "test/1 annotation"      "$(printf '%s' "$T1OUT" | jget annotation)"      "TEST_REWIND_TO_BUILD"
assert "test/1 route"           "$(printf '%s' "$T1OUT" | jget route)"           "rewind"
assert "rewind opened"          "$(printf '%s' "$T1OUT" | jget rewind_opened)"   "build/attempt_2"
assert "cross_phase_rewinds.test" "$(printf '%s' "$T1OUT" | jget cross_phase_rewinds.test)" "1"
assert "test/1 consumed NO test retry" "$(printf '%s' "$T1OUT" | jget retries_used)" "0/2"

C="$J1/build/attempt_2/corrections.json"
assert "corrections source_attempt"     "$(jfile "$C" source_attempt)"                 "test/attempt_1"
assert "corrections classification"     "$(jfile "$C" corrections.0.classification)"   "code"
assert "corrections regression_check_id" "$(jfile "$C" corrections.0.regression_check_id)" "CHK002"
assert "corrections repro"              "$(jfile "$C" corrections.0.repro)"            "null"
assert "corrections guidance ABSENT"    "$(jfile "$C" guidance)"                       "<absent>"

B2OUT="$(step "$J1" build 2 "$FIX/build_code_repair")"
assert "build/2 origin"          "$(printf '%s' "$B2OUT" | jget origin)"        "rewind"
assert "build/2 gate"            "$(printf '%s' "$B2OUT" | jget gate_result)"   "pass"
assert "build/2 tier ESCALATED"  "$(printf '%s' "$B2OUT" | jget model_tier)"    "opus"
assert "build/2 tier source"     "$(printf '%s' "$B2OUT" | jget tier_source)"   "cross-phase-rewind"
assert "build/2 tier value"      "$(jfile "$J1/build/attempt_2/phase_manifest.json" tier_input.value)" "test/attempt_1"
assert "build retry NOT consumed" "$(printf '%s' "$B2OUT" | jget retries_used)" "0/1"

T2OUT="$(step "$J1" test 2 "$(mktest test_pass_regression)")"
assert "test/2 origin (forward, NOT retry)" "$(printf '%s' "$T2OUT" | jget origin)"      "forward"
assert "test/2 gate"                        "$(printf '%s' "$T2OUT" | jget gate_result)" "pass"
assert "test/2 TABLE tier, not escalated"   "$(printf '%s' "$T2OUT" | jget model_tier)"  "sonnet"
assert "test/2 ordinary tier source"        "$(printf '%s' "$T2OUT" | jget tier_source)" "contract.risk_level"

tail_phases "$J1" || { echo "  FAIL  S1 tail phases did not complete"; FAILS=$((FAILS+1)); }
node "$CTRL" finalize "$J1" --report "$SCORER" >/dev/null 2>&1; E1=$?
assert "S1 scorer exit"          "$E1" "0"
assert "S1 final_status"         "$(jfile "$J1/run_manifest.json" final_status)"   "completed"
assert "S1 failure_reason"       "$(jfile "$J1/run_manifest.json" failure_reason)" "null"
assert "S1 decision"             "$(jfile "$J1/execution_report.json" decision)"   "PROMOTE"
node "$VERIFY" "$J1" >"$SCRATCH/canon1.txt" 2>&1; VC=$?
assert "S1 writer-floor conformance" "$VC" "0"
[ "$VC" -eq 0 ] || sed 's/^/      /' "$SCRATCH/canon1.txt"

echo
echo "### S2 — a SECOND code-classified failure terminates TEST_GATE_FAILURE (rewind cap 1)"
J2="$(newjob "$SCRATCH/s2")"
step "$J2" plan 1 "$FIX/plan" >/dev/null
step "$J2" build 1 "$FIX/build_initial" >/dev/null
step "$J2" test 1 "$(mktest test_fail_code)" >/dev/null
step "$J2" build 2 "$FIX/build_code_repair" >/dev/null
T2B="$(step "$J2" test 2 "$(mktest test_fail_code_again)")"
assert "test/2 annotation"  "$(printf '%s' "$T2B" | jget annotation)" "REWIND_BUDGET_EXHAUSTED"
assert "test/2 route"       "$(printf '%s' "$T2B" | jget route)"      "terminal"
assert "rewind cap held at 1" "$(printf '%s' "$T2B" | jget cross_phase_rewinds.test)" "1"
assert "no third build attempt opened" "$(attempts "$J2" build)" "2"
N2="$(node "$CTRL" next "$J2")"
assert "next action"          "$(printf '%s' "$N2" | jget action)"         "terminal"
assert "next verdict"         "$(printf '%s' "$N2" | jget verdict)"        "RETRY"
assert "next failure_reason"  "$(printf '%s' "$N2" | jget failure_reason)" "TEST_GATE_FAILURE"
node "$CTRL" record "$J2" test 3 --from "$(mktest test_pass_regression)" >/dev/null 2>&1; RC=$?
assert "a third test attempt is REFUSED although 2 retries remain unspent" "$RC" "65"
node "$CTRL" finalize "$J2" --report "$SCORER" >/dev/null 2>&1; E2=$?
assert "S2 scorer exit"    "$E2" "1"
assert "S2 final_status"   "$(jfile "$J2/run_manifest.json" final_status)"   "failed"
assert "S2 terminal reason is the DOCUMENTED class" "$(jfile "$J2/run_manifest.json" failure_reason)" "TEST_GATE_FAILURE"
assert "S2 decision"       "$(jfile "$J2/execution_report.json" decision)"   "RETRY"

echo
echo "### S3 — F-47: THREE build attempts against a budget of 1, with the accounting intact"
J3="$(newjob "$SCRATCH/s3")"
step "$J3" plan 1 "$FIX/plan" >/dev/null
step "$J3" build 1 "$FIX/build_initial" >/dev/null
step "$J3" test 1 "$(mktest test_fail_code)" >/dev/null          # -> cross_phase_rewinds.test
step "$J3" build 2 "$FIX/build_code_repair" >/dev/null
T3B="$(step "$J3" test 2 "$(mktest test_fail_check_after_repair)")"   # -> check_defect_repairs
assert "test/2 annotation"     "$(printf '%s' "$T3B" | jget annotation)" "CHECK_DEFECT_REPAIR"
assert "test/2 route"          "$(printf '%s' "$T3B" | jget route)"      "repair"
assert "repair opened"         "$(printf '%s' "$T3B" | jget rewind_opened)" "build/attempt_3"
B3OUT="$(step "$J3" build 3 "$FIX/build_check_repair")"
assert "build/3 origin"        "$(printf '%s' "$B3OUT" | jget origin)"      "rewind"
assert "build/3 tier source"   "$(printf '%s' "$B3OUT" | jget tier_source)" "cross-phase-rewind"
assert "build/3 tier value"    "$(jfile "$J3/build/attempt_3/phase_manifest.json" tier_input.value)" "test/attempt_2"
step "$J3" test 3 "$(mktest test_pass_regression)" >/dev/null
A3="$(node "$CTRL" audit "$J3")"
assert "build attempts"                    "$(attempts "$J3" build)" "3"
assert "build origins"                     "$(printf '%s' "$A3" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).budgets.build.origins.join(",")))')" "initial,rewind,rewind"
assert "build RETRIES used (the F-47 number)" "$(printf '%s' "$A3" | jget budgets.build.retries_used)" "0"
assert "build retry budget still whole"    "$(printf '%s' "$A3" | jget budgets.build.retry_budget)"  "1"
assert "cross_phase_rewinds.test"          "$(printf '%s' "$A3" | jget cross_phase_rewinds.test)"    "1"
assert "check_defect_repairs (INDEPENDENT)" "$(printf '%s' "$A3" | jget check_defect_repairs)"       "1"
assert "test attempts"                     "$(attempts "$J3" test)" "3"
assert "test retries used (forward re-runs are not retries)" "$(printf '%s' "$A3" | jget budgets.test.retries_used)" "0"
tail_phases "$J3" || { echo "  FAIL  S3 tail phases did not complete"; FAILS=$((FAILS+1)); }
node "$CTRL" finalize "$J3" --report "$SCORER" >/dev/null 2>&1; E3=$?
assert "S3 promotes after two independent excursions" "$E3" "0"
node "$VERIFY" "$J3" >"$SCRATCH/canon3.txt" 2>&1; VC3=$?
assert "S3 writer-floor conformance" "$VC3" "0"
[ "$VC3" -eq 0 ] || sed 's/^/      /' "$SCRATCH/canon3.txt"

echo
echo "### S4 — ordinary retry path: escalate sonnet -> opus -> fable, then exhaust (budget 2)"
J4="$(newjob "$SCRATCH/s4")"
step "$J4" plan 1 "$FIX/plan" >/dev/null
step "$J4" build 1 "$FIX/build_initial" >/dev/null
for N in 1 2 3; do
  O="$(step "$J4" test "$N" "$(mktest test_fail_unclassified)")"
  assert "test/$N gate"   "$(printf '%s' "$O" | jget gate_result)" "fail"
  printf '        tier=%s source=%s origin=%s retries=%s\n' \
    "$(printf '%s' "$O" | jget model_tier)" "$(printf '%s' "$O" | jget tier_source)" \
    "$(printf '%s' "$O" | jget origin)" "$(printf '%s' "$O" | jget retries_used)"
done
assert "test/1 tier" "$(jfile "$J4/test/attempt_1/phase_manifest.json" model_tier)" "sonnet"
assert "test/2 tier" "$(jfile "$J4/test/attempt_2/phase_manifest.json" model_tier)" "opus"
assert "test/3 tier" "$(jfile "$J4/test/attempt_3/phase_manifest.json" model_tier)" "fable"
assert "test/2 tier source" "$(jfile "$J4/test/attempt_2/phase_manifest.json" tier_input.source)" "retry-escalation"
assert "test/3 tier source" "$(jfile "$J4/test/attempt_3/phase_manifest.json" tier_input.source)" "retry-escalation"
N4="$(node "$CTRL" next "$J4")"
assert "budget exhausted -> terminal" "$(printf '%s' "$N4" | jget action)"  "terminal"
assert_match "and says so"            "$(printf '%s' "$N4" | jget note)"    "retry budget exhausted"
assert "not the loop guard"           "$(printf '%s' "$N4" | jget note | grep -c 'attempt bound' || true)" "0"
node "$CTRL" finalize "$J4" --report "$SCORER" >/dev/null 2>&1; E4=$?
assert "S4 scorer exit"      "$E4" "1"
assert "S4 terminal reason"  "$(jfile "$J4/run_manifest.json" failure_reason)" "TEST_GATE_FAILURE"

echo
echo "### S5 — environment/prerequisite is a GAP: no budget moves, and it routes to the operator"
J5="$(newjob "$SCRATCH/s5")"
step "$J5" plan 1 "$FIX/plan" >/dev/null
step "$J5" build 1 "$FIX/build_initial" >/dev/null
T5="$(step "$J5" test 1 "$(mktest test_fail_env)")"
assert "test/1 annotation"        "$(printf '%s' "$T5" | jget annotation)"   "ENVIRONMENT_GAP"
assert "test/1 route"             "$(printf '%s' "$T5" | jget route)"        "operator"
assert "no rewind spent"          "$(printf '%s' "$T5" | jget cross_phase_rewinds.test)" "0"
assert "no check repair spent"    "$(printf '%s' "$T5" | jget check_defect_repairs)"     "0"
assert "no retry spent"           "$(printf '%s' "$T5" | jget retries_used)" "0/2"
assert "no build attempt opened"  "$(attempts "$J5" build)" "1"
N5="$(node "$CTRL" next "$J5")"
assert "next action"  "$(printf '%s' "$N5" | jget action)" "operator"
assert "next kind"    "$(printf '%s' "$N5" | jget kind)"   "environment_gap"
node "$CTRL" record "$J5" test 2 --from "$(mktest test_pass_regression)" >/dev/null 2>&1; RC5=$?
assert "the controller will not auto-retry an environment gap" "$RC5" "65"

echo
echo "### S6 — SC-13/F-76: a repair that leaves no permanent check does not pass the gate"
echo "  6a) the BUILDER half — the rewind attempt does not echo regression_check_ids"
J6="$(newjob "$SCRATCH/s6")"
step "$J6" plan 1 "$FIX/plan" >/dev/null
step "$J6" build 1 "$FIX/build_initial" >/dev/null
step "$J6" test 1 "$(mktest test_fail_code)" >/dev/null
B6="$(step "$J6" build 2 "$FIX/build_code_repair_noecho")"
assert       "build/2 gate"   "$(printf '%s' "$B6" | jget gate_result)" "fail"
assert_match "names F-76"     "$(printf '%s' "$B6" | jget reason)"      "F-76.*regression_check_ids"
B6B="$(step "$J6" build 3 "$FIX/build_code_repair")"
assert "a FAILED rewind attempt DOES take the ordinary build retry" "$(printf '%s' "$B6B" | jget origin)" "retry"
assert "and escalates on the retry ladder"  "$(printf '%s' "$B6B" | jget tier_source)" "retry-escalation"
assert "build retry now spent"              "$(printf '%s' "$B6B" | jget retries_used)" "1/1"

echo "  6b) the TESTER half — the forward re-run answers only with a pre-existing row"
J7="$(newjob "$SCRATCH/s6b")"
step "$J7" plan 1 "$FIX/plan" >/dev/null
step "$J7" build 1 "$FIX/build_initial" >/dev/null
step "$J7" test 1 "$(mktest test_fail_code)" >/dev/null
step "$J7" build 2 "$FIX/build_code_repair" >/dev/null
T7="$(step "$J7" test 2 "$(mktest test_pass_no_regression)")"
assert       "test/2 gate"                "$(printf '%s' "$T7" | jget gate_result)" "fail"
assert_match "names the pre-existing assertion" "$(printf '%s' "$T7" | jget reason)" "assertion a superseded attempt already ran.*unique constraint"

echo "  6b2) a CHANGED pre-existing row is still not the new assertion (row identity is the CHECK, not its bytes)"
J7B="$(newjob "$SCRATCH/s6b2")"
step "$J7B" plan 1 "$FIX/plan" >/dev/null
step "$J7B" build 1 "$FIX/build_initial" >/dev/null
step "$J7B" test 1 "$(mktest test_fail_code)" >/dev/null
step "$J7B" build 2 "$FIX/build_code_repair" >/dev/null
# Every CHK002 row here runs an assertion attempt_1 already ran; only the structural row's
# `output` changed. Serialized-row identity called that "new" and discharged the debt while
# the regression assertion never ran — the substitution F-76 exists to catch.
T7B="$(step "$J7B" test 2 "$(mktest test_pass_mutated_structural)")"
assert       "test/2 gate"                 "$(printf '%s' "$T7B" | jget gate_result)" "fail"
# BOTH CHK002 rows must be rejected: the mutated structural one AND the behavioural one whose
# text attempt_1 already carried. Naming both is what proves neither discharged the debt.
assert_match "rejects the MUTATED structural row" "$(printf '%s' "$T7B" | jget reason)" "assertion a superseded attempt already ran.*unique constraint"
assert_match "and the behavioural row too"        "$(printf '%s' "$T7B" | jget reason)" "exactly one ledger row"

echo "  6c) a repaired criterion that comes back gate_weak FAILS rather than warns"
J8="$(newjob "$SCRATCH/s6c")"
step "$J8" plan 1 "$FIX/plan" >/dev/null
step "$J8" build 1 "$FIX/build_initial" >/dev/null
step "$J8" test 1 "$(mktest test_fail_code)" >/dev/null
step "$J8" build 2 "$FIX/build_code_repair" >/dev/null
T8="$(step "$J8" test 2 "$(mktest test_gate_weak_repaired)")"
assert       "test/2 gate"        "$(printf '%s' "$T8" | jget gate_result)" "fail"
assert_match "names gate_weak"    "$(printf '%s' "$T8" | jget reason)"      "gate_weak"

echo
echo "### S7 — Q4 idempotency: next twice, record twice, finalize twice"
J9="$(newjob "$SCRATCH/s7")"
N_A="$(node "$CTRL" next "$J9")"
sleep 1                      # a whole second, so a re-stamped dispatch marker would SHOW
N_B="$(node "$CTRL" next "$J9")"
assert 'two "next" calls are byte-identical (dispatch stamp included)' "$([ "$N_A" = "$N_B" ] && echo same || echo differs)" "same"
step "$J9" plan 1 "$FIX/plan" >/dev/null
node "$CTRL" record "$J9" plan 1 --from "$FIX/plan" >/dev/null 2>&1; RC9=$?
assert "re-recording a recorded attempt is refused" "$RC9" "65"
step "$J9" build 1 "$FIX/build_initial" >/dev/null
step "$J9" test 1 "$(mktest test_pass)" >/dev/null
tail_phases "$J9" || { echo "  FAIL  S7 tail phases did not complete"; FAILS=$((FAILS+1)); }
node "$CTRL" finalize "$J9" --report "$SCORER" >/dev/null 2>&1; F_A=$?
cp "$J9/run_manifest.json" "$SCRATCH/rm_a.json"
sleep 1
node "$CTRL" finalize "$J9" --report "$SCORER" >/dev/null 2>&1; F_B=$?
assert "finalize exit is stable"            "$F_B" "$F_A"
assert "finalize did not move completed_at" "$(cmp -s "$SCRATCH/rm_a.json" "$J9/run_manifest.json" && echo same || echo differs)" "same"
assert "next after finalize does not advance" "$(node "$CTRL" next "$J9" | jget action)" "finalize"
assert "S7 clean run promotes (no rewind)"  "$F_A" "0"

echo
echo "### S8 — the loop guard never fired; every run stopped on a real budget"
# MAX_ATTEMPTS_PER_PHASE is 6 and is a bug backstop, not a rule. If it is ever what stopped a
# run, a budget above it is not counting. Worst case here is test in S4 at 3.
OVER=0; WORST=0
for J in "$J1" "$J2" "$J3" "$J4" "$J5" "$J6" "$J7" "$J7B" "$J8" "$J9"; do
  for P in plan build test review document ship verify; do
    N="$(attempts "$J" "$P")"
    [ "$N" -gt "$WORST" ] && WORST="$N"
    if [ "$N" -ge 6 ]; then echo "      $(basename "$J")/$P reached $N attempts"; OVER=$((OVER+1)); fi
  done
done
assert "phases that reached the loop guard" "$OVER" "0"
printf '        deepest phase across all ten jobs: %s attempts (guard 6)\n' "$WORST"

echo
if [ "$FAILS" -eq 0 ]; then
  echo "### STEP 2 PASS — one test->build rewind with the prescribed counters, corrections.json and"
  echo "###   tier escalation; a second code failure terminates TEST_GATE_FAILURE; the rewind and"
  echo "###   check-defect budgets are independent and neither consumes a build retry; the retry"
  echo "###   ladder escalates and exhausts; an environment gap spends nothing; F-76 is enforced on"
  echo "###   both halves; and next/record/finalize are idempotent."
  exit 0
else
  echo "### STEP 2 FAIL — $FAILS assertion(s) failed."
  exit 1
fi
