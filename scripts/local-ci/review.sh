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
#         (default 100000), REVIEW_ALLOW_REMOTE (default unset — see below).
# Evidence: ci_logs/<run_id>.<model>.review.log + a line in ci_logs/review.jsonl.
#
# SC-14/A1 (F-80). This script POSTs the full branch diff to $OLLAMA and is the only
# network egress in the repository. OLLAMA_HOST was read straight into the curl target
# with no check, so a value inherited from a dotfile, a shared profile or a poisoned CI
# env sent the diff to an arbitrary host with nothing in the output naming it. A remote
# Ollama is a legitimate setup, so this is an opt-in and not a block: non-loopback hosts
# require REVIEW_ALLOW_REMOTE=1, and the destination is printed either way so a
# redirected review is visible in the log rather than inferred from its absence.
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

# --- Egress destination guard (SC-14/A1, F-80) --------------------------------
# Strip scheme, then userinfo, then path/query, then port, leaving the bare host.
# Done with parameter expansion rather than a regex so it holds under bash 3.2.
ollama_host_only="${OLLAMA#*://}"     # drop scheme if present
ollama_host_only="${ollama_host_only##*@}"   # drop any user:pass@
ollama_host_only="${ollama_host_only%%/*}"   # drop path
ollama_host_only="${ollama_host_only%%\?*}"  # drop query
case "$ollama_host_only" in
  \[*\]*) ollama_host_only="${ollama_host_only%%\]*}]" ;;  # bracketed IPv6 keeps its brackets
  *:*)    ollama_host_only="${ollama_host_only%%:*}" ;;    # host:port -> host
esac

# Redacted form for OUTPUT. This message lands in ci_logs/, which is committed, and the
# parser above exists precisely because OLLAMA_HOST may carry `user:pass@` — so printing
# $OLLAMA raw would write credentials into the repository, in the change whose sibling
# finding (F-81) is that secret redaction has no mechanical enforcement. The presence of
# userinfo is still reported; only its value is withheld.
case "$OLLAMA" in
  *://*@*) ollama_display="${OLLAMA%%://*}://[userinfo-redacted]@${OLLAMA#*@}" ;;
  *@*)     ollama_display="[userinfo-redacted]@${OLLAMA#*@}" ;;
  *)       ollama_display="$OLLAMA" ;;
esac

# `0.0.0.0` is the unspecified address, not a loopback address; it is accepted because
# connecting to it reaches a local listener on every stack this runs on, and it is a
# routine way to name a locally-bound Ollama. Naming it "loopback" would be wrong, so the
# set is described as local-only.
case "$ollama_host_only" in
  localhost|127.0.0.1|0.0.0.0|\[::1\]|::1) ;;
  *)
    if [ "${REVIEW_ALLOW_REMOTE:-}" != "1" ]; then
      echo "[review] ERROR: OLLAMA_HOST names a non-local host: $ollama_host_only" >&2
      echo "[review]   This script POSTs the full branch diff to that host." >&2
      echo "[review]   Set REVIEW_ALLOW_REMOTE=1 to allow it deliberately." >&2
      exit 2
    fi
    echo "[review] WARNING: sending the branch diff to REMOTE host $ollama_host_only (REVIEW_ALLOW_REMOTE=1)"
    ;;
esac
echo "[review] destination: $ollama_display (proxies bypassed)"

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
  # --noproxy '*': the loopback check above is defeated by http_proxy/ALL_PROXY otherwise —
  # this is the call that carries the diff, so it is the one that must not be reroutable.
  if out="$(printf '%s' "$req" | curl -sf --noproxy '*' "$OLLAMA/api/chat" -d @- 2>/dev/null | jq -r '.message.content // empty')" \
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
