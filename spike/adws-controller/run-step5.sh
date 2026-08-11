#!/usr/bin/env bash
# STEP 5 driver, part 1 — the two actions. THROWAWAY.
#
# Step 5's question is whether an orchestrator can RUN from thin-skill-sketch.md
# (SPIKE_CONTROLLER_PLAN.md §12). Three of the sketch's five branches — `consensus`,
# `reproduce`, and the dissent-resolution half of `operator` — describe a controller that did
# not exist, so they could not be exercised at all. This driver covers the PREREQUISITE
# (§12.3): the controller now emits all three, and every route they open is asserted here.
#
# What this driver does NOT establish, and the distinction is step 3's lesson restated: it
# proves the CONTROLLER routes correctly. It says nothing about whether the sketch's PROSE for
# these branches is sufficient to orchestrate from — that needs a model reading the document,
# which is the live run §12.4 scopes and this driver is not.
#
#   S1  the consensus round: requested, dispatched, ingested, gated
#   S2  Critic fail -> reproduce -> reproduced/code -> rewind, with the F-46 accounting
#   S3  Critic fail -> reproduce -> did NOT reproduce -> ordinary retry (rule 3)
#   S4  Advocate dissent -> operator -> each of the four resolutions (F-3 / F-6 / F-37)
#   S5  the refusals: an agent-written resolution, a short round, an unasked answer
#   S6  replay is UNCHANGED — no round is requested and no route is re-derived
#   S7  idempotency of the three new actions (Q4, on the code step 5 added)
#   S9  the residue ledger's arithmetic and its freshness — step 5's verdict, asserted
#   S9b finding 40's leak count, derived from the crash rather than remembered
#   S8  syntax + NUL sweep (finding 15; `make ci` does not see spike/)
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CTRL="$REPO/spike/adws-controller/adws-run.js"
MKTRACE="$REPO/spike/adws-controller/mk-risk-trace.js"
FIX="$REPO/spike/adws-controller/fixtures"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

FAILS=0
PASSES=0
assert() { # <label> <actual> <expected>
  if [ "$2" = "$3" ]; then printf '  PASS  %s (%s)\n' "$1" "$2"; PASSES=$((PASSES+1))
  else printf '  FAIL  %s: expected [%s], got [%s]\n' "$1" "$3" "$2"; FAILS=$((FAILS+1)); fi
}
assert_match() { # <label> <actual> <regex>
  if printf '%s' "$2" | grep -qiE "$3"; then printf '  PASS  %s (matched /%s/)\n' "$1" "$3"; PASSES=$((PASSES+1))
  else printf '  FAIL  %s: [%s] did not match /%s/\n' "$1" "$2" "$3"; FAILS=$((FAILS+1)); fi
}
assert_fails() { # <label> <regex> <cmd...>
  local out rc
  out="$("${@:3}" 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then printf '  FAIL  %s: the command SUCCEEDED (exit 0)\n' "$1"; FAILS=$((FAILS+1)); return; fi
  if printf '%s' "$out" | grep -qiE "$2"; then printf '  PASS  %s (refused: /%s/)\n' "$1" "$2"; PASSES=$((PASSES+1))
  else printf '  FAIL  %s: refused with the wrong reason [%s]\n' "$1" "$out"; FAILS=$((FAILS+1)); fi
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s);const k=process.argv[1].split(".");let x=v;for(const p of k)x=x==null?x:x[p];process.stdout.write(x===undefined?"<absent>":String(x))}catch(e){process.stdout.write("<unparseable>")}})' "$1"; }
jfile() { node -e 'const fs=require("fs");try{let x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));for(const p of process.argv[2].split("."))x=x==null?x:x[p];process.stdout.write(x===undefined?"<absent>":String(x))}catch(e){process.stdout.write("<unreadable>")}' "$1" "$2"; }

newjob() {
  node -e 'const {execFileSync}=require("child_process");const [c,f,o]=process.argv.slice(1);process.stdout.write(JSON.parse(execFileSync("node",[c,"init",f,o]).toString()).job_dir)' \
    "$CTRL" "$FIX/contract.json" "$1"
}
step() { # <job> <phase> <attempt> <fixtureDir> — REPLAY, for the phases step 5 is not about
  node "$CTRL" next "$1" >/dev/null 2>&1
  node "$CTRL" record "$1" "$2" "$3" --from "$4"
}
# LIVE staging: the agent's own files, written where a dispatched subagent would leave them.
# phase_manifest.json is deliberately NOT staged — assertLiveAttempt refuses one carrying a
# verdict, and step 3 already asserts that path.
stage_live() { # <job> <phase> <attempt> <fixtureDir>
  mkdir -p "$1/$2/attempt_$3"
  cp "$4/phase_output.json" "$4/phase_log.md" "$1/$2/attempt_$3/"
}
stage_consensus() { # <job> <phase> <attempt> <consensusFixtureDir>
  mkdir -p "$1/$2/attempt_$3/consensus"
  cp "$4/critic.json" "$4/advocate.json" "$1/$2/attempt_$3/consensus/"
}
# The corpus an orchestrator copied out of its scratch root into the attempt (F-46 step 1),
# plus the reproduction record it hands back with --reproduction.
stage_repro() { # <job> <phase> <attempt> <reproduced:true|false> <defect_in> -> prints the record path
  local a="$1/$2/attempt_$3"
  mkdir -p "$a/consensus/repro"
  printf '{"retries":1,"attempt_2_exists":false}\n' > "$a/consensus/repro/state.json"
  local rec="$SCRATCH/repro_$2_$3_$RANDOM.json"
  node -e 'const fs=require("fs");const [p,r,d]=process.argv.slice(1);
fs.writeFileSync(p, JSON.stringify({reproduced: r==="true", defect_in: d==="-"?null:d,
  command: "node -e \"require('./src/controller').advance({fail_at:'mkdir'})\"",
  observed: r==="true" ? "retries: 1 with no attempt_2/ on disk — the counter moved, the directory did not"
                       : "retries stayed 0 and attempt_2/ was created; the cited lines are guarded by the caller",
  files: r==="true" ? ["consensus/repro/state.json"] : []}, null, 2)+"\n")' "$rec" "$4" "$5"
  printf '%s' "$rec"
}
# plan + build, replayed, so every job below starts at a live test phase
head_phases() { # <job>
  step "$1" plan 1 "$FIX/plan" >/dev/null || return 1
  step "$1" build 1 "$FIX/build_initial" >/dev/null || return 1
}

