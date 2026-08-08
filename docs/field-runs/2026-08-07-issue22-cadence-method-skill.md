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
