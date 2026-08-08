#!/usr/bin/env bash
# gate.sh — TIER 1 local CI: the fast deterministic host gate (zero-LLM, ~seconds).
#
# Blocking (exit 0 iff every step passes). This is the pre-push gate and the quick
# inner-loop check for adws-pipeline-skill. It runs the repo's real suites — the 108
# validator-parity fixtures, 21 report-verdict fixtures, 7 stability-gate fixtures,
# 3 provenance-schema fixtures, the SC-3 contract micro-drill, and the CLI-contract
# suite over all 11 shipped CLIs — plus a syntax floor, shell lint, the guard-ablation
# sweep, and three skill-repo lints. The clean-room Node 20/24 matrix lives in orb-ci.sh
# (Tier 2); local-LLM review lives in review.sh (Tier 3).
#
# Usage:  make local-ci   (or: bash scripts/local-ci/gate.sh)
# Evidence: ci_logs/<run_id>.gate.log + a line in ci_logs/local_ci.jsonl.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/local-ci/lib.sh
. "$here/lib.sh"
repo_root="$(cd "$here/../.." && pwd)"
cd "$repo_root" || exit 1
mkdir -p ci_logs

# Preflight — Tier 1 hard-requires node + shellcheck (operator: brew install shellcheck).
for tool in node shellcheck; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[gate] ERROR: '$tool' not on PATH — Tier 1 requires it (see scripts/local-ci/README.md)" >&2
    exit 2
  fi
done

run_id="$(ci_run_id)"
commit="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
branch="$(git branch --show-current 2>/dev/null || echo unknown)"
dirty="$(ci_dirty)"
log="ci_logs/${run_id}.gate.log"
: > "$log"

overall=pass
steps=()

run_step() {
  # run_step <name> <cmd...>
  name="$1"; shift
  start=$(date +%s)
  echo "=== [gate] $name ===" >>"$log"
  if "$@" >>"$log" 2>&1; then st=pass; else st=fail; overall=fail; fi
  dur=$(( $(date +%s) - start ))
  echo "[gate] $name -> $(ci_upper "$st") (${dur}s)"
  steps+=("{\"step\":\"$name\",\"status\":\"$st\",\"duration_s\":$dur}")
}

# The static-floor steps need a little logic, so they are functions (bash-3.2-safe).
node_check() {
  # node --check every *.js under adws-pipeline/ and parity/, and every *.mjs the
  # local-ci harness owns (syntax floor). The .mjs lints were previously unchecked —
  # M-5a added two more of them, so the floor now covers what it is meant to cover.
  # Newline-delimited via heredoc (not `for in $(find)`) so a bad file fails the step
  # and the loop is not a subshell (rc survives). Paths here never contain spaces.
  rc=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if ! node --check "$f"; then echo "node --check FAILED: $f"; rc=1; fi
  done <<EOF
$(find adws-pipeline parity -name '*.js')
$(find scripts/local-ci -name '*.mjs')
EOF
  return $rc
}

shell_lint() {
  # Lint every shell script the repo owns (hard-required). Block on warning+error;
  # info/style (e.g. SC2012, SC2086) are advisory, not gate failures.
  rc=0
  files=(install.sh .githooks/pre-push)
  for f in scripts/local-ci/*.sh; do files+=("$f"); done
  for f in "${files[@]}"; do
    [ -f "$f" ] || continue
    if ! bash -n "$f"; then echo "bash -n FAILED: $f"; rc=1; fi
    if ! shellcheck --severity=warning -x "$f"; then echo "shellcheck FAILED: $f"; rc=1; fi
  done
  return $rc
}

# Deterministic suites (must stay green: 108 / 21 / 7 + provenance 3 + SC-3 drill
# + the CLI contract over 9 validators and 2 scripts).
run_step "parity"        node parity/run-parity.js
run_step "report"        node parity/execution-report-fixtures/run-tests.js
run_step "entropy"       node parity/entropy-gate-fixtures/run-tests.js
run_step "provenance"    node parity/provenance-fixtures/run-tests.js
run_step "sc3-drill"     node parity/sc3-micro-drill/run-tests.js
# CLI contract: the nine duplicated wrapper copies and stdin mode, which the parity
# fixtures cannot reach (they call execute() directly via exec-one.js).
run_step "cli-contract"  node parity/cli-contract/run-tests.js
# Anti-vacuity: does the fixture corpus actually PIN the rules it appears to test?
run_step "guard-ablation" node scripts/local-ci/guard-ablation.mjs
# Static floors.
run_step "node-check"    node_check
run_step "shell-lint"    shell_lint
# Skill-repo lints.
run_step "frontmatter"   node scripts/local-ci/frontmatter-lint.mjs
run_step "requires"      node scripts/local-ci/requires-lint.mjs
run_step "cli-block"     node scripts/local-ci/cli-block-lint.mjs

legs_json="$(IFS=,; echo "${steps[*]}")"
record="$(printf '{"event":"gate","run_id":"%s","git_commit":"%s","branch":"%s","dirty":%s,"overall":"%s","steps":[%s]}' \
  "$run_id" "$commit" "$branch" "$dirty" "$overall" "$legs_json")"
ci_emit_jsonl ci_logs/local_ci.jsonl "$record"

echo "[gate] overall: $(ci_upper "$overall")  (full log: $log)"
echo "[gate] evidence record (paste into the PR body):"
echo "$record"
[ "$overall" = pass ]