echo "### S1 — the consensus round is REQUESTED, dispatched, and gated"
J1="$(newjob "$SCRATCH/s1")"; head_phases "$J1"
node "$CTRL" next "$J1" >/dev/null
stage_live "$J1" test 1 "$FIX/test_pass"
# The first record declares the phase agent finished. It decides NOTHING.
R="$(node "$CTRL" record "$J1" test 1)"
assert "first record defers"        "$(printf '%s' "$R" | jget awaiting)"  "consensus"
assert "and records no verdict"     "$(printf '%s' "$R" | jget recorded)"  "null"
assert "no manifest was written"    "$([ -f "$J1/test/attempt_1/phase_manifest.json" ] && echo yes || echo no)" "no"
# F-35 lives in the payload, not only in the prose.
P="$(node "$CTRL" next "$J1")"
assert "next agrees with record"    "$(printf '%s' "$P" | jget action)"    "consensus"
assert "parallel is REQUIRED"       "$(printf '%s' "$P" | jget parallel)"  "required"
assert "the set is exactly two"     "$(printf '%s' "$P" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).agents.length)))')" "2"
assert_match "critic named"         "$P" '"agent":"adws-critic"'
assert_match "advocate named"       "$P" '"agent":"adws-advocate"'
assert_match "fresh context stated" "$P" 'never the other'
CD="$(printf '%s' "$P" | jget consensus_dir)"
assert "consensus dir created when advertised" "$([ -d "$CD" ] && echo yes || echo no)" "yes"
# the pair reports; the SECOND record gates
stage_consensus "$J1" test 1 "$FIX/consensus_clean"
R="$(node "$CTRL" record "$J1" test 1)"
assert "second record gates"        "$(printf '%s' "$R" | jget gate_result)"      "pass"
assert "and says the round RAN"     "$(printf '%s' "$R" | jget consensus_round)"  "ran"
assert "recorded the attempt"       "$(printf '%s' "$R" | jget recorded)"         "test/attempt_1"

echo
echo "### S2 — Critic fail -> reproduce -> REPRODUCED/code -> rewind (F-46 rules 1-2)"
J2="$(newjob "$SCRATCH/s2")"; head_phases "$J2"
node "$CTRL" next "$J2" >/dev/null
stage_live "$J2" test 1 "$FIX/test_pass"
node "$CTRL" record "$J2" test 1 >/dev/null
stage_consensus "$J2" test 1 "$FIX/consensus_critic_fail"
R="$(node "$CTRL" record "$J2" test 1)"
assert "a Critic fail defers to reproduce" "$(printf '%s' "$R" | jget awaiting)" "reproduce"
P="$(node "$CTRL" next "$J2")"
assert "next emits reproduce"       "$(printf '%s' "$P" | jget action)" "reproduce"
assert_match "it decides the ROUTE, not the verdict" "$P" 'never the verdict'
assert_match "the critic command is DATA (SC-14/F-82)" "$P" 'never pass it to a shell'
assert "orchestrator scratch is its own root, not an agent's" \
  "$(printf '%s' "$P" | jget scratch_root | grep -c '/orchestrator$')" "1"
REC="$(stage_repro "$J2" test 1 true code)"
R="$(node "$CTRL" record "$J2" test 1 --reproduction "$REC")"
assert "gate"                       "$(printf '%s' "$R" | jget gate_result)"   "fail"
assert "the DOCUMENTED annotation"  "$(printf '%s' "$R" | jget annotation)"    "CRITIC_FAIL_REPAIRED"
assert "route"                      "$(printf '%s' "$R" | jget route)"         "rewind"
assert "rewind opened"              "$(printf '%s' "$R" | jget rewind_opened)"  "build/attempt_2"
assert "cross_phase_rewinds.test"   "$(printf '%s' "$R" | jget cross_phase_rewinds.test)" "1"
assert "consumed NO test retry"     "$(printf '%s' "$R" | jget retries_used)"   "0/2"
C="$J2/build/attempt_2/corrections.json"
assert "corrections source"         "$(jfile "$C" source_attempt)"             "test/attempt_1"
assert "classification"             "$(node -e 'const c=require(process.argv[1]);process.stdout.write(c.corrections[0].classification)' "$C")" "code"
assert "the finding is the expectation, verbatim" \
  "$(node -e 'const c=require(process.argv[1]);process.stdout.write(String(c.corrections[0].expected.startsWith("The retry counter is incremented")))' "$C")" "true"
