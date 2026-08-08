# M-5a Plan — Minimum Trust Foundation

**Scope class:** harness (M-series). No validator behaviour changes; no fixture `expected`
value changes; no parity refreeze; no `SCHEMA_VERSION` bump.

**Why this package exists, and why it is alone.** The three defects SC-9 fixes were all
reproduced in `docs/AUDIT_2026-08-08.md`, and all three sit in code the suite does not
test. Landing behavioural fixes onto a gate that has never once failed — 73/73 runs, 657/657
steps, every F-register finding located by a field run, a review bot, or a human audit and
none by CI — would verify SC-9's claims with a green light that carries no information.
That is precisely the F-58/F-60/F-61 pattern `SC8_PLAN.md` §8 named, and it would be its
third recurrence.

M-5a is deliberately the *minimum* that makes SC-9's claims checkable. Harness
consolidation, tested-tree identification, fixture provenance and the finding-ID cleanup are
all worth doing and none of them makes an SC-9 claim more trustworthy; they are **M-5b**,
which gates nothing.

*(Topology correction: M-5b gates nothing, but it is not free-standing — it extends
`guard-ablation.mjs` and the `cli-contract` runner that M-5a introduces, so it must land
after M-5a. The shipped series is linear: `main → M-5a → SC-9 → SC-10 → SC-11 → M-5b`. See
`docs/M5B_PLAN.md` §0.)*

## 1. Findings register

| ID | Finding | Evidence | Action |
|---|---|---|---|
| — | The 279 duplicated CLI-wrapper lines have no exit-3 coverage. `run-parity.js:270-274` runs each validator's CLI once, on `fixtureFiles[0]`, happy path only; `checkCli:144-167` asserts only exit 0 and `typeof rubric_result === 'string'`. | `AUDIT_2026-08-08.md` §1 | A1 |
| — | Stdin (`-`) mode — the interface `SKILL.md:20` documents — is exercised by no test. All 93 parity fixtures bypass the CLI via `exec-one.js:24`. | `AUDIT_2026-08-08.md` §1 | A1 |
| — | A frozen fixture can pin nothing, and the pack looks identical either way. Two fixtures added to lock a security fix targeted nonexistent paths; `ENOENT` output was byte-identical to the guard refusing, so **deleting the guard left both fixtures green**. Recommended as routine; no mechanism shipped. | `docs/field-runs/2026-08-07-issue22-cadence-method-skill.md:148-159` | A2 |
| — | The CLI wrapper is duplicated nine times with nothing preventing divergence. SC-9 must edit all ten wrapper sites; without an assertion that edit can half-land. | `AUDIT_2026-08-08.md` §2 | A3 |
| **F-67** | `run-parity.js:146` wrote a predictable `os.tmpdir()/adws-parity-cli-input-<pid>.json` with `writeFileSync` — deterministic name, world-writable dir, follows symlinks, no `O_EXCL`. | `AUDIT_2026-08-08.md` §2 | A4 |
| — | The `.mjs` lints under `scripts/local-ci/` had no syntax floor; `node_check` covered only `*.js` under `adws-pipeline/` and `parity/`. M-5a adds two more `.mjs` files. | this package | A5 |

## 2. Actions

### A1 — `parity/cli-contract/run-tests.js`

One table-driven runner over all eleven shipped CLIs. Per validator: `no-argv`,
`missing-file`, `dir-as-input`, `unreadable-file` (skipped as root, where mode 000 is
readable), `invalid-json`, `empty-stdin`, `json-array`, `json-null`, `json-scalar`,
`json-string`, plus `file-happy`, `stdin-happy`, and `stdin-eq-file` asserting the two
input modes produce byte-identical stdout. Each rejection case asserts exit 3, empty
stdout, and the `adws-validator:` stderr prefix.

`entropy-gate.js` and `execution-report.js` get their own tables — different prefixes
(`adws-entropy-gate:`, bare `Usage:`/`Error:`) and different exit vocabularies. Two contract
facts become asserted here for the first time: empty input is exit 3 for a validator but
exit **0** for the entropy gate (zero lines = no signal, gate open), and
`execution-report.js` reaches **exit 3** four ways — an exit `SKILL.md:21` omits entirely.

An M-3a coverage cross-check compares the declared `VALIDATORS` list against disk in both
directions, so a tenth validator cannot be added without being covered.

