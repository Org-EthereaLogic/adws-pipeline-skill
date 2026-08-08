#!/usr/bin/env bash
# lib.sh — shared helpers for the local CI (sourced, never executed directly).
#
# adws-pipeline-skill has one remote check (.github/workflows/codeql.yml) and it dies
# in ~2s on the account-wide billing lock — so these scripts are the local stand-in CI.
# Evidence is written to the gitignored ci_logs/ directory as append-only JSONL, designed
# to be pasted into a PR body (cloud checks cannot run). Kept portable to macOS's stock
# bash 3.2 (no associative arrays, no ${var^^}, no mapfile) since the host-side scripts
# run there — the repo's own F-13 host-runtime lesson, applied to its tooling.
#
# Reused verbatim from agentic-starter-kit/scripts/local-ci/lib.sh (repo-agnostic).

# UTC run id, stable-sortable, safe for filenames.
ci_run_id() { date -u +%Y%m%dT%H%M%SZ; }

# Uppercase without bash 4 ${x^^}.
ci_upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

# Append one JSON line to a ci_logs/ sink: ci_emit_jsonl <file> <json>.
ci_emit_jsonl() { printf '%s\n' "$2" >> "$1"; }

# True if the working tree has any change (tracked or untracked-not-ignored).
ci_dirty() { if git status --porcelain 2>/dev/null | grep -q .; then echo true; else echo false; fi; }

# M-5b/B2: identify the tree that was actually TESTED, not just HEAD. 33 of the first 73
# recorded gate runs were dirty, so `git_commit` alone names a tree that was never under
# test.
#
# A first attempt hashed `git diff HEAD` and `git ls-files --others`. That was WRONG and is
# recorded here so it is not retried: `git diff HEAD` omits untracked file CONTENTS, and
# `git ls-files --others` lists untracked FILENAMES only. Verified directly — two worktrees
# differing solely in an untracked file's contents produced identical digests under both.
#
# A temporary index gives a real tree object instead: `git add -A` against it stages tracked
# modifications AND untracked contents, and `write-tree` hashes the result. It respects
# .gitignore (so artifacts/ and ci_logs/ do not churn it) and never touches the real index.
# When the tree is clean this equals HEAD^{tree}.
ci_tested_tree() {
  local idx
  idx="$(mktemp -u "${TMPDIR:-/tmp}/adws-ci-index.XXXXXX")"
  GIT_INDEX_FILE="$idx" git add -A >/dev/null 2>&1 || { rm -f "$idx"; echo unknown; return; }
  GIT_INDEX_FILE="$idx" git write-tree 2>/dev/null || echo unknown
  rm -f "$idx"
}

# Ollama server reachable? (does not check any specific model).
ci_ollama_up() { curl -sf "${1:-http://localhost:11434}/api/version" >/dev/null 2>&1; }

# Is a specific model pulled? ci_ollama_has_model <host> <model>
ci_ollama_has_model() {
  curl -sf "$1/api/tags" 2>/dev/null \
    | jq -e --arg m "$2" '.models[] | select(.name==$m)' >/dev/null 2>&1
}