assert "repro names the ARCHIVED corpus, not scratch" \
  "$(node -e 'const c=require(process.argv[1]);process.stdout.write(c.corrections[0].repro.files[0])' "$C")" "consensus/repro/state.json"
assert "what was run is recorded on the attempt (rule 1)" \
  "$(jfile "$J2/test/attempt_1/phase_manifest.json" gate_failure_detail.summary | grep -c 'Orchestrator reproduction')" "1"
# the build attempt escalates, and the rewind budget did not touch the build retry budget
P="$(node "$CTRL" next "$J2")"
assert "next dispatches the rewind build" "$(printf '%s' "$P" | jget attempt)"     "2"
assert "origin"                           "$(printf '%s' "$P" | jget origin)"      "rewind"
assert "tier escalates (F-48)"            "$(printf '%s' "$P" | jget model_tier)"  "opus"
assert "tier source"                      "$(printf '%s' "$P" | jget tier_input.source)" "cross-phase-rewind"

echo
echo "### S3 — Critic fail that does NOT reproduce -> ordinary retry (F-46 rule 3)"
J3="$(newjob "$SCRATCH/s3")"; head_phases "$J3"
node "$CTRL" next "$J3" >/dev/null
stage_live "$J3" test 1 "$FIX/test_pass"
node "$CTRL" record "$J3" test 1 >/dev/null
stage_consensus "$J3" test 1 "$FIX/consensus_critic_fail"
node "$CTRL" record "$J3" test 1 >/dev/null
REC="$(stage_repro "$J3" test 1 false -)"
R="$(node "$CTRL" record "$J3" test 1 --reproduction "$REC")"
assert "gate still fails"           "$(printf '%s' "$R" | jget gate_result)" "fail"
assert "no rewind"                  "$(printf '%s' "$R" | jget rewind_opened)" "null"
assert "route is the ordinary retry" "$(printf '%s' "$R" | jget route)"      "retry"
assert "it spends a rewind on nothing" "$(printf '%s' "$R" | jget cross_phase_rewinds.test)" "0"
assert "it DOES spend a test retry"  "$(printf '%s' "$R" | jget retries_used)" "0/2"
assert_match "and is never dismissed silently" \
  "$(jfile "$J3/test/attempt_1/phase_manifest.json" gate_failure_detail.summary)" 'did NOT reproduce'
assert "the next attempt is a retry" "$(node "$CTRL" next "$J3" | jget origin)" "retry"

echo
echo "### S4 — Advocate dissent -> operator, and the four resolutions"
dissent_job() { # <name> -> a job parked at the operator action on test/attempt_1
  local j; j="$(newjob "$SCRATCH/$1")"
  head_phases "$j" >/dev/null || return 1
  node "$CTRL" next "$j" >/dev/null
  stage_live "$j" test 1 "$FIX/test_pass"
  node "$CTRL" record "$j" test 1 >/dev/null
  stage_consensus "$j" test 1 "$FIX/consensus_dissent"
  node "$CTRL" record "$j" test 1 >/dev/null
  printf '%s' "$j"
}
J4="$(dissent_job s4)"
P="$(node "$CTRL" next "$J4")"
assert "next emits operator"        "$(printf '%s' "$P" | jget action)" "operator"
assert "kind"                       "$(printf '%s' "$P" | jget kind)"   "advocate_dissent"
assert "the dissent is VERBATIM"    "$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(JSON.parse(s).dissent===a.dissent))})' "$FIX/consensus_dissent/advocate.json" <<< "$P")" "true"
assert "four resolutions offered"   "$(printf '%s' "$P" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).resolutions.length)))')" "4"
assert_match "the controller refuses to decide it" "$P" 'do not override a dissent yourself'

echo "  -- override (F-3): no new attempt, no retry burned, permanent warning"
JA="$(dissent_job s4a)"
R="$(node "$CTRL" record "$JA" test 1 --resolution override --rationale 'assessed against the problem statement; the criterion covers the rewind path through the shared helper')"
assert "the SCORER clears it, not the controller" "$(printf '%s' "$R" | jget gate_result)" "pass"
assert "no attempt was created"     "$(ls -d "$JA"/test/attempt_* | wc -l | tr -d ' ')" "1"
assert "no retry burned"            "$(printf '%s' "$R" | jget retries_used)" "0/2"
assert "the resolution reached the file the scorer reads" \
  "$(jfile "$JA/test/attempt_1/consensus/advocate.json" resolution.action)" "override"
