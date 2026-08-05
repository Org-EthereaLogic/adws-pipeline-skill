# SC-5 Plan — Full Criterion Coverage in `check_specs`

**Status:** APPROVED (operator R-6, 2026-08-05, per item A1–A3) & IMPLEMENTED.
`DPPD.md` §14 is the governing record (v1.5), and `WBS.md` records the implementation.
This document is retained as the originating plan and verification ledger
(`SC4_PLAN.md` is the precedent format).

**Evidence source:** a production field run against `Org-EthereaLogic/cadence-method-skill`
issue #4 (job `job_20260805_0003`, 2026-08-05).

**Evidence boundary (F-34) — one standard, applied everywhere.** The run's evidence tree was
not retained, so the following are **orchestrator-reported and not independently
re-derivable**: that `criteria-to-checks` emitted exactly **7 check specs for 8 acceptance
criteria**, that the omitted one was AC-4 (*"…output format is specified as…"*), that the
orchestrator noticed the mismatch and had the tester cover AC-4 manually, that nothing
therefore shipped ungraded, and that the run reached PROMOTE. Any summary of this scope
change must carry the same attribution — see `VERIFICATION.md` "SC-5 scope change".

What **is** independently established, from the committed validator alone: v1.1.0 classed
the *"is specified as"* construction vague because no form of *specify* was in the
outcome-verb regex, and its `execute()` built `check_specs` from the verifiable list only —
so a criterion classed vague was omitted from the array outright. The mechanism is therefore
proven from code; only the run's specific tally rests on the report. That distinction is
sufficient for this scope change: SC-5 fixes the mechanism, and the mechanism is the part
that is verifiable.

The defect is that noticing was required at all — the drop left no trace of its own.

**Numbering:** continues the findings register (last: F-26, escalation-at-cap fixtures,
`SC4_PLAN.md` §1). New findings: **F-27 … F-30**.

**Decision boundary this plan enforces:** the classifier stays a **pure lexical function**
(NFR-1) and the rubric stays exactly as it was. What changes is what the validator *emits*,
not what it *judges*. `rubric_result`, `criteria_count`, `verifiable_count`, and
`vague_count` are computed by the same code paths before and after — measured against the
frozen corpus, **zero verdicts and zero counts moved**. This is the invariant that keeps a
verb-list edit from becoming a gate change, and it is why the widened regex could be taken
in the same pass as the structural fix.

---

## 1. Findings register (field run job_20260805_0003)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-27 | defect (silent evidence loss) | **A lexical miss deletes the criterion instead of flagging it.** `check_specs` was built by mapping over `verifiable`, so a criterion the regex did not recognize was omitted from the array entirely rather than marked. The tester's work list silently shrank, and nothing — not the verdict, not the counts as consumed, not the skill trace — stated that a criterion had gone missing. The `vague_count` metric records *how many*, never *which*, and no consumer compared it against `check_specs.length`. Live impact **as reported by the orchestrator** (not re-derivable, per the evidence boundary above): 1 of 8 criteria dropped. | `criteria-to-checks.js:46` (pre-change `verifiable.map(...)`); field run `job_20260805_0003` |
| F-28 | design gap | **The verifiable-verb set is undersized by roughly two orders of magnitude of coverage.** A 127-verb probe of ordinary acceptance-criterion language against the v1.1.0 pattern found **126 unmatched** — the specification family (`specify`, `list`, `state`, `declare`, `describe`, `document`, `record`, `populate`), the mutation family (`write`, `add`, `remove`, `replace`, `append`, `parse`), and — in the validator that gates the **test** phase — `fail`, `assert`, `skip`, `warn`, and `require`. v1.1.0 covered `pass` but not `fail`. | `criteria-to-checks.js:28` (v1.1.0 alternation); probe reproduced in §4 |
| F-29 | defect (cosmetic) | **Three v1.1.0 alternatives match non-words.** `runn?(?:s\|ing)?` matches `runn`/`runns`, `sett?(?:s\|ing)?` matches `sett`, and `outputt?(?:s\|ed\|ing)?` matches `outputt` — artifacts of the SC-1 patch's optional-consonant shorthand. No real criterion is affected; the cost is that the pattern misstates its own contract to the next reader. | `criteria-to-checks.js:28` |
| F-30 | contract contradiction | **Two rules the tester cannot satisfy simultaneously once F-27 fires.** `adws-tester.md` calls `check_specs` "the single source of truth for which criteria map to checks" and forbids re-classifying criteria in a parallel scheme, while `policy.test_policy: required` demands that "every criterion needs an executed check". For a dropped criterion these instructions are mutually exclusive, and the agent has no sanctioned way to notice — the array it is told to trust is precisely the artifact that lost the criterion. | `.claude/agents/adws-tester.md:15-17` vs `:17-20` (pre-change); `phase-gates.md:32` |

