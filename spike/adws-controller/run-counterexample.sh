#!/usr/bin/env bash
# STEP 1 structural negative control. THROWAWAY.
#
# The second adversarial review's counterexample, turned into an asserted regression, plus
# the mutation case it does NOT cover. run-step1-negative.sh probes a RAW-EVIDENCE gate
# failure (a failing Critic); nothing probed structural completeness at record time, which
# is exactly why the counterexample survived a self-check.
#
# CASE A (FIX 1) — completed-but-contradicted with NO mutation. Record `plan` from an EMPTY
#   dispatch directory (an agent that died before writing anything, the F-12 shape). Before
#   the fix: gate_result=pass -> six clean phases -> final_status=completed -> the UNMODIFIED
#   scorer QUARANTINEd it at exit 2, and verify-canonical.js said CANONICAL OK. All three of
#   those were wrong. Now the completeness slice of the scorer's own pipeline_completion gate
#   is consulted BEFORE `pass` is written.
#
# CASE B (FIX 2) — post-gate mutation. Drive all seven phases clean, then corrupt evidence
#   AFTER the last gate is written and BEFORE finalize. No per-phase gate can catch this (the
#   gates already ran), so finalize must derive readiness from the scorer's full terminal gate
#   set and RETRACT its completion claim rather than assert `completed` on a tree the scorer
#   quarantines.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CTRL="$REPO/spike/adws-controller/adws-run.js"
SCORER="$REPO/adws-pipeline/scripts/execution-report.js"
VERIFY="$REPO/spike/adws-controller/verify-canonical.js"
MKTRACE="$REPO/spike/adws-controller/mk-risk-trace.js"
GOLDEN="$REPO/parity/execution-report-fixtures/promote_clean/artifacts/job-2f8c1a"
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
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s)[process.argv[1]]))}catch(e){process.stdout.write("<unparseable>")}})' "$1"; }
newjob() { node -e 'process.stdout.write(JSON.parse(require("child_process").execSync(process.argv[1]).toString()).job_dir)' "node $CTRL init $GOLDEN/task_contract_snapshot.json $1"; }

# a complete review mock (see mk-risk-trace.js for why the fixture's own is not enough)
MOCK_REVIEW="$SCRATCH/mock_review"; mkdir -p "$MOCK_REVIEW"
cp -R "$GOLDEN/review/attempt_1/." "$MOCK_REVIEW/"
node "$MKTRACE" "$GOLDEN/build/attempt_1/phase_output.json" "$MOCK_REVIEW" >/dev/null

echo "### CASE A — plan dispatch wrote NOTHING (empty attempt dir), no mutation anywhere"
EMPTY="$SCRATCH/empty"; mkdir -p "$EMPTY"
JOB_A="$(newjob "$SCRATCH/a")"
AOUT="$(node "$CTRL" record "$JOB_A" plan 1 --from "$EMPTY")"
assert       "plan gate_result"          "$(printf '%s' "$AOUT" | jget gate_result)" "fail"
assert_match "reason names the missing output" "$(printf '%s' "$AOUT" | jget reason)" "wrote no readable phase_output.json"

# STEP 2 changed the shape of this control, and it is worth being explicit about how. Under
# step 1 a failed gate was terminal, so `next` said terminal here. Rule 4 says a failed gate
# with retries remaining opens a fresh attempt at the escalated tier — so the empty dispatch
# is now RETRIED once (plan's budget is 1) and only then terminates. What is unchanged, and
# what this control exists for, is that neither route reaches `completed`.
NOUT="$(node "$CTRL" next "$JOB_A")"
assert "next retries the empty dispatch" "$(printf '%s' "$NOUT" | jget action)"  "dispatch"
assert "at plan/attempt_2"               "$(printf '%s' "$NOUT" | jget attempt)" "2"
assert "escalated one tier (opus -> fable)" "$(printf '%s' "$NOUT" | jget model_tier)" "fable"

node "$CTRL" record "$JOB_A" build 1 --from "$GOLDEN/build/attempt_1" 2>/dev/null; RC=$?
assert "record build refused (exit 65)" "$RC" "65"

