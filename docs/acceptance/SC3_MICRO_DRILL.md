# SC-3 Contract Micro-Drill Evidence

**Date:** 2026-07-24

**Command:** `node parity/sc3-micro-drill/run-tests.js`

**Scope:** SC-3 A1/A2/A3 contract behavior in a real temporary Git repository.
**Result:** PASS — all twelve assertions succeeded.

The deterministic drill first exercises the falsifiability policy matrix, then executes
a real check against a committed pre-change baseline, an intentionally incorrect first
build, and a corrected second build. It verifies:

1. `required + falsifiability:false` is rejected at intake; required tests otherwise run
   the baseline, while `true` opts other test policies in.
2. The pre-change check fails because the feature is absent and is classified
   `assertion-failed-runtime-present`.
3. A deliberately missing runtime is classified `not-run`, producing `gate_weak` rather
   than a verified criterion.
4. The incorrect first build produces a code-classified correction record at
   `build/attempt_2/corrections.json`.
5. The second build passes and the SHA-256 of `corrections.json` is unchanged, proving
   that the correction record remained immutable after dispatch input creation.

The drill is wired into `make local-ci` and is therefore re-run on every local gate. It is
reproducible and retains no temporary repository after completion.

When invoked by a Git hook, Git exports repository-scoped environment variables such as
`GIT_DIR`. The drill removes those variables from its scratch Git subprocesses before
`git init`, so its baseline commit cannot target the source repository. PR #27 verified
this regression path by injecting the real `GIT_DIR` and confirming unchanged source
`HEAD` and worktree state after the drill.

## Limitation and explicit deferral

This is a contract-level executable micro-drill, not a seven-phase autonomous ADWS
production run. SC3_PLAN sequencing step 4 remains explicitly deferred until the first
suitable real post-SC-3 task exercises A1 and A3 through the full phase loop. That run
must copy its complete PROMOTE evidence tree into `docs/acceptance/` before teardown.