**Root cause.** F-27 and F-30 are one defect seen from two sides: an *allowlist* classifier
was wired to a *coverage* contract. An allowlist is necessarily incomplete — F-28 measures
how incomplete, and SC-1/F-2 already demonstrated the same failure once
(`acceptance/DRILL_EVIDENCE.md:78`). Extending the list treats the symptom; the mismatch
between "we could not confirm this criterion is testable" and "this criterion is not our
concern" is the disease.

---

## 2. Actions

| # | Action | Surface |
|---|---|---|
| A1 (F-27, F-30) | **`check_specs` carries every criterion, in input order, typed `behavioral` \| `unclassified`.** `unclassified` states that the classifier found no outcome verb — a fact about the wording, not a verdict on the criterion. `check_id` becomes index-stable (CHK*n* is the *n*-th criterion), which it was not before. The rubric and all three counts are unchanged. Consumers are told plainly that `check_specs.length` always equals `criteria_count`, so a mismatch is a defect rather than an expected narrowing. | `criteria-to-checks.js` (`execute`); `adws-tester.md`; `phase-gates.md`; `SKILL.md` |
| A2 (F-28) | **Widen the verb set by ~40 families**, matching the existing base + `-s/-es` + `-ed` + `-ing` style. Admitted only where the word is unambiguous outcome language. Explicitly **not** admitted: bare `is`/`are`, `look`, `feel`, `seem` — they match the subjective controls (`"the code is clean"`, `"the layout looks modern"`) and would suppress the warn signal. Under-matching is now safe (A1 keeps the criterion); over-matching is not, because it silently mutes the only vagueness signal the gate has. | `criteria-to-checks.js:28` |
| A3 (F-29) | Replace the three artifact alternatives with real-form equivalents: `run(?:s\|ning)?`, `set(?:s\|ting)?`, `output(?:s\|t?ed\|t?ing)?`. Verified equivalent across every real English form of all three verbs — the old and new patterns differ *only* on `runn`, `runns`, `sett`, `outputt`. | `criteria-to-checks.js:28` |

Version: `1.1.0` → **`2.0.0`**. The major bump is warranted by A1: the emitted array's
semantics change for consumers, even though no key was added or removed.

---

## 3. Invariants held

1. **Rubric and counts frozen.** `rubric_result`, `criteria_count`, `verifiable_count`, and
   `vague_count` are unchanged for every one of the 14 pre-existing fixtures — measured, not
   asserted. Five fixtures re-baseline on `check_specs` alone; nine are byte-identical.
2. **The vagueness signal survives full coverage.** `warn-unclassified-majority-still-warns`
   exists specifically to prove that emitting a spec for every criterion did not stop the
   rubric from complaining about vague ones.
3. **The eight original-parity packs are untouched** and still verified byte-for-byte
   against the ADWS_Pro originals. `criteria-to-checks` remains the sole diverged-by-design
   pack.
4. **No new script, runtime, or dependency** (NFR-2); pure function preserved (NFR-1); Node
   built-ins only (NFR-4); `SKILL.md` at 367 lines (NFR-3 < 500).
5. **Verdict taxonomy frozen** — no new DECISION, exit code, or reason-set entry.
   `execution-report.js` is untouched; `SCHEMA_VERSION` stays 1.2.0.
6. Parity suite **84 → 88** (four new fixtures); report 15/15, entropy 7/7, provenance 3/3,
   and the SC-3 micro-drill unchanged.

---

## 4. Verification

**The probe behind F-28** (reproducible; `isVerifiable` is pure, so a neutral carrier
sentence isolates the verb from incidental matches such as *output*, *exit*, or *reference*
elsewhere in the sentence):

```js
const v = require('./adws-pipeline/scripts/validators/criteria-to-checks.js');
const carrier = w => 'The widget ' + w + ' the thing for each item';
// against v1.1.0: 126 of 127 probed verbs classify the carrier as vague.
```

**Corpus regression (A2/A3 safety).** Simulating the widened pattern against all 14
pre-existing fixtures before implementing: **0 rubric flips, 0 count flips.** All seven
subjective controls (`"The code is nice and clean"`, `"The code is clean"`, `"Code is
good"`, `"The UX feels intuitive"`, `"Performance is good overall"`, `"The layout looks
modern and fresh"`, `"Looks polished"`) stay vague; every previously-verifiable criterion
stays verifiable.

**New fixtures (4).**

- `pass-specification-verbs` — the specification family, opening with the exact AC-4
  phrasing from the field run.
- `pass-gate-and-mutation-verbs` — `fails`/`skips`/`warns`/`asserts`/`removed`/`applies`/
  `exists`.
- `unclassified-specs-cover-every-criterion` — the A1 guarantee: `check_specs.length ===
  criteria_count`, with an unrecognized criterion present as `unclassified` between two
  behavioral ones (which also pins index-stable `check_id`s).
- `warn-unclassified-majority-still-warns` — invariant 2.

