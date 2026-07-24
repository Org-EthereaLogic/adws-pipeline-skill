#!/usr/bin/env bash
# ci-in-container.sh — runs INSIDE the Tier-2 OrbStack container (Debian, bash 5).
#
# Escapes the dirty bind-mounted /repo by cloning the shared Git database and checking out
# the exact CI_COMMIT, then runs the SAME Tier-1 gate (scripts/local-ci/gate.sh) there.
# Mounting the common database separately supports both primary checkouts and linked
# worktrees whose `.git` file contains a host-only absolute path. Identical gate, different
# runtime: any host-only pass (macOS/BSD-coreutils quirk, bash-3.2-ism that breaks on bash 5,
# Node drift) surfaces here. Invoked by orb-ci.sh via `docker run`; its exit code is the leg
# verdict. NODE_LABEL (e.g. "20"/"24") is passed in for the log header only.
set -uo pipefail

label="${NODE_LABEL:-?}"
echo "=== [container] node $(node --version) (matrix leg: node${label}), bash ${BASH_VERSION} ==="

# Trust the bind mount and the clone regardless of uid ownership mismatch.
git config --global --add safe.directory '*' 2>/dev/null || true

SRC="$(mktemp -d)"
# Clean checkout of the requested commit — committed state only (what a push would carry),
# no host artifacts/, ci_logs/, or uncommitted worktree files.
if [ -z "${CI_COMMIT:-}" ]; then
  echo "[container] ERROR: CI_COMMIT is required" >&2
  exit 1
fi
if ! git clone --quiet --no-checkout file:///repo-git-common "$SRC" 2>/dev/null \
   || ! git -C "$SRC" checkout --quiet --detach "$CI_COMMIT" 2>/dev/null; then
  echo "[container] ERROR: could not check out $CI_COMMIT from shared Git database" >&2
  exit 1
fi

cd "$SRC" || exit 1
echo "[container] running Tier-1 gate against clean clone at HEAD ($(git rev-parse --short HEAD 2>/dev/null || echo '?'))"

# Reuse the exact Tier-1 gate. Its own ci_logs/ lands inside the throwaway clone; the
# container's stdout is captured by orb-ci.sh into ci_logs/<run_id>.orb.log on the host.
exec bash scripts/local-ci/gate.sh
