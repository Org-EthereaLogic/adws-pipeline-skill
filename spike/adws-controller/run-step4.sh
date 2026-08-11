#!/usr/bin/env bash
# STEP 4 driver — the Q5 line-delta and the go/no-go. THROWAWAY.
#
# Step 4 is a MEASUREMENT, so this driver's job is to make the measurement checkable rather
# than asserted. It does five things:
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
#   S5  the freshness stamp regression — a same-length controller edit must read STALE.
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
# Model TURNS are the §9 unit, and they are not the message count. THIS VALUE IS INFERRED,
# not measured: the run above is driven from a shell over canned phase outputs, so no model
# was ever in the loop. The accounting comes from step 3's LIVE plan dispatch — `record`
# batches into the following `next` in one turn, so a phase costs next+dispatch+record = 2
# turns, plus init and finalize. An audit was right to flag the first cut for reporting it
# beside the measured figures without saying which was which.
TURNS=$(( 7 * 2 + 2 ))
# `controller_sha256` stamps the adws-run.js this was measured against. measure-delta.js
# compares it and reports the handshake as STALE rather than quoting it if the controller has
# changed since. This was `controller_bytes` until S5 below — see finding 27.
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({total_bytes:+process.argv[2],messages:+process.argv[3],phases:7,model_turns:+process.argv[4],controller_sha256:require("crypto").createHash("sha256").update(fs.readFileSync(process.argv[5])).digest("hex"),measured_over:"one complete seven-phase green run, all controller stdout concatenated"},null,2)+"\n")' \
  "$HANDSHAKE" "$BYTES" "$MSGS" "$TURNS" "$CTRL"
printf '  handshake: %s bytes over %s controller messages (MEASURED); %s model turns (INFERRED)\n' "$BYTES" "$MSGS" "$TURNS"
assert "one init + 7*(next+record) + finalize"  "$MSGS" "16"
assert_le "inferred turns per phase within the plan's bar of ~2" "$(( (TURNS - 2) / 7 ))" "2"

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
BE_C="$(printf '%s' "$M" | jget breakeven_handshake_bytes_per_run_conservative)"
printf '  full-document  %s -> %s (+hs %s)\n' "$BEFORE" "$AFTER" "$(( AFTER + BYTES ))"
printf '  no-reference   %s -> %s (+hs %s)\n' "$FLOOR_B" "$FLOOR_A" "$(( FLOOR_A + BYTES ))"
# BOTH scenarios must be a reduction WITH the handshake included. An earlier cut asserted the
# optimistic scenario's headroom beside the conservative scenario's reduction, which flattered
# both; an independent audit caught it. The honest bracket is asserted at both ends.
assert_ge "full-document reading is a reduction, handshake included"  "$(( BEFORE - AFTER - BYTES ))"   "1"
assert_ge "no-reference reading is a reduction, handshake included"   "$(( FLOOR_B - FLOOR_A - BYTES ))" "1"
# §9's kill criterion, as arithmetic, at the PESSIMISTIC end. 2x is the floor below which the
# margin is inside the noise of §9's own "~2-3 round trips" bar and this stops being a
# decision. The optimistic end is reported, never relied on.
assert_ge "worst-case handshake headroom is >= 2x" "$(( BE_C / BYTES ))" "2"
assert_ge "best-case handshake headroom is >= 5x"  "$(( BE / BYTES ))"   "5"
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
echo "### S5 — the freshness stamp is a digest, not a size (finding 27 regression)"
# The first cut compared FILE SIZE. CodeRabbit and an independent audit each found the hole
# the same day, with the same probe: `action: 'finalize'` -> `action: 'terminal'` is the same
# LENGTH, so the size matched, the check passed, and a stale handshake was reported for a
# controller that no longer produced it. This asserts the probe now fails closed.
BAK="$SCRATCH/adws-run.js.bak"
cp "$CTRL" "$BAK"
trap 'cp "$BAK" "$CTRL" 2>/dev/null' EXIT   # never leave a mutated controller behind
sed "s/action: 'finalize', note:/action: 'terminal', note:/" "$BAK" > "$CTRL"
assert "the probe actually changed the controller" \
  "$(cmp -s "$CTRL" "$BAK" && echo same || echo differs)" "differs"
assert "and did so at IDENTICAL byte length (the old check's blind spot)" \
  "$(wc -c < "$CTRL" | tr -d ' ')" "$(wc -c < "$BAK" | tr -d ' ')"
assert "measure-delta reports STALE on a same-length edit" \
  "$(node "$MEASURE" | grep -c 'handshake volume: STALE')" "1"
assert "and quotes no handshake figure while stale" \
  "$(node "$MEASURE" --json | jget handshake)" "null"
cp "$BAK" "$CTRL"; trap - EXIT
assert "controller restored byte-for-byte" \
  "$(cmp -s "$CTRL" "$BAK" && echo same || echo differs)" "same"
# An absent digest is stale too — an old artifact must not read as a fresh one.
cp "$HANDSHAKE" "$SCRATCH/hs.bak"
node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p));delete j.controller_sha256;fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$HANDSHAKE"
assert "a handshake record with NO digest is stale, not fresh" \
  "$(node "$MEASURE" | grep -c 'handshake volume: STALE')" "1"
cp "$SCRATCH/hs.bak" "$HANDSHAKE"
assert "handshake record restored" "$(node "$MEASURE" --json | jget handshake.total_bytes)" "$BYTES"

echo
if [ "$FAILS" -eq 0 ]; then echo "STEP 4 PASS — $PASSES assertions"; exit 0
else echo "STEP 4 FAIL — $FAILS of $((PASSES+FAILS)) assertions failed"; exit 1; fi
