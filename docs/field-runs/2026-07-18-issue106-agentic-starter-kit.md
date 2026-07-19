# ADWS Pipeline Field Run — 2026-07-18 — agentic-starter-kit issue #106

> **Retroactive record.** Written 2026-07-19 from the target repo's dashboard
> sixth post-merge sync (PR #127), the retained evidence trees
> (`agentic-starter-kit/artifacts/job_20260718_0006/` and `…_0007/`), and the
> session's operational notes. No same-day skill-repo record was written; this
> document back-fills the gap so the run ledger is continuous. Where this
> record and the evidence trees disagree, the evidence trees win.

Operator: Anthony (Cowork cloud session; device bridge to the local Mac for
ship/merge). Target: `Org-EthereaLogic/agentic-starter-kit` — issue #106,
`npm test` on a fresh scaffold ran `vitest run`, whose default include glob
never matches the template's node:test suites (`tests/test_*.js` /
`test_*.cjs`), failing with "No test files found" while `make test` passed.

## Shape of the run: one issue, two gated jobs

- **`job_20260718_0006` / patch `0001`** — the primary fix: point
  `test`/`test:watch`/`coverage` at `node --test` with quoted recursive
  `'tests/**/…'` globs (expanded by Node's own glob engine, matching the
  Makefile `find`'s recursion) and drop the unused, version-mismatched vitest
  devDependencies. Verdict: **PROMOTE-with-warnings**; used as the commit
  basis.
- **Independent post-promote audit** (outside the pipeline) between the jobs
  found: top-level-only npm globs vs the recursive `find`; an overclaiming
  Quickstart runner-equivalence sentence; residual operational vitest
  references.
- **`job_20260718_0007` / patch `0002`** — audit-driven follow-up contract
  resolving all audit findings; also uncovered and closed a second latent gap:
  the `test-typescript` recipe's `find` patterns missed `test_*.cjs`, so
  `make test` had silently skipped `tests/test_audit_hooks.cjs`. Verdict:
  **PROMOTE**, drift-grader 4/4 satisfied.

Docs were aligned end-to-end in the shipped change (READMEs,
QUICKSTART-TYPESCRIPT with an exact runner-equivalence statement including the
dot-directory caveat, cookiecutter.json prompt text, scaffold agent docs,
BUILD_PLAN, EXAMPLES, OPTIMIZATION_ROADMAP).

## Ship and validation

Cowork cloud container, `patch` mode (no push credentials), cloud→Mac ship
path via the device bridge: patches applied on the Mac with
`git -c commit.gpgsign=false` (headless signing-hang precaution), pushed, and
squash-merged as [PR #126](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/126)
(`02fa577`; issue #106 auto-closed). Dashboard synced via
[PR #127](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/127)
(`a95f816`). GitHub Actions billing-locked at the org, so the merge was gated
on local validation: rendered typescript + polyglot scaffolds green under both
runners (49/49 each; injected failing top-level and nested tests exit non-zero
under both), spot-checked post-merge on `main`. Workspace hygiene in the same
sync: merged branch deleted local+remote, transfer scratch removed, and a
stale zero-byte `.git/index.lock` (held open read-only by a desktop app, no
live git process) removed per the F-10 checklist before applying the patches.

## Findings carried forward

1. **Haiku-tier single-file writers may skip writing their output file** under
   the F-11 inline-spec fallback, returning the verdict in their final message
   instead. Mitigated operationally in these runs by re-instruction; the
   dispatch-prompt requirement (explicit file-write + `date -u` timestamps +
   existence verification) was validated 4/4 on run 7 (#107) and codified in
   SKILL.md's F-11 section on 2026-07-19.
2. **Two-job pattern for audit follow-ups worked well**: rather than mutating
   the promoted job, the audit findings became a fresh contract and a second
   fully-gated job — append-only evidence preserved for both, each with its
   own verdict.

## Ledger

| Item | Value |
| --- | --- |
| Jobs | `job_20260718_0006` (patch 0001) + `job_20260718_0007` (patch 0002) |
| Verdicts | PROMOTE-with-warnings; PROMOTE (grader 4/4) |
| Mode | patch (cloud container) → apply + PR on Mac |
| Ship | PR #126 → squash `02fa577` on `main`; #106 auto-closed |
| Dashboard | sixth post-merge sync, PR #127 (`a95f816`) |
| Evidence | `agentic-starter-kit/artifacts/job_20260718_0006/`, `…_0007/` |
| Record status | retroactive (written 2026-07-19) |
