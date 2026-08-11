# Plan phase log — job_20260811_0001 / attempt_1

Task: `tsk_20260811_0002` — "Separate the non-retriable terminal failure reasons from the
retriable ones."

Scratch root used: `/var/folders/vp/v7c0t9156zdf2fz1j92vg_5h0000gn/T/adws-job_20260811_0001/plan/attempt_1/adws-planner`
(the path the dispatch named). Nothing needed writing there this phase — every question was
answerable by reading the worktree — so it stays empty. No file outside this attempt
directory was written.

## What I inspected, and why

| Read | Why |
|---|---|
| `adws-pipeline/scripts/execution-report.js` (all 1466 lines) | The contract names it as the severity source. `NO_RETRY_REASONS` / `QUARANTINE_REASONS` (lines 53-61) and `decideLifecycle` (851-936) are the classification the ACs say to source from. |
| `adws-pipeline/references/phase-gates.md` | Holds the vocabulary today: "Failure-reason classes (port of `phases.js` reason sets)", lines 457-471 — two prose bullets, no table, no per-reason severity. Also Consensus rules 2/5 (317-381) and Critic-fail remediation (177-228), which is where the reasons are actually emitted. |
| `adws-pipeline/references/artifact-layout.md` | `run_manifest.failure_reason` is defined here (49-68) and the skill_trace breach rule at 391-400 says the breach is "the same class as `MISSING_UPSTREAM_ARTIFACT`" — i.e. it has no reason of its own today. |
| `adws-pipeline/SKILL.md` §4-§5 | Not writable under this policy, but it is where the flattening originates: step 4's "terminate `failed` with the recorded failure reason (default `{PHASE}_GATE_FAILURE` … unless a more specific reason applies)" is the ambiguity, and §5 step 1 shows the orchestrator writes `failure_reason` BEFORE running the report. |
| `spike/adws-controller/FINDINGS.md` (finding 4, 173-186; open item, 565-567) and `spike/adws-controller/adws-run.js` (`terminalReasonFor`, `terminalReasonFrom`, `cmdFinalize`) | The recorded observation this contract is drawn from. Read-only: `spike/` is a blocked path. |
| `parity/execution-report-fixtures/run-tests.js`, `parity/cli-contract/run-tests.js`, `parity/_harness.js`, `.gitignore` | To find what the change must not break. Read-only: `parity/` is a blocked path. |
| `Makefile`, `scripts/local-ci/gate.sh`, `skill-manifest.mjs`, `requires-lint.mjs`, `guard-ablation.mjs` | To know which repo gates the change trips. |

## Why the plan is shaped this way

**The gap is real and it is two-sided.** `execution-report.js` already classifies severity:
`decideLifecycle` maps a `failed` job to QUARANTINE when the reason is in
`QUARANTINE_REASONS` or `NO_RETRY_REASONS`, and to RETRY otherwise. What is missing is (a) a
reason for the evidence-integrity case at all, and (b) any documented, machine-readable
binding from a failing gate to the reason it implies. So an orchestrator that halts writes
the blanket `{PHASE}_GATE_FAILURE` and the run scores RETRY. The spike controller shows both
failure modes in one function: `terminalReasonFor(phase)` returns `${PHASE}_GATE_FAILURE`
unconditionally, and the retraction path writes `failingGate || 'SCORER_' + decision` —
a gate `detail` SENTENCE into `run_manifest.failure_reason`. That is simultaneously the
severity downgrade the problem statement describes and a free-text terminal reason, which
contract constraint 1 forbids. Both are fixed by the same thing: a closed table with a
severity column, and a structured field to read the reason from.

**Severity must be a projection, not a second opinion.** AC-4 says "sourced from the
classification execution-report.js already computes". So `failureReasonSeverity(reason)` is
defined as membership in the two existing sets — the exact test `decideLifecycle` applies —
rather than as a new hand-maintained map beside them. A hand-maintained map is a second
source of truth that can drift from the verdict it claims to describe; the tester's totality
check (every enum member, severity vs. the actual `decideLifecycle` decision) exists to pin
that they never do.

**Two rows needed a decision, and I made both explicitly rather than silently.**

- `EVIDENCE_INTEGRITY_BREACH` is NEW. The alternative was to reuse
  `MISSING_UPSTREAM_ARTIFACT`, which is what artifact-layout.md's "same class as" wording
  hints at. Rejected: an unreadable or forged evidence file is not a missing artifact, and
  reusing the reason would redefine an existing one — contract constraint 2 says a reason may
  be added but never redefined. AC-3 also asks for a *distinct* reason.
- `PR_DRIFT_SENTINEL_BLOCK` is a pre-existing inconsistency I am proposing to close, not a
  discovery I am smuggling in. phase-gates.md line 466 has listed it as quarantine-class
  since it was introduced; the code set omits it, so a job that terminated `failed` with that
  reason would score RETRY. The documented SKILL.md path writes `final_status: quarantined`,
  which quarantines from the STATUS, which is why nobody has been bitten yet. AC-1 forces
  every reason to carry one severity in one table, and this row cannot be both "quarantine
  class" (doc) and "retriable" (code) without making the table dishonest. Adding it to
  `QUARANTINE_REASONS` makes the code compute the severity the doc has always asserted; no
  parity fixture records the reason (all 25 fixtures use `null`, `ADVOCATE_DISSENT`, or
  `TEST_GATE_FAILURE` in `run_manifest.failure_reason`), so nothing rescores. If the build or
  review phase judges this out of scope, the fallback is to keep the code as-is and give the
  row severity "retriable" with a footnote — but then the table contradicts the bullet list
  directly above it, which is worse.
