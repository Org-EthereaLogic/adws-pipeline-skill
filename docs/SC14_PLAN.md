# SC-14 Implementation Plan — budgets, assertions, and the unpinned register (F-80, F-82, F-83, F-86, F-87)

**Status:** IMPLEMENTED, 2026-08-09. Companion: `DPPD.md` §23 (M-6), audit
`docs/AUDIT_2026-08-09.md`, verification `VERIFICATION.md` §SC-14.

**Scope decision (operator, 2026-08-09):** five of the eight M-6 findings — the ones whose
mechanism is already understood and whose fix touches no evidence schema, no validator
behaviour, and no `SCHEMA_VERSION`. The line budget seeds at **424**, the value audit M-6
observed. F-81, F-84 and F-85 go to SC-15, with reasons recorded in "Deferred" below rather
than left implicit.

**One finding changed shape during implementation.** A4's triage proved that F-86's headline
example — `drift-sentinel:verdict:#5` — is a dead branch and was never debt, and found the
real gap somewhere else entirely. A4b below records what shipped, not what was planned; the
audit carries the correction in its own §2.

## Why

M-6 found the detectors in good shape and the *budgets* missing. Three of the five findings
below are the same shape: a rule was decided, written down, and given nothing that asserts it —
`SKILL.md`'s 337-line floor (F-83), the no-eval rule on `reproduction.command` (F-82), and the
guard-ablation baseline's `class` / `owner` / shrink-only contract (F-86). The project has a
name for this already: **a rule nothing asserts is a rule nothing enforces** (F-55).

The remaining two are small and unrelated: the only network egress in the repository has no
destination check (F-80), and the reference graph has one missing TOC and a circular
cross-link (F-87).

---

## A1 — Egress destination is checked and named (F-80)

`scripts/local-ci/review.sh` only. Tier 3 is advisory and never blocks; this does not change
that.

- After `OLLAMA="${OLLAMA_HOST:-http://localhost:11434}"` (`:31`), validate the host. Accept
  `localhost`, `127.0.0.1`, `[::1]` and `0.0.0.0` by default. Anything else requires an
  explicit `REVIEW_ALLOW_REMOTE=1`; without it, print the rejected host and exit 2 (the
  existing "missing prerequisite" code — not a new one).
- Print the destination before the first POST regardless of host, so a redirected review is
  visible in the log rather than inferred from its absence.
- Document both in the script header's env list alongside `OLLAMA_HOST` and
  `REVIEW_MAX_BYTES`.

**Why an opt-in rather than a hard block:** a remote Ollama is a legitimate setup and Tier 3
is the one place a user may reasonably want it. The defect is that the diff can leave the
machine with no decision and no trace, not that it can leave at all.

**Not in scope:** `REVIEW_MAX_BYTES`, the `jq --arg` construction, and `curl -d @-` are all
already correct and are not touched.

---

## A2 — The no-eval rule becomes a hard rule and an assertion (F-82)

The rule text at `references/artifact-layout.md:344-352` is good and complete; it does not
change. What changes is where it lives and whether anything asserts it.

- **`SKILL.md` hard rules:** add one rule — agent-authored strings in evidence
  (`reproduction.command` today) are records, never execution channels; never pass one to a
  shell, `exec`, or any evaluating API; any automated replay goes through an allowlisted
  runner keyed by `check_id`. One sentence, placed with the existing git rule (hard rule 6),
  which is the other "never interpolate untrusted text into a command" rule.
- **`references/agent-shared-blocks.md`:** extend the Security block with the same
  prohibition, so every agent that could author or consume the field carries it. This is a
  byte-identical block across all ten agents — `agent-blocks-lint.mjs` will require all ten
  `.claude/agents/adws-*.md` to be updated in the same commit, which is the mechanism working
  as designed.
- **New lint, `scripts/local-ci/no-eval-lint.mjs`,** wired into `gate.sh`: assert that no
  shipped script reads a `.command` property from parsed evidence into any execution sink.
  Given `requires-lint` already proves the shipped tree imports no `child_process`, the
  practical assertion is the narrower one — the identifier `command` is never dereferenced
  off a `safeReadJson`/`JSON.parse` result in `adws-pipeline/scripts/`.

**Falsification (required before acceptance):** add a line to any shipped script that reads
`.command` off parsed evidence; the lint must fail naming the file and the line. Remove a
sentence from one agent's Security block; `agent-blocks-lint` must fail naming the file and
the block.

