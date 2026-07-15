#!/usr/bin/env bash
# install.sh — install/port the ADWS pipeline skill + agents into a project.
#
# Usage:
#   ./install.sh /path/to/your/project   # into <project>/.claude/
#   ./install.sh --global                # into ~/.claude/ (all projects)
#   ./install.sh                         # into the current directory's .claude/
#
# Idempotent: re-running overwrites the installed copies with this repo's version.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- resolve destination .claude root ---------------------------------------
case "${1:-.}" in
  --global|-g) DEST_ROOT="$HOME" ;;
  --help|-h)
    sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0 ;;
  *) DEST_ROOT="$(cd "${1:-.}" 2>/dev/null && pwd || true)"
     if [ -z "${DEST_ROOT}" ]; then echo "error: target directory '${1:-.}' does not exist" >&2; exit 1; fi ;;
esac

if [ "${DEST_ROOT}" = "${SRC}" ]; then
  echo "error: target is this skill's own repo — pick a different project (or --global)." >&2
  exit 1
fi

CLAUDE_DIR="${DEST_ROOT}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
AGENTS_DIR="${CLAUDE_DIR}/agents"

# --- install -----------------------------------------------------------------
mkdir -p "${SKILLS_DIR}" "${AGENTS_DIR}"
rm -rf "${SKILLS_DIR}/adws-pipeline"
cp -R "${SRC}/adws-pipeline" "${SKILLS_DIR}/adws-pipeline"
cp "${SRC}/.claude/agents/"adws-*.md "${AGENTS_DIR}/"
# strip OS junk that a working copy may carry (never shipped into a project)
find "${SKILLS_DIR}/adws-pipeline" -name '.DS_Store' -delete 2>/dev/null || true

AGENT_COUNT=$(ls -1 "${SRC}/.claude/agents/"adws-*.md | wc -l | tr -d ' ')

echo "Installed the ADWS pipeline skill into: ${CLAUDE_DIR}"
echo "  • skill:  ${SKILLS_DIR}/adws-pipeline"
echo "  • agents: ${AGENTS_DIR} (${AGENT_COUNT} adws-* agents)"
echo
echo "Next: in that project, ask Claude Code to run a small task through the adws pipeline."
echo "Requires: Node >= 20, and gh authenticated for pr mode."
