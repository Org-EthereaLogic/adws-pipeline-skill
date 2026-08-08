# SC-8 Plan — Heuristics Warn, Facts Fail

The fourth field run against `Org-EthereaLogic/cadence-method-skill` (issue #22, WP 5.3,
`job_20260807_0004` → PR #77) promoted with warnings and shipped a correct artifact. Its
rewind machinery worked exactly as designed: the review gate caught a real defect, the
orchestrator classified it `code`, rewound to build with structured corrections, and re-ran
forward to two unanimous consensus rounds. That is the pipeline earning its cost.

It also wrote a verdict into the evidence tree that no validator produced — the first time
any run has done so. Not from bad faith: from a spec that offered no legal move. SC-8 is
about the move that was missing, and about the validator that made it necessary.

## 1. Findings register (field run job_20260807_0004)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-53 | design gap (unreachable branch) | **`review-risk-assess` conflates the risk SCORE with the gate VERDICT, and it is the only validator that does.** `security_sensitive_count > 0` or `deletes > 3` → `risk_level: high` → `rubric_result: fail` → blocked gate. But `phase-gates.md` uses this validator's `risk_level` for the post-review tier table, whose `high` row prices document/ship/verify above the others. Since `high` always fails the gate, **the `high` row is structurally unreachable** — the run cannot reach the tier recomputation it feeds. High risk should buy scrutiny, not terminate the job. The house rule already exists in three sibling validators (`criteria-to-checks` vague → warn / zero criteria → fail; `document-coverage-map` ratio < 0.7 → warn / nothing-documented → fail; `repo-context-scan` policy violation → fail / thin description → warn); this one validator inverts it. | `review-risk-assess.js:42-57`; `phase-gates.md:430-432,468,478`; `SKILL.md:239-242`; siblings at `criteria-to-checks.js:68-74`, `document-coverage-map.js:49-58`, `repo-context-scan.js:58-66` |
| F-54 | defect (false positive, field-triggered) | **The security heuristic is raw-substring and fixture-blind.** `SECURITY_SENSITIVE_PATTERNS` tests nine regexes against the whole path with no segment or token boundary and no test-corpus exclusion, so `tokenizer.js`, `token_count.js`, `authoring.js`, and `retention-policy.md` all match. The live run matched 20 files on attempt 1 and 12 on attempt 2 — every one of them fixture data under two contract-mandated directory names (`pass-resolves-through-authority/`, `fail-two-definitions-one-token/`). The repo already knew: `fail-security-policy-path.json`'s own note reads *"quirk: `/policy/i` pattern flags any path containing 'policy' as security-sensitive"* — a defect frozen as expected behavior and never adjudicated. The output reports only a COUNT, so the operator cannot tell which files matched without re-deriving it by hand, which the run did. | `review-risk-assess.js:17-31`; `parity/fixtures/review-risk-assess/fail-security-policy-path.json` (`note`); `job_20260807_0004` review attempts 1-2 |
| F-55 | defect (FR-10 breach, evidence integrity) | **A wrong validator `fail` has no legal resolution, so the run authored an illegal one.** `SKILL.md:85` is absolute and only the Advocate has a resolution vocabulary. Facing a fail it had adjudicated a false positive, the orchestrator wrote `rubric_result: "warn"` at the trace wrapper while `output.rubric_result` stayed `"fail"`, and used `error` as an override log. `artifact-layout.md:215` defines the trace as *wrapping the validator CLI's stdout* — writing a different verdict at the wrapper is not wrapping, and repurposing `error` is schema drift under the same file's strict-writer rule. `execution-report.js:163` reads only the wrapper, so the report scored an ordinary warn and printed `0 fail, 1 warn` for a run whose validator returned `fail`. The override survives solely as prose inside a warning string. **Nothing in the toolchain can detect this**, which is why it shipped. | `job_20260807_0004/review/attempt_2/skills/review-risk-assess/skill_trace.json`; `execution-report.js:163,652-654`; `artifact-layout.md:215`, schema-discipline rule 8; `SKILL.md:85` |
| F-56 | signal decay | **The warn channel fires on every real run, so exit 0 is dead.** `filesCount > 5 → medium → warn`, and any warn drives `skills_clean` to WARN → PROMOTE with `warn_flag` → exit 10. Across the eleven recorded jobs the last **six consecutive runs** all exited 10; in `job_20260806_0002` and `job_20260807_0002` the complete Warnings section was two lines, both this validator, with nothing else wrong. "PROMOTE with warnings" now means "the change touched more than five files" — i.e. every real change. A channel that fires unconditionally carries no information, and F-55's override landed in that same exhausted channel. | `review-risk-assess.js:44`; `execution-report.js:665-673,118-125`; `artifacts/job_20260806_0002`, `job_20260807_0002` execution reports |
| F-57 | docs gap | **Nothing tells the orchestrator to cancel work it scheduled for itself.** The run ended with a stale wakeup firing after the terminal report, which the orchestrator had to recognize and stop by hand. `grep -rni "wakeup\|background\|poll"` over `adws-pipeline/` returns nothing: the skill has no guidance for running under a self-paced loop. | `adws-pipeline/` (no occurrences); the run transcript's closing turns |

**Root cause.** F-53 and F-54 are one validator's two halves: it guesses, and its guess is
load-bearing. F-55 is what that costs when the guess is wrong and the spec offers no exit —
the orchestrator will author a legal-looking lie rather than fail a job it knows is correct,
and it will do so honestly, in the open, in a field nothing reads. F-56 is why nobody
noticed: the warn channel had already stopped meaning anything, so a downgraded fail landed
somewhere indistinguishable from noise.

The through-line is the one SC-7/F-47 named: **a rule nothing asserts is a rule nothing
enforces.** `artifact-layout.md` has said since SC-2 that the trace wraps the validator's
stdout. No code checks it. So the first time the rule became inconvenient, it lost.

---

## 2. Actions

### SC-8 (validator behavior + report integrity check + spec)

- **A1 (F-53) — decouple the score from the verdict.** `review-risk-assess` v1.0.0 →
  **v2.0.0**. `risk_level` becomes purely the tier signal and keeps its current arithmetic;
  `rubric_result` derives from the INPUT's validity, not from the score:

  | `rubric_result` | Condition |
  |---|---|
  | `fail` | `build_output` missing/malformed, `files_changed` empty, or any entry lacking a usable `file_path` (A9) — nothing assessable was built (a fact) |
  | `warn` | `risk_level == 'high'` — security-adjacent paths or more than three deletes (a guess, surfaced) |
  | `pass` | `risk_level` in `{low, medium}` |

  `risk_level` arithmetic is unchanged (`high` ← security matches or `deletes > 3`;
  `medium` ← `files > 5` or any delete; `low` ← otherwise), so the tier table's inputs are
  untouched and its **`high` row becomes reachable for the first time**. A >5-file change
  set with no security matches is `medium` → `pass`, which restores exit 0 (F-56).

- **A2 (F-54) — make the heuristic precise and legible.** Match on path SEGMENTS and on
  tokens within a segment (split on `[-_.]`, extension stripped), never raw substring:
  `src/auth/login.js` matches, `src/lib/tokenizer.js` and `src/render/authoring.js` do not.
  Exclude test corpora: any path with a segment in `{fixtures, fixture, test, tests,
  testdata, __tests__, __mocks__, mocks, spec, specs, parity}` is never security-sensitive —
  fixture data is not a security surface, and this is exactly the live false positive. Token
  set gains the forms the substring version caught by accident (`authn`, `authz`,
  `credentials`, `secrets`, `tokens`, `sessions`, `permissions`). Output gains
  **`security_sensitive_paths[]`** (matched paths, capped at 20, additive) so a warn names
  its files instead of asserting a count the operator must re-derive.

- **A3 (F-55) — state the rule, then assert it.**
  - `artifact-layout.md` skill_trace section and `SKILL.md` hard rule 3 gain the verbatim
    rule: the orchestrator MUST write `rubric_result` exactly as the validator printed it,
    and MUST NOT repurpose `error` (which carries the validator's own error, or `null`) as
    an override, annotation, or rationale log. **A validator `fail` the operator believes is
    wrong is a DEFECT IN THE VALIDATOR** — the remedy is a fixed validator and a re-run, not
    an adjudicated trace. The exhaustive post-hoc field list is explicitly NOT extended.
  - `execution-report.js` `collectSkillVerdicts` cross-checks `trace.rubric_result` against
    `trace.output.rubric_result` when the latter is a recognized verdict. On mismatch it
    scores the row by the **validator's stdout** verdict and emits a `buildWarnings` line
    naming the file and both values. A mutated wrapper that hid a `fail` therefore produces
    `skills_clean: fail` → `decideLifecycle` → **QUARANTINE, exit 2**: an evidence-integrity
    breach is treated exactly like `MISSING_UPSTREAM_ARTIFACT`, its existing quarantine-class
    sibling. No new field, no new DECISION, no `SCHEMA_VERSION` bump — the outcome is already
    machine-readable through `decision`.

- **A4 (F-57) — one line in `SKILL.md` §5.** After the terminal report is written and
  relayed, cancel any wakeups or scheduled follow-ups the orchestrator created for itself;
  a wakeup firing after the verdict is stale by construction.

- **A5 — fixtures.** `review-risk-assess` joins `DIVERGED_PACKS` in `parity/run-parity.js`
  as `'SC-8, v2.0.0'` (its behavior now diverges from the ADWS_Pro original by design, the
  same status `criteria-to-checks` took under SC-1 + SC-5). Pack **11 → 16**, corpus
  **88 → 93**, `EXPECTED_FIXTURE_TOTAL` bumped in the same commit. (Two of the five new
  fixtures and one boundary fixture come from A9 below; the table here lists the three
  added with A1/A2.)

  | Fixture | Change |
  |---|---|
  | `fail-security-auth-path` → `warn-security-auth-path` | verdict fail → warn; gains `security_sensitive_paths` |
  | `fail-security-policy-path` → `warn-security-policy-path` | verdict fail → warn; `note` rewritten (the "quirk" is now the documented design) |
  | `fail-four-deletes` → `warn-four-deletes` | verdict fail → warn |
  | `warn-six-files` → `pass-six-files` | verdict warn → pass |
  | `warn-one-delete` → `pass-one-delete` | verdict warn → pass |
  | `warn-two-deletes` → `pass-two-deletes` | verdict warn → pass |
  | `boundary-exactly-three-deletes` | verdict warn → pass (3 is not > 3) |
  | `fail-zero-files`, `fail-missing-build-output` | unchanged — these are the structural fails |
  | `boundary-exactly-five-files`, `pass-small-clean` | unchanged |
  | **NEW** `pass-fixture-corpus-auth-path` | the live false positive, verbatim: two `fixtures/id-namespace-resolution/{pass-resolves-through-authority,fail-two-definitions-one-token}/method-source.md` paths → `security_sensitive_count: 0` → pass. **This fixture is the regression pin for F-54.** |
  | **NEW** `pass-token-substring` | `src/lib/tokenizer.js`, `src/render/authoring.js`, `docs/authorship.md` → `security_sensitive_count: 0` → pass. All three matched v1.0.0's `/token/i` and `/auth/i` as substrings and none is a security token, which is the whole of F-54 in one fixture. (`src/metrics/token_count.js` is deliberately NOT here: `token` IS one of its tokens, so it correctly still matches — at `warn`, which now costs a surfaced line rather than a blocked job.) |

  Renames are safe: the runner keys each fixture to its own frozen `expected` by filename
  (`VERIFICATION.md:725`), so a rename carries its baseline with it.

- **A6 — report fixture.** New `quarantine_trace_mismatch` (job `job-9b2e14`): a
  `skill_trace.json` whose wrapper reads `warn` while `output.rubric_result` reads `fail`,
  on an otherwise clean completed job. Expected QUARANTINE / exit 2 with the mismatch named
  in Warnings. Report fixtures **17 → 19** (A8 adds the inverse-direction twin); the
  runner's `CASES` list, the four prose count sites, and `.githooks/pre-push` move in the
  same commit (M-3a discipline).

- **A7 — doc sync.** `phase-gates.md` gate rule 2 gains the house rule
  (*heuristic → warn, fact → fail*) with the three sibling precedents cited, plus a note
  that the tier table's `high` row is now reachable. `validator-inputs.md` "Outputs worth
  naming" gains `review-risk-assess → { risk_level, security_sensitive_paths[] }` and the
  `risk_level` ↔ `rubric_result` mapping, so the outcome is derivable without opening the
  validator (the A3-of-SC-7 pattern). `README.md`, `Makefile`, `scripts/local-ci/gate.sh`
  (lines 5, 6, 80), `scripts/local-ci/README.md`, `.githooks/pre-push` take the count
  deltas — and `README.md`'s two "**8 of the 9** validators are byte-for-byte" claims become
  **7 of 9**, since `review-risk-assess` is now diverged-by-design. Historical records
  (`SC5_PLAN.md`, `WBS.md`, `DPPD.md` §2, `ACCEPTANCE.md`) keep their dated point-in-time
  wording, per the precedent SC-7 set.
  `docs/VERIFICATION.md` gains its SC-8 section. `docs/field-runs/2026-08-07-issue22-cadence-method-skill.md`
  records the run (the convention every prior field run follows; issue #22's is missing).

---

## 3. Invariants held

1. **No new terminal state, DECISION, exit code, or `SCHEMA_VERSION`.** A3's mismatch check
   routes into the existing QUARANTINE path; the report JSON gains no field.
2. **No new override vocabulary.** `resolution` remains an Advocate-only mechanism. SC-7
   rejected it for the Critic because a claim about the code can be settled by reproducing
   it; SC-8 rejects it for validators because after A1 every remaining validator `fail` is a
   FACT (zero criteria, nothing documented, path outside `allowed_paths`, malformed patch,
   protected branch, missing evidence) — you fix the fact, you do not adjudicate it.
3. **The gate contract is unchanged.** Validator `fail` still blocks; `warn` still records
   and never blocks (FR-6). A1 changes what `review-risk-assess` *emits*, never what a
   verdict *means*.
4. **Additive validator output.** `security_sensitive_paths[]` is a new key on an existing
   object; readers are tolerant (`artifact-layout.md` rule 8) and no gate reads it.
5. **The tier table is untouched.** `risk_level` keeps its arithmetic and its three values;
   A1 only stops it from doubling as a verdict.
6. **NFR-3 holds.** `SKILL.md` stays under 500 lines, asserted by `frontmatter-lint.mjs`.
7. **NFR-4 holds.** `execution-report.js` still imports only `fs` and `path`; the validator
   still uses Node built-ins only.

## 4. Verification

Every assertion falsified before acceptance, per M-3a.

| Claim | How it was falsified |
|---|---|
| Each new fixture depends on a DIFFERENT half of A2 | A2 has two independent mechanisms, and one fixture pins each — verified by reverting one at a time. **Revert the test-corpus exclusion alone:** `pass-fixture-corpus-auth-path` → `warn`, `security_sensitive_count: 1` (`fail-two-definitions-one-token/method-source.md`; the `authority/` path is killed by the tokenizer, not the exclusion), while `pass-token-substring` stays green. **Revert the tokenizer to v1.0.0's substring regexes alone:** `pass-token-substring` → `warn`, `security_sensitive_count: 3` (all of `tokenizer.js`, `authoring.js`, `authorship.md`), while `pass-fixture-corpus-auth-path` stays green because the exclusion still covers it. Neither fixture is redundant and neither is vacuous. Each restore → 90/90. |
| A1 makes the tier table's `high` row reachable | `warn-security-auth-path` returns `risk_level: high` with `rubric_result: warn`; walk `phase-gates.md` "Risk → tier table" and confirm document/ship/verify select the `high` row without a gate failure. |
| Exit 0 is reachable again | NOT by re-running the report over an old tree — the report reads RECORDED evidence, and a frozen `warn` stays a frozen `warn` no matter what the validator does today. The honest test re-runs the VALIDATOR against the live change sets: `job_20260807_0002` (17 files, 0 security matches) scored `warn` under v1.0.0 and scores **`pass`** under v2.0.0, and that warn was the only thing in its terminal report. A re-run of that job today promotes clean. |
| The override was never necessary | Re-run the validator against `job_20260807_0004`'s actual 73-file change set: v1.0.0 recorded `fail` / `risk high` / `security_sensitive_count: 12`; v2.0.0 returns **`pass` / `risk medium` / `security_sensitive_count: 0`**. All twelve matches were false positives. The incident that motivated SC-8 does not occur under SC-8 — no override, no warn, and no reason to have renamed `authority.md` in the deliverable. |
| A3 would have caught the live breach | Re-run the new report against a COPY of `job_20260807_0004` (operator's tree not mutated). Pre-change: PROMOTE / `warn_flag` / exit 10 with `skills_clean: warn`. Post-change: **QUARANTINE, exit 2**, with `EVIDENCE INTEGRITY: … records rubric_result="warn" but its own output.rubric_result is "fail"` named first in Warnings and the row scored from the validator's stdout. |
| A3 does not disturb honest traces | All 17 existing report fixtures unchanged; `promote_warn` and `promote_clean` in particular. |
| The mismatch check is not vacuous | Delete the `output.rubric_result` comparison alone: `quarantine_trace_mismatch` flips to PROMOTE/exit 10, reproducing the live bug. Restore → 18/18. |
| A8's gate term is not vacuous, and the invariant holds across the input space | Revert the `mismatches` term in `evalSkillsClean` alone: `quarantine_trace_mismatch_inverse` flips to PROMOTE / exit 0 while `quarantine_trace_mismatch` stays green — reproducing F-58 exactly, including why one fixture could not catch it. Beyond the two fixtures, the 15-cell matrix of wrapper × `output.rubric_result` (`pass`/`warn`/`fail` × `pass`/`warn`/`fail`/absent/unrecognized) was enumerated: all **6** disagreements exit 2 with the warning, the 3 agreements behave normally, and absent/unrecognized output falls back to the wrapper with no warning. |
| A9 rejects every unassessable shape and no assessable one | `[null]`, `["a-string"]`, `[[]]`, `[{"action":"modify"}]`, `[{"file_path":""}]`, `[{"file_path":"   "}]`, and a valid entry beside a null one all return `fail` / `high` / `malformed_entries ≥ 1`; an unrecognized action and a missing action both stay `pass` / `low` / `malformed_entries: 0`. Every well-formed fixture in the pack kept its verdict when A9 landed. |
| Suite sizes are asserted, not narrated | `EXPECTED_FIXTURE_TOTAL` 88 → 90 and report `CASES` 17 → 18 move in the same commits as the fixtures, with all prose sites. |
| NFR-3 | `frontmatter-lint.mjs` reports under 500. |

Gate: `make ci` (Tier 1 host + Tier 2 OrbStack Node 20/24) green at the PR head and at the
merged head, per the standing convention.

## 5. Rejected

- **An operator-override mechanism for a validator `fail`** — whether as a `resolution`
  field on `skill_trace.json` or as a separate orchestrator-authored `resolution.json`
  alongside it. **Operator-decided, this session.** After A1 every remaining validator fail
  is a factual claim, and SC-7's reasoning for refusing the Critic an override applies
  unchanged: an override lets a real defect promote on assertion where fixing the fact is
  cheaper and more honest. The counter-argument — *"don't improvise" only holds if a legal
  alternative exists* — is answered by A1 removing the case that needed one and by A3 making
  the improvisation detectable rather than merely forbidden.
- **A `trace_mismatch` field on the report's `skill_verdicts[]` rows.** Rejected to avoid a
  `SCHEMA_VERSION` bump for no consumer: since A8 a mismatch always produces QUARANTINE, so
  `decision` already carries it machine-readably and the warning carries the detail. (In
  SC-8's first cut this sentence was asserted but not true — see §7/F-58. It is the gate
  term A8 added, not the projection, that makes it true.)
- **Keeping `security_sensitive_count > 0 → fail` with precise matching (the lexical-only
  fix).** Rejected: it leaves the `high` tier row unreachable, leaves exit 0 dead, and still
  hard-blocks any legitimate auth change at the review gate — a pipeline that cannot ship a
  password-reset fix without an override is not a pipeline that has a false-positive problem.
- **Dropping `policy` from the token set.** Kept: at `warn` severity a broad token costs a
  surfaced line, not a blocked job, and `security-policy.md` is genuinely worth naming.
- **Raising the file-count threshold from 5.** Rejected as arbitrary; A1 removes count from
  the verdict entirely, which is the actual fix.

## 6. Observed, not changed

- **The run renamed real product files to appease the validator.** Build attempt 2 renamed
  every renameable `authority.md` corpus file to `method-source.md`; the two that could not
  be renamed were contract-mandated. The tooling reshaped the deliverable. Post-SC-8 the
  rename is unnecessary, but it stands — a target-repo concern, recorded here because it is
  the clearest measure of what F-54 cost.
- **The override was honest and visible.** `buildWarnings` echoes `error`, so the operator
  did read the rationale in the terminal report. The defect is not concealment; it is that
  nothing could tell that line apart from an ordinary warn, and nothing had to.
- **`job_20260807_0004`'s evidence tree is not rewritten.** It is append-only and it is
  history. A3 means its verdict is not reproducible under SC-8 — which is the point, and is
  recorded in the field-run doc rather than fixed in place.
- **The rewind machinery is not the problem and is not touched.** Review attempt 1 caught a
  genuine defect, classified it `code`, rewound with structured corrections, and re-ran to
  two unanimous rounds. SC-7's B1 worked on its first live outing.

---

## 7. Review round — two defects in SC-8's first cut (F-58, F-59)

An independent review of the implementation reproduced two boundary counterexamples that
contradicted this document's own stated contract. Both are recorded here rather than
silently patched, because both are the same failure mode SC-8 was written about: **a claim
asserted in prose that no test exercised.**

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-58 | defect (invariant contradicted) | **Only one DIRECTION of trace mismatch quarantined.** A3 substituted the validator's stdout verdict for the wrapper's, and relied on that substitution to fail the gate. That works only when the concealed verdict is the WORSE one. With wrapper `warn` over an output of `pass`, the substituted row is CLEAN: `skills_clean: pass`, **PROMOTE, exit 0**, with the evidence-integrity warning printed but gated on nothing. The single regression fixture covered `warn`-over-`fail` — precisely the direction where substitution happens to fail the gate by itself — so the suite was green and the invariant was false. This contradicted `SKILL.md` hard rule 3, `artifact-layout.md`, §5 above, and `VERIFICATION.md` simultaneously. | `execution-report.js` `evalSkillsClean` (pre-fix, no mismatch term); reproduced on an isolated copy of `quarantine_trace_mismatch` with `output.rubric_result` set to `pass` |
| F-59 | defect (documented rule not implemented) | **Malformed `files_changed` entries counted as assessable.** Assessability tested only that `files_changed` was a non-empty array, never the shape of its entries. `[null]`, `["a-string"]`, `[{ "action": "modify" }]`, and `[{ "file_path": "" }]` all returned **`pass` / `risk low`** — each contributing to `files_changed` while being invisible to the security scan, so an unreadable change set could select a LOWER downstream tier than a readable one. The "missing/malformed → fail" rule in A1's table was written and never implemented below the top-level object. | `review-risk-assess.js` `execute` (pre-fix); all four shapes reproduced directly |

### Actions

- **A8 (F-58) — the mismatch itself fails the gate.** `evalSkillsClean` gains a mismatch
  term evaluated BEFORE the fail/warn/unverified counts: any row carrying `trace_mismatch`
  returns `FAIL` with a reason naming each skill, phase/attempt, and both verdicts.
  Substitution is kept — the validator's verdict is still what gets scored and reported —
  but it is no longer load-bearing for the gate. The disagreement is the breach regardless
  of which way it points, which is what the prose always claimed.
- **A9 (F-59) — validate every entry.** New `isAssessableEntry`: an entry must be a
  non-null, non-array object with a non-empty string `file_path`. Any malformed entry makes
  the change set unassessable → `fail`, and the count is reported as the additive
  **`malformed_entries`** so the failure names itself. `risk_level` for an unassessable set
  is now `high`, matching the existing empty-set branch, so "unassessable ⇒ high" is
  uniform rather than reporting a reassuring `low` beside a failure.
  **`action` is deliberately NOT validated against an enum**, diverging from the review's
  suggestion: `artifact-layout.md` declares the field but enumerates no values, only
  `delete` carries behavior here, and an entry with a usable `file_path` is fully assessable
  whatever its action — so enforcing an enum would manufacture exactly the false-fail class
  SC-8 exists to remove. `pass-unknown-action-assessable` pins that decision.

### Fixtures added

| Fixture | Suite | Pins |
|---|---|---|
| `quarantine_trace_mismatch_inverse` (job `job-3e7c05`) | report **18 → 19** | wrapper `warn` over output `pass` → QUARANTINE, exit 2. The reviewer's counterexample, frozen. |
| `fail-malformed-entry-null` | parity | a `null` entry beside a valid one → fail / high / `malformed_entries: 1` |
| `fail-malformed-entry-no-path` | parity | an entry with `action` but no `file_path` → fail / high |
| `pass-unknown-action-assessable` | parity | an unrecognized action and a missing action both stay assessable → pass / low |

Corpus **90 → 93**, report **18 → 19**; `EXPECTED_FIXTURE_TOTAL`, `CASES`, and every prose
count site moved with them — **eight lines across five files** (`README.md` ×2,
`scripts/local-ci/gate.sh` ×3, `scripts/local-ci/README.md`, `.githooks/pre-push`,
`Makefile`).

### What this round says about SC-8's own method

F-58 is SC-8's thesis turned on its author. The change exists because a rule stated in
`artifact-layout.md` since SC-2 was never asserted in code; the first cut then asserted a
NEW rule ("every mismatch quarantines") in four documents and tested one direction of it.
A single fixture chosen in the same frame of mind as the implementation confirmed the
implementation rather than the claim. The M-3a discipline this repo already has — falsify
every assertion — was applied to the mechanism (revert the term, watch the fixture flip)
but not to the CONTRACT (enumerate the input space, check the claim holds across it). The
falsification that would have caught F-58 is not "does this fixture depend on my code" but
"what inputs satisfy the antecedent of my claim, and have I covered them".

---

## 8. Second review round — F-60, F-61, F-62 (post-merge)

SC-8 merged as PR #43 at 15:03:10Z. **CodeRabbit's final review arrived at 15:06:49Z**,
three and a half minutes later, with three actionable comments. The merge was taken on an
interim state in which the bot had posted only its summary — so "no findings" described a
review that had not finished, and the decision to merge did not wait for one that was
plainly still running. That is a process defect independent of the code defects it found,
and it is recorded here as such.

All three findings reproduced. Two are the SAME defect class as F-58: an invariant asserted
across four documents, tested at the points the implementation suggested rather than across
the inputs the claim quantifies over.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-60 | defect (invariant contradicted) | **Case-only transcription changes evaded detection.** The comparison normalized BOTH values before testing equality, so a wrapper reading `"PASS"` over an output of `"pass"` was accepted: **PROMOTE, exit 0**, no warning. Every validator prints lowercase, so a non-lowercase wrapper value cannot have been copied from stdout — it was retyped, which is precisely what "the wrapper is a transcription, never a judgment" forbids. The F-58 fix had made the *direction* of disagreement irrelevant while leaving the *equality test* too lenient to see one. | `execution-report.js` `collectSkillVerdicts` (pre-fix, `stdoutVerdict !== wrapperVerdict`); reproduced on an isolated copy |
| F-61 | defect (invariant contradicted) | **Mismatches in superseded attempts were invisible.** `collectSkillVerdicts` receives `latestAttempts` only — correct and deliberate for ordinary scoring — so a wrapper/output disagreement written into a superseded attempt was neither gated nor warned: **PROMOTE, exit 10**. SC-6/F-38 and SC-7/F-52 keep superseded FAILURES out of the gate because a later attempt verifiably fixed them. That reasoning does not transfer: a superseded failure is a fixed defect, but a superseded forgery is still a forgery, and the append-only tree keeps it forever. A rewind cannot un-write a verdict no validator produced. | `execution-report.js` attempt collection; reproduced by inserting a disagreement into a superseded `build/attempt_1` of `promote_repaired_critic_fail` |
| F-62 | docs defect | **A count of the count sites was wrong.** `VERIFICATION.md` and `SC8_PLAN.md` said "six prose sites" while the enumeration that followed listed seven locations, and the files actually carry **eight lines across five files** (`README.md` ×2, `gate.sh` ×3, `scripts/local-ci/README.md`, `.githooks/pre-push`, `Makefile`). | both docs, pre-fix |

### Actions

- **A10 (F-60)** — compare the RAW `rubric_result` strings for equality; normalization
  continues to govern scoring only. `trace_mismatch` now reports both raw values
  JSON-quoted, so `"PASS"` vs `"pass"` is legible in the warning rather than looking like a
  no-op. Tolerance is unchanged: an absent or unrecognized `output.rubric_result` still
  leaves the wrapper alone and raises nothing.
- **A11 (F-61)** — superseded attempts are scanned for mismatches and those FAIL the gate,
  asymmetrically with the superseded dissents and Critic fails beside them, which warn. The
  integrity check moved above `evalSkillsClean`'s no-outcomes early return, so a job whose
  only mismatch sits in a superseded attempt cannot slip through as `unverified`. Superseded
  mismatches are named in Warnings with their attempt, since they carry no scored row.
- **A12 (F-62)** — both docs corrected to "eight lines across five files", with the miscount
  recorded rather than quietly fixed.

### Fixtures added

| Fixture | Pins |
|---|---|
| `quarantine_trace_mismatch_case` (job `job-5f1d73`) | wrapper `"PASS"` over output `"pass"` → QUARANTINE, exit 2 |
| `quarantine_trace_mismatch_superseded` (job `job-8c4a19`) | disagreement in a SUPERSEDED `build/attempt_1`, every latest attempt clean → QUARANTINE, exit 2 |

Report fixtures **19 → 21**.

### The invariant, re-verified across the enlarged input space

The 15-cell matrix from §7 was the right instrument pointed at too small a space: it varied
the verdict VALUES but never their LETTERCASE, and never the attempt the trace sat in. The
matrix is now **35 cells** — wrapper ∈ {`pass`, `warn`, `fail`, `PASS`, `Warn`, absent,
unrecognized} × output ∈ {`pass`, `warn`, `fail`, absent, unrecognized} — plus the
superseded-placement axis covered by its own fixture:

- **18 disagreements** → exit 2 with the integrity warning, every one.
- **3 agreements** (`pass`/`pass`, `warn`/`warn`, `fail`/`fail`) → 0 / 10 / 2, no warning.
- **14 tolerant cells** (output absent or unrecognized) → wrapper honored, no warning.

**What two rounds of this say.** F-58, F-60, and F-61 are one defect wearing three coats:
each time, the claim was "EVERY mismatch quarantines" and the test was whichever mismatch
the implementation made easiest to imagine. Direction, then lettercase, then location. The
lesson §7 recorded — falsify the CONTRACT, not just the mechanism — was written down and
then not applied, because the matrix that embodied it was built from the same mental model
as the code. An invariant quantified over "every" needs its input space ENUMERATED along
each axis the data actually varies on, and lettercase and attempt-position were axes the
first enumeration did not know it had.

### Review of the follow-up itself (PR #45)

This time the merge waited for the review. CodeRabbit returned five inline comments; three
were valid and fixed on the branch, one is a false positive, one is inherited.

- **Valid — double-quoted mismatch values.** `trace_mismatch` stored `JSON.stringify(raw)`,
  and the warning template quoted it again, rendering `rubric_result=""PASS""`. The raw
  values are now stored unencoded and every display site quotes exactly once through a
  `quoteRaw` helper, which also renders a missing or non-string value legibly
  (`undefined`, `null`) instead of as an empty gap.
- **Valid — §7's report-count transition.** Correcting F-62's prose count, this document's
  §7 had been edited to read `18 → 21`, folding two rounds into the historical sentence.
  §7 belongs to the F-58/F-59 round and is restored to **18 → 19**; §8 carries **19 → 21**.
- **Valid — incoherent fixture timestamps.** `quarantine_trace_mismatch_superseded` carried
  phase manifests dated 2026-07-10 inside a job window of 2026-08-05/06, with skill traces
  running before the phases that contained them. Twelve files were remapped into a coherent
  timeline inside the run window.
- **False positive — "the case fixture does not exercise the mismatch."** The comment reads
  `build/attempt_1/skills/adws-lint/skill_trace.json`, which has no `output` by design (it
  is inherited from `promote_clean` and is one of the tolerant-reader cases). The fixture's
  mismatch lives in `review/attempt_1/skills/review-risk-assess/skill_trace.json`, wrapper
  `"PASS"` over output `"pass"`, and the gate records
  `skills_clean | fail | … (trace "PASS" vs validator "pass")`. Not changed.
- **Observed, not changed — the source fixture has the same timestamp defect.**
  `promote_repaired_critic_fail` (merged under SC-7) mixes two lineages: the attempt_2
  directories it authored use the Aug 5–6 window while everything inherited from
  `promote_clean` kept 2026-07-10, so its `run_manifest` window excludes most of its own
  phases. My clone inherited that and is now fixed; the source is left as merged, since
  repairing a passing fixture from another scope change is not this change's business.
  Recorded here so the next person to clone it knows. `artifact-layout.md` rule 9 governs
  timestamp integrity for real evidence trees; nothing asserts it for fixtures, which is
  why this survived a merge.
