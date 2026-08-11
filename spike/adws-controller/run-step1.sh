#!/usr/bin/env bash
# STEP 1 go/no-go driver. Drives the controller's next/record loop over MOCKED dispatch
# outputs (the golden fixture's agent-produced files), then scores the controller-generated
# tree with the UNMODIFIED execution-report.js. Success = decision PROMOTE / exit 0.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CTRL="$REPO/spike/adws-controller/adws-run.js"
SCORER="$REPO/adws-pipeline/scripts/execution-report.js"
MKTRACE="$REPO/spike/adws-controller/mk-risk-trace.js"
GOLDEN="$REPO/parity/execution-report-fixtures/promote_clean/artifacts/job-2f8c1a"
SCRATCH="$(mktemp -d)"
EVID="$SCRATCH/artifacts"
PHASES=(plan build test review document ship verify)

# The golden fixture's review attempt records no `review-risk-assess` trace — it is a
# MINIMAL fixture for a tolerant reader, not a complete run. FR-12 keys the
# document/ship/verify tiers to the risk that validator recomputes, and the controller
# refuses to substitute contract risk and mislabel the source, so the mock review dispatch
# has to carry what a real one would. mk-risk-trace.js runs the REAL validator on the
# golden BUILD output and transcribes its stdout — no verdict is invented here.
MOCK_REVIEW="$SCRATCH/mock_review"
mkdir -p "$MOCK_REVIEW"
cp -R "$GOLDEN/review/attempt_1/." "$MOCK_REVIEW/"
node "$MKTRACE" "$GOLDEN/build/attempt_1/phase_output.json" "$MOCK_REVIEW"

echo "### scratch: $SCRATCH"
echo "### 1) init from the golden contract"
INIT_JSON="$(node "$CTRL" init "$GOLDEN/task_contract_snapshot.json" "$EVID")"
echo "    $INIT_JSON"
JOBDIR="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).job_dir)' "$INIT_JSON")"

echo "### 2) drive next -> record for each phase (mock dispatch = golden attempt_1)"
for _ in ${PHASES[@]+"${PHASES[@]}"}; do   # F-13 safe idiom (macOS bash 3.2 under set -u)
  ACTION="$(node "$CTRL" next "$JOBDIR")"
  PHASE="$(node -e 'const a=JSON.parse(process.argv[1]); process.stdout.write(a.phase||"")' "$ACTION")"
  KIND="$(node -e 'const a=JSON.parse(process.argv[1]); process.stdout.write(a.action)' "$ACTION")"
  if [ "$KIND" != "dispatch" ]; then echo "    unexpected: $ACTION"; break; fi
  FROM="$GOLDEN/$PHASE/attempt_1"
  [ "$PHASE" = "review" ] && FROM="$MOCK_REVIEW"
  printf '    next -> dispatch %-9s | record --from %s\n' "$PHASE" "$(basename "$FROM")"
  node "$CTRL" record "$JOBDIR" "$PHASE" 1 --from "$FROM" >/dev/null
done

echo "### 3) next should now say finalize:"
node "$CTRL" next "$JOBDIR" | sed 's/^/    /'

echo "### 4) finalize -> run the UNMODIFIED execution-report.js"
set +e
node "$CTRL" finalize "$JOBDIR" --report "$SCORER" >"$SCRATCH/out.txt" 2>"$SCRATCH/err.txt"
EXIT=$?
set -e

echo "### scorer verdict from controller-generated tree:"
node -e '
  const fs=require("fs");
  const r=JSON.parse(fs.readFileSync(process.argv[1]+"/execution_report.json","utf8"));
  console.log("    decision      :", r.decision);
  console.log("    exit_code     :", r.exit_code, "(process exit:", process.argv[2]+")");
  console.log("    warn_flag     :", r.warn_flag);
  console.log("    gates         :", r.gates.map(g=>g.gate+"="+g.result).join(", "));
' "$JOBDIR" "$EXIT"

echo "### 5) prove the manifests are CONTROLLER-generated, not copied from golden:"
node -e '
  const fs=require("fs"); const j=process.argv[1];
  const rd=p=>JSON.parse(fs.readFileSync(j+"/"+p+"/attempt_1/phase_manifest.json","utf8"));
  const plan=rd("plan"), doc=rd("document");
  console.log("    plan.agent (writer contract adws-…) :", plan.agent);
  console.log("    plan.provenance                     :", JSON.stringify(plan.provenance));
  console.log("    plan.tier_input   (FR-12 pre-review):", JSON.stringify(plan.tier_input));
  console.log("    document.tier_input (FR-12 post-rev):", JSON.stringify(doc.tier_input));
  const run=JSON.parse(fs.readFileSync(j+"/run_manifest.json","utf8"));
  console.log("    run.risk_level / recomputed         :", run.risk_level, "/", run.recomputed_risk_level);
' "$JOBDIR"

echo "### 6) writer-floor conformance of the controller-generated tree:"
node "$REPO/spike/adws-controller/verify-canonical.js" "$JOBDIR" | sed 's/^/    /'

echo
if [ "$EXIT" -eq 0 ]; then
  echo "### RESULT: PASS — controller-generated evidence scored PROMOTE (exit 0) by the untouched scorer."
else
  echo "### RESULT: exit $EXIT — see $SCRATCH/{out,err}.txt"
fi
echo "### job dir kept at: $JOBDIR"
