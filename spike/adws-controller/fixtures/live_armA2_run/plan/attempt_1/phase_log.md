# Plan phase log — job_20260812_0001, attempt 1

Agent: adws-planner (Architect, plan phase). Model tier: opus (tier_input:
`contract.risk_level` = medium). Task: `tsk_20260811_0002` — separate the non-retriable
terminal failure reasons from the retriable ones.

Scratch root used (all temporary files, nothing else touched):
`/tmp/adws-job_20260812_0001/plan/attempt_1/adws-planner/`
Repository content was read **only** from the worktree
`/home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001`. The only writes
outside scratch are the three evidence files in this attempt directory. No repository
file was modified.

## Operator read restriction

The dispatch forbade reading anything under `spike/` or `docs/` in either tree. I honoured
that: every `grep` I ran carried `--exclude-dir=spike --exclude-dir=docs`, and I opened no
file under either directory. **I did not need one.** Everything the contract's four
criteria touch is reachable from `adws-pipeline/`, `parity/`, `scripts/local-ci/`, the
`Makefile`, and `.gitignore`. Nothing in this plan rests on a spike or docs file, so there
is no blocked-read to report.

`parity/` is a contract **blocked path** (no writes), not an unreadable one, and the
operator restriction did not name it — so I read it. That reading is load-bearing: it is
where the constraint "the parity fixture corpus must keep scoring the same decision and
exit code" is actually enforced, and it is where the pre-change baseline lives.

## What I inspected, and why

**The contract's three file hints, first.**
- `adws-pipeline/references/phase-gates.md` (601 lines). The vocabulary lives in
  "Failure-reason classes (port of `phases.js` reason sets)", lines 457–471 — and it is
  **prose**: two bullet lists ("No-retry", "Quarantine-class") plus a catch-all sentence.
  There is no table, and no individual reason carries a severity. This is the concrete
  gap AC-1 names, and it is why AC-1's fix is a table and not an extra sentence.