echo "  -- uphold (rule 5): terminal, quarantine class, ADVOCATE_DISSENT"
JB="$(dissent_job s4b)"
R="$(node "$CTRL" record "$JB" test 1 --resolution uphold)"
assert "gate"                       "$(printf '%s' "$R" | jget gate_result)" "fail"
assert "the terminal reason is NOT the blanket gate failure" "$(printf '%s' "$R" | jget annotation)" "ADVOCATE_DISSENT"
N="$(node "$CTRL" next "$JB")"
assert "next is terminal"           "$(printf '%s' "$N" | jget action)"        "terminal"
assert "verdict"                    "$(printf '%s' "$N" | jget verdict)"       "QUARANTINE"
assert "failure_reason"             "$(printf '%s' "$N" | jget failure_reason)" "ADVOCATE_DISSENT"
node "$CTRL" finalize "$JB" >/dev/null 2>&1
assert "run_manifest final_status"  "$(jfile "$JB/run_manifest.json" final_status)"   "quarantined"
assert "run_manifest failure_reason" "$(jfile "$JB/run_manifest.json" failure_reason)" "ADVOCATE_DISSENT"
node "$CTRL" finalize "$JB" --report "$REPO/adws-pipeline/scripts/execution-report.js" >/dev/null 2>&1
assert "the scorer agrees: QUARANTINE/2" "$?" "2"

echo "  -- repair (F-37): its own budget, and the ONE rewind that burns a build retry"
JC="$(dissent_job s4c)"
R="$(node "$CTRL" record "$JC" test 1 --resolution repair --rationale 'dissent CONFIRMED on inspection, not overridden')"
assert "gate"                       "$(printf '%s' "$R" | jget gate_result)" "fail"
assert "the DOCUMENTED annotation"  "$(printf '%s' "$R" | jget annotation)"  "ADVOCATE_DISSENT_REPAIRED"
assert "route"                      "$(printf '%s' "$R" | jget route)"       "operator-repair"
assert "rewind opened"              "$(printf '%s' "$R" | jget rewind_opened)" "build/attempt_2"
assert "operator_directed_rewinds.test" "$(printf '%s' "$R" | jget operator_directed_rewinds.test)" "1"
assert "it is NOT a gate-automatic rewind" "$(printf '%s' "$R" | jget cross_phase_rewinds.test)" "0"
assert "nor a check-defect repair"  "$(printf '%s' "$R" | jget check_defect_repairs)" "0"
P="$(node "$CTRL" next "$JC")"
assert "the build attempt's origin" "$(printf '%s' "$P" | jget origin)"            "operator-repair"
assert "tier source (F-37 step 4)"  "$(printf '%s' "$P" | jget tier_input.source)" "operator-resolution"
assert "and it DID burn a build retry (F-37 step 5)" \
  "$(node -e 'const{execFileSync}=require("child_process");const o=JSON.parse(execFileSync("node",[process.argv[1],"audit",process.argv[2]]).toString());process.stdout.write(String(o.budgets.build.retries_used))' "$CTRL" "$JC")" "1"

echo "  -- re-review (F-6): a fresh round, escalated, at the operator's source"
JD="$(dissent_job s4d)"
R="$(node "$CTRL" record "$JD" test 1 --resolution re-review)"
assert "gate"                       "$(printf '%s' "$R" | jget gate_result)" "fail"
assert "no rewind"                  "$(printf '%s' "$R" | jget rewind_opened)" "null"
assert "the file carries NO resolution the scorer would misread" \
  "$(jfile "$JD/test/attempt_1/consensus/advocate.json" resolution)" "<absent>"
P="$(node "$CTRL" next "$JD")"
assert "a fresh attempt"            "$(printf '%s' "$P" | jget attempt)"           "2"
assert "origin"                     "$(printf '%s' "$P" | jget origin)"            "operator-rereview"
assert "tier source is NOT retry-escalation" "$(printf '%s' "$P" | jget tier_input.source)" "operator-resolution"
assert "and it DID burn the test retry (F-3's cost)" \
  "$(node -e 'const{execFileSync}=require("child_process");const o=JSON.parse(execFileSync("node",[process.argv[1],"audit",process.argv[2]]).toString());process.stdout.write(String(o.budgets.test.retries_used))' "$CTRL" "$JD")" "1"

echo
echo "### S5 — the refusals"
JE="$(newjob "$SCRATCH/s5")"; head_phases "$JE"
node "$CTRL" next "$JE" >/dev/null
stage_live "$JE" test 1 "$FIX/test_pass"
node "$CTRL" record "$JE" test 1 >/dev/null
# (a) FINDING 19 ONE FILE OVER: the Advocate resolves its own dissent, and the SCORER believes it
mkdir -p "$JE/test/attempt_1/consensus"
cp "$FIX/consensus_dissent/critic.json" "$JE/test/attempt_1/consensus/"
node -e 'const fs=require("fs");const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
a.resolution={resolved_by:"operator",action:"override",rationale:"self-cleared",resolved_at:"2026-08-11T14:33:00Z"};
fs.writeFileSync(process.argv[2],JSON.stringify(a,null,2)+"\n")' \
  "$FIX/consensus_dissent/advocate.json" "$JE/test/attempt_1/consensus/advocate.json"
assert_fails "an agent-written resolution is refused" 'the Advocate never writes it' \
  node "$CTRL" record "$JE" test 1
# and the refusal is load-bearing: without it the scorer downgrades this to a WARN and passes
assert "the scorer WOULD have believed it (which is why the refusal exists)" \
  "$(node -e 'const s=require(process.argv[1]);const r=s.buildReport(process.argv[2]).report;
const g=r.gates.find(x=>x.gate==="consensus");process.stdout.write(g?g.result:"<none>")' \
  "$REPO/adws-pipeline/scripts/execution-report.js" "$JE")" "warn"
