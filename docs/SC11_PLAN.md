# SC-11 Plan — Evidence That Means Something

**Scope class:** report integrity + spec. Report fixtures 21 → 24, provenance 3 → 5.
**No `SCHEMA_VERSION` bump, no new decision, no new exit code, no validator changes, no
parity refreeze.** Depends on M-5a and SC-9.

## 1. Findings register

| ID | Finding | Evidence | Action |
|---|---|---|---|
| **F-69** | `safeReadJson` caught every error and returned `null`, so `EACCES`, `EISDIR`, a truncated write and a JSON syntax error were indistinguishable from "never written" — in the one tool whose purpose is tamper-evident evidence. | `AUDIT_2026-08-08.md` §2 | A1 |
| — | Three verdict vocabularies and two exit vocabularies existed with no written mapping, and `SKILL.md` documented `execution-report.js` as exiting "0/10/1/2", omitting exit 3 — which is reachable four ways and already asserted by the report suite. | `AUDIT_2026-08-08.md` §2 | A2 |
| **F-17** | No per-phase invocation provenance. Open since SC-3 across five scope changes. Thirteen field runs, thirteen × `model_used=null, cost_usd=null, token_count=null`; three record wall-clock. | `SC3_PLAN.md:41`; `DRILL_EVIDENCE.md:14-22` | A3 |
| — | Grader mandate ambiguity, open since a field run graded the same class of criterion two defensible ways — deciding exit 10 versus exit 0. | `issue119:111-132`; `adws-grader.md:17` | A4 |
| — | Four runs lost the evidence tree at teardown; one record calls it the *third* time that cost a verifiable claim. | `issue4:24`, `issue104:170`, `DRILL_EVIDENCE.md:5` | A5 |

## 2. Actions

### A1 — evidence integrity (F-69)

`ENOENT` is the only benign absence. `ENOTDIR`, `EISDIR`, `EACCES` and JSON syntax errors
become recorded integrity problems, and any such problem **fails the gate** — routed
through the existing FAIL → `decideLifecycle` → QUARANTINE (exit 2) path, so no new
decision, exit code or schema version.

The integrity term sits **above** `evalSkillsClean`'s no-outcomes early return. That
placement is SC-8/A11's lesson restated: an integrity check underneath an early return
gates nothing.

The accumulator is module-scoped rather than threaded through all eleven call sites, which
sit in eight functions with unrelated signatures; it is reset at the top of `buildReport()`,
the single entry point, so a process that generates two reports (the fixture runner does)
cannot leak problems between them.

### A2 — document the vocabularies; fix the one outright error

`SKILL.md` now documents exit **3**. `references/validator-inputs.md` gains the mapping
table and the sentence that existed nowhere: *a validator's `fail` is exit 0 — the verdict
is data, not a process outcome; reading a validator's exit status as its verdict is a
category error.* Also written down: the degenerate-input rule (fact → fail, heuristic →
warn) with each validator's behaviour and why, **documented rather than harmonized**.

### A3 — F-17 closed WONTFIX-with-substitute

The data is not obtainable: the runtime does not expose per-subagent token or cost
accounting to a skill. So the finding closes, and the split becomes explicit:

- **Structurally unavailable** — `model_id`, `cost_usd`, `tokens_in`, `tokens_out`,
  `tool_call_count`: keys **retained** and written `null`.
- **Obtainable, therefore mandatory** — `started_at`, `completed_at`, derived
  `wall_clock_s`, `agent`, `model_tier_requested`, typed and asserted.

**Correction to the first draft.** It proposed *removing* the three always-null keys on the
reasoning that "a field that is always null is a claim that data exists". That reasoning
does not survive its cost: removal is a breaking schema change to every recorded evidence
tree and every reader, and it sits badly beside this package's own no-bump posture. An
explicitly-documented-unavailable field is no less honest than an absent one, and only the
retained-and-null form lets a reader distinguish *not captured* from *field dropped*.

Provenance fixtures 3 → 5: one asserting the mandatory shape (including that `wall_clock_s`
agrees with the two stamps it derives from), one asserting **rejection** of the shape
thirteen field runs actually produced. Five new type-rejection cases cover malformed and
fabricated stamps — the exact failure `DRILL_EVIDENCE.md` recorded as *"timestamps are
agent-authored placeholders … treat timeline metadata as synthetic."*

### A4 — the grader mandate is diff-only, and tightened

Decided rather than left ambiguous. Diff-only wins because: the grader's independence comes
precisely from not sharing the pipeline's evidence; reproduction would make the verdict
depend on an environment nothing records, and evidence that varies with an unrecorded
environment is not evidence; and executing the change is the verifier's job, so reproducing
it in the grader is a role collision.

