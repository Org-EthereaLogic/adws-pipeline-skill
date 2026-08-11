#!/usr/bin/env bash
# STEP 1 negative control (HARDENED assertions — FINDINGS.md pre-step-2 item 6).
# Same clean golden, but the test-phase mock has a FAILING critic. With the single-source
# gate + enforced sequencing, the controller must:
#   1. record plan, build with gate_result=pass;
#   2. record test with gate_result=FAIL (the scorer's own consensus evaluator caught the
#      critic fail — reason names the Critic);
#   3. REFUSE a subsequent `record review` (sequencing: the job is terminal after a failed gate);
#   4. `next` reports action=terminal / verdict=RETRY / phase=test;
#   5. finalize -> run_manifest.final_status=failed -> UNMODIFIED scorer RETRY / exit 1,
#      consensus gate=fail.
# Every one of those is asserted exactly; the old version only checked exit!=0 && !=PROMOTE.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CTRL="$REPO/spike/adws-controller/adws-run.js"
SCORER="$REPO/adws-pipeline/scripts/execution-report.js"
GOLDEN="$REPO/parity/execution-report-fixtures/promote_clean/artifacts/job-2f8c1a"
SCRATCH="$(mktemp -d)"; EVID="$SCRATCH/artifacts"

FAILS=0
assert() { # <label> <condition-desc> <actual> <expected>  (string equality)
  if [ "$3" = "$4" ]; then printf '  PASS  %s (%s)\n' "$1" "$3"
  else printf '  FAIL  %s: expected [%s], got [%s]\n' "$1" "$4" "$3"; FAILS=$((FAILS+1)); fi
}
assert_match() { # <label> <actual> <regex>
  if printf '%s' "$2" | grep -qiE "$3"; then printf '  PASS  %s (matched /%s/)\n' "$1" "$3"
  else printf '  FAIL  %s: [%s] did not match /%s/\n' "$1" "$2" "$3"; FAILS=$((FAILS+1)); fi
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s)[process.argv[1]]))}catch(e){process.stdout.write("<unparseable>")}})' "$1"; }

# failing test-phase mock: golden test attempt with the Critic verdict flipped to fail
MOCK_TEST="$SCRATCH/mock_test"; mkdir -p "$MOCK_TEST"
cp -R "$GOLDEN/test/attempt_1/." "$MOCK_TEST/"
node -e 'const fs=require("fs"),p=process.argv[1]+"/consensus/critic.json";const c=JSON.parse(fs.readFileSync(p));c.verdict="fail";c.dissent=null;fs.writeFileSync(p,JSON.stringify(c,null,2))' "$MOCK_TEST"

JOBDIR="$(node -e 'process.stdout.write(JSON.parse(require("child_process").execSync(process.argv[1]).toString()).job_dir)' "node $CTRL init $GOLDEN/task_contract_snapshot.json $EVID")"

echo "### 1) record plan, build (clean) -> pass"
for P in plan build; do
  OUT="$(node "$CTRL" record "$JOBDIR" "$P" 1 --from "$GOLDEN/$P/attempt_1")"
  assert "$P gate_result" "" "$(printf '%s' "$OUT" | jget gate_result)" "pass"
done

echo "### 2) record test (failing critic) -> single-source gate = FAIL, reason names the Critic"
TOUT="$(node "$CTRL" record "$JOBDIR" test 1 --from "$MOCK_TEST")"
assert       "test gate_result"        "" "$(printf '%s' "$TOUT" | jget gate_result)" "fail"
assert_match "test reason names Critic" "$(printf '%s' "$TOUT" | jget reason)" "critic|consensus"

echo "### 3) sequencing REFUSES a post-failure record of review"
node "$CTRL" record "$JOBDIR" review 1 --from "$GOLDEN/review/attempt_1" 2>"$SCRATCH/rej.txt"; RC=$?
assert       "record review rejected (exit 65)" "" "$RC" "65"
assert_match "rejection explains why"            "$(cat "$SCRATCH/rej.txt")" "out of order|terminal|refused"

echo "### 4) next reports terminal / RETRY / test"
NOUT="$(node "$CTRL" next "$JOBDIR")"
assert "next action"  "" "$(printf '%s' "$NOUT" | jget action)"  "terminal"
assert "next verdict" "" "$(printf '%s' "$NOUT" | jget verdict)" "RETRY"
assert "next phase"   "" "$(printf '%s' "$NOUT" | jget phase)"   "test"

echo "### 5) finalize -> failed -> UNMODIFIED scorer RETRY / exit 1 / consensus=fail"
node "$CTRL" finalize "$JOBDIR" --report "$SCORER" >/dev/null 2>&1; EXIT=$?
FINAL_STATUS="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/run_manifest.json")).final_status)' "$JOBDIR")"
DECISION="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/execution_report.json")).decision)' "$JOBDIR")"
CONSENSUS="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1]+"/execution_report.json"));console.log((r.gates.find(g=>g.gate==="consensus")||{}).result)' "$JOBDIR")"
assert "run_manifest.final_status" "" "$FINAL_STATUS" "failed"
assert "scorer exit code"          "" "$EXIT"         "1"
assert "scorer decision"           "" "$DECISION"     "RETRY"
assert "consensus gate"            "" "$CONSENSUS"    "fail"

echo
if [ "$FAILS" -eq 0 ]; then
  echo "### NEGATIVE CONTROL PASS — failing critic -> gate fail -> sequencing halt -> RETRY/exit1, every state asserted."
  exit 0
else
  echo "### NEGATIVE CONTROL FAIL — $FAILS assertion(s) failed."
  exit 1
fi
