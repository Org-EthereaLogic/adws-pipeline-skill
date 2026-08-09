# SC-13 Implementation Plan — run disposition (F-73 … F-79)

**Status:** implemented, 2026-08-09. Companion: `DPPD.md` §22, field record
`docs/field-runs/2026-08-09-issue24-cadence-method-skill.md`, verification
`VERIFICATION.md` §SC-13.

**Scope decision (operator, 2026-08-09):** all seven findings in scope; F-74 (the
one-rewind cap for a Critic-found code defect) closed WORKING-AS-DESIGNED — the fix is the
carry-over path, not a larger budget.

## Why

Two consecutive RETRY runs against `cadence-method-skill` issue #24 found eleven real
defects and repaired ten, and shipped nothing. Every Critic `fail` was a reproduced true
positive. The pipeline's detection is not what failed; its **disposition** is — what it
does with a defect once it has one, and what happens to the repairs when a job ends.

## A1 — Resumption path (F-73)

The substantive change. A RETRY/QUARANTINE retains its worktree and then nothing said how
the next job may use it, so job 0004 invented `isolation_mode: "worktree-reused"`, a
`worktree_reuse` object, and a prose record of which files had ever been gated.

- `SKILL.md` §5 step 4 (new): on a non-PROMOTE terminal state write
  `run_manifest.carry_over` — `retained`, `worktree_path`, `branch_name`, `gated_through`,
  and `files: [{ path, sha256 }]`. Existing steps 4 and 5 renumber to 5 and 6.
- `SKILL.md` §0 step 5 (new): `execution.resume_from_job` is the only authorization to run
  against an existing tree. Intake verifies the predecessor's record, classifies each file
  `gated` / `ungated-carry-over` by digest, writes `run_manifest.resumed_from`, keeps the
  predecessor's branch and records `branch_name_origin: "resumed-from:{jobId}"`. Tier
  selection renumbers to step 6.
- `SKILL.md` §1: a contract naming `resume_from_job` skips worktree creation.
- `references/artifact-layout.md`: `isolation_mode` enum gains `"worktree-resumed"`;
  `carry_over` and `resumed_from` documented as DEFINED keys defaulting to `null`.
- `references/task-contract.md`: `execution.resume_from_job` added to template and field
  table — and `execution.evidence_archive_dir` with it, which `SKILL.md` §5 had consumed
  since SC-11 without the contract ever defining it.

**Hard rule 6 is untouched.** Nothing is staged or committed at termination; the carry-over
record is evidence about a worktree, not a commit.

## A2 — Corrections guidance becomes schema (F-75)

- `references/artifact-layout.md`: optional top-level `guidance` on `corrections.json` —
  `invisible_because`, `direction_of_error`, `must_not_regress[]`, `tie_breaking`,
  `housekeeping`. Field names lifted verbatim from what job 0004's orchestrator wrote into
  an undocumented `orchestrator_guidance` key, so the schema matches practice rather than
  inventing a parallel vocabulary.
- `.claude/agents/adws-builder.md`: reading `guidance` is mandatory when present, and the
  builder must state in `phase_log.md`, per item, how each `must_not_regress` entry was
  preserved and how `direction_of_error` was verified in both directions.

## A3 — Regression coverage for a repaired defect (F-76)

- `references/phase-gates.md`, new subsection under Cross-phase rewind: the orchestrator
  joins a Critic finding to the criterion it violates (a Critic finding has no `check_id`
  of its own); the builder leaves a check that is RED without the fix and records
  `regression_check_ids` plus the pre-fix reproduction output; the tester must answer those
  ids, and a criterion repaired in THIS job that comes back `gate_weak` fails the gate
  rather than warning.
- `references/artifact-layout.md`: `regression_check_ids` on the build `phase_output`.
- `.claude/agents/adws-builder.md` (new step 3) and `adws-tester.md` (step 1).

Reuses `check_specs`, the SC-5/F-31 id join, and the existing falsifiability baseline. No
new validator, DSL, verdict, or exit code.

## A4 — Scratch discipline and reproduction as evidence (F-77)

- `references/agent-shared-blocks.md`: a THIRD shared block, "Scratch space — one root per
  agent", propagated byte-identically into all ten `.claude/agents/adws-*.md` files.
  `scripts/local-ci/agent-blocks-lint.mjs` now pins three blocks instead of two, so the new
  rule cannot drift out of one copy.
- `adws-tester.md`: "delete the scratch copy when done" scoped to the tester's own root.
- `references/phase-gates.md` F-46 step 1: the orchestrator reproduces in its own root and
  copies the corpus into the failing attempt's `consensus/repro/`.
- `findings[]` gains `reproduction: { command, files, observed, expected, runs,
  deterministic }`, required when the author ran something, `null` for a static-reasoning
  finding. Corpus files go to `consensus/repro/`, which joins the tree diagram — and
  therefore the terminal archive.
- `adws-critic.md` and `adws-advocate.md` updated to match.

## A5 — Report distinguishes "not reached" from "wrote nothing" (F-78)

- `adws-pipeline/scripts/execution-report.js`, `missingPhaseEvidence()`: a phase with no
  attempt reads `not reached — job terminated at {phase}` when no LATER phase produced
  evidence, and keeps `no attempt recorded` when one did (a genuine skip). Gate status,
  DECISION, exit codes and `SCHEMA_VERSION` are all unchanged — only the words.
- New fixture `parity/execution-report-fixtures/quarantine_skipped_phase` (job `job-sk1p13`):
  `review` absent while `document` has evidence, pinning BOTH branches from one tree —
  `review (no attempt recorded)` beside `ship (not reached — job terminated at document)`.
  The `retry` case gains an `expectWarning` for the trailing-hole wording. Suite 24 → 25.

## A6 — critic.json schema consistency (F-79)

`resolution` documented on `advocate.json` alone in `references/artifact-layout.md`
(matching the prose that already said "advocate only"), and `adws-critic.md` states the
Critic never writes it.

## Verification

`make ci` (Tier 1 + Tier 2). Tier 1: parity 108/108, report **25/25**, entropy 7/7,
provenance 5/5, SC-3 drill, CLI contract, guard-ablation, four skill-repo lints,
skill-manifest. `skill-manifest.json` regenerated (`--write`) — version `904e3aa56dac` →
`d01d5a220664`, 30 files. `node adws-pipeline/scripts/skill-check.js --json` reports
`intact: true`.

The live end-to-end drill — resuming `job_20260809_0003`'s retained worktree as a new job
under `execution.resume_from_job` — is deferred to the next run against issue #24 and
recorded as such in `VERIFICATION.md` §SC-13. Nothing in SC-13 is blocked on it; the
mechanism is documentation and report logic, and the report logic is fixture-pinned.

## Post-merge

`make check-installs` (or the `post-merge` hook) — a merged fix does not reach a run until
someone reinstalls (F-72), and the next issue #24 run should carry `d01d5a220664`.
