# ADWS Pipeline Field Run — 2026-07-19 — agentic-starter-kit issue #107

Operator: Anthony (Cowork cloud session, orchestrated by Claude on
`claude-fable-5`; device bridge to the local Mac for ship/merge).
Target: `Org-EthereaLogic/agentic-starter-kit` — issue #107, three related
robustness bugs in the template's `.devcontainer/post-create.sh`: `ensure_uv`
logs a false "uv installed" success when the `curl | sh` pipeline fails (no
`pipefail`); curl missing from the `pkg_bin` apt map despite the network-probe
comment's promise; unguarded `npm config set prefix` can abort the whole script
under `set -eu`. Labels `bug` / `area:tooling`.
Job: `job_20260719_0001` / `tsk_20260719_0001`, `patch` mode. Verdict:
**PROMOTE** (exit 0, no warnings) on the FIRST attempt of every phase — 7/7
gates, both consensus rounds clean with exact schemas, grader 4/4 satisfied,
zero rewinds, zero parse failures (no `entropy_history.jsonl` ever created —
the healthy-missing path fed `drift-sentinel` `{"entropy_history": []}` at
verify, SAFE/pass as designed). Shipped as
[PR #128](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/128)
(squash `49c3315`, issue #107 auto-closed), dashboard synced via
[PR #129](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/129).
Evidence tree: `artifacts/job_20260719_0001/` in the target repo (retained,
gitignored).

**This is the first run orchestrated from the standalone `adws-pipeline-skill`
repository** rather than the target repo's in-repo copy of the skill: the
skill tree (SKILL.md, references, scripts, agent specs) was staged from
`~/Dev/adws-pipeline-skill` into the cloud container over the device bridge
and executed from there. Everything behaved identically to the in-repo copy —
expected, since the standalone repo is the upstream of the vendored copy — and
the run doubles as an acceptance check of the standalone packaging.

## Run environment

Cowork cloud container (Linux, Node v22.22.2, python3.11, shellcheck 0.9.0
installable via apt). No push credentials in the container — hence `patch`
mode with the established cloud→Mac ship path. Repo transport: `git bundle`
of `main` at `a95f816` (700 KB) created on the Mac, staged over the device
bridge, cloned in the container. F-11 inline-spec fallback used for ALL ten
dispatches (`adws-*` agent types not registered in Cowork). Tiers per the
low-risk row: architect sonnet, critic haiku, advocate haiku, grader opus;
`review-risk-assess` recomputed `low` post-review (no change). Worktree
isolation via `git worktree add`; worktree removed after PROMOTE. Ship
completion on the Mac via Desktop Commander: `git am` of the format-patch
with `-c commit.gpgsign=false` (headless signing hang precaution, per the
#106-era ship path), push, `gh pr create`, squash-merge. GitHub Actions
remains billing-locked at the org, so the merge was gated on local
validation: template pytest suite 26/26 (via `uv run --with pytest --with
cookiecutter` — the Mac has neither on PATH, only uv), rendered typescript
scaffold `npm test` 49/49, `bash -n` + shellcheck clean on the modified
script (no new findings vs baseline).

## What worked well (measured)

- **Cleanest run to date: first-attempt pass on all seven gates.** All nine
  validator invocations returned `pass` with zero warnings;
  `execution-report.js` exit 0 with `warn_flag=false`. No retries, no
  rewinds, no entropy events, no deferred gates.
- **The haiku write-and-verify dispatch mitigation worked.** Both consensus
  rounds (4 haiku dispatches) produced their single output file with the
  EXACT documented schema and live `date -u` timestamps. Each dispatch prompt
  explicitly said: use the Write tool at the exact path, take `assessed_at`
  from `date -u`, then `ls -l` the file and confirm in the final message.
  Under the same fallback WITHOUT that instruction, a haiku-tier agent had
  previously returned its verdict in the final message without writing the
  file (#106-era runs). Two-for-two now; promoted into SKILL.md's F-11
  section this same day (see Skill changes).
- **Verifier skip-semantics held again**: `CHANGELOG.md` (no applicable
  syntax checker) was noted in `phase_log.md` and emitted no boolean check —
  `verify_structural` 4/4, no false quarantine.
- **Consensus and grader independence produced no false positives** on a
  small, well-specified diff: pipeline-mechanics preamble kept "untracked
  change set" out of the findings entirely.
- **Patch-mode end-to-end integrity**: `git apply --check` clean against
  `main` in the container AND `git am` clean on the Mac against the same
  `a95f816` base; authorship preserved (documented fallback identity
  `Claude (ADWS pipeline) <noreply@anthropic.com>`, commit_identity null).

## Friction / findings

1. **(Skill fix, applied)** Low-tier single-file writers (Critic, Advocate,
   Grader) under F-11 fallback need the write-and-verify instruction IN the
   dispatch prompt; the spec files alone ("Write EXACTLY one file") were not
   reliably sufficient at haiku tier in earlier runs. SKILL.md F-11 now
   carries the dispatch-time note.
2. **(Orchestrator-harness note, no skill change)** Interpolating validator
   stdout into a shell heredoc for trace-wrapping broke once on embedded
   quotes (a harness JSONDecodeError, NOT an agent parse failure — correctly
   left out of the entropy signal, which counts agent-produced malformed
   outputs only). Fixed by capturing validator stdout to a temp file and
   wrapping from disk (`runval.sh` helper). Recommendation for future
   orchestrators: never round-trip validator JSON through shell string
   interpolation.
3. **(Transport note)** A bundle created with `git bundle create <f> main`
   clones with "remote HEAD refers to nonexistent ref" and an empty checkout;
   recover with `git fetch origin main && git checkout -b main FETCH_HEAD`.
   Harmless but worth knowing for the cloud path.
4. **(Observation, no change)** The shipper probed whether GPG/SSH signing
   would hang by making a throwaway commit and soft-resetting it before the
   real commit. It worked and stayed inside the worktree, but a lighter probe
   (`git config commit.gpgsign` / key-agent inspection) would avoid creating
   even a transient commit. Not promoted to a spec change — the behavior was
   safe and the spec's signing paragraph already covers the decision that
   matters.

## Skill changes resulting from this run

- SKILL.md § "Agent-type fallback (F-11)": added the dispatch-time
  requirement that single-file writers (Critic/Advocate/Grader) be explicitly
  instructed to write their output file with the file-writing tool, stamp
  timestamps from `date -u`, and verify the file exists before finishing —
  field-validated in this run (4/4 haiku dispatches wrote exact-schema files).

## Ledger

| Item | Value |
| --- | --- |
| Job / task | `job_20260719_0001` / `tsk_20260719_0001` |
| Mode | patch (cloud container) → `git am` + PR on Mac |
| Verdict | PROMOTE, exit 0, no warnings |
| Gates | 7/7 first-attempt pass; consensus 4/4 clean; grader 4/4 satisfied |
| Rewinds / entropy | 0 / no history file (healthy-missing path exercised) |
| Ship | PR #128 → squash `49c3315` on `main`; #107 auto-closed |
| Dashboard | seventh post-merge sync, PR #129 (`de08f73`) |
| Local validation | pytest 26/26; TS scaffold node:test 49/49; bash -n + shellcheck clean |
| Evidence | `agentic-starter-kit/artifacts/job_20260719_0001/` |