- `adws-pipeline/references/artifact-layout.md` (473 lines). `failure_reason` appears in
  the `run_manifest.json` shape (line 52) and in the reader note at line 63
  ("`execution-report.js` reads only `job_id`, `task_id`, `final_status`, and
  `failure_reason`"). The file enumerates `final_status`'s four values but says nothing
  at all about `failure_reason`'s vocabulary — the field is defined where its enum is not.
- `adws-pipeline/scripts/execution-report.js` (1465 lines). The classification AC-4 refers
  to is already here: `NO_RETRY_REASONS` (lines 53–59) and `QUARANTINE_REASONS` (line 61),
  consumed by `decideLifecycle` at lines 899–921. Both Sets are exported. What does **not**
  exist is any way for a reader of the report to obtain the severity: the report object
  (lines 1376–1403) carries `failure_reason` copied verbatim from `run_manifest` and
  nothing else about severity, and each gate is flattened to `{gate, result, detail}` at
  lines 1387–1391.

**Then I measured the baseline rather than assuming it.** I copied two committed fixture
trees into scratch (never running the CLI against the corpus in place) and ran the shipped
generator over the copies:

- `quarantine_upheld_dissent` / `job-4e5f6a` — the canonical `resolution.action: "uphold"`
  tree. Result: `decision=QUARANTINE exit_code=2`, `run_manifest.failure_reason: null`,
  `report.failure_reason: null`, no `failure_severity` key, no `terminal_failure_reason`
  key. The token `ADVOCATE_DISSENT` appears exactly once in the whole report — inside the
  consensus gate's free-text `detail`:
  `"… — Advocate dissent in review/attempt_1 (operator UPHELD the dissent) — blocks
  promotion (ADVOCATE_DISSENT / AC-4.2): …"`.
- `quarantine_trace_mismatch` / `job-9b2e14` — an evidence-integrity forgery. Same shape:
  `QUARANTINE/2`, `failure_reason: null`, and the breach is legible only as the literal
  prose `EVIDENCE INTEGRITY: …` inside the `skills_clean` gate's `detail`.

That is the problem statement reproduced, and it sharpens it: the failure is not that the
orchestrator writes the *wrong* token, it is that for these two conditions there is **no
token at all** in `run_manifest.failure_reason`, and the only recoverable signal is a
substring of a prose string. An orchestrator that wants the severity today has literally
no option except the one AC-4 forbids.

**Then the enforcement surfaces**, because a plan that lands the four criteria and turns
CI red is not a plan:
- `parity/execution-report-fixtures/run-tests.js` — 25 cases. It asserts `decision`,
  `warn_flag`, `exit_code`, **`schema_version === '1.4.0'` (line 444)**, `gates[].result`
  looked up by key, `warnings` substring containment, and byte-identical determinism
  across two runs (`generated_at` stripped). Two consequences: additive top-level keys and
  additive per-gate keys are invisible to it, and a `SCHEMA_VERSION` bump **breaks** it.
- `.gitignore` lines 38–39 — the fixtures' derived `execution_report.{json,md}` are
  ignored, so running the suite leaves `git status parity/` clean. The tester can execute
  the corpus without dirtying a blocked path.
- `scripts/local-ci/gate.sh` — the Tier-1 gate: parity, report, entropy, provenance,
  sc3-drill, cli-contract, guard-ablation, node-check, shell/bash lints, frontmatter,
  requires, cli-block, agent-blocks, no-eval, **skill-manifest**.
- `scripts/local-ci/frontmatter-lint.mjs` lines 200–221 — the reference index is
  **bidirectional**: every `references/*.md` must be named in a backticked token inside
  `SKILL.md`, or the lint fails.
- `scripts/local-ci/guard-ablation.mjs` line 57 — targets the nine validator packs only;
  `execution-report.js` is out of its scope, so no mutant budget is implicated.
- `parity/cli-contract/run-tests.js` lines 360–401 — for `execution-report.js` it asserts
  only the five exit-3 error paths and their stderr first lines. Nothing pins stdout on a
  successful run, so the one-line summary is safe to leave alone (I left it alone anyway).
- `parity/skill-line-budget.json` — the line ratchet applies to `SKILL.md` only, not to
  `references/`. Growing a reference file costs nothing here.

## Why the plan is shaped this way

**Four files, all modifications, no creations.** The bidirectional reference index decides
this: a new `references/failure-reasons.md` would be the tidiest home for a vocabulary
table, and it is unshippable in this contract, because clearing the lint requires naming
the file in `SKILL.md` and `SKILL.md` is outside `policy.allowed_paths`. So the table goes
into the section that already owns the vocabulary — phase-gates.md's "Failure-reason
classes" — which also satisfies AC-1's exact wording ("the severity is stated in the same
table the reason is defined in") by making the definition site and the severity site one
table.

**Severity is a projection of the existing Sets, not a second list.** AC-4 says severity is
*sourced from the classification execution-report.js already computes*. The cheapest way to
violate that in spirit while satisfying it in letter is to introduce a parallel severity
catalog that can drift from `NO_RETRY_REASONS` / `QUARANTINE_REASONS`. So the plan adds a
function over those Sets (`failureReasonSeverity`) rather than a new table beside them, and
leaves `decideLifecycle` untouched: the verdict and the published severity are then
computed from the same two objects by construction, and the AC-1 doc table is checkable
against the function row by row.

**The severity column had to be two columns.** The existing prose distinguishes two things
that a naive "severity" column would fuse and corrupt:
`PROTECTED_BRANCH_BLOCKED` is listed as **no-retry** (terminate immediately, ignore
remaining budget) yet is in **neither** code Set, so `decideLifecycle` classifies it
*retriable* and the report literally prints "retry is permitted by policy" — correctly, per
lines 466–468: the operator fixes the contract and resubmits. `PR_DRIFT_SENTINEL_BLOCK` is
the same shape from the other side (doc calls it quarantine-class on a second BLOCK; the
code Sets do not contain it). Collapsing "does the orchestrator stop now" and "what does the
report decide" into one cell would silently redefine both reasons — which constraint 2
forbids. Hence: a `Severity` column defined as exactly what the script classifies (so AC-1
and AC-4 are the same fact) and a separate in-run `no-retry` column carrying the
orchestrator rule. I deliberately did **not** plan any routing change for these two reasons:
adding `PR_DRIFT_SENTINEL_BLOCK` to `QUARANTINE_REASONS` would flip a `failed` run carrying
that token from RETRY to QUARANTINE, which is a redefinition, not a documentation fix. The
doc/code divergence is recorded as a fact in the table rather than "tidied" away.

**Exactly one new enum member.** `EVIDENCE_INTEGRITY_BREACH` is added because AC-3's
condition has no token at all (the grep returns nothing tree-wide). AC-2's condition
already has one — `ADVOCATE_DISSENT`, whose meaning phase-gates.md lines 402–403 already
pins as "an unresolved or upheld dissent that quarantines" — so AC-2 is met by making that
binding **normative and machine-readable** (precedence rule + gate-level field), not by
minting a second dissent token that would redefine the first. That is constraint 2 applied
in both directions: add where nothing exists, never re-point what does.

**Additive report fields, and why they need the docs change.** `terminal_failure_reason`,
`failure_severity` and `gates[].failure_reason` are what let the orchestrator source the
severity without touching `detail`. Artifact-layout rule 8 (lines 463–468) declares an
undocumented extra key to be schema drift — so documenting them in artifact-layout.md is
not decoration, it is what keeps the change compliant with the repo's own rule.

**`SCHEMA_VERSION` stays `1.4.0`.** The file's own history (comments at lines 36–47) bumped
the minor version for each previous additive change, so convention argues for `1.5.0`. The
fixture runner pins `'1.4.0'` at line 444, and `parity/` is a blocked path — the bump and
its fixture update cannot land in the same job, and shipping the bump alone turns the
report suite red, which the contract's own constraint forbids. The plan therefore holds the
version and requires the builder to write the deferral, with this reason, as a comment
beside the constant where a reviewer will read it. Flagging it here so the review phase
treats it as a recorded decision rather than an oversight.

## Risks and out-of-scope consequences (operator decisions, not planned work)

1. **`adws-pipeline/skill-manifest.json` will go stale — and it is outside
   `policy.allowed_paths`.** `scripts/local-ci/skill-manifest.mjs` hashes every file under
   `adws-pipeline/` and fails the Tier-1 `skill-manifest` step when the manifest does not
   match the tree ("Fix: node scripts/local-ci/skill-manifest.mjs --write (and commit
   it)"). This plan changes four shipped files, so `make local-ci` will fail on that step
   alone even when every criterion is satisfied and all 25 report fixtures are green. The
   manifest is neither `adws-pipeline/references/` nor `adws-pipeline/scripts/execution-report.js`,
   so I did not propose it. Three ways out, all of them the operator's call, none mine:
   widen `allowed_paths` by one file; accept a known-red Tier-1 step attributable to the
   path policy and record it in the evidence; or land the manifest regeneration as a
   separate follow-up. **This does not block planning** — no acceptance criterion depends
   on it — but it will surface at test/verify and should not be mistaken for a defect in
   the change.
2. **No test directory is inside `allowed_paths`.** Every criterion check must therefore be
   runnable without adding a repo file: `node -e` assertions against the module, CLI runs
   over scratch copies of fixture trees, and greps over the reference docs. All four
   `check_idea`s are written to that constraint. A tester that wants to add a fixture or a
   spec file has nowhere in-policy to put it.
3. **Fixture trees must be copied, never run in place.** `parity/` is blocked. The derived
   reports are gitignored so an in-place run would probably leave the tree clean, but
   "probably clean" is not a policy argument; the checks specify scratch copies, and the
   constraint check asserts `git status --porcelain parity/` is empty.
4. **Precedence must be frozen and documented, or the new field is non-deterministic.**
   When both `skills_clean` and `consensus` fail, `terminal_failure_reason` must have one
   answer. The plan fixes integrity ahead of dissent, following the existing SC-8/F-55
   rationale already in the file (line 982: an evidence-integrity breach outranks the
   verdict it was hiding), and requires the order to be an exported constant documented in
   the table's precedence rule — the fixture suite's byte-identical determinism check would
   catch a wobble, but only by accident.

## Untrusted-content check

Repository prose, fixture JSON, and command output were treated as data throughout. I
found **no** embedded instruction attempting to redirect this task, alter a verdict, widen
a write scope, or bypass a rule. Nothing I captured contained a credential, token, or
key, so no redaction was required. Worth noting as design context rather than as a
finding: `scripts/local-ci/no-eval-lint.mjs` and artifact-layout's hard rule 9 encode the
same posture this plan inherits — a recorded `command` string is a record, never an
execution channel — and the checks I specified are written to be read and decided, not
replayed.
