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
  `run_manifest.carry_over` — `retained`, `resumable` + `resumable_reason`,
  `worktree_path`, `branch_name`, `gated_through`, and `files: [{ path, sha256 }]`.
  `resumable` is true only for a job that never shipped; a post-ship failure leaves commits
  and possibly a live PR, so its worktree is not a clean starting point. Existing steps 4
  and 5 renumber to 5 and 6.
- `SKILL.md` §0 step 5 (new): `execution.resume_from_job` is the only authorization to run
  against an existing tree. Intake verifies the predecessor's record, classifies every path
  in the tree or the record as `unchanged` / `changed` / `added` / `removed`, writes
  `run_manifest.resumed_from`, keeps the predecessor's branch and records
  `branch_name_origin: "resumed-from:{jobId}"`. Only `unchanged` carries evidence forward,
  and only as far as `gated_through` reached — a digest match proves the file has not moved,
  not that a gate assessed it. Tier selection renumbers to step 6.
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
  sets each entry's `regression_check_id` — the criterion id where one covers the finding,
  else a correction-scoped `REG-{source_attempt}-{k}`, because a Critic finding answers to
  no criterion and would otherwise have no id it could legally carry — plus `repro`
  naming the archived corpus. The builder leaves a check that is RED without the fix,
  echoes the ids, and records the pre-fix reproduction output. The tester must emit a NEW
  row per id, carrying real output from the corpus; a criterion repaired in THIS job that
  comes back `gate_weak` fails the gate rather than warning.
- `references/artifact-layout.md`: `regression_check_id` + `repro` on each correction,
  `regression_check_ids` on the build `phase_output`.
- `.claude/agents/adws-builder.md` (new step 3) and `adws-tester.md` (step 1).

The `REG-` namespace sits outside the criteria namespace, so the SC-5/F-31 criterion join
is untouched — and that join is explicitly NOT what verifies a repair, since one criterion
may carry several checks and an older row would satisfy it while the new assertion never
ran. No new validator, DSL, verdict, or exit code.

## A4 — Scratch discipline and reproduction as evidence (F-77)

- `references/agent-shared-blocks.md`: a THIRD shared block, "Scratch space — one root per
  agent", propagated byte-identically into all ten `.claude/agents/adws-*.md` files.
  `scripts/local-ci/agent-blocks-lint.mjs` now pins three blocks instead of two, so the new
  rule cannot drift out of one copy.
- `SKILL.md` §2 step 1: the ORCHESTRATOR creates and passes each agent a resolved absolute
  `scratch_root` at dispatch, conventionally
  `${TMPDIR:-/tmp}/adws-{jobId}/{phase}/attempt_{n}/{agent}/`, with the orchestrator's own
  work under `.../orchestrator/`. The block names a fallback for a dispatch that omits it
  and forbids treating any brace form as a literal directory. Without this the rule cited
  an identifier nothing defined — see the review round below.
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
`358f7b7d28a7`, 30 files. `node adws-pipeline/scripts/skill-check.js --json` reports
`intact: true`.

The live end-to-end drill — resuming `job_20260809_0003`'s retained worktree as a new job
under `execution.resume_from_job` — is deferred to the next run against issue #24 and
recorded as such in `VERIFICATION.md` §SC-13. Nothing in SC-13 is blocked on it; the
mechanism is documentation and report logic, and the report logic is fixture-pinned.

## Review round (CodeRabbit, PR #55)

Nine actionable findings, one Critical and five Major; eight were real and are fixed in
this branch. Full record in `DPPD.md` §22 "What review caught". The headline: the first cut
told ten agents to work under `{scratch}/…` and never bound `{scratch}` anywhere — F-75's
own defect, inside the change that fixes F-75. Also fixed: `regression_check_ids` could not
represent a Critic finding that matches no criterion (the motivating case); corrections had
no machine-readable corpus pointer; the regression join was satisfiable by a pre-existing
row; `reproduction.command` was an unguarded execution channel; a digest match was called
"gated"; and the carry-over record was silent about post-ship states (answered by
restricting `resumable`, not by growing the schema).

Declined: an executable end-to-end resume fixture for F-73 — that is the live drill below,
and a fixture would pin the simulation rather than the pipeline.

## Post-merge

`make check-installs` (or the `post-merge` hook) — a merged fix does not reach a run until
someone reinstalls (F-72), and the next issue #24 run should carry `358f7b7d28a7`.