**Measured:** 332 assertions at M-5a, ~2 s. (SC-9 later flipped the four hostile pins from
asserting the defect to asserting the fix, which changes the count to 330 — two of the pins
trade three exit-3 assertions for one verdict assertion. The number moves with the corpus;
the suite's own output is the current figure.)

### A2 — `scripts/local-ci/guard-ablation.mjs` + `parity/guard-ablation-baseline.json`

Mutates one rule at a time in a validator's `execute()`, instantiates the mutated source
with `new Function('module','exports','require',…)` — not `vm`, not a temp file; the shim
`module` makes `require.main === module` false so the CLI wrapper never fires — and runs
that pack's fixtures against the mutant, deep-comparing to each fixture's frozen `expected`.
A mutant identical on **every** fixture SURVIVED: nothing pins the rule it touched.

Two operators (`guard-off`: `if (COND)` → `if (false)`; `verdict`: `'fail'`/`'warn'` literal
→ `'pass'`) over the three packs SC-9 modifies. A source scanner tracks comment and string
state so mutations never fire inside a comment or rewrite the word "fail" in a rubric
description.

Env manipulation is safe in-process precisely **because** `drift-sentinel` reads
`process.env` at call time rather than module-load time — the same impurity that forces
`run-parity.js` to spawn a child per fixture.

Baseline discipline mirrors `EXPECTED_FIXTURE_TOTAL`, bidirectionally: a survivor absent
from `accepted` fails the gate, **and** an `accepted` entry that is no longer a survivor
also fails it, so a stale exemption cannot outlive the gap it excused.

**Scope is deliberately narrow.** The wider operator catalogue and the remaining six
validators are M-5b/B6's decision, to be made on the measurements below rather than on
estimates.

**Measured:** 18 mutants, 122 `execute()` calls, **0 survivors, 6 ms**.

**Scope correction made during implementation.** The first run reported nine survivors and
every one was in the CLI wrapper (`if (require.main === module)`, `if (!src)`, the
JSON-object guard). That is a true finding stated in the wrong place: the parity fixtures
call `execute()` directly and never invoke the CLI, so they pin no wrapper line by
construction. Keeping nine permanent baseline entries saying so would drown any real
survivor. The wrapper is therefore out of scope here and pinned instead by A1 and A3, and
the tool's claim is correspondingly narrow and true: *the fixture corpus pins every rule in
`execute()`.*

### A3 — `parity/cli-wrapper.expected.txt` + `scripts/local-ci/cli-block-lint.mjs`

Asserts all nine validators carry a byte-identical 31-line executable wrapper
(md5 `d044bfb48f75a9ad1a977e5e86cee3c9`). Scope is the executable block from
`if (require.main === module)` to EOF; the comment header above it is excluded because it
legitimately differs — `drift-sentinel.js` names itself in its USAGE line and documents the
`ADWS_UMIF_CANONICAL` env var it reads. That is per-file documentation, not shared logic.

This is what makes SC-9's input-size cap a ten-file edit that cannot half-land.

### A4 — `run-parity.js` uses `mkdtempSync` (F-67)

`mkdtempSync` (0700, non-guessable) replacing the predictable path; the whole scratch
directory is removed in `finally` via `rmSync`, so the bare `unlinkSync` disappears.
`parity/sc3-micro-drill/run-tests.js:68` was already correct and is the in-repo precedent.

### A5 — gate wiring, syntax floor, count sites

Three new steps in `gate.sh`: `cli-contract`, `guard-ablation`, `cli-block`. `node_check`
extended to `scripts/local-ci/*.mjs`. Count sites moved in `Makefile:7`,
`.githooks/pre-push:10`, `scripts/local-ci/README.md:17`, `README.md:139-152`.

`scripts/local-ci/README.md` gains the honest note: this gate had never failed in 73
recorded runs, and `guard-ablation` is the first step that can fail for a reason nobody
wrote a fixture for.

## 3. Invariants held

1. **No validator behaviour changes.** Zero edits to any `execute()`. Parity stays 93/93
   with no refreeze; `EXPECTED_FIXTURE_TOTAL` is untouched.
2. **No fixture `expected` value changes.** The three new hostile inputs live in
   `parity/cli-contract/hostile/`, outside the parity corpus, and assert current behaviour.
3. **NFR-4 preserved.** No shared module was introduced under `scripts/validators/`;
   `checkRequires` is unmodified; every validator still requires only `fs`. The
   `guard-ablation` shim `require` throws on anything but `fs`/`path`, so a mutant cannot
   widen the guarantee either.
4. **Single-file standalone-ness preserved.** Every validator still runs as
   `node <script>.js <input.json | ->` with no sibling imports — now asserted twice per
   validator rather than assumed.
5. **No new decision, exit code, or schema version anywhere.**

## 4. Verification — by falsification

Each row was executed against this checkout; the tree was restored and verified clean after
each.

| Claim | Falsification | Result |
|---|---|---|
| A1 exercises the wrapper's object guard | Delete the `input === null \|\| typeof input !== 'object'` check from `patch-compose.js` **alone** | `patch-compose/json-array`, `json-null`, `json-scalar`, `json-string` all fail **for that pack only**; all eight other packs stay green. Also surfaced that without the guard, `[]`, `42` and `"hello"` return `rubric_result: "fail"` at exit 0 — garbage silently scored as assessable. |
| A1 exercises stdin mode | Change `src === '-' ? readFileSync(0) : …` to always read a file, in `task-normalize.js` alone | Every `stdin-*` case fails with `ENOENT … open '-'`; `file-happy` stays green |
| **A2 is not vacuous** | Add a guard no fixture exercises (`if (branchName.startsWith('-')) return {rubric_result:'fail',…}`) to `ship-mode-select.js` | **2 new survivors reported, exit 1** — both the guard (`guard-off:#1`) and its verdict (`verdict:#1`). This is exactly the rule SC-9/A2 must add, so SC-9 cannot ship it without a fixture that pins it. |
| A2's floor is real | — | The tool asserts the **unmutated** source reproduces every frozen `expected` before mutating, and aborts otherwise. Without that floor a survivor count would be meaningless. |
| A3 catches drift | Change one character in `verify-evidence-map.js`'s wrapper (`invalid JSON` → `invalid json`) | Named the file and the differing wrapper line (16), exit 1 |
| A5's floor covers `.mjs` | — | `node-check` now walks `scripts/local-ci/*.mjs`; step passes at 1 s |

**Gate at HEAD:** 12/12 steps pass. Total ~8 s (was ~5 s; `cli-contract` +2 s,
`guard-ablation` +0–1 s).

```
parity 4s · report 1s · entropy 0s · provenance 0s · sc3-drill 1s · cli-contract 2s
guard-ablation 0s · node-check 1s · shell-lint 0s · frontmatter 0s · requires 0s · cli-block 0s
```

## 5. Rejected

- **Extracting `scripts/validators/_cli.js`** (would delete 279 duplicated lines). It breaks
  `checkRequires` in `run-parity.js:135-141`, whose builtins set is exactly
  `{fs, path, node:fs, node:path}` — and that two-line check is what produces the NFR-4
  acceptance evidence. The only non-weakening fix is a recursive allowlisted scan, which
  adds subtlety to the check that *asserts* the guarantee; given the F-58/F-60/F-61 pattern,
  that is the wrong trade. Extraction would also silently revoke the single-file-standalone
  property every validator's USAGE header advertises. With A1 covering the wrapper and A3
  preventing drift, extraction now buys line count and nothing else.
- **The full seven-operator mutation framework.** The first sketch estimated ~500 mutants,
  ~1.5 s and ~14 accepted survivors. Those were projections, not measurements, and should
  not be load-bearing in a gating PR. A2 ships two operators over three packs and **reports
  measured numbers** (18 / 122 / 0 / 6 ms) so M-5b/B6 can extrapolate from data.
- **Bundling M-5b's contents here.** Harness consolidation, the tested-tree digest, fixture
  provenance annotation and the finding-ID cleanup triple the review surface of the PR that
  exists to establish one thing.

## 6. Observed, not changed

- **All nine wrapper *executable* blocks are byte-identical, but the comment headers above
  them are not.** `drift-sentinel.js` names itself in USAGE and documents its env var. That
  is correct as-is and is why A3 scopes to the executable block.
- **`patch-compose`'s `else if (!hasBranchName || !modeValid)` has a dead disjunct** —
  `!modeValid` implies `!compositionValid`, so the first branch already took it. Not touched
  here (M-5a changes no validator behaviour); SC-9 should remove the dead term and record it.
- **`entropy-gate.js`'s `finally` does not run on the error path.** `fail()` calls
  `process.exit()`, which terminates synchronously, so the comment at `:96-97` claiming the
  process "leaves the environment untouched" is not true when the sentinel throws. Harmless
  — the process is dying and env is per-process — but the comment overstates.
- **The parity baseline is self-referential for diverged packs.** `PARITY_REPORT.md:10`
  states this honestly; nothing in the repo can re-derive original parity without
  `ADWS_PRO_source/`. M-5b/B4 makes each fixture *declare* which side its baseline came
  from; the parity itself is not recoverable.