# (b) a one-voter round never gates: unanimity is not a property a single opinion can have.
# The ask repeats (bounded), naming the role that did not report, and it never decides.
JF="$(newjob "$SCRATCH/s5f")"; head_phases "$JF"
node "$CTRL" next "$JF" >/dev/null
stage_live "$JF" test 1 "$FIX/test_pass"
node "$CTRL" record "$JF" test 1 >/dev/null
mkdir -p "$JF/test/attempt_1/consensus"
cp "$FIX/consensus_clean/critic.json" "$JF/test/attempt_1/consensus/"
R="$(node "$CTRL" record "$JF" test 1)"
assert "a one-voter round does not gate" "$(printf '%s' "$R" | jget awaiting)" "consensus"
assert "and names the role that did not report" "$(printf '%s' "$R" | jget missing)" "advocate"
assert "the handshake says the round is incomplete" \
  "$(printf '%s' "$R" | jget consensus_round)" "incomplete: missing advocate"
node "$CTRL" record "$JF" test 1 >/dev/null 2>&1
assert_fails "and past the bound it refuses, by role" 'no advocate' \
  node "$CTRL" record "$JF" test 1
# (c) an answer to a question nobody asked
JG="$(newjob "$SCRATCH/s5g")"; head_phases "$JG"
node "$CTRL" next "$JG" >/dev/null
stage_live "$JG" test 1 "$FIX/test_pass"
assert_fails "a resolution with no dissent awaiting it" 'no Advocate dissent is awaiting resolution' \
  node "$CTRL" record "$JG" test 1 --resolution override
# (d) an undecided reproduction has no route. This needs a job parked at `reproduce`, which
# is a Critic fail — a dissent job parks at `operator` and would refuse for the wrong reason.
critic_job() { # <name> -> a job parked at the reproduce action on test/attempt_1
  local j; j="$(newjob "$SCRATCH/$1")"
  head_phases "$j" >/dev/null || return 1
  node "$CTRL" next "$j" >/dev/null
  stage_live "$j" test 1 "$FIX/test_pass"
  node "$CTRL" record "$j" test 1 >/dev/null
  stage_consensus "$j" test 1 "$FIX/consensus_critic_fail"
  node "$CTRL" record "$j" test 1 >/dev/null
  printf '%s' "$j"
}
JH="$(critic_job s5h)"
assert "the job is parked at reproduce" "$(node "$CTRL" next "$JH" | jget action)" "reproduce"
BADREC="$SCRATCH/bad_repro.json"
printf '{"reproduced":"maybe","defect_in":"code"}\n' > "$BADREC"
assert_fails "a non-boolean reproduced is refused" 'no route for an undecided reproduction' \
  node "$CTRL" record "$JH" test 1 --reproduction "$BADREC"
# (e) an absolute path in the archived corpus (SC-14/F-82)
printf '{"reproduced":true,"defect_in":"code","files":["/etc/passwd"]}\n' > "$BADREC"
assert_fails "an absolute repro path is refused" 'must be a relative path under consensus/repro' \
  node "$CTRL" record "$JH" test 1 --reproduction "$BADREC"
printf '{"reproduced":true,"defect_in":"code","files":["consensus/repro/../../../etc/passwd"]}\n' > "$BADREC"
assert_fails "a traversing repro path is refused" 'must be a relative path under consensus/repro' \
  node "$CTRL" record "$JH" test 1 --reproduction "$BADREC"