A2OUT="$(node "$CTRL" record "$JOB_A" plan 2 --from "$EMPTY")"
assert "the retry is also empty -> fail" "$(printf '%s' "$A2OUT" | jget gate_result)" "fail"
assert "plan retry budget now spent"     "$(printf '%s' "$A2OUT" | jget retries_used)" "1/1"
NOUT2="$(node "$CTRL" next "$JOB_A")"
assert "budget exhausted -> terminal" "$(printf '%s' "$NOUT2" | jget action)"         "terminal"
assert "verdict"                      "$(printf '%s' "$NOUT2" | jget verdict)"        "RETRY"
assert "terminal reason"              "$(printf '%s' "$NOUT2" | jget failure_reason)" "PLAN_GATE_FAILURE"

node "$CTRL" finalize "$JOB_A" --report "$SCORER" >/dev/null 2>&1; EXIT_A=$?
STATUS_A="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/run_manifest.json")).final_status)' "$JOB_A")"
DEC_A="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/execution_report.json")).decision)' "$JOB_A")"
assert "final_status is NOT completed" "$STATUS_A" "failed"
assert "scorer decision"               "$DEC_A"    "RETRY"
assert "scorer exit"                   "$EXIT_A"   "1"
node "$VERIFY" "$JOB_A" >"$SCRATCH/verify_a.txt" 2>&1; VRC=$?
assert       "verify-canonical rejects the tree (exit 1)" "$VRC" "1"
assert_match "and names the missing phase_output"         "$(cat "$SCRATCH/verify_a.txt")" "no phase_output.json"

echo "### CASE B — seven clean gates, then evidence mutated AFTER the last gate"
JOB_B="$(newjob "$SCRATCH/b")"
for P in plan build test review document ship verify; do
  FROM="$GOLDEN/$P/attempt_1"; [ "$P" = "review" ] && FROM="$MOCK_REVIEW"
  node "$CTRL" next "$JOB_B" >/dev/null
  OUT="$(node "$CTRL" record "$JOB_B" "$P" 1 --from "$FROM")"
  [ "$(printf '%s' "$OUT" | jget gate_result)" = "pass" ] || { echo "  FAIL  $P did not gate pass"; FAILS=$((FAILS+1)); }
done
assert "all seven gates passed -> next says finalize" "$(node "$CTRL" next "$JOB_B" | jget action)" "finalize"

# the mutation: flip the recorded test-gate Critic verdict to fail, after its gate was written
node -e 'const fs=require("fs"),p=process.argv[1]+"/test/attempt_1/consensus/critic.json";const c=JSON.parse(fs.readFileSync(p));c.verdict="fail";c.dissent=null;fs.writeFileSync(p,JSON.stringify(c,null,2))' "$JOB_B"

FOUT="$(node "$CTRL" finalize "$JOB_B" --report "$SCORER" 2>/dev/null)"; EXIT_B=$?
STATUS_B="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/run_manifest.json")).final_status)' "$JOB_B")"
DEC_B="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/execution_report.json")).decision)' "$JOB_B")"
assert       "finalize RETRACTED the completion claim" "$(printf '%s' "$FOUT" | head -1 | jget final_status)" "quarantined"
assert       "run_manifest.final_status"               "$STATUS_B" "quarantined"
assert       "scorer decision"                         "$DEC_B"    "QUARANTINE"
assert       "scorer exit"                             "$EXIT_B"   "2"
assert_match "retraction names the failing gate"       "$(printf '%s' "$FOUT" | head -1)" "consensus"

echo
if [ "$FAILS" -eq 0 ]; then
  echo "### STRUCTURAL NEGATIVE CONTROL PASS — the no-mutation counterexample is refused at record,"
  echo "###   and a post-gate mutation is caught at finalize. Neither reaches final_status: completed."
  exit 0
else
  echo "### STRUCTURAL NEGATIVE CONTROL FAIL — $FAILS assertion(s) failed."
  exit 1
fi
