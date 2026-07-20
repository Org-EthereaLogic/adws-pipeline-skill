# ADWS Pipeline Field Run — 2026-07-20 — agentic-starter-kit issue #111

Operator: Anthony (Cowork cloud session, orchestrated by Claude on
`claude-opus-4-8`; device bridge to the local Mac for ship/merge and, decisively,
for target-runtime validation).
Target: `Org-EthereaLogic/agentic-starter-kit` — issue #111, a seven-item
refactoring & optimization epic. Two items (#1 coverage-theater, #2
triplicated-prune sync-test) were found ALREADY resolved on `main` by the #110
fix (PR #132) and left untouched. The five remaining items shipped: #3
governance-loader fan-out (one `--emit` call/script), #4 `read_lines_into_array`
helper + `check-traceability.sh` single-`jq`-pass, #5 dead `defs.mk` macros +
**wired** (not deleted) `--list` + `RECOMMENDED` count comment, #6
`governance_review/__main__.py` import guard, #7 copier `_tasks` Windows
portability. Labels `enhancement` / `area:tooling`.
Jobs: `job_20260719_0002` (RETRY) → `job_20260720_0001` (PROMOTE), both `patch`
mode. Verdict: **PROMOTE** (exit 10, one benign warn) on job_20260720_0001.
Shipped as [PR #148](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/148)
(squash `28df24b`, #111 auto-closed); dashboard synced via
[PR #149](https://github.com/Org-EthereaLogic/agentic-starter-kit/pull/149)
(`ee24ce1`, fifteenth post-merge sync). Evidence retained at
`artifacts/job_20260719_0002/` and `artifacts/job_20260720_0001/`.

## Headline: the container is blind to the target runtime (F-13)

The single most important outcome. `job_20260720_0001` reached a clean PROMOTE
(7/7 gates, consensus 2 rounds clean, grader 6/6) entirely inside the Linux /
bash-5 cloud container. Mac-side validation then caught a **real regression the
pipeline could not see**: the new `read_lines_into_array` helper (#4) leaves
results in `READ_LINES_RESULT`; callers do `arr=("${READ_LINES_RESULT[@]}")` then
`for x in "${arr[@]}"`. Under `set -euo pipefail` on macOS `/bin/bash` 3.2.57,
expanding an **empty** array `"${arr[@]}"` raises `unbound variable` and aborts
(a bash bug fixed only in 4.4). A traceability criterion with empty
`tests`/`evidence` — entirely normal — crashed `check-traceability.sh` on the
Mac (baseline exited 0); any empty governance list would do the same. bash 5
(container/CI) never shows it.

Fix idiom: guard every possibly-empty array expansion (copy AND loop, plus the
unit test's own bash snippet) with `${arr[@]+"${arr[@]}"}`. Re-validated on the
Mac: all 5 governance scripts byte-identical to a baseline scaffold under
`/bin/bash` 3.2 including empty-list cases; template pytest failure-set parity
with `main` (0 new failures, +25 passing, 2 make-target tests skip on template
source); TypeScript scaffold `npm test` pass. Promoted into SKILL.md F-9 as
**F-13 (host-runtime blindness)**: container-green is necessary, not sufficient;
shell changes must be exercised on the target interpreter (with empty/edge
inputs) before merge.

## The two RETRYs (consensus working as designed)

`job_20260719_0002` never promoted — and that is the system functioning. The
Critic caught two REAL regressions across two test rounds that the tester's
happy-path checks missed:

1. **`--list` removal broke a shipped consumer.** #5 deleted governance.py's
   parsed-but-unread `--list` flag. But `scripts/query-governance.sh` forwards
   `"$@"` to governance.py and documents `query-governance.sh --list` as usage
   example #1; deleting `--list` made it an ambiguous argparse prefix of the
   surviving `--list-required-*` flags → exit 2. Baseline exited 0 and listed.
   Fix = **WIRE** `--list` to actually perform the listing (the AC's alternative
   branch), not delete it. Rewound to build (the one test rewind).
2. **Second round, distinct regression, same class.** On the corrected code the
   Critic found that #4's `check-traceability.sh` single-`jq`-pass demux
   (`field⇥value` lines + `awk`) silently DROPS a value containing an embedded
   newline (splits into an untagged second line). The tab case had been fixed
   but not the newline. This was the second code-caused test failure with the
   rewind budget spent → deterministic `TEST_GATE_FAILURE` → RETRY.

Rather than whack-a-mole a third patch to the fragile tab/newline framing,
`job_20260720_0001` re-implemented the five items with the multiplexing robust by
design at BOTH sites (governance.py `--emit` and check-traceability.sh): preserve
embedded tabs (first-delimiter-only demux), fail LOUDLY on embedded newlines. It
seeded from the prior job's vetted worktree (all items had passed except the two
Critic findings), added the one net-new consistent guard, and reached PROMOTE
first-attempt on every phase.

## What worked well (measured)

- **Consensus caught two real regressions the tester missed.** Both were
  behavioral edge/consumer cases (an interface's other consumer; a
  newline-in-value). The adversarial Critic — rendering scaffolds and
  constructing edge inputs — is the reason neither shipped.
- **Two-stage validation (container PROMOTE → Mac re-validate) is essential.**
  The container's job is correctness on the logic; the Mac's job is the target
  runtime. Only the second caught the bash-3.2 empty-array abort.
- **Seeding a retry job from the prior vetted worktree** made the redesign fast
  and low-risk: copy the known-good files, apply the one net-new fix, re-verify.
- **#7 verified ad-hoc, no committed test.** `copier.yml` does not render into
  generated projects and the smoke CI runs `{{cookiecutter.project_slug}}/tests/`
  INSIDE a rendered project (no copier.yml there), so an in-project copier test
  is nonsensical. Verified by parsing `_tasks` (no rm/find; list-form =
  shell=False), dual-engine render diff of the removed-file set vs baseline, and
  a `.git`-sentinel check — at the test gate, not as a shipped file.

## Friction / findings

1. **(Skill fix, applied) F-13 host-runtime blindness** — see headline; added to
   SKILL.md F-9.
2. **`make`-target tests fail on template source.** #6/#5 governance tests that
   run `make <target>` hit Jinja in `Makefile.fragments/*.mk` ("missing
   separator") when pytest runs against the template source rather than a
   rendered project. Guarded with `pytest.skip` when the Makefile contains
   unrendered Jinja. (No skill change — target-repo test hygiene.)
3. **BRIEFING vs YAML REC count.** #5 fixed governance-rules.yaml's own
   `RECOMMENDED (4)`→`(3)` comment (3 REC directives in the YAML), but
   `docs/BRIEFING.md` legitimately documents four (REC-001..004). Left the
   briefing/yaml delta for a separate decision — do NOT "fix" the briefing to 3.
4. **Codacy assert-noise is repo-tolerated.** The repo does not uniformly `# nosec`
   test asserts (test_governance_loader.py on main has bare asserts), so the new
   tests' B101/semgrep findings are consistent with `main`; `main` is unprotected
   so they do not block. One soft complexity warning on the wired
   `emit_directive_listing` was accepted rather than refactored (refactoring the
   `--list` path risks re-breaking the parity that caused RETRY #1).

## Skill changes resulting from this run

- SKILL.md § "Environment & runtimes (F-9)": added **F-13 host-runtime
  blindness** — container-green is necessary not sufficient; exercise
  shell/runtime-sensitive changes on the target interpreter (with empty/edge
  inputs) before merge. Field-validated by the bash-3.2 empty-array regression.

## Ledger

| Item | Value |
| --- | --- |
| Jobs | `job_20260719_0002` (RETRY) → `job_20260720_0001` (PROMOTE) |
| Mode | patch (cloud container) → `git am` + PR on Mac |
| Scope | issue #111 items #3–#7; #1/#2 already resolved by #110/#132 |
| RETRY 1 cause | Critic: deleting `--list` broke `query-governance.sh --list` (rewound to build; fix = wire `--list`) |
| RETRY 2 cause | Critic: `check-traceability.sh` newline silently dropped → 2nd code fail, rewind budget spent → `TEST_GATE_FAILURE` |
| PROMOTE | job_20260720_0001, exit 10 (one benign `review-risk-assess=medium` warn); 7/7 gates, consensus 2 rounds clean, grader 6/6 |
| Post-PROMOTE fix | macOS bash-3.2 empty-array abort (`${arr[@]+…}` guard), caught only by Mac validation; operator-completed + re-validated on the target runtime |
| Ship | PR #148 → squash `28df24b` on `main`; #111 auto-closed |
| Dashboard | fifteenth post-merge sync, PR #149 (`ee24ce1`) |
| Local validation | pytest failure-set parity vs main (0 new; +25 passing, 2 skipped); 5 governance scripts byte-identical under macOS bash 3.2 incl. empty-list; TS scaffold `npm test` pass; shellcheck 0 |
| Skill change | SKILL.md F-9 → **F-13 host-runtime blindness** |
| Evidence | `agentic-starter-kit/artifacts/job_20260719_0002/` + `.../job_20260720_0001/` |
