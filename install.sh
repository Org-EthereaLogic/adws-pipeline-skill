#!/usr/bin/env bash
# install.sh — install/port the ADWS pipeline skill + agents into a project.
#
# Usage:
#   ./install.sh /path/to/your/project   # into <project>/.claude/
#   ./install.sh --global                # into ~/.claude/ (all projects)
#   ./install.sh                         # into the current directory's .claude/
#   ./install.sh <target> --force        # skip the overwrite prompt (or FORCE=1)
#
# Re-running over an existing install BACKS IT UP first, shows what differs, and asks
# before replacing. Backups go to <target>/.claude/.adws-backup-<UTC timestamp>/ and are
# never deleted automatically — prune them yourself when you no longer need them.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- flags -------------------------------------------------------------------
FORCE="${FORCE:-0}"
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done
# bash 3.2 (macOS stock) raises `unbound variable` on "${ARGS[@]}" when ARGS is empty
# under `set -u`, so expand it defensively — the repo's own F-13 lesson.
set -- ${ARGS[@]+"${ARGS[@]}"}

# --- resolve destination .claude root ---------------------------------------
case "${1:-.}" in
  --global|-g) DEST_ROOT="$HOME" ;;
  --help|-h)
    sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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

# SC-10/A4. This was `rm -rf` + `cp`: any local edit to an installed skill or agent was
# destroyed with no backup, no prompt, and no diff, and an interrupted copy left a
# half-written skill directory behind. Now: stage and validate first, back up only the
# paths this installer owns, decide, then swap by rename.
mkdir -p "${SKILLS_DIR}" "${AGENTS_DIR}"

# --- 1. stage the new payload, and validate it BEFORE touching the install ----
STAGE="${SKILLS_DIR}/.adws-pipeline.incoming.$$"
cleanup() { rm -rf "${STAGE}"; }
trap cleanup EXIT
rm -rf "${STAGE}"
cp -R "${SRC}/adws-pipeline" "${STAGE}"
# strip OS junk that a working copy may carry (never shipped into a project)
find "${STAGE}" -name '.DS_Store' -delete 2>/dev/null || true

VALIDATOR_COUNT=$(find "${STAGE}/scripts/validators" -name '*.js' 2>/dev/null | wc -l | tr -d ' ')
AGENT_COUNT=$(ls -1 "${SRC}/.claude/agents/"adws-*.md 2>/dev/null | wc -l | tr -d ' ')
if [ ! -f "${STAGE}/SKILL.md" ] || [ "${VALIDATOR_COUNT}" -lt 9 ] || [ "${AGENT_COUNT}" -lt 10 ]; then
  echo "error: staged payload looks incomplete (SKILL.md, ${VALIDATOR_COUNT} validators, ${AGENT_COUNT} agents)." >&2
  echo "       Nothing was changed in ${CLAUDE_DIR}." >&2
  exit 1
fi

# --- 2. back up ONLY what this installer owns --------------------------------
# Never a recursive snapshot of .claude/ — that would accumulate copies of the user's
# whole configuration on every run.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${CLAUDE_DIR}/.adws-backup-${STAMP}"
HAD_EXISTING=0
if [ -d "${SKILLS_DIR}/adws-pipeline" ] || ls "${AGENTS_DIR}/"adws-*.md >/dev/null 2>&1; then
  HAD_EXISTING=1
  mkdir -p "${BACKUP}"
  [ -d "${SKILLS_DIR}/adws-pipeline" ] && cp -R "${SKILLS_DIR}/adws-pipeline" "${BACKUP}/adws-pipeline"
  for a in "${AGENTS_DIR}/"adws-*.md; do [ -f "$a" ] && cp "$a" "${BACKUP}/"; done

  echo "Existing install found. Backed up to: ${BACKUP}"
  if command -v diff >/dev/null 2>&1 && [ -d "${BACKUP}/adws-pipeline" ]; then
    echo "Differences (installed → this repo):"
    diff -rq "${BACKUP}/adws-pipeline" "${STAGE}" 2>/dev/null | sed 's/^/  /' || true
  fi
  for a in "${SRC}/.claude/agents/"adws-*.md; do
    b="${BACKUP}/$(basename "$a")"
    if [ -f "$b" ] && ! cmp -s "$a" "$b"; then echo "  Agent differs: $(basename "$a")"; fi
  done

  # --- 3. decide ---------------------------------------------------------------
  if [ "${FORCE}" != "1" ]; then
    if [ -t 0 ]; then
      printf 'Replace the installed copies? [y/N] '
      read -r reply
      case "$reply" in
        [Yy]*) ;;
        *) echo "Aborted. Nothing was changed; backup kept at ${BACKUP}"; exit 1 ;;
      esac
    else
      echo "error: non-interactive, and an existing install would be replaced." >&2
      echo "       Re-run with --force (or FORCE=1). Backup is at ${BACKUP}" >&2
      exit 1
    fi
  fi
fi

# --- 4. swap ------------------------------------------------------------------
# `mv` within one filesystem is atomic, so an interruption leaves either the old tree or
# the new one — never a half-written skill directory, which `rm -rf` + `cp` could.
trap - EXIT
rm -rf "${SKILLS_DIR}/adws-pipeline"
mv "${STAGE}" "${SKILLS_DIR}/adws-pipeline"
for a in "${SRC}/.claude/agents/"adws-*.md; do
  cp "$a" "${AGENTS_DIR}/.$(basename "$a").incoming.$$"
  mv "${AGENTS_DIR}/.$(basename "$a").incoming.$$" "${AGENTS_DIR}/$(basename "$a")"
done

echo "Installed the ADWS pipeline skill into: ${CLAUDE_DIR}"
echo "  • skill:  ${SKILLS_DIR}/adws-pipeline (${VALIDATOR_COUNT} validators)"
echo "  • agents: ${AGENTS_DIR} (${AGENT_COUNT} adws-* agents)"
if [ "${HAD_EXISTING}" = "1" ]; then
  echo "  • backup: ${BACKUP} (kept — prune it yourself when you no longer need it)"
fi
echo
echo "Next: in that project, ask Claude Code to run a small task through the adws pipeline."
echo "Requires: Node >= 20, and gh authenticated for pr mode."