**Cost note:** this adds ~1 line to `SKILL.md`, against A3's budget. That is the intended
interaction — the budget makes the cost visible, it does not forbid it.

---

## A3 — `SKILL.md` gets a ratchet, not a compression pass (F-83)

**This does not compress `SKILL.md`.** `SC10_PLAN.md` §5 rejected that with reasons and the
rejection stands. The budget starts at the current line count, so this change requires no
prose edits at all.

- **New `parity/skill-line-budget.json`**, in the house style of
  `guard-ablation-baseline.json` — a `_doc` block, a `budget` integer, and a `history` array
  of `{ value, set_by, reason }`. Seed: `budget: 424`, `set_by: "SC-14"`, reason recording
  that 424 is the observed value at M-6 and that SC-10's considered floor was 337.
- **`frontmatter-lint.mjs`** gains a third level. Today it NOTEs at 350 and fails at 500.
  After: **NOTE** at 350 (unchanged advisory target); **FAIL** if `lines > budget`, with the
  message naming the budget file and stating that raising it is a deliberate edit belonging in
  the same commit; **FAIL** at ≥ 500 regardless of budget (NFR-3, unchanged).

The ratchet never forbids growth. It requires that growth be written down, with a reason, in
the diff a reviewer reads — which is exactly what did not happen when SC-11, SC-12 and SC-13
put back 88 lines between them.

**Why the budget starts at 424 and not 337:** lowering it is a separate decision that would
force the compression pass SC-10 declined. Bounding the future is the finding; re-litigating
the floor is not. If the operator wants the budget seeded lower, that is a one-integer change
to this plan and a real prose task attached to it.

**Falsification:** append one line to `SKILL.md`; the gate must fail naming the budget.
Raise `budget` to 425 in the same commit; the gate must pass. Set `budget` to 500; the NFR-3
ceiling must still fail it.

---

## A4 — The unpinned register is read, ratcheted, and reported (F-86)

The baseline's data model is already right — `class`, `reason` and `owner` are specified in
its `_doc`. The gap is that `guard-ablation.mjs` reads none of them, the shrink-only property
is unenforced, and the terminal line reports 19 unverified rules as a clean pass.

**A4a — enforce the `_doc`'s own contract.** In `guard-ablation.mjs`:

- Require every accepted entry to carry `reason` and `class`; `class` must be `equivalent` or
  `unpinned`; an `unpinned` entry must carry a non-empty `owner`. Malformed baseline → gate
  failure, naming the entry.
- **Ratchet:** the count of `class: unpinned` entries may not exceed the value recorded in a
  new top-level `unpinned_budget` field. Raising it is a deliberate edit in the same commit,
  the same discipline as A3. `equivalent` entries are permanent and uncounted.
- **Report both populations**: replace `19 survivor(s)` and the `(19)` in the OK line with a
  split — `N equivalent, M unpinned (budget B)`. A number that merges two populations needing
  opposite responses is the project's own recurring mode #9.

**A4b — triage on evidence, then close what is real.** The plan proposed closing five
`drift-sentinel` entries with five fixtures. **Triage found that four of the five were never
debt, and that the real gap was somewhere the plan had not looked.** What shipped:

Method: each entry's mutation applied to `drift-sentinel.js`, swept against **931 inputs across
both gating modes** (entropy from −1 to 2 in 0.005 steps, score shapes including negative,
`NaN`, `Infinity` and 1e6, mixed and numeric histories, lengths 1–40), plus branch
instrumentation that throws on entry to prove reachability rather than infer it.

| Entry | Site | Triage result |
|---|---|---|
| `guard-off:#22` | `:332` `if (ctm > CTM_YELLOW)` | **genuinely unpinned and reachable** → closed with a fixture |
| `verdict:#5` | `:452` `'fail' → 'pass'` | **dead branch** → reclassified `equivalent` |
| `guard-off:#16` | `:263` `if (max === 0)` | reachable but **output-identical** → reclassified `equivalent` |
| `guard-off:#6` | `:105` `if (dTx < 0)` | not reached by any of 931 × 2 → left `unpinned` |
| `guard-off:#8` | `:131` range check | not reached by any of 931 × 2 → left `unpinned` |

