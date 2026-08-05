# ADWS Pipeline Field Run — 2026-07-19 — agentic-starter-kit issue #135

Operator: Anthony (Cowork cloud session, orchestrated by Claude on
`claude-opus-4-8`; device bridge to the local Mac for ship/merge).
Target: `Org-EthereaLogic/agentic-starter-kit` — issue #135, rendered-project
`make validate` failures in a clean Linux CI container (first surfaced by the
new local CI `RUN_VALIDATE=1 make ci-orb`; GitHub Actions never ran these
gates while billing-locked). One confirmed genuine bug plus three failures
flagged for triage.

Job: `job_20260719_0002` / `tsk_20260719_0135`, `patch` mode. Verdict:
**PROMOTE** (exit 0, no warnings) on the FIRST attempt of every phase — 7/7
gates, both consensus rounds clean with exact schemas, grader 4/4 satisfied,
zero rewinds, zero parse failures (no `entropy_history.jsonl` ever created;
the healthy-missing path fed `drift-sentinel` `{"entropy_history": []}` at
verify, SAFE/pass). Shipped as
[PR #138](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/138)
(squash `534cf14`, issue #135 auto-closed), dashboard synced via
[PR #139](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/139)
(eleventh post-merge sync, `2aa7ed9`). Evidence tree:
`artifacts/job_20260719_0002/` in the target repo (retained).

## The change (3 files, +40)

- `{{cookiecutter.project_slug}}/tests/test_validation_scripts.py` — gate
  `test_python_sbom_replaces_only_successful_output` behind
  `@unittest.skipUnless((SCRIPTS / "generate-sbom.sh").exists(), …)`,
  mirroring the file's existing `jq`-skip idiom. The post-gen hook prunes
  `scripts/generate-sbom.sh` on `include_sbom=no` renders, so the ungated
  `_copy_scripts(root, "generate-sbom.sh")` raised `FileNotFoundError`; it now
  skips there and still runs+passes on `include_sbom=yes`.
- `{{cookiecutter.project_slug}}/.devcontainer/post-create.sh` — guard the
  sole unguarded `mktemp` in `ensure_uv()` with `command -v mktemp`. The two
  AI-CLI post-create tests source the script (which self-runs `main`); under
  their stub-only PATH `ensure_uv`'s `uv_installer="$(mktemp)"` aborted the
  process (exit 127) before the npm/gh-absent skip lines ran. The `sudo`
  calls at 76/80/83/105 were already `if !`-guarded and degrade gracefully —
  the minimal, proportionate fix is the single `mktemp` guard (empirically
  confirmed: guarding `mktemp` alone flips both tests green).
- `CHANGELOG.md` — one `[Unreleased] › Fixed` entry covering the above plus
  the AC3 triage.

## Triage outcome of the three "needs a look" failures

- Two `test_post_create_ai_clis.py` tests (`skips_npm_install_when_npm_absent`,
  `skips_gh_copilot_when_gh_absent`) → **genuine**, fixed at the product layer
  (the `mktemp` guard). Assertions untouched.
- `test_skill_contracts.py::test_governance_check_rejects_body_only_agent_key`
  → **already resolved on current `main`**. #130 (commit `7198373`) scoped
  `frontmatter_has_key`'s awk to the first `--- … ---` fence, so a body-only
  `model:` key fails closed. Reproduced PASS under a bookworm-matching env
  (mawk 1.3.4 + Python 3.12) for `include_sbom ∈ {yes,no}`. Documented in the
  CHANGELOG as a triage conclusion; no code change. The grader independently
  confirmed `7198373` in git history before grading AC3 `satisfied`.

## Run environment

Cowork cloud container (Linux, Node v22.22.2, Python 3.11 + 3.12 via uv,
mawk 1.3.4). Repo transport: a `git bundle` of `main` at `cd66ed6` (724 KB)
created on the Mac via Desktop Commander, staged over the device bridge into
the connected `adws-pipeline-skill/_transfer/`, cloned in the container
(recover from "remote HEAD refers to nonexistent ref" with
`git fetch origin main && git checkout -b main FETCH_HEAD`, as documented for
the cloud path). The standalone `adws-pipeline-skill` tree (SKILL.md,
references, scripts, agent specs) was staged from `~/Dev/adws-pipeline-skill`
and executed from there — the second acceptance run of the standalone
packaging after #107. F-11 inline-spec fallback used for ALL 11 dispatches
(`adws-*` agent types not registered in Cowork). Tiers per the low-risk row:
architect sonnet, critic haiku, advocate haiku, grader opus;
`review-risk-assess` recomputed `low` post-review (no change). Worktree
isolation via `git worktree add`. No push credentials in the container →
`patch` mode with the established cloud→Mac ship path: `git am
-c commit.gpgsign=false` of the format-patch, push, `gh pr create`,
squash-merge with `--admin` (Actions billing-locked). Ship gh account:
`AJ-EthereaLogic-ai` (keyring) — has the write/merge access proven by #128–#137.

## What worked well (measured)

- **Cleanest run to date, tied with #107: first-attempt pass on all seven
  gates.** All nine validator invocations `pass`, both consensus rounds clean
  (4 haiku dispatches, exact schemas, live `date -u` timestamps, no extra
  keys), grader 4/4 `satisfied`, `execution-report.js` exit 0
  `warn_flag=false`. No retries, rewinds, entropy events, or deferred gates.
- **F-11 fallback flawless across 11 dispatches.** The haiku write-and-verify
  dispatch instruction (write the file, `date -u` timestamps, `ls -l` confirm)
  produced exact-schema consensus files 4/4 again — three-for-three across
  #107/#135 runs.
- **Orchestrator-verified planning cut a build→test→rewind cycle.** Before the
  build phase, the orchestrator empirically confirmed on a scratch render that
  guarding `mktemp` alone flips both post-create tests green (the `sudo` path
  was a red herring), so the plan shipped minimal and the test gate passed
  first try.
- **Grader independence held.** The grader re-derived AC2 by reproducing
  unpatched-vs-patched `post-create.sh` and re-confirmed AC3's `7198373` in git
  history, rather than trusting narrative.
- **Review phase caught an evidence gap** (AC3 only exercised on the
  `include_sbom=no` render); the orchestrator closed it by running the
  governance test on an `include_sbom=yes` render (pass) before proceeding.

## Friction / findings

1. **(Cross-platform, ship-time — no skill change) macOS bash 3.2 parity.**
   The Linux/py3.12 render (the env issue #135 targets) is `133 passed, 1
   skipped, 0 failed` (baseline `3 failed, 131 passed`). On the Mac
   (`/bin/bash` 3.2.57) the two post-create tests still fail — but **identically
   on `main` and the branch**: `local -A pkg_bin` at `post-create.sh:57` is a
   `declare -A` associative array, unsupported by bash 3.2 → `jq: unbound
   variable`, aborting before the `mktemp` path. This is pre-existing, unrelated
   to the fix, and out of #135's scope (failure-set parity confirmed by
   rendering `main` via a throwaway worktree). It is a good next field-run
   candidate — the same bug class #109 fixed in `check-doc-drift.sh` (replaced
   the assoc array with `sort -u`). The pipeline's test phase runs Linux-only in
   the cloud; cross-platform parity remains a manual ship-time check.
2. **(Target-repo hygiene, observation) `artifacts/` is not actually
   gitignored** in `agentic-starter-kit` (`git check-ignore artifacts/…` →
   not ignored; no `artifacts` pattern in `.gitignore`), despite prior dashboard
   syncs describing it as "gitignored." Patch mode kept the evidence tree out of
   the diff regardless (ship works from the worktree), but a stray `git add -A`
   could commit the ~large evidence tree. Worth a one-line `.gitignore` add in a
   future housekeeping change (not done here — out of #135's scope).
3. **(Orchestrator-harness note, no skill change) Desktop Commander blocks a
   `cat > file <<'EOF'` heredoc** that also contains a `gh` invocation on the
   same command line; writing the PR/commit body via the `write_file` tool and
   running `gh … --body-file` / `git commit -F` separately is the clean path.

## Skill changes resulting from this run

None. The run exercised the pipeline end to end with zero mechanics friction;
scripts, validators, agent specs, and the F-11 fallback all behaved to spec.
Per the repo's frozen-baseline policy, no spec/script change is warranted — the
only follow-ups are target-repo work (finding 1: bash-3.2 assoc-array fix;
finding 2: `.gitignore` the evidence tree), not skill work.

## Ledger

| Item | Value |
| --- | --- |
| Job / task | `job_20260719_0002` / `tsk_20260719_0135` |
| Mode | patch (cloud container) → `git am` + PR on Mac |
| Verdict | PROMOTE, exit 0, no warnings |
| Gates | 7/7 first-attempt pass; consensus 4/4 clean; grader 4/4 satisfied; 9/9 skills pass |
| Rewinds / entropy | 0 / no history file (healthy-missing path exercised) |
| Ship | PR #138 → squash `534cf14` on `main`; #135 auto-closed |
| Dashboard | eleventh post-merge sync, PR #139 (`2aa7ed9`) |
| Review bots | Codacy 0 issues; CodeRabbit no actionable comments (5/5 pre-merge checks); Copilot billing-locked |
| Linux validation | rendered python-mit-ty (include_sbom=no) py3.12: 133 passed, 1 skipped, 0 failed; sbom passes on include_sbom=yes |
| macOS parity | 2 post-create tests red on both main and branch (pre-existing bash-3.2 `declare -A`); no regression |
| Evidence | `agentic-starter-kit/artifacts/job_20260719_0002/` |
| Open follow-ups | target #111, #119; new candidates: bash-3.2 `pkg_bin` assoc array, `.gitignore artifacts/` |
