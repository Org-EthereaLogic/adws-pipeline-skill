#!/usr/bin/env bash
# STEP 3 driver — the LIVE handshake (plan Q1). THROWAWAY.
#
# Step 3's actual event was one `adws-planner` subagent dispatched through the controller's
# own handshake. That cannot be re-run from a shell script, so this driver does the next
# best thing and the only honest one: it REPLAYS the evidence that dispatch produced
# (fixtures/live_plan_attempt/, provenance in its README) through the same live-mode code
# path, and asserts every property the live run was claimed to establish.
#
#   S1  the dispatch payload carries what SKILL.md step 1 requires a dispatcher to hand an
#       agent — and every path in it exists at the moment it is advertised
#   S2  live-mode record: the agent's own files are gated in place, task-normalize really
#       runs, and the trace the controller writes is byte-identical to the recorded one
#   S3  finding 18 — an agent-authored phase_manifest.json with gate_result: null must read
#       as NOT YET RECORDED, not as an undecided verdict that terminates the job
#   S4  the plan gate is SINGLE-SOURCED: a validator `fail` reaches the gate through the
#       scorer's own skills_clean evaluator, with no hand-rolled comparison
#   S5  authorship refusals: an agent that writes its own gate_result, or its own
#       corrections.json, is refused rather than silently overwritten
#   S6  the planning_blocked refusal (planLayer2), and the scope it does NOT cover
#   S7  finding 16 — the corpus records plan-coherence=pass over a contract the validator
#       scores fail, on all 25 fixtures, with no `output` field for the scorer to catch it
#   S8  idempotency of the live path (Q4 again, on the code step 3 added)
#   S9  syntax + NUL sweep of spike/ (finding 15 — `make ci` is not evidence about this code)
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CTRL="$REPO/spike/adws-controller/adws-run.js"
SCORER="$REPO/adws-pipeline/scripts/execution-report.js"
FIX="$REPO/spike/adws-controller/fixtures"
LIVE="$FIX/live_plan_attempt"
TN="$REPO/adws-pipeline/scripts/validators/task-normalize.js"
GOLDEN="$REPO/parity/execution-report-fixtures/promote_clean/artifacts/job-2f8c1a"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

FAILS=0
assert() { # <label> <actual> <expected>
  if [ "$2" = "$3" ]; then printf '  PASS  %s (%s)\n' "$1" "$2"
  else printf '  FAIL  %s: expected [%s], got [%s]\n' "$1" "$3" "$2"; FAILS=$((FAILS+1)); fi
}
assert_match() { # <label> <actual> <regex>
  if printf '%s' "$2" | grep -qiE "$3"; then printf '  PASS  %s (matched /%s/)\n' "$1" "$3"
  else printf '  FAIL  %s: [%s] did not match /%s/\n' "$1" "$2" "$3"; FAILS=$((FAILS+1)); fi
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];process.stdout.write(v===null?"null":String(v))}catch(e){process.stdout.write("<unparseable>")}})' "$1"; }
newjob() { # <evidence-root> [contract]
  node -e 'process.stdout.write(JSON.parse(require("child_process").execSync(process.argv[1]).toString()).job_dir)' \
    "node $CTRL init ${2:-$FIX/live_contract.json} $1 --worktree $REPO"
}
# stage the agent-authored half of the live attempt into a job's plan/attempt_1, exactly as
# a live subagent would have left it
stage_live() { # <jobDir>
  mkdir -p "$1/plan/attempt_1"
  cp "$LIVE/agent_authored/phase_output.json" "$LIVE/agent_authored/phase_log.md" \
     "$LIVE/agent_authored/phase_manifest.json" "$1/plan/attempt_1/"
}