- **`verdict:#5` is a dead branch.** Every return path in `computeCTM` — the early
  short-history return and all four band returns — sets `zone` to `green`, `yellow` or `red`,
  so the `else` this mutation touches is unreachable. It was the plan's must-land entry and it
  was never debt at all.
- **`guard-off:#16` is an algebraic identity.** The branch *is* reachable (any all-zero signal
  window enters it), but when `max === 0` every element of `abs` is already `0`, so
  `abs.map(() => 0)` and the fall-through return the same values — and the fall-through is
  taken, because `max <= 1` holds for `0`. No fixture can distinguish them and none should be
  written.
- **`#6` and `#8` were NOT reclassified.** The sweep did not reach them, but their
  unreachability rests on an invariant that spans function boundaries (normalized values stay
  in `[0,1]`, so `dTx >= 0`) and a later edit could invalidate it. Evidence is not proof;
  leaving them as debt fails closed, which is the direction this register should fail in.

**The one real gap, and the fixture that should have caught it.** `guard-off:#22` covers the
legacy YELLOW band. The pack already contained `legacy-yellow-zone.json`, named *"returns warn
when entropy puts CTM in yellow zone"* — but its entropy of `0.25` gives `ctm = 0.33 − 0.25 =
0.08`, below `CTM_YELLOW` (0.1), so it lands in the **red** band and its own frozen expectation
says `zone: "red"`, `risk_level: "high"`. Deleting the yellow rule left it green. **A fixture
named for the rule it does not pin is F-71's exact shape, inside the mechanism built to answer
F-71.** Closed by `legacy-yellow-band-reached.json` (entropy `0.18` → `ctm 0.15` → yellow /
medium / warn, entropy held flat so `gradient_alert` stays false and the case pins the band
alone). The misnamed sibling keeps its frozen expectation — it is history — and gains a `note`
recording what it actually pins.

Parity **108 → 109**, `EXPECTED_FIXTURE_TOTAL` updated in the same commit. One fixture added;
no existing expectation rewritten. `guard-off:#22` deleted from the baseline, which the tool
demanded on its own (stale-entry rule). Result: **18 entries — 2 `equivalent`, 16 `unpinned`**,
all 16 re-owned from `SC-12 (unscheduled)` to `SC-15`, `unpinned_budget` seeded at 16.

**Also recorded, not fixed:** the baseline's `mutation` field is **truncated with an ellipsis**
for long conditions, so `drift-sentinel:guard-off:#0` and `#20` could not be replayed from the
register at all. A register whose entries cannot be reconstructed from the register must be
re-derived to audit. Left for SC-15 with the entries it affects.

**Falsification (all performed):** delete the new fixture → `guard-ablation` reports
`guard-off:#22` as a new survivor and `run-parity` fails its total. Delete the yellow rule from
the validator → the new fixture goes red (`zone: "yellow" !== "red"`) **and the misnamed
sibling stays green**, which is the finding demonstrated rather than asserted. Strip `owner`
from an unpinned entry, give an `equivalent` entry an `owner`, set an invalid `class`, or drop
`unpinned_budget` to 15 → each fails with the entry named.

---

## A5 — Reference graph hygiene (F-87)

Small, documentation-only, no mechanism.

- **Shipped:** a `## Contents` block on `references/validator-inputs.md` (132 lines, the only
  reference over 100 lines without one, and reachable through `task-contract.md`). A TOC is
  what makes a partial read safe, so this is the substantive half of F-87.
- **Reviewed and deliberately unchanged:** all thirteen sibling cross-links. The plan expected
  to redirect the merely-navigational ones at `SKILL.md`'s index and leave the load-bearing
  ones. On inspection **every one cites a specific rule or section** — *"`artifact-layout.md`
  rule 2"*, *"`phase-gates.md` 'Consensus' rule 5"*, *"the accounting table in
  `phase-gates.md`"*, *"`artifact-layout.md` rule 8"*. None is navigation. Rewriting them to
  point at an index would replace a precise citation with a vaguer one and make the reader
  hunt, which costs more than the nesting does. The circular `phase-gates.md` ↔
  `artifact-layout.md` pair stays, and both files carry a TOC.

That leaves F-87 half-closed by design, and the residue stated rather than quietly dropped:
a 601-line reference reached through a sibling can still be previewed rather than read. The
mitigation is the TOC on both ends, which is now universal across the seven references.

