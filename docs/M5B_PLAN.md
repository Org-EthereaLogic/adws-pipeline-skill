# M-5b Plan — Harness Improvement

**Scope class:** harness (M-series). **No validator changes, no fixture `expected` changes,
no parity refreeze.** Independent of every other package; nothing depends on it.

## 1. Findings register

| Finding | Evidence | Action |
|---|---|---|
| `Makefile` and `.githooks/pre-push` claimed Tier 2 "closes F-13". F-13 is a macOS **bash-3.2** defect; `orb-ci.sh` varies only the **Node** version on `linux/arm64`. The claim is false as written. | `AUDIT_2026-08-08.md` §1 | B3 |
| 33 of the first 73 recorded gate runs were `dirty: true`, so `git_commit` names a tree that was never under test. | `ci_logs/local_ci.jsonl` | B2 |
| `SC8_PLAN.md` §7 and the issue-#22 field record both used F-58/F-59 for **different** findings. Separately, F-11/F-12/F-13 existed only as `SKILL.md` headings — the register jumped F-10 → F-14. | `AUDIT_2026-08-08.md` §5 | B5 |
| `guard-ablation` shipped narrow by design, pending measurement. | `M5A_PLAN.md` §2/A2 | B6 |

## 2. Actions

### B3 — the `ci-orb` claim, restated, and the axis actually covered

Claim restated in `Makefile`, `.githooks/pre-push` and `scripts/local-ci/README.md`. Then
Tier 1 gains **`bash32-scan`**, which covers the real F-13 axis: it looks for the trigger
construct — a bare `"${arr[@]}"` under `set -u` — in the shell scripts this repo owns, and
names the safe idiom `${arr[@]+"${arr[@]}"}`.

It went red on its first run. Three hits were **its own explanatory comments** (the same
false-positive class `requires-lint` had, found the same way), so comments are stripped
before matching. Three were real sites in `gate.sh`, `orb-ci.sh` and `review.sh`; all three
were made safe rather than waived. Every one of those arrays happens to be non-empty today
— and "happens to be non-empty" is precisely what F-13 punished.

### B2 — `tested_tree`, and the version of it that was wrong

**The first design was wrong and is recorded rather than quietly replaced.** It hashed
`git diff HEAD` plus `git ls-files --others`. `git diff HEAD` omits untracked file
*contents*; `git ls-files --others` lists untracked *filenames*. Verified directly: two
worktrees differing solely in an untracked file's contents produced **identical** digests
under both.

The shipped version builds a real tree object through a temporary index —
`GIT_INDEX_FILE=$(mktemp -u) git add -A && git write-tree` — which covers tracked
modifications and untracked contents together, respects `.gitignore` (so `artifacts/` and
`ci_logs/` do not churn it), and never touches the real index. Verified to distinguish both
an untracked content change and the file's presence. When the tree is clean it equals
`HEAD^{tree}`.

Worth recording because the broken version looked entirely plausible and would have shipped
a field that *appeared* to identify the tested tree without doing so — the same shape as a
fixture that appears to pin a rule and does not.

### B5 — the finding-ID collision, and the lint that was NOT shipped

The register definitions in `SC8_PLAN.md` §7 keep F-58/F-59 (they are cited by §8 and by
`VERIFICATION.md`); the issue-#22 field record is renumbered to **F-70** and **F-71** with a
note at each. F-11/F-12/F-13 are backfilled into `VERIFICATION.md` with their dates and
their current homes. **No evidence tree was rewritten** — SC-8 §6's precedent holds that
trees are append-only history, so only prose moved.

**A `finding-ids-lint` was prototyped and rejected.** Probed against the corpus it would
have reported 47 "multiple definition" violations, because a finding legitimately appears in
several plan registers, in `DPPD.md`, and in `VERIFICATION.md` — "one definition per ID" is
not this repo's convention. Worse, it would **not** have caught the actual collision, since
both F-58s were headings in different files and only their *titles* differ. The mechanical
checks that remain (contiguity — currently F-0…F-71 with no gaps; and has-at-least-one-
definition — which flags F-0, F-1, F-42, F-43) are either satisfied or low-value.

The repo's own field record says it: *"when a parser heuristic needs a third patch, delete
it and accept the over-report."* This one was on patch two with no convergence in sight, so
it was dropped rather than tuned. The four IDs with no definition are recorded here instead.

### B6 — generalize `guard-ablation`, on measured data

Extended from three packs to **all nine**, decided on M-5a/A2's measured cost rather than an
estimate. Nine packs: **109 mutants, 1,446 `execute()` calls, 47 ms** — cheap enough that
narrowing buys nothing.

Two things had to be fixed to sweep the full set. `drift-sentinel` failed the pristine
sanity floor because the frozen baselines encode `undefined` as `exec-one.js`'s
`"__UNDEFINED__"` sentinel while an in-process call sees real `undefined`; the comparator
now treats them as equal. That floor doing its job is the reason the pack was not swept
silently and wrongly.

**The sweep found 19 unpinned rules across six validators no scope change had ever swept.**
They are recorded in `parity/guard-ablation-baseline.json` as `class: unpinned` with an
owner, not fixed: closing them means new fixtures in four more packs, each needing a version
bump and a refreeze — validator work, and M-5b changes no validator. Recording converts 19
invisible gaps into 19 tracked ones, and the rule is bidirectional, so an entry that stops
surviving fails the gate until it is deleted.

The **wider operator catalogue is still not adopted.** Two operators already surfaced 19
gaps; adding more before those close would grow the accepted list faster than anyone works
it down. `execution-report.js` is named as the next candidate surface but needs a different
mechanism — mutating a report generator means rebuilding job trees, not calling
`execute(input)`.

## 3. Invariants held

1. No validator behaviour changes; parity stays 108/108 with no refreeze.
2. No fixture `expected` value changes.
3. No evidence tree rewritten during the renumber.
4. `tested_tree` is additive to the JSONL record; nothing reads it as a gate input.

## 4. Verification — by falsification

| Claim | Falsification | Result |
|---|---|---|
| `bash32-scan` covers the F-13 axis | — | Went red on first run; 3 comment false-positives fixed, 3 real sites made safe |
| `tested_tree` identifies the tested tree | Change only an **untracked file's contents** | Digest changes (the case both naive digests missed); removing the file changes it again |
| The 19 gaps are tracked bidirectionally | Delete three accepted entries → reported as NEW SURVIVORS. Add a nonexistent entry → reported as STALE | Both directions fail the gate |
| The `undefined` sentinel is handled | — | `drift-sentinel` now passes the pristine floor and is swept |

**Gate at HEAD:** 14/14 steps pass.

## 5. Rejected

- **`finding-ids-lint`** — see B5. Rejected on a probe, not on principle.
- **The wider mutation-operator catalogue** — see B6. Deferred until `accepted` is near empty.
- **Fixing the 19 unpinned rules here** — that is validator work; M-5b changes no validator.

## 6. Observed, not changed

- **F-0, F-1, F-42 and F-43 have no definition anywhere** — they are referenced but never
  defined in a heading or register row. Surfaced by the rejected lint's probe and left as a
  known gap rather than back-filled speculatively.
- **`execution-report.js` remains the largest unswept surface in the repo** (~1,400 lines,
  24 fixture job-trees), and SC-11's own first-cut fixtures were vacuous there. That is the
  strongest single argument for the next sweep.