echo
echo "### S5b — the two an independent audit found (both were fail-OPEN)"
# (i) BOTH a dissent and a Critic fail. evalConsensus's precedence is
#     `blocking dissent -> critic fail`, where blocking means dissenting AND NOT overridden.
#     Testing `dissent` alone kept the controller answering a dissent the scorer had already
#     cleared, and the Critic's reproduction was never requested.
JX="$(newjob "$SCRATCH/s5b")"; head_phases "$JX"
node "$CTRL" next "$JX" >/dev/null
stage_live "$JX" test 1 "$FIX/test_pass"
node "$CTRL" record "$JX" test 1 >/dev/null
mkdir -p "$JX/test/attempt_1/consensus"
cp "$FIX/consensus_critic_fail/critic.json"  "$JX/test/attempt_1/consensus/critic.json"
cp "$FIX/consensus_dissent/advocate.json"    "$JX/test/attempt_1/consensus/advocate.json"
R="$(node "$CTRL" record "$JX" test 1)"
assert "the BLOCKING dissent is answered first" "$(printf '%s' "$R" | jget kind)" "advocate_dissent"
R="$(node "$CTRL" record "$JX" test 1 --resolution override --rationale 'false positive on inspection')"
assert "an OVERRIDDEN dissent hands off to the Critic" "$(printf '%s' "$R" | jget awaiting)" "reproduce"
assert "next agrees"                "$(node "$CTRL" next "$JX" | jget action)" "reproduce"
REC="$(stage_repro "$JX" test 1 true code)"
R="$(node "$CTRL" record "$JX" test 1 --reproduction "$REC")"
assert "and the Critic finding still routes" "$(printf '%s' "$R" | jget annotation)" "CRITIC_FAIL_REPAIRED"
assert "the overridden dissent did not become a retry" "$(printf '%s' "$R" | jget route)" "rewind"
# ...and the other THREE resolutions must NOT ask for a reproduction, because in each of them
# the dissent still owns the route: uphold ends the job, repair rewinds, re-review retries. A
# reproduce round requested there costs a dispatch whose answer is then discarded. (The first
# cut of the fix above fell through to the Critic for exactly these three — and never for
# `override`, the case it was written for, which writes the file and skips the block.)
mixed_job() { # <name> -> a job at test/attempt_1 with BOTH a dissent and a Critic fail
  local j; j="$(newjob "$SCRATCH/$1")"
  head_phases "$j" >/dev/null || return 1
  node "$CTRL" next "$j" >/dev/null
  stage_live "$j" test 1 "$FIX/test_pass"
  node "$CTRL" record "$j" test 1 >/dev/null
  mkdir -p "$j/test/attempt_1/consensus"
  cp "$FIX/consensus_critic_fail/critic.json" "$j/test/attempt_1/consensus/critic.json"
  cp "$FIX/consensus_dissent/advocate.json"   "$j/test/attempt_1/consensus/advocate.json"
  node "$CTRL" record "$j" test 1 >/dev/null
  printf '%s' "$j"
}
for pair in "uphold:ADVOCATE_DISSENT" "repair:ADVOCATE_DISSENT_REPAIRED" "re-review:TEST_GATE_FAILURE"; do
  act="${pair%%:*}"; want="${pair##*:}"
  JM="$(mixed_job "s5b_$act")"
  R="$(node "$CTRL" record "$JM" test 1 --resolution "$act")"
  assert "$act with a Critic fail present decides, never defers" "$(printf '%s' "$R" | jget awaiting)" "<absent>"
  assert "  and routes on the DISSENT"                           "$(printf '%s' "$R" | jget annotation)" "$want"
  assert "  with no reproduce round requested"                   "$(node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(!!(r["test/attempt_1"]||{}).reproduce))' "$JM/.rounds.json")" "false"
done
# (ii) a `route: "terminal"` that never terminated. Nothing in expectedNext reads `route` — it
#      reads the ANNOTATION — so an integrity breach announced itself and then dispatched a retry.
JY="$(dissent_job s5b2)"
node "$CTRL" record "$JY" test 1 --resolution override >/dev/null
# strip the resolution the controller just wrote: the ledger says override, the file does not
node -e 'const fs=require("fs");const p=process.argv[1];const a=JSON.parse(fs.readFileSync(p,"utf8"));delete a.resolution;fs.writeFileSync(p,JSON.stringify(a,null,2)+"\n")' \
  "$JY/test/attempt_1/consensus/advocate.json"
JZ="$(dissent_job s5b3)"
R="$(node "$CTRL" record "$JZ" test 1 --resolution uphold)"   # a control: this one IS terminal
assert "control: uphold terminates"  "$(node "$CTRL" next "$JZ" | jget action)" "terminal"
# the ledger/file disagreement, re-gated on a fresh job so the breach is the only difference
JW="$(dissent_job s5b4)"
node -e 'const fs=require("fs");const p=process.argv[1];const r=JSON.parse(fs.readFileSync(p,"utf8"));
for(const k of Object.keys(r)) if(r[k].resolution) r[k].resolution={action:"override",resolved_at:"2026-08-11T00:00:00Z"};
fs.writeFileSync(p,JSON.stringify(r,null,2)+"\n")' "$JW/.rounds.json"
R="$(node "$CTRL" record "$JW" test 1)"
assert "a ledger/file resolution disagreement is an integrity breach" \
  "$(printf '%s' "$R" | jget annotation)" "MISSING_UPSTREAM_ARTIFACT"
N="$(node "$CTRL" next "$JW")"
assert "and it ACTUALLY terminates"  "$(printf '%s' "$N" | jget action)"  "terminal"
assert "in the quarantine class"     "$(printf '%s' "$N" | jget verdict)" "QUARANTINE"
# ...all the way through finalize, and scored as quarantine by the untouched scorer.
node "$CTRL" finalize "$JW" >/dev/null 2>&1
assert "finalize records it as quarantined" "$(jfile "$JW/run_manifest.json" final_status)"    "quarantined"
assert "on the sourced reason"              "$(jfile "$JW/run_manifest.json" failure_reason)"  "MISSING_UPSTREAM_ARTIFACT"
node "$CTRL" finalize "$JW" --report "$REPO/adws-pipeline/scripts/execution-report.js" >/dev/null 2>&1
assert "and the scorer agrees: exit 2"      "$?" "2"