A criterion satisfiable only by execution now has a defined path rather than a judgement
call: if the diff carries a demonstrating test, grade `satisfied` and cite it; if not,
grade `partial` with `requires_execution: true` — **the absence of a demonstrating test is
the finding.** The grader spec also now states what a `pass` does not mean: it certifies
criterion coverage, not correctness. That is the field record's own conclusion after a
12/12 grade certified a validator carrying an information-disclosure path.

### A5 — archive before teardown, to a durable destination

**Correction to the first draft.** It proposed writing `artifacts/{jobId}.tar.gz` and
checking it non-empty. That under-reads the failure: the records show the tree was *"not
committed to the PR head and not retained locally"* — the archive was not absent so much as
written somewhere disposable. Writing the tarball beside the source tree reproduces exactly
that when the whole checkout is the disposable thing, which is the normal case in
cloud/patch-mode runs.

Three mandatory parts: a **durable destination outside the worktree and the target
checkout** (`execution.evidence_archive_dir`, an intake-visible gap when unset); **path and
sha256 recorded** in `run_manifest.evidence_archive`; and **verification by extraction** —
extract and confirm `execution_report.json` and every `phase_manifest.json` are readable,
because a truncated tarball is non-empty. If any step fails, the worktree is not removed.

## 3. Invariants held

1. **No `SCHEMA_VERSION` bump, no new decision, no new exit code.** Integrity routes
   through the existing FAIL path.
2. **No validator changes, no fixture `expected` changes, no parity refreeze.** Parity
   stays 108/108.
3. **The provenance schema is additive.** No key removed; the five unavailable fields keep
   their names and are written `null`.
4. **A1 did not over-correct** — absence still routes through unverified → warn (exit 10),
   pinned by `promote_absent_optional`.

## 4. Verification — by falsification

| Claim | Falsification | Result |
|---|---|---|
| A1's discrimination gates | Restore the catch-all `safeReadJson` | Both quarantine fixtures flip to **PROMOTE exit 0**; `promote_absent_optional` stays green |
| A1's gate term gates | Keep the discrimination, disable the `evidenceProblems` term only | Same flip — F-58's exact shape, enumerated rather than assumed |
| A1 tolerates absence | — | `promote_absent_optional` (an optional subtree removed entirely) promotes at exit 10 in every variant |
| A3 rejects the historical shape | — | `reject-missing-wall-clock.json` is the shape 13 field runs produced; it now fails validation |
| A3's derivation is checked | — | `wall_clock_s` must equal `completed_at - started_at` |
| The `requires` lint is trustworthy | Add `require('lodash')` to `entropy-gate.js` | Named and failed |

**The fixtures were vacuous on the first cut, and that is worth recording.** Both new
quarantine fixtures initially targeted `build/attempt_1/phase_manifest.json` — but missing
phase evidence already fails `pipeline_completion`, so the job quarantined **with the fix
fully reverted**. They pinned nothing. Rebuilt against files whose absence is *tolerated*
(a `skill_trace.json` and a `consensus/advocate.json`), so `skills_clean` via the integrity
term is now the only gate that can produce the verdict.

That is the same defect class as the field record's *"deleting the guard left both fixtures
green"* — reproduced here, in this package's own work, and caught only by hand-falsification
because `guard-ablation` covers validators and not `execution-report.js`. Extending it there
is the strongest single argument for M-5b/B6.

**Gate at HEAD:** 13/13 steps pass.

## 5. Rejected

- **Unifying `rubric_result` / `action` / `decision`, or the stderr prefixes.** Three
  fields naming three different things; renaming touches 108 parity fixtures, 24 report
  fixtures, five references and every recorded evidence tree, for zero behavioural gain.
  The genuine hazard is a documentation gap and the only real defect was the omitted exit 3.
- **Removing the three always-null provenance keys** — see A3.
- **A separate `EVIDENCE_INTEGRITY` decision or exit code.** QUARANTINE already means
  "stop and preserve the evidence", which is exactly right here, and SC-8 §3's invariant
  that the decision set is closed is worth more than a more specific label.

## 6. Observed, not changed

- **`requires-lint` had a false-positive bug**, matching `from "…"` inside comment prose
  and failing correct code. Found by writing a comment containing the phrase. Fixed here
  (comments are stripped before scanning) because a gate step that cries wolf is worse than
  no gate step — but it is a reminder that these lints are regexes over source, not parsers.
- **`guard-ablation` does not cover `execution-report.js`.** Its 1,400 lines and 24 fixture
  job-trees are the largest un-swept surface in the repo, and this package's own vacuous
  first-cut fixtures show what that costs. M-5b/B6.
- **The archive rule is prose the orchestrator must follow, not code.** Nothing mechanically
  verifies that a durable destination was used; the recorded `sha256` makes a later audit
  possible but does not prevent the loss. Closing that properly needs a script, and a script
  needs a runtime contract for where "durable" lives.