**Re-baselined fixtures (5).** `checkspecs-verifiable-only`, `pass-minority-vague`,
`warn-majority-vague`, `warn-majority-vague-new-verbs`, `warn-no-outcome-verb` — each gains
the previously-dropped criteria in `check_specs` and nothing else. Every `note` was amended
in place to cite SC-5 rather than rewritten, per the repository's supersession style
(`acceptance/DRILL_EVIDENCE.md:78`).

**Freeze limitation.** `run-parity.js --freeze` exits 3 without a local `ADWS_PRO_source/`
checkout (`run-parity.js:160-162`) even for a diverged pack, whose baseline is captured from
the port. The nine `expected` blocks were therefore written by hand from the patched CLI's
own output and confirmed by a full suite run — deterministic and reviewable either way. This
is the SC-1 limitation, unchanged and still worth closing someday.

---

## 5. Rejected

| Rejected | Why |
|---|---|
| **Replace the lexical classifier with an LLM judgment call.** | Breaks NFR-1 (validators are pure functions: same fixture in, same verdict out) and NFR-2 (no network). It would also make the one artifact the tester is told to trust non-reproducible, and parity-pin it to nothing. The gate wants a cheap, honest signal, not a good one. |
| **A second classifier or an `acceptance_gate` DSL.** | Already rejected under SC-3 (`SC3_PLAN.md:134`) for the same reason: a parallel criterion classifier drifts invisibly from the pinned baseline (R-2). A1 deliberately extends the existing pack instead of adding a rival. |
| **Relax or remove the `length < 10` gate** (`criteria-to-checks.js:23`). | Genuinely short criteria are usually underspecified, and the gate is load-bearing in the original's fixtures. With A1 in place a short criterion is no longer *dropped*, only marked — which removes the harm that motivated looking at it. |
| **Make `unclassified` fail the gate, or add a fourth `rubric_result`.** | Freezes nothing and breaks much: the verdict taxonomy is fixed (invariant 5), and a wording heuristic is far too weak to block a promotion on. Vagueness stays a `warn`. |
| **Report which criteria were vague as a new metric key.** | The typed `check_specs` array already carries it positionally, at zero schema cost. A parallel list would be a second source of truth for the same fact — the thing R-2 exists to prevent. |
| **Backfill `check_type` into historical evidence trees.** | Those are point-in-time records. FR-4 append-only; the field-run record states what happened instead. |

---

## 6. Post-submission review findings (F-31 … F-34)

Raised by automated review on PR #36 against the SC-5 change set itself, and fixed in the
same PR before merge rather than deferred. All four are accepted as valid.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| F-31 | data integrity | **Full emission guarantees delivery, not answer.** A1 puts every criterion into `check_specs` with a stable `check_id`, but the tester's `phase_output.json.checks` schema documented only `check` and `criterion` — so nothing joined an executed check back to its spec, and coverage could only be confirmed by matching prose. `corrections.json` already keyed on `check_id`, making the omission an internal inconsistency as well. **The F-27 guarantee stopped exactly at the hand-off, which is where the original defect hid.** | `check_id` added to the tester output schema in `artifact-layout.md` and `adws-tester.md` (carried over verbatim; one id may repeat across several checks). Test-gate row and the falsifiability section now require every emitted `check_specs.check_id` to appear at least once in `phase_output.json.checks`. |
| F-32 | correctness | **A3's `output` replacement was incomplete.** `output(?:s\|t?ed\|t?ing)?` still admitted `outputed` and `outputing` — the same non-word class A3 set out to remove. A non-word that classifies as `behavioral` suppresses the vagueness warning for free. | Tightened to `output(?:s\|ted\|ting)?`. Verified to match `output`/`outputs`/`outputted`/`outputting` and reject both misspellings; no fixture depended on them. |
| F-33 | precision | **Retention and the rubric were stated as one outcome.** "A lexical miss costs a `warn` instead of a criterion" overstates: retention is unconditional, while `warn` fires only when unclassified criteria exceed half the input. A single misread criterion in a sound set costs nothing at all. | Both summaries (`VERIFICATION.md`, field-run record) now state the two outcomes separately. |
| F-34 | evidence discipline | **Two evidence standards inside one change set.** `VERIFICATION.md` correctly recorded the run's 7-of-8 tally as not re-derivable, while `SC5_PLAN.md`, `DPPD.md` §14, `WBS.md`, and the field-run record still asserted it flatly (one even claimed independent confirmation). A scope change arguing for honest evidence boundaries cannot carry two of them. | A single boundary stated once in `SC5_PLAN.md` and referenced by the rest: the tally, the omitted criterion's identity, the manual coverage, and the PROMOTE are **orchestrator-reported**; the *mechanism* is proven from the committed validator. All four documents re-worded to match. |

**Why these were fixed pre-merge.** F-31 closes the same class of gap SC-5 exists to close,
one layer downstream; F-34 is a self-consistency defect in the documents that make the
argument. Merging either as a follow-up would have shipped a scope change that did not hold
its own standard.