echo
echo "### S6 — REPLAY is unchanged: no round requested, no route re-derived"
JI="$(newjob "$SCRATCH/s6")"; head_phases "$JI"
D="$(mktemp -d "$SCRATCH/replay_XXXXXX")"
cp "$FIX/test_pass/phase_output.json" "$FIX/test_pass/phase_log.md" "$D/"
mkdir -p "$D/consensus"; cp "$FIX/consensus_critic_fail/critic.json" "$FIX/consensus_critic_fail/advocate.json" "$D/consensus/"
R="$(node "$CTRL" record "$JI" test 1 --from "$D")"
assert "a replayed attempt gates in ONE call" "$(printf '%s' "$R" | jget awaiting)" "<absent>"
assert "its consensus is INGESTED, not run"   "$(printf '%s' "$R" | jget consensus_round)" "ingested"
assert "a replayed Critic fail opens no rewind" "$(printf '%s' "$R" | jget rewind_opened)" "null"
assert "and takes the pre-step-5 route"       "$(printf '%s' "$R" | jget route)" "retry"
assert "no round was ever requested"          "$([ -f "$JI/.rounds.json" ] && echo yes || echo no)" "no"
# But COMPLETENESS is a property of the evidence, not of who wrote it. A replayed one-voter
# round used to gate `pass` while the same message said "incomplete: missing advocate" — the
# controller naming a defect and promoting anyway. The scorer cannot catch it: collectConsensus
# builds a row from either file alone.
JJ="$(newjob "$SCRATCH/s6b")"; head_phases "$JJ"
D2="$(mktemp -d "$SCRATCH/replay1_XXXXXX")"
cp "$FIX/test_pass/phase_output.json" "$FIX/test_pass/phase_log.md" "$D2/"
mkdir -p "$D2/consensus"; cp "$FIX/consensus_clean/critic.json" "$D2/consensus/"
R="$(node "$CTRL" record "$JJ" test 1 --from "$D2")"
assert "a replayed one-voter round does NOT gate pass" "$(printf '%s' "$R" | jget gate_result)" "fail"
assert "and says which role never reported"           "$(printf '%s' "$R" | jget consensus_round)" "incomplete: missing advocate"
assert "the scorer alone would have passed it (which is why this layer exists)" \
  "$(node -e 'const s=require(process.argv[1]);const r=s.buildReport(process.argv[2]).report;
const g=r.gates.find(x=>x.gate==="consensus");process.stdout.write(g?g.result:"<none>")' \
  "$REPO/adws-pipeline/scripts/execution-report.js" "$JJ")" "pass"
# and a wholly ABSENT round is deliberately NOT failed — the scorer scores it UNVERIFIED, which
# promotes with a warning. An honest gap, not a false unanimity (finding 30).
JK="$(newjob "$SCRATCH/s6c")"; head_phases "$JK"
D3="$(mktemp -d "$SCRATCH/replay0_XXXXXX")"
cp "$FIX/test_pass/phase_output.json" "$FIX/test_pass/phase_log.md" "$D3/"
R="$(node "$CTRL" record "$JK" test 1 --from "$D3")"
assert "an absent round is reported, not failed"      "$(printf '%s' "$R" | jget gate_result)" "pass"
assert "and is reported as such"                      "$(printf '%s' "$R" | jget consensus_round)" "none"

echo
echo "### S7 — idempotency of the three new actions (Q4)"
J7="$(dissent_job s7)"
A="$(node "$CTRL" next "$J7")"; B="$(node "$CTRL" next "$J7")"
assert "next is byte-identical while a round is outstanding" "$([ "$A" = "$B" ] && echo same || echo differs)" "same"
# A recorded resolution is final. After `uphold` the job is terminal, so the sequencing oracle
# refuses before applyResolution is even reached — which is the stronger of the two refusals,
# and the one that shows the resolution is not a field the caller can revise.
node "$CTRL" record "$J7" test 1 --resolution uphold >/dev/null
assert_fails "an upheld dissent cannot be re-resolved" "the job is at 'terminal'" \
  node "$CTRL" record "$J7" test 1 --resolution override
# The same property where the job is still RUNNING: after `override` the gate passed and the
# next dispatch is build, so a second resolution is refused as out of order rather than applied.
J7C="$(dissent_job s7c)"
node "$CTRL" record "$J7C" test 1 --resolution override >/dev/null
assert_fails "an overridden dissent cannot be re-resolved either" 'out of order' \
  node "$CTRL" record "$J7C" test 1 --resolution uphold
# `record` REPEATS an outstanding ask rather than erroring on a redundant call (a model that
# calls record twice is being redundant, not wrong), and the repeat is bounded.
J7B="$(newjob "$SCRATCH/s7b")"; head_phases "$J7B"
node "$CTRL" next "$J7B" >/dev/null
stage_live "$J7B" test 1 "$FIX/test_pass"
A="$(node "$CTRL" record "$J7B" test 1 | jget awaiting)"
B="$(node "$CTRL" record "$J7B" test 1 | jget awaiting)"
assert "re-recording an outstanding round re-reports it, never decides" "$A/$B" "consensus/consensus"
assert "and still wrote no manifest" "$([ -f "$J7B/test/attempt_1/phase_manifest.json" ] && echo yes || echo no)" "no"
node "$CTRL" record "$J7B" test 1 >/dev/null 2>&1
assert_fails "but the ask is BOUNDED, not a loop" 'dispatch the missing agent' \
  node "$CTRL" record "$J7B" test 1