**Falsification:** `frontmatter-lint`'s bidirectional index check still passes, and still
fails by name if a reference file is dropped from `SKILL.md`'s index.

---

## Deferred to SC-15 — with reasons, not silently

- **F-81 (secret redaction unenforced; SC-11 + SC-13 widened the radius).** Needs a scanner
  choice and a false-positive policy before it needs code. The register is unkind here: F-2,
  F-28/F-29 and F-54 are all cases where a lexical rule misjudged content, and F-54 in
  particular had `review-risk-assess` blocking a review gate on twelve provably-false matches.
  A naive secret scanner run against an evidence tree — which contains diffs, findings prose,
  and now verbatim repository files — would repeat exactly that, in a step that gates
  archiving. The design question is whether the scan fails closed, warns, or only records; that
  is an operator decision, and shipping the wrong answer here is worse than shipping nothing.
- **F-84 (input-dimension coverage).** Needs a contract-schema field
  (`task.input_dimensions[]`) and a tester obligation. Adding a required-ish field to the task
  contract is the kind of change this project makes deliberately, with intake rules and
  soft-warning behaviour decided up front. It is also the largest of the eight and the one most
  likely to be got wrong on the first cut.
- **F-85 (cross-job memory).** The carrier (`carry_over`) and the payload (`REG-…` ids) both
  exist, so this is genuinely ready — **except that SC-13's resumption path has never been
  exercised by a live run.** Designing the finding-carry on top of a path with zero field
  evidence would repeat the pattern SC-13's own review caught: a rule delivered to the right
  file whose binding nobody had to supply. Wait for one resumed job, then design against what
  it actually did.

---

## Verification — by falsification

Every claim below must be demonstrated by breaking it, per the house standard.

| Claim | Falsification | Result |
|---|---|---|
| The egress guard is real | `OLLAMA_HOST=http://evil.example` | **exit 2**, host named, no POST |
| No substring/userinfo/subdomain bypass | 12 URL forms (7 distinct hosts) incl. `user:pass@evil`, `localhost.evil.example`, `?x=localhost`, `[2001:db8::1]` | all BLOCK; 5 local forms ALLOW |
| **The guard survives a proxy** | every proxy var set + `NO_PROXY=` | reaches the real local Ollama; before `--noproxy`, curl exited 7 against the **proxy** |
| **Credentials are not printed** | `OLLAMA_HOST=http://alice:hunter2@localhost:11434` | `destination: http://[userinfo-redacted]@localhost:11434` |
| The opt-in works | same host, `REVIEW_ALLOW_REMOTE=1` | proceeds, WARNING + destination printed |
| The no-eval lint is real | add `require("child_process")` to a shipped validator | **fails**, file + line named |
| …and catches the field read | `repro.command` in the harness | **fails** by file + line |
| …including the bracket spelling | `repro["command"]` | **fails** by file + line |
| **…and destructuring** | `const { command } = repro` and `const { command: cmd } = repro` | both **fail** by file + line |
| **…and every `vm` spelling** | `await import('vm')`, `await import('node:vm')`, `from 'vm'`, `await import('node:child_process')` | all four **fail** |
| The security block is pinned | reword the new sentence in one agent | `agent-blocks-lint` **fails** naming file + block |
| The line budget is real | append one line to `SKILL.md` | **fails**, budget file named |
| An unrecorded bump fails | raise `budget`, don't append `history` | **fails** — budget/history mismatch |
| The budget can be raised properly | raise `budget` **and** append `history` | passes |
| **History is monotonic** | append `{value: 300}` to hide growth | **fails** — `history[2] lowers the budget 429 -> 300` |
| **…but not append-only** | rewrite the last entry in place | **passes** — stated as a limit, caught by `git diff`, not by the lint |
| NFR-3 still dominates | `budget: 600`, SKILL.md 509 lines | **fails** at the 500 ceiling |
| The unpinned ratchet is real | `unpinned_budget: 15` against 16 | **fails**, counts named |
| `owner` is required on debt | strip `owner` from an unpinned entry | **fails**, entry named |
| `equivalent` owes nothing | add `owner` to an equivalent entry | **fails**, entry named |
| `class` is validated | set `class: "probably-fine"` | **fails**, entry named |
| The split report is real | — | `2 equivalent (permanent), 16 unpinned (debt, budget 16)` |
| The new fixture pins the yellow rule | delete the rule from the validator | fixture goes red (`zone: "yellow" !== "red"`) |
| …and the misnamed sibling never did | same deletion | `legacy-yellow-zone` stays **green** |
| Fixture total is asserted | the new fixture moves the count | `EXPECTED_FIXTURE_TOTAL` 108 → 109, parity 109/109 |
| The index check survives A5 | drop a reference from `SKILL.md`'s index | `frontmatter-lint` fails by name |

