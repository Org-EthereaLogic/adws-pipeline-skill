#!/usr/bin/env bash
# STEP 4 driver — the Q5 line-delta and the go/no-go. THROWAWAY.
#
# Step 4 is a MEASUREMENT, so this driver's job is to make the measurement checkable rather
# than asserted. It does three things:
#
#   S1  drives one complete seven-phase run and measures the handshake by BYTE, so the
#       "is the handshake cheap" half of Q5 rests on a full run rather than on step 3's
#       three sampled messages.
#   S2  runs measure-delta.js and asserts the structural properties that make its numbers
#       mean anything — the classification tiles every file, every coverage anchor still
#       matches adws-run.js, and the reported X/Y/Z agree with the files on disk.
#   S3  asserts the go/no-go's own arithmetic: the reduction, the break-even, and the
#       headroom between them. If a later edit makes the handshake expensive or the thin
#       interface fat, THESE assertions fail — the verdict is not a sentence in a document.
#   S4  syntax + NUL sweep over the spike tree (finding 15; `make ci` does not see spike/).
#
# What this driver does NOT establish is stated in FINDINGS.md finding 25: it measures the
# INSTRUCTION mass the orchestrator loads, never the reasoning it spends. That half of Q5
# needs two live runs of the same contract and is not in the time-box.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CTRL="$REPO/spike/adws-controller/adws-run.js"
MEASURE="$REPO/spike/adws-controller/measure-delta.js"
MKTRACE="$REPO/spike/adws-controller/mk-risk-trace.js"
FIX="$REPO/spike/adws-controller/fixtures"
HANDSHAKE="$REPO/spike/adws-controller/.step4-handshake.json"
SCRATCH="$(mktemp -d)"

FAILS=0
PASSES=0
assert() { # <label> <actual> <expected>
  if [ "$2" = "$3" ]; then printf '  PASS  %s (%s)\n' "$1" "$2"; PASSES=$((PASSES+1))
  else printf '  FAIL  %s: expected [%s], got [%s]\n' "$1" "$3" "$2"; FAILS=$((FAILS+1)); fi
}
assert_ge() { # <label> <actual> <floor>
  if [ "$2" -ge "$3" ] 2>/dev/null; then printf '  PASS  %s (%s >= %s)\n' "$1" "$2" "$3"; PASSES=$((PASSES+1))
  else printf '  FAIL  %s: [%s] is below [%s]\n' "$1" "$2" "$3"; FAILS=$((FAILS+1)); fi
}
assert_le() { # <label> <actual> <ceiling>
  if [ "$2" -le "$3" ] 2>/dev/null; then printf '  PASS  %s (%s <= %s)\n' "$1" "$2" "$3"; PASSES=$((PASSES+1))
  else printf '  FAIL  %s: [%s] is above [%s]\n' "$1" "$2" "$3"; FAILS=$((FAILS+1)); fi
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s);const k=process.argv[1].split(".");let x=v;for(const p of k)x=x==null?x:x[p];process.stdout.write(x===undefined?"<absent>":String(x))}catch(e){process.stdout.write("<unparseable>")}})' "$1"; }

echo "### S1 — handshake volume over ONE COMPLETE seven-phase run"
# Every controller message of the run is appended to $LOG, so the total is the real
# transcript volume the orchestrator would carry, not three sampled messages scaled up.
LOG="$SCRATCH/handshake.txt"
COUNT="$SCRATCH/msgs"
: > "$LOG"; printf '0' > "$COUNT"
# The counter lives in a FILE, not a variable: `cap` is called inside $( ) for the verbs
# whose output is consumed, and a subshell's increment never reaches the parent — the first
# run of this driver reported 14 messages for a 16-message run for exactly that reason.
cap() { # run a controller verb, append its stdout to the transcript, echo it back
  local o rc; o="$(node "$CTRL" "$@")"; rc=$?
  printf '%s\n' "$o" >> "$LOG"
  printf '%s' "$(( $(cat "$COUNT") + 1 ))" > "$COUNT"
  printf '%s' "$o"; return $rc
}
J="$(cap init "$FIX/contract.json" "$SCRATCH/run" | jget job_dir)"
mktest() { local d; d="$(mktemp -d "$SCRATCH/mock_XXXXXX")"; mkdir -p "$d/consensus"
  cp "$FIX/$1/phase_output.json" "$FIX/$1/phase_log.md" "$d/"
  cp "$FIX/consensus_clean/critic.json" "$FIX/consensus_clean/advocate.json" "$d/consensus/"; printf '%s' "$d"; }
