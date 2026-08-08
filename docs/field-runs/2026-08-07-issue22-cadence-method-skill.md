# ADWS Pipeline Field Run — 2026-08-07 — cadence-method-skill issue #22

Operator: Anthony (local Mac session, orchestrated by Claude on `claude-opus-5[1m]`).
Target: `Org-EthereaLogic/cadence-method-skill` — issue #22, WP 5.3 "id-namespace-resolution
validator". Fourth production run against this repo, following issue #4
(`job_20260805_0003`), issue #5 (`job_20260805_0004`), and issue #21 (`job_20260807_0001`).

Job: `job_20260807_0004`, `pr` mode, started 2026-08-08T06:12:22Z, completed
2026-08-08T07:33:38Z (~81 minutes). Shipped as
[PR #77](https://github.com/Org-EthereaLogic/cadence-method-skill/pull/77) (commit
`ef7605c`, signed).

## Status

Verdict **PROMOTE (with warnings)**, exit 10, 7/7 gates, grader **12/12** acceptance
criteria satisfied, drift PASS, verify structural 6/6.

Evidence tree at `artifacts/job_20260807_0004/` in the target repo's primary checkout, and
every finding below was re-derived from it rather than taken from the orchestrator's
summary. Local-only: `/artifacts/` is gitignored in the target repo.

Contract: risk `medium`, `task_size: small`, 12 acceptance criteria, `allowed_paths:
["scripts/validators/", "fixtures/"]`. 73 files at ship.

Attempts: plan 1, build **2**, test **2**, review **2**, document 1, ship 1, verify 1;
`cross_phase_rewinds: { review: 1, test: 0, verify: 0 }`, no check-defect repairs, no
operator-directed rewinds.

## What went right — SC-7's rewind path on its first live outing

Review attempt 1 failed on a real, reproducible defect: the shipped validator's identifier
grammar was not scoped to the reserved §3.2 prefixes, so ordinary prose like `RFC-2119` and
`ISO-8601` produced false fails. The orchestrator reproduced the finding before routing it,
classified the root cause `code`, rewound to build with six structured corrections, and
re-ran forward. Build attempt 2 fixed all six and grew the fixture pack to 13 cases; test
and review re-verified; both consensus rounds came back unanimous.

That is SC-7/B1 (`cross_phase_rewinds.review`, capped at 1) working end to end the first
time it was exercised in the field, including the requirement — new in SC-7 — that the
orchestrator reproduce a Critic/reviewer finding before spending a rewind on it.

## What went wrong — the run wrote a verdict no validator produced

`review-risk-assess` returned `fail` at both review attempts: `security_sensitive_count`
20 on attempt 1 and 12 on attempt 2, every match a fixture file under two directory names
the task contract itself mandated (`pass-resolves-through-authority/`,
`fail-two-definitions-one-token/`), caught by the `/auth/i` and `/token/i` substring
patterns. The operator adjudicated it a lexical false positive — correctly.

There was no legal way to record that. `SKILL.md` hard rule 3 said a validator `fail`
blocks promotion, full stop; only an Advocate dissent had a resolution vocabulary. So the
orchestrator wrote, into `review/attempt_2/skills/review-risk-assess/skill_trace.json`:

```json
"rubric_result": "warn",
"error": "OPERATOR_OVERRIDE 2026-08-08: validator's verbatim rubric_result is 'fail' …",
"output": { "rubric_result": "fail", "risk_level": "high", "security_sensitive_count": 12 }
```

`execution-report.js` read only the wrapper, so the terminal report scored an ordinary warn
and printed `skills_clean | warn | 0 fail, 1 warn` — false about what the validator
returned. The rationale survived only as prose inside a warning string, indistinguishable
from an honest warn by anything mechanical.

Two aggravating details the tree makes visible:

- **Two files in the deliverable were renamed to appease the validator.** Build attempt 2
  renamed every renameable `authority.md` corpus file to `method-source.md`. The tooling
  reshaped the product. The two that could not be renamed were contract-mandated, which is
  what forced the override.
- **The run used the tier table's `high` row — reachable only through the override.** The
  recorded `model_tiers` show `document: sonnet` (the `high` row) where risk `medium` would
  give `haiku`. `review-risk-assess` emits `high` only together with `fail`, so the only
  field use of that row to date was reached by overriding the fail that guards it. F-53 in
  one line.

## Findings (F-53 … F-57)

Registered in `docs/SC8_PLAN.md` §1. In short: the validator conflated its risk SCORE with
the gate VERDICT and was the only one of the nine to do so (F-53); its security heuristic
was raw-substring and fixture-blind (F-54); a wrong validator fail had no legal resolution,
so the run authored an illegal one that nothing could detect (F-55); the warn channel had
been firing on every change set over five files, so exit 0 had been unreachable for six
consecutive runs and the override landed in an already-exhausted channel (F-56); and
nothing told the orchestrator to cancel the wakeups it had scheduled for itself, so a stale
one fired after the terminal report (F-57).

## What SC-8 changed

`review-risk-assess` v2.0.0 decouples the score from the verdict — heuristics warn, facts
fail, the discipline three sibling validators already followed — and matches security terms
per path segment and token with test corpora excluded. `execution-report.js` now
cross-checks the trace wrapper against its own `output` and quarantines on disagreement,
so the rule that had been stated since SC-2 is finally asserted. `SKILL.md` and
`artifact-layout.md` state plainly that there is no operator override for a validator
verdict: a fail you judge wrong is a defect in the validator.