echo
echo "### S9 — the residue ledger's arithmetic, and its freshness (§12.6 criterion 2)"
# Step 5's verdict is a NUMBER against a threshold, so it is asserted here rather than stated
# in a document. Same shape as run-step4.sh S3, and the same lesson from finding 27: the
# ledger records a DIGEST of the sketch it measured, never a size — a same-length edit must
# read stale.
LEDGER="$REPO/spike/adws-controller/.step5-residue.json"
SKETCH="$REPO/spike/adws-controller/thin-skill-sketch.md"
lget() { node -e 'const j=require(process.argv[1]);const k=process.argv[2].split(".");let x=j;for(const p of k)x=x==null?x:x[p];process.stdout.write(String(x))' "$LEDGER" "$1"; }
SHA_NOW="$(node -e 'const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$SKETCH")"
BYTES_NOW="$(wc -c < "$SKETCH" | tr -d ' ')"
assert "the ledger's patched digest matches the sketch on disk" "$(lget sketch_patched.sha256)" "$SHA_NOW"
assert "and its byte count does too"                            "$(lget sketch_patched.bytes)"  "$BYTES_NOW"
CEIL="$(lget ceiling_bytes)"
assert "the ceiling is the one §12.1 computed"                  "$CEIL" "21274"
# Z' UNDER the ceiling is what keeps the GO's pessimistic floor. Above it, the no-reference
# reading stops being a reduction at all and §12.7's first row fires.
if [ "$BYTES_NOW" -lt "$CEIL" ]; then
  printf '  PASS  Z prime is under the ceiling (%s < %s)\n' "$BYTES_NOW" "$CEIL"; PASSES=$((PASSES+1))
else
  printf '  FAIL  Z prime %s has reached the ceiling %s — §12.7 row 1 fires\n' "$BYTES_NOW" "$CEIL"; FAILS=$((FAILS+1))
fi
# The band, which is the verdict: <14000 confirms Z; 14000..ceiling makes the reasoning A/B
# mandatory before any real build; over the ceiling is a kill.
BAND="$(node -e 'const b=Number(process.argv[1]),c=Number(process.argv[2]);process.stdout.write(b>c?"KILL":(b>=14000?"AB_MANDATORY":"Z_CONFIRMED"))' "$BYTES_NOW" "$CEIL")"
assert "§12.7 band" "$BAND" "Z_CONFIRMED"
assert "the run used no forbidden read"        "$(lget run.forbidden_reads)"          "0"
assert "and hit no blocking residue event"     "$(lget run.blocking_residue_events)"  "0"
assert "within the dispatch cap"               "$(lget run.dispatches_used)"          "5"
# Every residue event the run found is patched INTO the sketch, so the delta is real work and
# not a tally. A ledger listing events against an unchanged sketch would measure nothing.
assert "the patched sketch is larger than the one measured" \
  "$(node -e 'process.stdout.write(String(Number(process.argv[1])>Number(process.argv[2])))' "$BYTES_NOW" "$(lget sketch_at_run.bytes)")" "true"

echo
echo "### S9b — finding 40's leak count, derived from the crash rather than remembered"
# An independent audit of the MERGED record found finding 40 claiming five leaked frames where
# the captured stack carried four. The crash reproduces, so the count is a measurement and not
# a memory: it is taken from the stack here and the prose is required to agree. Same lesson as
# findings 22/29/34 — one place answers the question, and the other is checked against it.
# This assertion is SUPPOSED to fail if the uncaught ENOENT is ever fixed: the frame count goes
# to zero, and finding 40's first half stops being true and must be rewritten, not re-passed.
FRAMES="$(node "$CTRL" next "$SCRATCH/no_such_job" 2>&1 | grep -c 'adws-run\.js:')"
assert "the uncaught ENOENT still reproduces, leaking this many controller frames" "$FRAMES" "4"
WORD="$(node -e 'const w=["zero","one","two","three","four","five","six","seven","eight"];process.stdout.write(w[Number(process.argv[1])]||String(process.argv[1]))' "$FRAMES")"
assert "and finding 40 states that number in words, not another" \
  "$(grep -c "leaked $WORD \`adws-run.js\` line numbers" "$REPO/spike/adws-controller/FINDINGS.md")" "1"

echo
echo "### S8 — syntax + NUL sweep (finding 15)"
BAD=0
for f in "$REPO"/spike/adws-controller/*.js; do node --check "$f" >/dev/null 2>&1 || BAD=$((BAD+1)); done
assert "spike/ files that fail a syntax check" "$BAD" "0"
NUL="$(node -e 'const fs=require("fs"),p=require("path");const d=process.argv[1];
let bad=0;for(const f of fs.readdirSync(d)){const s=p.join(d,f);if(fs.statSync(s).isFile()&&fs.readFileSync(s).includes(0))bad++}
process.stdout.write(String(bad))' "$REPO/spike/adws-controller")"
assert "spike/ files containing a NUL byte" "$NUL" "0"

echo
echo "### $((PASSES+FAILS)) assertions run, $FAILS failed."
if [ "$FAILS" -eq 0 ]; then
  cat <<'EOF'
### STEP 5 (prerequisite) PASS — the controller emits `consensus`, `reproduce` and the
###   operator dissent-resolution action; a Critic fail reproduces before it routes and
###   spends nothing when it does not reproduce; the four resolutions carry the F-3/F-6/F-37
###   budgets and tier sources; an Advocate that resolves its own dissent is refused, in the
###   one place the scorer would have believed it; an overridden dissent hands off to the
###   Critic rather than answering itself; an integrity breach actually terminates; a
###   one-voter round never gates in EITHER mode; and replay is otherwise unchanged.
###
### NOT established here: that the SKETCH's prose for these branches is sufficient to
###   orchestrate from. That is §12.4's live run, and no model was in this loop.
EOF
  exit 0
fi
echo "### STEP 5 FAIL — $FAILS assertion(s) failed"
exit 1
