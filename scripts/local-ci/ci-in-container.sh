#!/usr/bin/env bash
# ci-in-container.sh — runs INSIDE the Tier-2 OrbStack container (Debian, bash 5).
#
# Escapes the dirty bind-mounted /repo by taking a clean shallow clone of HEAD, then runs
# the SAME Tier-1 gate (scripts/local-ci/gate.sh) there. Identical gate, different runtime:
# any host-only pass (macOS/BSD-coreutils quirk, bash-3.2-ism that breaks on bash 5, Node
# drift) surfaces here. Invoked by orb-ci.sh via `docker run`; its exit code is the leg
# verdict. NODE_LABEL (e.g. "20"/"24") is passed in for the log header only.
set -uo pipefail

label="${NODE_LABEL:-?}"
echo "=== [container] node $(node --version) (matrix leg: node${label}), bash ${BASH_VERSION} ==="

# Trust the bind mount and the clone regardless of uid ownership mismatch.
git config --global --add safe.directory '*' 2>/dev/null || true

SRC="$(mktemp -d)"
# Clean shallow clone of HEAD — committed state only (what a push would carry), no host
# artifacts/, ci_logs/, or worktrees.
if ! git clone --quiet --depth 1 "file:///repo/.git" "$SRC" 2>/dev/null \
   && ! git clone --quiet --depth 1 /repo "$SRC"; then
  echo "[container] ERROR: could not clone /repo HEAD into $SRC" >&2
  exit 1
fi

cd "$SRC" || exit 1
echo "[container] running Tier-1 gate against clean clone at HEAD ($(git rev-parse --short HEAD 2>/dev/null || echo '?'))"

# Reuse the exact Tier-1 gate. Its own ci_logs/ lands inside the throwaway clone; the
# container's stdout is captured by orb-ci.sh into ci_logs/<run_id>.orb.log on the host.
exec bash scripts/local-ci/gate.sh
