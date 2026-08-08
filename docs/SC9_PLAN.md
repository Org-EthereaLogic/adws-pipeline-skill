# SC-9 Plan — Hostile Input Is Input

**Scope class:** validator behaviour (SC-series). Three packs move to `v2.0.0` and join
`DIVERGED_PACKS`; corpus 93 → 108; no `SCHEMA_VERSION` bump; no new decision or exit code.

**Depends on M-5a.** Every claim below is verified by suites that did not exist a package
ago. Before M-5a the CLI was covered by one happy-path assertion per pack, and nothing
checked whether a fixture pinned anything — the two conditions under which all three of
these defects shipped.

## 1. Findings register

| ID | Finding | Evidence | Action |
|---|---|---|---|
| **F-63** | `repo-context-scan.js:27` used `{}`, which inherits `Object.prototype`. A proposal under a directory named `__proto__` (or `constructor`, `toString`, `valueOf`, `hasOwnProperty`) made `groupedFiles[dir]` truthy, skipped the initializer, and threw on `.push`. **The crash is not the finding:** the `blocked_paths`/`allowed_paths` loop lived in the same loop body and never completed, so a proposal explicitly inside a blocked path produced no verdict rather than `fail`. The build-phase policy gate was *skipped*, not failed. | `AUDIT_2026-08-08.md` §2, reproduced at exit 3 | A1 |
| **F-64** | `branch_name` was length-checked only in **both** ship validators (`patch-compose.js:22`, `ship-mode-select.js:21`) — the pair SKILL.md documents as the pre-git gate. `--upload-pack=/tmp/evil` and `foo; rm -rf ~` both returned `pass`. `{slug}`, which feeds the same field, was undefined anywhere in the spec. | `AUDIT_2026-08-08.md` §2, both reproduced | A2 |
| **F-65** | `drift-sentinel.js:244` spread an unbounded array into `Math.max(...abs)`. Reproduced: fine at 50k entries, `RangeError` at 200k. Reachable from `entropy-gate.js` over an append-only history nothing truncates. No input-size cap existed anywhere in the codebase. | `AUDIT_2026-08-08.md` §2 | A3 |
| — | `patch-compose` counted `files_to_ship` from `build_output` only, while the shipper stages the union with the document phase's `docs_delta`. Recorded in three separate field runs and deferred each time as a frozen validator. | `issue104:93`, `issue105:52`, `issue119:139` | A4 |

## 2. Actions

### A1 — `repo-context-scan` → v2.0.0

**(a) Prototype-safe map.** `Object.create(null)` plus a `hasOwnProperty.call` guard — the
pattern `task-normalize.js:26` already used. `JSON.stringify` of a null-prototype object is
byte-identical, so this alone changes no output.

**(b) Policy evaluation runs first, unconditionally.** Even with (a) fixed, a gate must not
depend on bookkeeping that can throw; grouping is now the last statement in the loop body.
Entries with no usable `file_path` are counted as `malformed_entries` and **fail** rather
than being silently skipped — SC-8/A9's rule, since an unassessable entry is a fact about
the input, not a judgement about it. A `null` entry no longer throws.

**(c) Segment-aware prefix matching and traversal rejection.** `startsWith` is a raw
substring test, so `allowed_paths: ["src"]` admitted `srcfoo/evil.js`. That is the same
defect class SC-8/A2 fixed in `review-risk-assess` and left standing here. Added
`underPrefix` (exact match or `prefix + '/'`) and `isSafeRelativePath` (rejects `..`, `.`,
empty segments, and drive-letter absolutes). Empty and whitespace-only policy prefixes are
dropped by `normalizePrefixes` rather than interpreted: an empty prefix would otherwise
mean "everything allowed" for `allowed_paths` and "everything blocked" for `blocked_paths`
from the same value.

**Verdict table** keeps its shape and the house rule — **fact → fail, heuristic → warn**:
policy violations and malformed entries `fail`; zero proposals or thin descriptions `warn`.
**Additive output:** `malformed_entries`.