- `PROTECTED_BRANCH_BLOCKED` is deliberately left alone: "no-retry but NOT quarantine-class →
  RETRY verdict" is already stated in both doc and code and they agree. It is exactly why the
  table needs a "halts immediately" column SEPARATE from the severity column — the doc's
  "no-retry" class and the code's `NO_RETRY_REASONS` are two different facts that share a
  name, and collapsing them would redefine this reason.

**The emitted report schema is deliberately frozen.** The obvious extra move — put
`failure_reason` / `failure_severity` into `execution_report.json`'s `gates[]` rows — is NOT
in the plan. `parity/execution-report-fixtures/run-tests.js:445` asserts
`schema_version === '1.4.0'`, `parity/` is in `policy.blocked_paths`, and the file's own
convention bumps the minor version for every additive report-shape change (1.2.0, 1.3.0,
1.4.0 are all documented as exactly that in the header). So emitting the field would force a
choice between a red CI step and an unversioned schema change. Neither is necessary: the
orchestrator writes `failure_reason` BEFORE the report is generated (SKILL.md §5 step 1), so
its sourcing channel is the documented table plus the module exports, not the report it has
not produced yet. The structured `failure_reason` therefore lives on the INTERNAL gate
objects (whose fields are already not emitted verbatim — the emitted row is
`{gate, result, detail}`) and reaches callers through a new third key on `buildReport`'s
return value and through `terminalFailureReasonForGates()`. Emitted JSON keys: unchanged.
`SCHEMA_VERSION`: unchanged. The two rendering changes I did keep — the markdown
"Failure reason:" line and the "Failure reason recorded:" warning gaining "(non-retriable)" —
are content, not schema, and directly answer the problem statement's "a reader cannot tell a
run worth retrying from a run that must be quarantined".

**Non-goals respected.** No gate key is added (`skills_clean` and `consensus` gain a field on
their existing rows), no phase, no validator. `DECISIONS`, `GATE_STATUSES`, `exitCodeFor` and
the 0/10/1/2/3 exit codes are untouched — the change is which decision a reason maps to, not
what decisions exist. The CLI argument contract is untouched: `parity/cli-contract` pins
one-argument usage and four exit-3 paths, so a subcommand would break it.

## Consequences the next phases must plan around

1. **`adws-pipeline/skill-manifest.json` will go stale, and it is out of policy to fix.**
   The Tier-1 step `skill-manifest` (`make local-ci`) asserts a sha256 of every shipped file,
   including all three files this plan changes. It is currently green (verified: `OK — version
   549226ba94f0, 30 shipped file(s) match`). Regenerating it means writing
   `adws-pipeline/skill-manifest.json`, which is NOT in `policy.allowed_paths`, so
   `repo-context-scan` would fail the build gate. The builder must NOT touch it. Expect
   `make local-ci` to report exactly one failing step (`skill-manifest`) with the message
   "changed since the manifest was written" for the three planned files; that is the expected,
   in-policy outcome and the regeneration (`node scripts/local-ci/skill-manifest.mjs --write`)
   belongs to whoever merges under a policy that admits the file. Every historical commit that
   touched `references/` regenerated it in the same commit (e.g. c037c67), so this is a policy
   boundary, not a defect in the change.
2. **No new permanent fixture can be added.** The only fixture home for this tool is
   `parity/execution-report-fixtures/`, a blocked path, and its harness cross-checks declared
   cases against fixture directories in both directions, so adding a directory without a
   `CASES` entry fails the suite. The test phase must therefore run its checks as recorded
   commands against trees built in the tester's own scratch root, with the pre-change baseline
   materialized by `git archive main` into scratch (never by reverting the worktree, F-36).
   Every check in `criteria_map` is written to be falsifiable that way; the sharpest is
   AC-3's, which is RETRY/exit 1 on the baseline and QUARANTINE/exit 2 after.
3. **The parity floor is a hard gate, not a nicety.** Contract constraint 4 requires the
   fixture corpus to keep scoring the same decision and exit code. `run-tests.js` also
   compares the full JSON and markdown between two consecutive runs for determinism, so any
   added field must be deterministic (all of them are — they derive from the same evidence).
4. **The document phase's docs delta has to live in `adws-pipeline/references/`.** `docs/` is
   not in `allowed_paths`, so the changelog/doc-coverage evidence must come from the reference
   files themselves.
5. `requires-lint` covers `execution-report.js` and permits only Node built-ins and intra-repo
   relative requires — the plan adds no imports. `guard-ablation` covers only
   `adws-pipeline/scripts/validators/`, so it does not see this file.

## Security note

`spike/adws-controller/FINDINGS.md` and `adws-run.js` were read as DATA only. Nothing in the
worktree, the contract, or any command output attempted to redirect this phase, and no
command string recorded above was executed from a stored record. No secrets appeared in any
output read; nothing required redaction.

## Timestamps

`started_at` is the real UTC birth time of this attempt directory
(`TZ=UTC stat -f %SB` → `2026-08-11T07:08:50Z`), i.e. the moment the dispatch opened it.
`completed_at` is a live `date -u +%Y-%m-%dT%H:%M:%SZ` taken at the moment the manifest was
written. Neither is estimated or copied.
