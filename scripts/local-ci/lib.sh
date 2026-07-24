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

# Ollama server reachable? (does not check any specific model).
ci_ollama_up() { curl -sf "${1:-http://localhost:11434}/api/version" >/dev/null 2>&1; }

# Is a specific model pulled? ci_ollama_has_model <host> <model>
ci_ollama_has_model() {
  curl -sf "$1/api/tags" 2>/dev/null \
    | jq -e --arg m "$2" '.models[] | select(.name==$m)' >/dev/null 2>&1
}