echo "### S1 — the dispatch payload is sufficient for a real dispatch"
JOB1="$(newjob "$SCRATCH/s1")"
P="$(node "$CTRL" next "$JOB1")"
assert "action"                 "$(printf '%s' "$P" | jget action)"       "dispatch"
assert "agent"                  "$(printf '%s' "$P" | jget agent)"        "adws-planner"
assert "tier (FR-12 medium/plan)" "$(printf '%s' "$P" | jget model_tier)" "opus"
assert "plan_gate_scope reported" "$(printf '%s' "$P" | jget plan_gate_scope)" "refusal-and-validator"
assert "prev_output is null at the first phase" "$(printf '%s' "$P" | jget prev_output)" "null"
for K in attempt_dir contract worktree_path scratch_root; do
  V="$(printf '%s' "$P" | jget "$K")"
  case "$V" in /*) ;; *) printf '  FAIL  %s is not an absolute path: [%s]\n' "$K" "$V"; FAILS=$((FAILS+1));; esac
  if [ -e "$V" ]; then printf '  PASS  %s exists when advertised (%s)\n' "$K" "$V"
  else printf '  FAIL  %s advertised but does not exist: %s\n' "$K" "$V"; FAILS=$((FAILS+1)); fi
done
# SC-13/F-77: "never a brace template"
assert_match "scratch_root carries no brace template" "$(printf '%s' "$P" | jget scratch_root)" '^[^{}]*$'

echo "### S2 — live-mode record gates the agent's files in place"
stage_live "$JOB1"
R="$(node "$CTRL" record "$JOB1" plan 1)"
assert "gate_result"   "$(printf '%s' "$R" | jget gate_result)"   "pass"
assert "dispatch_mode" "$(printf '%s' "$R" | jget dispatch_mode)" "live"
assert "tier_source"   "$(printf '%s' "$R" | jget tier_source)"   "contract.risk_level"
TRACE="$JOB1/plan/attempt_1/skills/task-normalize/skill_trace.json"
if [ -f "$TRACE" ]; then printf '  PASS  task-normalize trace written\n'
else printf '  FAIL  no task-normalize trace at %s\n' "$TRACE"; FAILS=$((FAILS+1)); fi
# the trace must WRAP the validator's stdout (SC-8/F-55, F-60): wrapper string identical to
# output.rubric_result, and output identical to what the validator prints right now.
assert "wrapper rubric_result"           "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).rubric_result)' "$TRACE")" "pass"
assert "wrapper == output.rubric_result" "$(node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(t.rubric_result===t.output.rubric_result)' "$TRACE")" "true"
node -e '
 const fs=require("fs"),t=JSON.parse(fs.readFileSync(process.argv[1]));
 const c=JSON.parse(fs.readFileSync(process.argv[2])).task;
 const inp={title:c.title,requested_change:c.requested_change,problem_statement:c.problem_statement,
            acceptance_criteria:c.acceptance_criteria||[],constraints:c.constraints||[],file_hints:c.file_hints||[]};
 const out=JSON.parse(require("child_process").execSync("node "+process.argv[3]+" -",{input:JSON.stringify(inp)}).toString());
 process.exit(JSON.stringify(t.output)===JSON.stringify(out)?0:1);
' "$TRACE" "$JOB1/task_contract_snapshot.json" "$TN"
assert "trace.output is the validator's real stdout" "$?" "0"
# and the replay reproduces the RECORDED live verdict, not merely some verdict
assert "matches the recorded live rubric_result" \
  "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).rubric_result)' "$LIVE/controller_recorded/skill_trace.json")" \
  "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).rubric_result)' "$TRACE")"
# the controller OWNS the manifest: the agent's null gate is replaced by a real decision,
# and the provenance the agent left null is filled in
assert "controller overwrote gate_result" "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).gate_result)' "$JOB1/plan/attempt_1/phase_manifest.json")" "pass"
assert "provenance.agent recorded"        "$(node -e 'console.log((JSON.parse(require("fs").readFileSync(process.argv[1])).provenance||{}).agent)' "$JOB1/plan/attempt_1/phase_manifest.json")" "adws-planner"

echo "### S3 — finding 18: an agent's gate_result: null is NOT a recorded verdict"
JOB3="$(newjob "$SCRATCH/s3")"
node "$CTRL" next "$JOB3" >/dev/null
stage_live "$JOB3"
N3="$(node "$CTRL" next "$JOB3")"
assert "next still says dispatch"    "$(printf '%s' "$N3" | jget action)"  "dispatch"
assert "…of the SAME attempt"        "$(printf '%s' "$N3" | jget attempt)" "1"
assert "…not a fresh retry"          "$(printf '%s' "$N3" | jget origin)"  "initial"
# the pre-fix behaviour, asserted as the thing that must not come back
assert_match "and not a terminal verdict" "$(printf '%s' "$N3" | jget action)" '^dispatch$'
# A garbled gate_result is a different animal and must still quarantine — but only on a
# manifest the CONTROLLER wrote. On an agent's manifest (provenance null) "banana" is just
# another verdict the agent had no standing to write, and it reads as unrecorded like any
# other. So record the attempt properly first, then corrupt the decision: that is the
# hand-edited-tree case the branch exists for.
JOB3B="$(newjob "$SCRATCH/s3b")"
node "$CTRL" next "$JOB3B" >/dev/null
stage_live "$JOB3B"
node "$CTRL" record "$JOB3B" plan 1 >/dev/null
node -e 'const fs=require("fs"),p=process.argv[1];const m=JSON.parse(fs.readFileSync(p));m.gate_result="banana";fs.writeFileSync(p,JSON.stringify(m,null,2))' "$JOB3B/plan/attempt_1/phase_manifest.json"
N3B="$(node "$CTRL" next "$JOB3B")"
assert "a non-enum gate_result on a RECORDED attempt terminates" "$(printf '%s' "$N3B" | jget action)"  "terminal"
assert "…as QUARANTINE"                                          "$(printf '%s' "$N3B" | jget verdict)" "QUARANTINE"
# and the agent's own garbled verdict is simply not believed
JOB3C="$(newjob "$SCRATCH/s3c")"
node "$CTRL" next "$JOB3C" >/dev/null
stage_live "$JOB3C"
node -e 'const fs=require("fs"),p=process.argv[1];const m=JSON.parse(fs.readFileSync(p));m.gate_result="banana";fs.writeFileSync(p,JSON.stringify(m,null,2))' "$JOB3C/plan/attempt_1/phase_manifest.json"
assert "an AGENT's garbled verdict is not a verdict at all" "$(node "$CTRL" next "$JOB3C" | jget action)" "dispatch"

echo "### S4 — the plan gate is single-sourced: validator fail -> scorer -> gate fail"
# The golden contract is the negative control, and it is not a contrived one: task-normalize
# scores it `fail` (it has no requested_change). Same live evidence, different contract.
JOB4="$(newjob "$SCRATCH/s4" "$GOLDEN/task_contract_snapshot.json")"
node "$CTRL" next "$JOB4" >/dev/null
stage_live "$JOB4"
R4="$(node "$CTRL" record "$JOB4" plan 1)"
assert       "gate_result"                    "$(printf '%s' "$R4" | jget gate_result)" "fail"
assert_match "and the reason names the SCORER's gate, not a controller comparison" \
             "$(printf '%s' "$R4" | jget reason)" "skills_clean"
assert       "the trace records the validator's own fail" \
             "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).rubric_result)' "$JOB4/plan/attempt_1/skills/task-normalize/skill_trace.json")" "fail"
# rule 4 still applies: plan has a budget of 1, so this retries once then terminates
assert "failure retries at the escalated tier" "$(node "$CTRL" next "$JOB4" | jget model_tier)" "fable"

echo "### S5 — authorship refusals in live mode"
JOB5="$(newjob "$SCRATCH/s5")"
node "$CTRL" next "$JOB5" >/dev/null
stage_live "$JOB5"
node -e 'const fs=require("fs"),p=process.argv[1];const m=JSON.parse(fs.readFileSync(p));m.gate_result="pass";fs.writeFileSync(p,JSON.stringify(m,null,2))' "$JOB5/plan/attempt_1/phase_manifest.json"
# The FIRST thing to assert is not the refusal — it is that `next` did not believe the agent.
# Before the attemptRecorded fix this said "dispatch build/attempt_1": an orchestrator asking
# what to do next would have dispatched the BUILDER against a plan gate the planner granted
# itself, and the `record` refusal below would never have been reached (finding 19).
N5="$(node "$CTRL" next "$JOB5")"
assert "a self-granted pass does NOT advance the job" "$(printf '%s' "$N5" | jget phase)"   "plan"
assert "…the attempt is still the one to run"         "$(printf '%s' "$N5" | jget attempt)" "1"
node "$CTRL" record "$JOB5" plan 1 >/dev/null 2>"$SCRATCH/e5.txt"; RC5=$?
assert       "agent-written gate_result refused (exit 65)" "$RC5" "65"
assert_match "and the refusal says why"                    "$(cat "$SCRATCH/e5.txt")" "grading itself|designated post-hoc"
JOB5B="$(newjob "$SCRATCH/s5b")"
node "$CTRL" next "$JOB5B" >/dev/null
stage_live "$JOB5B"
printf '{"source_attempt":"test/attempt_1","corrections":[]}\n' > "$JOB5B/plan/attempt_1/corrections.json"
node "$CTRL" record "$JOB5B" plan 1 >/dev/null 2>"$SCRATCH/e5b.txt"; RC5B=$?
assert       "agent-written corrections.json refused (exit 65)" "$RC5B" "65"
assert_match "and the refusal names the authorship rule"        "$(cat "$SCRATCH/e5b.txt")" "orchestrator-authored|own instructions"
# an attempt directory that was never created at all
JOB5C="$(newjob "$SCRATCH/s5c")"
node "$CTRL" record "$JOB5C" plan 1 >/dev/null 2>"$SCRATCH/e5c.txt"; RC5C=$?
assert       "an empty live attempt is refused" "$RC5C" "65"
assert_match "…naming the missing output"       "$(cat "$SCRATCH/e5c.txt")" "no readable phase_output|does not exist"

echo "### S6 — planLayer2: a declared refusal fails the gate"
JOB6="$(newjob "$SCRATCH/s6")"
node "$CTRL" next "$JOB6" >/dev/null
stage_live "$JOB6"
node -e '
 const fs=require("fs"),p=process.argv[1];const o=JSON.parse(fs.readFileSync(p));
 o.planning_blocked=true;o.planning_blocked_reason="AC-2 cannot be implemented inside policy.allowed_paths";
 fs.writeFileSync(p,JSON.stringify(o,null,2));
' "$JOB6/plan/attempt_1/phase_output.json"
R6="$(node "$CTRL" record "$JOB6" plan 1)"
assert       "planning_blocked: true fails the gate" "$(printf '%s' "$R6" | jget gate_result)" "fail"
assert_match "and the reason quotes the planner"     "$(printf '%s' "$R6" | jget reason)" "allowed_paths"
# the scope this gate does NOT cover, asserted so the limit cannot be quietly forgotten:
# a plan output with NO file_change_proposal and NO criteria_map still passes.
JOB6B="$(newjob "$SCRATCH/s6b")"
node "$CTRL" next "$JOB6B" >/dev/null
stage_live "$JOB6B"
printf '{"plan_summary":"x","planning_blocked":false,"planning_blocked_reason":null}\n' > "$JOB6B/plan/attempt_1/phase_output.json"
assert "DECLARED LIMIT: a plan with no file_change_proposal still passes (finding 17)" \
  "$(node "$CTRL" record "$JOB6B" plan 1 | jget gate_result)" "pass"

echo "### S7 — finding 16: every corpus fixture records a plan verdict the validator refutes"
TOTAL=0; REFUTED=0; NO_OUTPUT=0
for CF in $(find "$REPO/parity/execution-report-fixtures" -name task_contract_snapshot.json | sort); do
  TOTAL=$((TOTAL+1))
  V="$(node -e 'const t=(require(process.argv[1]).task)||{};process.stdout.write(JSON.stringify({title:t.title,requested_change:t.requested_change,problem_statement:t.problem_statement,acceptance_criteria:t.acceptance_criteria||[],constraints:t.constraints||[],file_hints:t.file_hints||[]}))' "$CF" | node "$TN" - | jget rubric_result)"
  TR="$(dirname "$CF")/plan/attempt_1/skills/plan-coherence/skill_trace.json"
  [ "$V" = "fail" ] && REFUTED=$((REFUTED+1))
  if [ -f "$TR" ]; then
    # try/catch, not a bare parse: quarantine_unreadable_manifest ships a deliberately
    # truncated JSON file and an uncaught throw here dumped a stack trace mid-survey.
    node -e 'let t;try{t=JSON.parse(require("fs").readFileSync(process.argv[1]))}catch(e){process.exit(1)}process.exit(t.rubric_result==="pass"&&t.output===undefined?0:1)' "$TR" && NO_OUTPUT=$((NO_OUTPUT+1))
  fi
done
assert "fixtures surveyed"                                  "$TOTAL"     "25"
assert "…whose contract task-normalize scores fail"         "$REFUTED"   "25"
assert "…recording rubric_result: pass with NO output key"  "$NO_OUTPUT" "21"

echo "### S8 — idempotency of the live path (Q4)"
JOB8="$(newjob "$SCRATCH/s8")"
A="$(node "$CTRL" next "$JOB8")"; B="$(node "$CTRL" next "$JOB8")"
assert "two next calls are byte-identical" "$([ "$A" = "$B" ] && echo same || echo differs)" "same"
stage_live "$JOB8"
node "$CTRL" record "$JOB8" plan 1 >/dev/null
T1="$(cat "$JOB8/plan/attempt_1/skills/task-normalize/skill_trace.json")"
node "$CTRL" record "$JOB8" plan 1 >/dev/null 2>"$SCRATCH/e8.txt"; RC8=$?
assert "re-recording a recorded attempt is refused" "$RC8" "65"
assert "…and the trace was not rewritten"           "$([ "$T1" = "$(cat "$JOB8/plan/attempt_1/skills/task-normalize/skill_trace.json")" ] && echo same || echo differs)" "same"

echo "### S9 — syntax + NUL sweep of spike/ (make ci does not cover this tree)"
SYN=0
for F in $(find "$REPO/spike" -name '*.js'); do node --check "$F" >/dev/null 2>&1 || { echo "  FAIL  node --check $F"; SYN=$((SYN+1)); }; done
for F in $(find "$REPO/spike" -name '*.sh'); do bash -n "$F" 2>/dev/null   || { echo "  FAIL  bash -n $F";     SYN=$((SYN+1)); }; done
assert "every spike script parses" "$SYN" "0"
# Not `grep $'\x00'`: bash cannot hold a NUL in a variable, so that pattern is the EMPTY
# string and matches every file — it reported all 68 as dirty on first run. Same method as
# run-step2.sh, which is where the hazard was found.
NULS="$(python3 -c "
import pathlib
print(sum(1 for p in pathlib.Path('$REPO/spike').rglob('*') if p.is_file() and b'\x00' in p.read_bytes()))
")"
assert "no NUL bytes in spike/" "$NULS" "0"

echo
if [ "$FAILS" -eq 0 ]; then
  echo "### STEP 3 PASS — the live dispatch's evidence replays through the live-mode path at the"
  echo "###   same gate; the payload is complete and its paths exist; an agent-authored manifest"
  echo "###   reads as unrecorded; a validator fail reaches the gate through the scorer alone;"
  echo "###   and the corpus's own plan verdicts are refuted 25/25 by the validator that made them."
  exit 0
else
  echo "### STEP 3 FAIL — $FAILS assertion(s) failed."
  exit 1
fi
