#!/usr/bin/env bash
# review.sh — TIER 3 local CI: advisory local-LLM review of the branch diff (Ollama).
#
# NEVER blocks (always exit 0, except exit 2 if curl/jq missing or exit 3 if Ollama is
# down). Fills the CodeRabbit/Copilot vacuum left by the billing-locked cloud: two local
# models read `git diff origin/main...HEAD` against a repo-specific prompt and emit an
# advisory record for the PR body. A model that isn't pulled is honestly recorded as
# skipped_not_pulled — it is never a silent pass.
#
# Usage:  make review   (or: bash scripts/local-ci/review.sh)
# Env:    REVIEW_MODELS (default "gpt-oss:120b qwen3.5:9b"), REVIEW_BASE (default
#         origin/main), OLLAMA_HOST (default http://localhost:11434), REVIEW_MAX_BYTES
#         (default 100000).
# Evidence: ci_logs/<run_id>.<model>.review.log + a line in ci_logs/review.jsonl.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/local-ci/lib.sh
. "$here/lib.sh"
repo_root="$(cd "$here/../.." && pwd)"
cd "$repo_root" || exit 1
mkdir -p ci_logs

for tool in curl jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[review] ERROR: '$tool' not on PATH" >&2
    exit 2
  fi
done

OLLAMA="${OLLAMA_HOST:-http://localhost:11434}"
MODELS="${REVIEW_MODELS:-gpt-oss:120b qwen3.5:9b}"
BASE="${REVIEW_BASE:-origin/main}"
MAX_BYTES="${REVIEW_MAX_BYTES:-100000}"

if ! ci_ollama_up "$OLLAMA"; then
  echo "[review] ERROR: Ollama not reachable at $OLLAMA — start it with 'ollama serve'" >&2
  exit 3
fi

run_id="$(ci_run_id)"
commit="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
branch="$(git branch --show-current 2>/dev/null || echo unknown)"
diff_stat="$(git diff --shortstat "${BASE}...HEAD" 2>/dev/null | tr -d '\n')"
diff="$(git diff "${BASE}...HEAD" 2>/dev/null)"

# Truncate very large diffs so the model call stays bounded.
if [ "${#diff}" -gt "$MAX_BYTES" ]; then
  diff="$(printf '%s' "$diff" | head -c "$MAX_BYTES")
[DIFF TRUNCATED at ${MAX_BYTES} bytes]"
fi

prompt="$(cat "$here/review-prompt.md")"
content="$(printf '%s\n\n=== DIFF (%s...HEAD) ===\n%s\n' "$prompt" "$BASE" "$diff")"

reviewed=0
model_records=()

read -ra model_list <<< "$MODELS"
for MODEL in ${model_list[@]+"${model_list[@]}"}; do
  safe="$(printf '%s' "$MODEL" | tr '/:' '__')"
  mlog="ci_logs/${run_id}.${safe}.review.log"

  if ! ci_ollama_has_model "$OLLAMA" "$MODEL"; then
    echo "[review] $MODEL -> SKIPPED (not pulled: 'ollama pull $MODEL')"
    model_records+=("{\"model\":\"$MODEL\",\"status\":\"skipped_not_pulled\"}")
    continue
  fi

  echo "[review] $MODEL -> reviewing ${diff_stat:-no changes} ..."
  req="$(jq -n --arg m "$MODEL" --arg c "$content" \
    '{model:$m, stream:false, messages:[{role:"user", content:$c}]}')"
  if out="$(printf '%s' "$req" | curl -sf "$OLLAMA/api/chat" -d @- 2>/dev/null | jq -r '.message.content // empty')" \
     && [ -n "$out" ]; then
    printf '%s\n' "$out" > "$mlog"
    echo "[review] $MODEL -> done (see $mlog)"
    model_records+=("{\"model\":\"$MODEL\",\"status\":\"reviewed\",\"log\":\"$mlog\"}")
    reviewed=$((reviewed + 1))
  else
    echo "[review] $MODEL -> ERROR (call failed)"
    model_records+=("{\"model\":\"$MODEL\",\"status\":\"error\"}")
  fi
done

models_json="$(IFS=,; echo "${model_records[*]}")"
record="$(printf '{"event":"review","run_id":"%s","git_commit":"%s","branch":"%s","base":"%s","diff_stat":"%s","reviewed":%s,"models":[%s]}' \
  "$run_id" "$commit" "$branch" "$BASE" "${diff_stat:-}" "$reviewed" "$models_json")"
ci_emit_jsonl ci_logs/review.jsonl "$record"

echo "[review] advisory review complete ($reviewed model(s) ran). Never blocks."
echo "[review] evidence record (paste into the PR body):"
echo "$record"
exit 0