mkreview() { local d; d="$(mktemp -d "$SCRATCH/review_XXXXXX")"; cp -R "$FIX/review/." "$d/"
  local last; last="$(ls -d "$1"/build/attempt_* | sort -V | tail -1)"
  node "$MKTRACE" "$last/phase_output.json" "$d" >/dev/null || return 1; printf '%s' "$d"; }

for spec in "plan:$FIX/plan" "build:$FIX/build_initial" "test:MKTEST" "review:MKREVIEW" \
            "document:$FIX/document" "ship:$FIX/ship" "verify:$FIX/verify"; do
  ph="${spec%%:*}"; src="${spec#*:}"
  [ "$src" = "MKTEST" ] && src="$(mktest test_pass)"
  [ "$src" = "MKREVIEW" ] && src="$(mkreview "$J")"
  cap next "$J" >/dev/null
  cap record "$J" "$ph" 1 --from "$src" >/dev/null
done
# finalize's exit code IS the verdict (0/10/1/2 = PROMOTE / with-warnings / RETRY /
# QUARANTINE), so it is asserted as a code, not parsed out of the text.
cap finalize "$J" --report "$REPO/adws-pipeline/scripts/execution-report.js" >/dev/null 2>&1
assert "seven-phase run promotes (scorer exit 0)" "$?" "0"
assert "run_manifest final_status" \
  "$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1]+"/run_manifest.json","utf8")).final_status))' "$J")" \
  "completed"

BYTES="$(wc -c < "$LOG" | tr -d ' ')"
MSGS="$(cat "$COUNT")"
# Model TURNS are the §9 unit, and they are not the message count: `record` batches into the
# following `next` in one turn, so a phase costs next+dispatch+record = 2 turns, plus init
# and finalize. This is the same accounting step 3 measured on the plan phase alone.
TURNS=$(( 7 * 2 + 2 ))
# `controller_bytes` stamps the adws-run.js this was measured against. measure-delta.js
# compares it and reports the handshake as STALE rather than quoting it if the controller has
# changed since — a committed measurement that a later edit can silently invalidate is the
# exact failure mode findings 12-23 keep naming.
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({total_bytes:+process.argv[2],messages:+process.argv[3],phases:7,model_turns:+process.argv[4],controller_bytes:fs.statSync(process.argv[5]).size,measured_over:"one complete seven-phase green run, all controller stdout concatenated"},null,2)+"\n")' \
  "$HANDSHAKE" "$BYTES" "$MSGS" "$TURNS" "$CTRL"
printf '  handshake: %s bytes over %s controller messages, %s model turns\n' "$BYTES" "$MSGS" "$TURNS"
assert "one init + 7*(next+record) + finalize"  "$MSGS" "16"
assert "model turns per phase"                  "$(( (TURNS - 2) / 7 ))" "2"
assert_le "turns per phase within the plan's bar of ~2" "$(( (TURNS - 2) / 7 ))" "2"

echo
echo "### S2 — the measurement's structural invariants"
node "$MEASURE" > "$SCRATCH/report.txt" 2>&1
assert "measure-delta.js exits clean (tiling + anchors hold)" "$?" "0"
M="$(node "$MEASURE" --json)"
assert "no structural errors" "$(printf '%s' "$M" | jget errors)" "0"
# The three figures Q5 names, cross-checked against the files rather than against the report.
assert "Y matches adws-run.js on disk" "$(printf '%s' "$M" | jget y_lines)" \
  "$(wc -l < "$REPO/spike/adws-controller/adws-run.js" | tr -d ' ')"
assert "Z matches the thin sketch on disk" "$(printf '%s' "$M" | jget z_lines)" \
  "$(wc -l < "$REPO/spike/adws-controller/thin-skill-sketch.md" | tr -d ' ')"
assert "Q5-scope prose total is SKILL.md + phase-gates.md" "$(printf '%s' "$M" | jget prose_total_q5)" \
  "$(( $(wc -l < "$REPO/adws-pipeline/SKILL.md") + $(wc -l < "$REPO/adws-pipeline/references/phase-gates.md") ))"
# Every classified line is accounted for in exactly one class.
X="$(printf '%s' "$M" | jget x_full_scope)"; A="$(printf '%s' "$M" | jget agent_facing)"
K="$(printf '%s' "$M" | jget kept)"; TOT="$(printf '%s' "$M" | jget prose_total_full)"
assert "C + A + (K+S) = every line of all four documents" "$(( X + A + K ))" "$TOT"

