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
#   S5b finding 22 — the ledger governs FINALIZE too. A full clean seven-phase tree with a
#       missing or mismatched .decisions.json must not reach `completed`
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
# Counted here rather than by grepping the output: an audit found the reported figure was one
# high, because `grep -c PASS` also matches the final "STEP 3 PASS" banner. A driver that
# reports its own count cannot drift from the docs that quote it.
ASSERTS=0
assert() { # <label> <actual> <expected>
  ASSERTS=$((ASSERTS+1))
  if [ "$2" = "$3" ]; then printf '  PASS  %s (%s)\n' "$1" "$2"
  else printf '  FAIL  %s: expected [%s], got [%s]\n' "$1" "$3" "$2"; FAILS=$((FAILS+1)); fi
}
assert_match() { # <label> <actual> <regex>
  ASSERTS=$((ASSERTS+1))
  if printf '%s' "$2" | grep -qiE "$3"; then printf '  PASS  %s (matched /%s/)\n' "$1" "$3"
  else printf '  FAIL  %s: [%s] did not match /%s/\n' "$1" "$2" "$3"; FAILS=$((FAILS+1)); fi
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];process.stdout.write(v===null?"null":String(v))}catch(e){process.stdout.write("<unparseable>")}})' "$1"; }
# execFileSync with an ARGV, never execSync with a built command string: $REPO is a
# filesystem path and a path containing shell syntax would otherwise execute.
newjob() { # <evidence-root> [contract]
  node -e 'const{execFileSync}=require("child_process");const a=process.argv.slice(1);
process.stdout.write(JSON.parse(execFileSync("node",[a[0],"init",a[1],a[2],"--worktree",a[3]]).toString()).job_dir)' \
    "$CTRL" "${2:-$FIX/live_contract.json}" "$1" "$REPO"
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
  # Both branches print, so the PASS-line count and the self-reported ASSERTS agree. A check
  # that is silent on success is the reason the two numbers diverged in the first place.
  ASSERTS=$((ASSERTS+2))
  case "$V" in
    /*) printf '  PASS  %s is an absolute path\n' "$K" ;;
    *)  printf '  FAIL  %s is not an absolute path: [%s]\n' "$K" "$V"; FAILS=$((FAILS+1)) ;;
  esac
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
ASSERTS=$((ASSERTS+1))
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
 const out=JSON.parse(require("child_process").execFileSync("node",[process.argv[3],"-"],{input:JSON.stringify(inp)}).toString());
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
# The first fix here keyed authorship to the orchestrator-written `provenance` block, which
# an automated review correctly rejected: every byte of it lives in a file the agent is TOLD
# to write. So forge the whole thing — a complete, well-formed provenance block beside the
# self-granted pass — and assert it is still not believed. Only the controller's own
# .decisions.json ledger, outside the attempt directory, can answer "did I decide this".
JOB5F="$(newjob "$SCRATCH/s5f")"
node "$CTRL" next "$JOB5F" >/dev/null
stage_live "$JOB5F"
node -e '
 const fs=require("fs"),p=process.argv[1];const m=JSON.parse(fs.readFileSync(p));
 m.gate_result="pass";
 m.provenance={started_at:m.started_at,completed_at:m.completed_at,wall_clock_s:811,
               agent:"adws-planner",model_tier_requested:"opus",model_id:null,cost_usd:null,
               tokens_in:null,tokens_out:null,tool_call_count:null,elapsed_ms:null,timeout:null,cancel:null};
 fs.writeFileSync(p,JSON.stringify(m,null,2));
' "$JOB5F/plan/attempt_1/phase_manifest.json"
assert "a FORGED provenance block is not believed either" "$(node "$CTRL" next "$JOB5F" | jget phase)" "plan"
assert "…and the ledger, not the manifest, is what says so" \
  "$([ -f "$JOB5F/.decisions.json" ] && echo present || echo absent)" "absent"
# Post-record tampering: the ledger stores the verdict the gate decided, so flipping the
# agent-writable manifest from a recorded `fail` to `pass` must not advance the job. Reading
# the verdict from the ledger instead would be worse — it would promote a tree whose own
# evidence disagrees — so the two are BOUND and a disagreement is an integrity breach.
JOB5T="$(newjob "$SCRATCH/s5t" "$GOLDEN/task_contract_snapshot.json")"
node "$CTRL" next "$JOB5T" >/dev/null
stage_live "$JOB5T"
assert "recorded verdict (golden contract -> validator fail)" "$(node "$CTRL" record "$JOB5T" plan 1 | jget gate_result)" "fail"
node -e 'const fs=require("fs"),p=process.argv[1];const m=JSON.parse(fs.readFileSync(p));m.gate_result="pass";m.failure_reason=null;fs.writeFileSync(p,JSON.stringify(m,null,2))' "$JOB5T/plan/attempt_1/phase_manifest.json"
N5T="$(node "$CTRL" next "$JOB5T")"
assert       "fail flipped to pass after recording -> terminal" "$(printf '%s' "$N5T" | jget action)"  "terminal"
assert       "…as QUARANTINE, not a re-run"                     "$(printf '%s' "$N5T" | jget verdict)" "QUARANTINE"
assert_match "…naming the disagreement"                         "$(printf '%s' "$N5T" | jget note)"    "EVIDENCE INTEGRITY"
# DECLARED LIMIT, and the reason the assertion above is the strongest one available: the
# orchestrator and its subagents are the same OS principal, so an agent that violates its
# explicit "never write outside your attempt directory" prohibition can forge a CONSISTENT
# ledger entry and manifest together. Nothing inside one filesystem tree detects that. What
# the ledger buys is that forging now requires breaking a rule rather than following one.
node -e '
 const fs=require("fs"),p=process.argv[1];const d=JSON.parse(fs.readFileSync(p));
 d["plan/attempt_1"].gate_result="pass";fs.writeFileSync(p,JSON.stringify(d,null,2));
' "$JOB5T/.decisions.json"
assert "DECLARED LIMIT: a CONSISTENT forgery of both files is not detected (finding 19)" \
  "$(node "$CTRL" next "$JOB5T" | jget phase)" "build"
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

echo "### S5b — the ledger governs FINALIZE too, not just next/record"
# An independent audit found that `finalize` walked the manifests itself instead of asking
# expectedNext(), so the ledger was bypassable by calling one verb instead of another: on a
# fully clean seven-phase tree, deleting .decisions.json and finalizing directly returned 0,
# wrote final_status: completed, and the scorer PROMOTEd. Same root as findings 18/19 one verb
# over — phase_manifest.json is agent-writable, so "every latest manifest says pass" is a
# CLAIM, not a decision. These drive a real seven-phase job and assert both halves.
MOCKR="$SCRATCH/mock_review"; mkdir -p "$MOCKR"
cp -R "$GOLDEN/review/attempt_1/." "$MOCKR/"
node "$REPO/spike/adws-controller/mk-risk-trace.js" "$GOLDEN/build/attempt_1/phase_output.json" "$MOCKR" >/dev/null
drive7() { # <jobDir> -> seven clean recorded phases
  for P in plan build test review document ship verify; do
    F="$GOLDEN/$P/attempt_1"; [ "$P" = "review" ] && F="$MOCKR"
    node "$CTRL" next "$1" >/dev/null
    node "$CTRL" record "$1" "$P" 1 --from "$F" >/dev/null
  done
}
JOB5L="$(newjob "$SCRATCH/s5l" "$GOLDEN/task_contract_snapshot.json")"
drive7 "$JOB5L"
assert "seven clean gates -> next says finalize" "$(node "$CTRL" next "$JOB5L" | jget action)" "finalize"
rm "$JOB5L/.decisions.json"
node "$CTRL" finalize "$JOB5L" --report "$SCORER" >/dev/null 2>"$SCRATCH/e5l.txt"; RC5L=$?
assert       "ledger DELETED -> finalize refused (exit 65)" "$RC5L" "65"
assert_match "…and says the controller never decided it"    "$(cat "$SCRATCH/e5l.txt")" "not been recorded|cannot vouch"
assert       "…and final_status was NOT written"            "$(node -e 'console.log(String(JSON.parse(require("fs").readFileSync(process.argv[1])).final_status))' "$JOB5L/run_manifest.json")" "null"
# The sharper half: a ledger that DISAGREES with the manifest. next already quarantines here;
# finalize used to write `completed` anyway.
JOB5M="$(newjob "$SCRATCH/s5m" "$GOLDEN/task_contract_snapshot.json")"
drive7 "$JOB5M"
node -e 'const fs=require("fs"),p=process.argv[1];const d=JSON.parse(fs.readFileSync(p));d["test/attempt_1"].gate_result="fail";fs.writeFileSync(p,JSON.stringify(d,null,2))' "$JOB5M/.decisions.json"
assert "mismatched ledger -> next quarantines" "$(node "$CTRL" next "$JOB5M" | jget verdict)" "QUARANTINE"
node "$CTRL" finalize "$JOB5M" --report "$SCORER" >/dev/null 2>&1; EXIT5M=$?
assert "…finalize does NOT reach completed" "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).final_status)' "$JOB5M/run_manifest.json")" "quarantined"
assert "…on the evidence-integrity reason"   "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).failure_reason)' "$JOB5M/run_manifest.json")" "MISSING_UPSTREAM_ARTIFACT"
assert "…and the scorer exits QUARANTINE (2)" "$EXIT5M" "2"

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
# SC-19/F-98. This block used to assert `fixtures surveyed == 25`, and had been RED since
# SC-16 and SC-17 grew the report corpus to 29 — a live assertion carrying a frozen
# expectation, which is F-94's defect one layer deeper and worse, because it fails loudly
# where nobody looks rather than quietly where everybody reads.
#
# Bumping 25 -> 29 was the wrong fix and finding 61 said so: S7 exists to support finding
# 16's claim about EVERY corpus fixture, so whether the four added since preserve that
# property is a MEASUREMENT. It was made. All four do: 29/29 contracts score `fail`. The
# assertions below now derive the totals from the corpus and pin the CLAIM (refuted ==
# surveyed) instead of the count, so growing the corpus can never make this block stale —
# only make it fail, which is what an assertion is for.
TOTAL=0; REFUTED=0; TRACED=0
EXCEPTIONS=""
for CF in $(find "$REPO/parity/execution-report-fixtures" -name task_contract_snapshot.json | sort); do
  TOTAL=$((TOTAL+1))
  V="$(node -e 'const t=(require(process.argv[1]).task)||{};process.stdout.write(JSON.stringify({title:t.title,requested_change:t.requested_change,problem_statement:t.problem_statement,acceptance_criteria:t.acceptance_criteria||[],constraints:t.constraints||[],file_hints:t.file_hints||[]}))' "$CF" | node "$TN" - | jget rubric_result)"
  TR="$(dirname "$CF")/plan/attempt_1/skills/plan-coherence/skill_trace.json"
  [ "$V" = "fail" ] && REFUTED=$((REFUTED+1))
  if [ -f "$TR" ]; then
    TRACED=$((TRACED+1))
    # try/catch, not a bare parse: quarantine_unreadable_manifest ships a deliberately
    # truncated JSON file and an uncaught throw here dumped a stack trace mid-survey.
    node -e 'let t;try{t=JSON.parse(require("fs").readFileSync(process.argv[1]))}catch(e){process.exit(1)}process.exit(t.rubric_result==="pass"&&t.output===undefined?0:1)' "$TR" \
      || EXCEPTIONS="$EXCEPTIONS $(basename "$(dirname "$(dirname "$(dirname "$CF")")")")"
  fi
done
# Vacuity floor. "Every fixture" is trivially true of no fixtures, so a survey that found
# nothing must not report the claim as upheld — the same absence-reads-as-success branch
# evidence-integrity.js and secret-scan.js each grew after committing it once.
assert "the survey found fixtures at all"  "$([ "$TOTAL" -gt 0 ] && echo yes || echo no)" "yes"
# THE CLAIM, derived on both sides: no literal survives here, so the corpus can grow freely
# and a single fixture whose contract the validator does NOT refute fails the step.
assert "every surveyed contract is refuted by task-normalize" "$REFUTED" "$TOTAL"
# The trace half is stated as a NAMED EXCEPTION SET rather than a count, for the same
# reason: a count changes silently when the corpus grows, a name does not. Both exceptions
# are deliberate fixtures and neither weakens finding 16 —
#   quarantine_malformed_output  the trace is truncated JSON ON PURPOSE (it is the fixture
#                                for an unparseable skill trace), so it cannot be read
#   quarantine_skill_fail        records rubric_result: "fail" WITH an `output` block, i.e.
#                                the corpus's one example of the honest shape
# Every OTHER traced fixture records `pass` with no `output` for the scorer to catch it on,
# which is the finding. The four fixtures carrying no plan-coherence trace at all
# (promote_absent_optional, promote_warn, and the two skipped-phase quarantines) are counted
# by TRACED and are not exceptions to anything.
assert "traced fixtures are a subset of those surveyed" \
  "$([ "$TRACED" -le "$TOTAL" ] && echo yes || echo no)" "yes"
assert "…the only traces NOT recording pass-with-no-output are the two named fixtures" \
  "$(printf '%s' "$EXCEPTIONS" | tr ' ' '\n' | grep -v '^$' | sort | tr '\n' ' ' | sed 's/ $//')" \
  "quarantine_malformed_output quarantine_skill_fail"

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

# SC-18 closed finding 15: `make ci` DOES cover this tree now — gate.sh's node_check and
# shell_lint include spike/ (fixtures excluded as recorded evidence). This stays as the
# spike's own local assertion, which is stricter in one respect: it parses the fixture
# reproduction scripts too, where the gate deliberately leaves recorded evidence alone.
echo "### S9 — syntax + NUL sweep of spike/ (also gated by make ci since SC-18)"
SYN=0
# `while read` rather than `for F in $(find …)`: word-splitting find output is fragile
# (SC2044), and the loop must not be a subshell or SYN would not survive it.
while IFS= read -r F; do
  [ -n "$F" ] || continue
  node --check "$F" >/dev/null 2>&1 || { echo "  FAIL  node --check $F"; SYN=$((SYN+1)); }
done <<EOF
$(find "$REPO/spike" -name '*.js')
EOF
while IFS= read -r F; do
  [ -n "$F" ] || continue
  bash -n "$F" 2>/dev/null || { echo "  FAIL  bash -n $F"; SYN=$((SYN+1)); }
done <<EOF
$(find "$REPO/spike" -name '*.sh')
EOF
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
printf '### %d assertions run, %d failed.\n' "$ASSERTS" "$FAILS"
if [ "$FAILS" -eq 0 ]; then
  echo "### STEP 3 PASS — the live dispatch's evidence replays through the live-mode path at the"
  echo "###   same gate; the payload is complete and its paths exist; an agent-authored manifest"
  echo "###   reads as unrecorded; a validator fail reaches the gate through the scorer alone;"
  # Interpolated, not typed: this banner said "refuted 25/25" while S7 was surveying 29 —
  # the same frozen expectation as the assertion above it, in the sentence that reports it.
  echo "###   and the corpus's own plan verdicts are refuted $REFUTED/$TOTAL by the validator that made them."
  exit 0
else
  echo "### STEP 3 FAIL — $FAILS assertion(s) failed."
  exit 1
fi