### A2 — branch-name safety in both ship validators → v2.0.0 each

They cannot share a module (NFR-4 requires each validator to import only Node built-ins and
run standalone), so the block is duplicated verbatim and
`scripts/local-ci/cli-block-lint.mjs` asserts the two copies are byte-identical against
`parity/branch-guard.expected.txt`.

**Three rules, deliberately.** `too_long` (>255), `leading_dash_reads_as_option`, and
`illegal_character` (`/^[A-Za-z0-9._/-]+$/`, which excludes space, `;`, `|`, `&`, `$`,
backtick, `\`, `~`, `^`, `:`, `?`, `*`, `[`, `!`, quotes and control characters). Git's
remaining refname niceties — dot segments, `.lock` suffixes, slash placement — are left to
git, which rejects them with a clear error and no ambiguity about who decided. Each of the
three is safety-bearing and each is pinned by a fixture in **both** packs.

**An absent name stays `warn`** — the pre-existing "not chosen yet" case, unchanged. In
`ship-mode-select` the branch check precedes the policy/absence branches so an unsafe name
can never be downgraded to a warn by a policy conflict.

**Additive output on both:** `branch_name_valid`, `branch_name_problem`.

**SKILL.md** gains the `{slug}` derivation that appeared nowhere before, the instruction to
run `ship-mode-select` before the first git command that consumes the name, and a clause in
hard rule 6 about interpolating unvalidated values into git commands.

### A3 — `drift-sentinel` fold, plus a wrapper byte cap

**(a)** `Math.max(...abs)` → an O(n) constant-stack fold. `0` is the correct identity
(every element is `Math.abs(…)`, matching the `abs.length ? … : 0` fallback it replaces).
The value is identical for every input the spread survived, so **`drift-sentinel` does not
join `DIVERGED_PACKS` and none of its 16 fixtures change.** 500k entries now complete in
41 ms.

**(b)** `MAX_INPUT_BYTES = 64 MiB` in all ten CLI wrappers, applied through
`parity/cli-wrapper.expected.txt` so the ten-file edit could not half-land. **This is a
floor, not the fix** — a 200k-entry history is only ~2 MB, well under the cap. The 200k pin
lives in `parity/cli-contract`, generated in memory, so no 2 MB fixture enters the repo and
`drift-sentinel` need not diverge for a fix that changes no output.

### A4 — `patch-compose` counts the set it actually ships

`files_to_ship` becomes the size of the **union** of `build_output.files_changed` and
`document_output.docs_delta`, deduplicated. `docs_delta` entries are read as either bare
strings or objects carrying `file_path`, because `document-coverage-map`'s own fixtures use
both shapes — tolerant reader, strict writer. **Additive output:** `build_files`,
`docs_files`, `malformed_entries`.

Also removed a dead disjunct found while editing: `else if (!hasBranchName || !modeValid)`
could never take its second term, since `!modeValid` implies `!compositionValid` and the
branch above already returned.

## 3. Invariants held

1. **Zero pre-existing verdicts moved.** All 20 pre-existing fixtures across the three packs
   were re-verified against `git show HEAD:` — every `rubric_result` is unchanged. Only
   additive keys differ. *This was the PR's central review question.*
2. **`drift-sentinel` did not diverge.** All 16 of its fixtures are byte-identical; it is
   not in `DIVERGED_PACKS`.
3. **No `SCHEMA_VERSION` bump, no new decision, no new exit code.**
4. **NFR-4 preserved.** No shared module under `scripts/validators/`; `checkRequires` is
   unmodified; every validator still requires only `fs` and runs standalone.
5. **Non-diverged baselines cannot be laundered.** The new `--freeze-diverged` mode
   refuses to touch a pack that is not in `DIVERGED_PACKS`.

## 4. Verification — by falsification

| Claim | Falsification | Result |
|---|---|---|
| F-63 is fixed | Re-run the audit's reproduction | `rubric=fail`, violations `outside_allowed_paths + in_blocked_path`, exit 0 (was: exit 3, no verdict) |
| F-64 is fixed | Re-run both reproductions against both validators | `--upload-pack=…` → `fail (leading_dash_reads_as_option)` in both; `foo; rm -rf ~` → `fail (illegal_character)` |
| F-65 is fixed | 500k-entry history | `band=SAFE` in 41 ms (was: `RangeError` at 200k) |
| The undercount is fixed | 2 build + 2 docs files | `files_to_ship=4` (was 2) |
| The M-5a pins flipped | `cli-contract` with `pending_sc9: false` | All four hostile cases now assert `after_sc9` and pass; leaving a flag set either way turns the suite red |
| Each new rule is pinned | `guard-ablation` | 35 mutants, 409 `execute()` calls, **0 survivors**, 13 ms |
| No pre-existing verdict moved | Compare every pre-existing fixture's `expected.rubric_result` against `HEAD` | 20 checked, **0 moved**, 15 added |

**The gate went red on this package's first cut, and that is the headline.**
`guard-ablation` named four rules SC-9 had introduced without pinning: the empty-prefix
branch of `underPrefix`, both absolute-path guards, and the malformed-entry count. Three
were closed by adding fixtures. The fourth — an explicit `startsWith('/')` test — proved to
be **dead code**: `/etc/passwd` splits to `['', 'etc', 'passwd']` and the empty-segment rule
already rejected it. It was deleted rather than exempted, because a redundant guard is a
rule readers will trust twice.

That is the mechanism doing precisely the job the field record said was missing. Without it,
SC-9 would have shipped four un-pinned rules and one piece of dead security-shaped code, and
the suite would have been green.

**Gate at HEAD:** 12/12 steps pass, ~10 s.

## 5. Rejected

- **Adding a 200k-entry `drift-sentinel` parity fixture.** It would force `drift-sentinel`
  into `DIVERGED_PACKS` (the original crashes on it) for a fix that changes no output on any
  input the original survives, and put ~2 MB of generated JSON in the repo. Pinned in
  `cli-contract`, generated in memory, where there is no original baseline to diverge from.
- **Full git refname validation.** Dot segments, `.lock` suffixes, slash placement and
  `@{` are refname *legality*, not safety, and git rejects them itself with a clearer error.
  Each extra rule would need its own fixture in both packs to satisfy `guard-ablation`;
  three safety-bearing rules earn that cost and eight do not.
- **Treating an empty policy prefix as a policy.** Dropped by `normalizePrefixes` instead.
  An empty prefix would mean "everything allowed" and "everything blocked" depending only on
  which list it appeared in — a policy that reads restrictive and behaves as none.
- **Harmonizing degenerate-input verdicts across the other six validators.** Each is a
  divergence plus a version bump plus a refreeze. Five of nine packs already diverge; taking
  three more to satisfy a symmetry no gate reads would leave one original-parity pack.
  SC-11/A2 writes the rule down instead.

## 6. Observed, not changed

- **`--freeze` still requires `ADWS_PRO_source/`, which is absent here.** A scope change
  that adds output keys cannot land without a refreeze, so `--freeze-diverged` was added:
  for a diverged pack the port *is* the reference by definition, so no original is needed.
  It refuses non-diverged packs, so it cannot be used to launder a baseline. Refreezing all
  five diverged packs left `criteria-to-checks` and `review-risk-assess` byte-identical,
  which is independent evidence that the freeze path is faithful for unchanged code.
- **Four of nine validators now have original parity, down from seven.** `README.md` says
  so plainly. The count fell because scope changes were approved, not because parity
  degraded — but the honest number is the smaller one.
- **`repo-context-scan` still double-counts overlapping blocked prefixes.** A file under
  both `src/` and `src/auth/` yields two `policy_violations` entries. Harmless (the verdict
  is driven by `length > 0`) and left alone; changing it would move existing fixture output
  for no gate effect.
- **`entropy-gate.js`'s `finally` still does not run on the error path**, since `fail()`
  calls `process.exit()`. Carried from M-5a §6; harmless, but the comment overstates.