echo
echo "### S3 — the go/no-go arithmetic"
BEFORE="$(printf '%s' "$M" | jget context_before_bytes)"
AFTER="$(printf '%s' "$M" | jget context_after_bytes)"
FLOOR_B="$(printf '%s' "$M" | jget context_floor_before_bytes)"
FLOOR_A="$(printf '%s' "$M" | jget context_floor_after_bytes)"
BE="$(printf '%s' "$M" | jget breakeven_handshake_bytes_per_run)"
printf '  orchestrator instruction bytes  %s -> %s   (floor %s -> %s)\n' "$BEFORE" "$AFTER" "$FLOOR_B" "$FLOOR_A"
# A reduction on BOTH readings — the realistic one and the one where the model never opens a
# reference file. If either flips, the go/no-go flips with it.
assert_ge "realistic reading is a reduction"   "$(( BEFORE - AFTER ))"       "1"
assert_ge "conservative floor is a reduction"  "$(( FLOOR_B - FLOOR_A ))"    "1"
# §9's kill criterion, as arithmetic: the handshake must stay far under the break-even. 5x is
# the margin below which this stops being a decision and starts being a coin flip.
assert_ge "handshake headroom against break-even is >= 5x" "$(( BE / BYTES ))" "5"
assert_ge "reduction is at least half the before-mass"     "$(( (BEFORE - AFTER) * 2 / BEFORE ))" "1"
# The thin interface has to actually carry the residue. This is a PRESENCE check, not a
# sufficiency proof — it cannot show the sketch says enough, only that it does not silently
# drop a named human-decision boundary. Sufficiency is finding 24's declared limit.
for kw in "dissent" "requires_human_approval_before_ship" "Delegated push" "reproduction.command" \
          "pipeline-mechanics preamble" "PARALLEL" "NOT RUN" "F-11" "intake validation"; do
  if grep -qF "$kw" "$REPO/spike/adws-controller/thin-skill-sketch.md"; then
    printf '  PASS  thin interface still names: %s\n' "$kw"; PASSES=$((PASSES+1))
  else printf '  FAIL  thin interface dropped: %s\n' "$kw"; FAILS=$((FAILS+1)); fi
done
# The other direction, and this one IS decidable: every action the controller can emit must
# have a branch in the interface. The first cut of the sketch handled `consensus` and
# `reproduce`, which the controller never emits, and omitted `finalize`, which it does — an
# interface measured against an imagined controller measures nothing.
EMITS="$(grep -o "action: '[a-z]*'" "$CTRL" | sed "s/action: '//;s/'//" | sort -u)"
for act in $EMITS; do
  if grep -qF "\"action\":\"$act\"" "$REPO/spike/adws-controller/thin-skill-sketch.md"; then
    printf '  PASS  interface handles emitted action: %s\n' "$act"; PASSES=$((PASSES+1))
  else printf '  FAIL  controller emits "%s" with no branch in the interface\n' "$act"; FAILS=$((FAILS+1)); fi
done

echo
echo "### S4 — syntax + NUL sweep over the spike tree (finding 15)"
for f in "$REPO"/spike/adws-controller/*.js; do
  node --check "$f" >/dev/null 2>&1 && { printf '  PASS  syntax %s\n' "$(basename "$f")"; PASSES=$((PASSES+1)); } \
    || { printf '  FAIL  syntax %s\n' "$(basename "$f")"; FAILS=$((FAILS+1)); }
done
# bash cannot hold a NUL in a variable, so `grep -qU $'\x00'` searches for the EMPTY pattern
# and matches every file. This is the python3 form run-step2.sh settled on.
NUL="$(node -e 'const fs=require("fs"),p=require("path");const d=process.argv[1];
let bad=[];for(const f of fs.readdirSync(d)){const s=p.join(d,f);if(fs.statSync(s).isFile()&&fs.readFileSync(s).includes(0))bad.push(f)}
process.stdout.write(String(bad.length))' "$REPO/spike/adws-controller")"
assert "no NUL bytes in the spike tree" "$NUL" "0"

echo
if [ "$FAILS" -eq 0 ]; then echo "STEP 4 PASS — $PASSES assertions"; exit 0
else echo "STEP 4 FAIL — $FAILS of $((PASSES+FAILS)) assertions failed"; exit 1; fi