**Gate at HEAD (Tier 1): 16/16 steps pass** (15 existing + `no-eval`), parity **109/109**,
guard-ablation **18 accepted — 2 equivalent, 16 unpinned (budget 16)**.

**Tier 2: PASS on Node 20 and 24 against commit `3ec8e6b`** — 32 `-> PASS` steps in
`ci_logs/20260809T230215Z.orb.log`, 16 per leg, `no-eval` included. `orb-ci.sh` clones the
*committed* tree, so the first run reported for SC-14 tested the pre-SC-14 `21b7fa0` with 15
steps; review caught that, and this run names the real commit. **Tier 1 tests the working
tree; Tier 2 tests `HEAD`** — a distinction easy to lose while the tree is dirty.

## Review round — six corrections, two of them security defects in the security fix

Full record in `VERIFICATION.md` §SC-14 "What review caught". In short: the A1 egress guard
validated the URL while `curl` still honoured `http_proxy`, so the diff could be rerouted to
an arbitrary host (**a destination check the transport can override is not a check**) — fixed
with `--noproxy '*'` on all three call sites; the same guard printed `$OLLAMA` raw, which
would have written `user:pass@` credentials into committed `ci_logs/` from the change whose
sibling finding is that secret redaction is unenforced — now userinfo-redacted; `no-eval`
missed `const { command } = repro` and `await import('vm')` — widened, eight forms verified;
"silent bumps are impossible" was overstated, since rewriting the last history entry passes a
file-local check — history is now monotonic and the claim is narrowed to what it is, *growth
recorded and visible in review*; and the 931-input sweep justifying two `class` changes lived
in a scratch directory, **breaking SC-13/F-77's own rule inside a change that cites F-77** —
now committed as `parity/guard-ablation-triage.mjs`.

The pattern across four of the six is one this register keeps recording: **the rule was
right and the thing underneath it was not asked to comply.** A URL check with a transport
that ignores it, a lexical scan with a claim wider than its regexes, a ratchet whose history
nothing pinned, a proof whose evidence nobody kept.

**Gate at completion:** 16/16 steps (15 existing + `no-eval`), parity **109/109**. The
plan's original expectation was 113/113, on the assumption that five fixtures would close
five entries; the triage in A4b found only one entry genuinely needed one, so the total moved
by one rather than five.

## Invariants this must not break

1. **No evidence-schema change, no `SCHEMA_VERSION` bump, no new terminal state, DECISION, or
   exit code.** Nothing in SC-14 touches `run_manifest`, `phase_manifest`, or any consensus
   file shape.
2. **No validator behaviour change.** HELD — no file under
   `adws-pipeline/scripts/validators/` was edited. A4 adds one fixture to `drift-sentinel`'s
   pack; the validator is untouched.
3. **No existing frozen expectation is rewritten.** HELD — one fixture added, 108 unchanged.
   `legacy-yellow-zone.json` gained a `note` correcting what it pins; its `expected` is
   history and stays exactly as frozen.
4. **The byte-identical blocks stay byte-identical** — `cli-block-lint` (9 validators, 42-line
   wrapper) passes unchanged; `agent-blocks-lint` passes with all 10 agents carrying the
   extended security block (still 3 blocks — A2 extended the security paragraph rather than
   adding a fourth).
5. **`SKILL.md` stays under 500 lines** — 429, under NFR-3 and equal to its recorded budget.
6. **`skill-manifest.json` regenerated in the same commit** — version `358f7b7d28a7` →
   `3a92cd9c5355`, 30 files.

**Cost recorded, not absorbed:** SC-14 grew `SKILL.md` by 5 lines (429 from 424) for hard
rule 9, and the budget was raised from its 424 seed to 429 with the reason in
`parity/skill-line-budget.json`'s `history`. That is A3's mechanism exercising itself on the
change that introduced it — which is the intended behaviour, not an exception to it.
