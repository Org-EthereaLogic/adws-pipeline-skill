# ADWS Pipeline Field Run — 2026-07-19 — agentic-starter-kit issue #109

Operator: Anthony (Cowork cloud session, orchestrated by Claude on
`claude-fable-5`; device bridge to the local Mac for the retry, ship, and
merge).
Target: `Org-EthereaLogic/agentic-starter-kit` — issue #109, six
correctness/portability bugs in the shell validation scripts: unquoted
`compgen -G` suppressing drift errors for globs with spaces
(`check-traceability.sh`); frontmatter checks grepping the whole file instead
of the first `--- ... ---` block (`check-governance.sh`); unescaped `.` in the
action-pin skip prefix exempting single-char-owner actions
(`check-action-pins.sh`); `rg`-vs-`grep` marker-scan semantic divergence
(`lib/common.sh`); `check-doc-drift.sh` self-disabling on macOS bash 3.2;
`generate-sbom.sh` leaving a truncated SBOM on failure.

Job: `job_20260718_0008` / `tsk_20260718_0109`, `patch` mode. Verdict of the
pipeline run: **RETRY / TEST_GATE_FAILURE** (exit 1) — the first production
run to terminate on the retry path. Build passed on attempt 2 (opus); the
test gate failed twice (attempt 1 CRITIC_FAILURE at sonnet, attempt 2
TEST_GATE_FAILURE at opus); review/document/ship/verify never ran, so no
commit, push, or PR was produced by the pipeline. The isolated worktree was
retained per policy at `agentic-starter-kit-adws-job_20260718_0008` and the
execution report at `artifacts/job_20260718_0008/execution_report.md`
(evidence retained, gitignored, in the target repo).

## Retry (operator-completed, same day)

The retained worktree already contained all six requested fixes, an
additional Critic-found bash 3.2 frontmatter/SIGPIPE fix, and a focused
regression suite (`tests/test_validation_scripts.py`, incl. a 200,000-line
bash 3.2 regression). The retry was completed by the operator session
directly on the Mac (Desktop Commander) rather than by re-running the full
pipeline, fixing the two real gate blockers:

1. **ruff I001** (unsorted imports) in the new test — `ruff check --fix`.
2. **Marker-fallback fixture lost PyYAML under its stripped `PATH`.** Root
   cause: the fixture symlinked `shutil.which("python3")` into its fallback
   bin; a symlink to a virtualenv interpreter resolves back to the base
   interpreter (venv resolution depends on the executable path), dropping
   the venv's site-packages and therefore PyYAML for `governance.py`.
   Fixed by writing a shim script that `exec`s `sys.executable` by absolute
   path instead of symlinking it.

Triage of the remaining red: the branch's 31 template-test failures are
byte-identical to `main`'s under the same command (pre-existing macOS-env
failures — `test_pre_tool_use_hook.py`, `test_post_create_ai_clis.py`); the
branch adds 8 newly passing tests and 0 new failures.

## Ship and review

Shipped from the worktree as
[PR #130](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/130)
(squash `7198373`, issue #109 auto-closed), dashboard synced via
[PR #131](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/131)
(eighth post-merge sync). Review-bot resolution before merge:

- **Codacy**: 20 new findings, all bandit/semgrep noise on `subprocess.run`
  in the new test file; suppressed with the repo's inline `# nosec` /
  `# nosemgrep` convention → check green, 0 annotations.
- **CodeRabbit**: two nitpicks across two review rounds (rate-limit window
  waited out per convention, re-triggered with `@coderabbitai review`),
  both applied: `git init` in the marker-scan fixture so the `.gitignore`
  scoping assertion is genuinely exercised (rg only honors `.gitignore`
  inside a repo), and `B607` added to the git-init nosec.
- **Copilot**: review did not run (org billing lock), expected.

Local validation gating the merge (GitHub Actions still billing-locked):
new suite 4/4; template failure-set parity with `main` confirmed (31=31
byte-identical); rendered typescript scaffold `npm test` 49/49;
`ruff check` clean.

## Findings

1. **(Pipeline note)** The RETRY verdict + retained-worktree policy worked
   as designed: all implementation value survived the gate failure, and the
   retry cost was two small fixture fixes rather than a re-run of
   plan/build.
2. **(Test-harness note, general)** Never symlink a virtualenv interpreter
   into a fixture `bin` — venv resolution follows the executable path, so
   the symlink silently yields the base interpreter. Use a `#!/bin/sh` shim
   that `exec`s the absolute interpreter path.
3. **(Gate-triage note)** A red suite is not necessarily a regression:
   diffing the failure set against `main` under the identical command
   separated 31 pre-existing environment failures from the branch's actual
   delta (+8 passing, 0 new failures).

## Ledger

| Item | Value |
| --- | --- |
| Job / task | `job_20260718_0008` / `tsk_20260718_0109` |
| Mode | patch (cloud container) → operator retry + ship on Mac |
| Pipeline verdict | RETRY / TEST_GATE_FAILURE (exit 1); worktree retained |
| Retry | operator-completed same day; 2 fixture fixes + failure-set triage |
| Ship | PR #130 → squash `7198373` on `main`; #109 auto-closed |
| Review bots | Codacy green after nosec/nosemgrep; CodeRabbit 2 nitpicks applied; Copilot locked |
| Dashboard | eighth post-merge sync, PR #131 (`47d7ad1`) |
| Local validation | new suite 4/4; failure-set parity 31=31 vs main; TS scaffold 49/49; ruff clean |
| Evidence | `agentic-starter-kit/artifacts/job_20260718_0008/` |
