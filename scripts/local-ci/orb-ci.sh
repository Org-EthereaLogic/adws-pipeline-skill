#!/usr/bin/env bash
# orb-ci.sh — TIER 2 local CI: the clean-room Node 20/24 matrix in OrbStack/Docker.
#
# Closes the F-13 host-runtime blind spot: re-runs the Tier-1 gate inside a clean
# Debian/bash-5 userland (none of the macOS host's brew tools) once per Node version, so a
# change that passes on macOS bash 3.2 but would break on Linux bash 5 / a different Node
# is caught before it leaves the machine. Blocking (exit 0 iff every leg passes).
#
# Usage:  make ci-orb   (or: bash scripts/local-ci/orb-ci.sh)
# Env:    NODE_VERSIONS (default "20 24"), ORB_PLATFORM (default from `uname -m`).
# Evidence: ci_logs/<run_id>.orb.log + a line in ci_logs/orb_ci.jsonl.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/local-ci/lib.sh
. "$here/lib.sh"
repo_root="$(cd "$here/../.." && pwd)"
cd "$repo_root" || exit 1
mkdir -p ci_logs

if ! command -v docker >/dev/null 2>&1; then
  echo "[orb] ERROR: 'docker' not on PATH — Tier 2 needs OrbStack/Docker (see scripts/local-ci/README.md)" >&2
  exit 2
fi

case "$(uname -m)" in
  arm64|aarch64) platform="linux/arm64" ;;
  *)             platform="linux/amd64" ;;
esac
platform="${ORB_PLATFORM:-$platform}"
NODE_VERSIONS="${NODE_VERSIONS:-20 24}"

run_id="$(ci_run_id)"
commit="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
branch="$(git branch --show-current 2>/dev/null || echo unknown)"
common_git_dir="$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd)"
log="ci_logs/${run_id}.orb.log"
: > "$log"

overall=pass
legs=()

read -ra versions <<< "$NODE_VERSIONS"
for v in ${versions[@]+"${versions[@]}"}; do
  img="adws-pipeline-localci:node${v}"

  echo "=== [orb] build $img ($platform) ===" >>"$log"
  if docker build --platform "$platform" --build-arg "NODE_VERSION=${v}" \
       -t "$img" -f scripts/local-ci/Dockerfile.ci scripts/local-ci >>"$log" 2>&1; then
    bst=pass
  else
    bst=fail; overall=fail
  fi

  start=$(date +%s)
  echo "=== [orb] run  $img ===" >>"$log"
  if [ "$bst" = pass ] && docker run --rm --platform "$platform" \
       --user "$(id -u):$(id -g)" -e HOME=/tmp -e "NODE_LABEL=${v}" \
       -e "CI_COMMIT=$commit" \
       -v "$repo_root:/repo" -v "$common_git_dir:/repo-git-common:ro" \
       -w /repo "$img" >>"$log" 2>&1; then
    st=pass
  else
    st=fail; overall=fail
  fi
  dur=$(( $(date +%s) - start ))

  echo "[orb] node${v}: build=$(ci_upper "$bst") run=$(ci_upper "$st") (${dur}s)"
  legs+=("{\"node\":\"$v\",\"build\":\"$bst\",\"status\":\"$st\",\"duration_s\":$dur}")
done

legs_json="$(IFS=,; echo "${legs[*]}")"
record="$(printf '{"event":"orb_ci","run_id":"%s","git_commit":"%s","branch":"%s","platform":"%s","overall":"%s","legs":[%s],"log":"%s"}' \
  "$run_id" "$commit" "$branch" "$platform" "$overall" "$legs_json" "$log")"
ci_emit_jsonl ci_logs/orb_ci.jsonl "$record"

echo "[orb] overall: $(ci_upper "$overall")  (full log: $log)"
echo "[orb] evidence record (paste into the PR body):"
echo "$record"
[ "$overall" = pass ]