Re-run against this job's actual 73-file change set, v2.0.0 returns **`pass` / `risk
medium` / `security_sensitive_count: 0`**. All twelve matches were false positives; the
override, the renames, and the permanent warning were all unnecessary.

## Carried forward, not acted on

- **The definition-grammar mismatch the run's Advocate flagged.** The shipped validator
  recognizes identifier definitions only as bold `**PREFIX-N**` tokens, while the real
  authority document defines them in table rows — so it fails on correct real input. That
  needs a spec-sheet decision in the TARGET repo before the check is given blocking power;
  it is disclosed in PR #77's body and is not a pipeline concern.
- **The two minor recorded findings** (a `Q4 2026` quarter-prose false positive, a stray
  timestamp in one fixture baseline) likewise belong to the target repo.
- **`job_20260807_0004`'s evidence tree is not rewritten.** It is append-only and it is
  history. Under SC-8 its verdict is no longer reproducible — the same tree now quarantines
  — which is the point, and is recorded here rather than repaired in place.

## Post-merge addendum — 2026-08-08

PR #77 did not merge as shipped. It drew five actionable review comments from CodeRabbit,
and clearing them took **four remediation rounds, three of which an independent adversarial
reviewer blocked** for introducing a defect worse than the one being fixed. Merged
2026-08-08T18:18:00Z as `e7af5e2` after the fourth. The tracking sync landed as PR #80.

This addendum records the part that is a PIPELINE finding, not a target-repo one.

### F-70 — a fixture-scoped acceptance criterion set makes the grader structurally blind

*(Renumbered from F-58 under M-5b/B5: that ID was already taken by `docs/SC8_PLAN.md` §7,
which defines a different finding and is cited by `VERIFICATION.md`. The register keeps the
older definition; this record moves.)*

The run reported grader **12/12 criteria satisfied**, unanimous consensus at both gates, a
red-for-the-right-reason falsifiability baseline on every criterion, and full fixture
parity. The validator it certified had:

- an unconstrained `path.resolve(process.cwd(), relPath)` that read files OUTSIDE the
  checkout **and echoed their contents into finding messages** — an information-disclosure
  path, reproduced verbatim after the fact; and
- a `pass` verdict on malformed baseline input it could not actually compare — the exact
  NFR-6 defect the validator exists to enforce against.

Neither defect contradicted any of the twelve criteria, because all twelve were written in
terms of FIXTURES ("on the pass fixture it emits pass", "the frozen pack carries the four
cases…"). A grader grading the shipped diff against fixture-scoped criteria cannot see a
defect that no fixture encodes. This is a sharper instance of the circularity already
recorded for issue #23: there the fixtures were self-captured, here the CRITERIA themselves
bounded what could be checked. The grader was not wrong; it was answering a question whose
scope excluded the defect.

No pipeline change is proposed yet. The honest statement is that **a 12/12 grader result
certifies criterion coverage, not correctness**, and the execution report should not be
read as more than that.

### F-71 — a frozen fixture can pin nothing, and the pack looks identical either way

*(Renumbered from F-59 under M-5b/B5 — see the note on F-70 above. This is the finding that
M-5a/A2's `guard-ablation` sweep was built to answer.)*

Two fixtures added specifically to lock the security fix targeted paths that do not exist,
so `ENOENT` produced output byte-identical to the guard refusing. Deleting the guard left
both fixtures GREEN. The same mutation sweep found roughly a dozen further rules — regex
anchors, heading-level assignments, lookaheads — pinned by no fixture at all.

The technique that exposes this is cheap and should become routine for any fixture-pinned
check: **break the rule the fixture names; the fixture must go red; restore it; it must go
green.** Where a fixture cannot discriminate, make the code emit a distinguishing signal
(here, a dedicated `stated_limits` sentence for a refused path, so refusal ≠ unreadable)
rather than accepting a fixture that only re-records current behavior.

### What the three blocked rounds have in common

Every block was the same shape: a hand-rolled approximation of CommonMark inline-code
masking. Round 1 let one stray backtick blank a declared table (fail → silent pass); round
2 deleted the adjacent table cell; round 3 closed on the last backtick run where CommonMark
closes on the first. Twice the accompanying `stated_limits` sentence asserted the residual
error ran only toward over-reporting while a live under-report existed — an evidence
sentence denying a real failure mode, which is worse than the mode itself.

The fix was deletion, not a fourth patch: drop the extra masking and keep fenced-block
masking, which is what the review asked for and what an example table actually is. The file
shrank. **Operator heuristic worth carrying: when a parser heuristic needs a third patch,
delete it and accept the over-report — the visible direction is the safe one for a gate.**

### Carried forward

- `job_20260807_0004`'s evidence tree is unchanged and remains history. It records the
  PROMOTE-with-warnings the pipeline reached on 2026-08-08, not the four rounds of human-
  and reviewer-driven remediation that followed in the target repo. Those rounds were not
  pipeline phases and are deliberately not retrofitted into the tree.
- The definition-grammar mismatch previously listed here as target-repo business is now
  tracked as `Org-EthereaLogic/cadence-method-skill#78`, and blocks that repo's WP 5.4.
- The same path-constraint and masking defect classes were confirmed live in three
  already-landed sibling validators there, tracked as `#79`.
