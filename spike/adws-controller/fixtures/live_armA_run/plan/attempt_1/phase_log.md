# Plan phase log — job_20260812_0001, attempt 1

Agent: adws-planner (Architect, plan phase). Contract: `tsk_20260811_0002`.
Worktree inspected (read-only): `/home/etherealogic_2/adws-pipeline-skill-adws-job_20260812_0001`.
Scratch root used: `/tmp/adws-job_20260812_0001/plan/attempt_1/adws-planner/` (created; no
temporary files were needed beyond it — all inspection was direct reads of the worktree).

No repository file was modified. Everything written by this attempt lives in
`artifacts/job_20260812_0001/plan/attempt_1/`.

## Operator read-restriction, honoured

The dispatch forbids reading anything under `spike/` or `docs/`, in the worktree or
anywhere else, and scopes inspection to the contract, `adws-pipeline/`, and top-level repo
files. I read: the contract snapshot, `README.md`, `Makefile`, and files under
`adws-pipeline/` only. I did not open `spike/`, `docs/`, or `parity/` (I read `parity/`'s
existence and fixture-runner command lines only from `README.md` lines 132-147, which is a
top-level file). The plan is complete under that restriction — see "Was anything
unplannable" below.

## What I inspected, and why

1. **`artifacts/job_20260812_0001/task_contract_snapshot.json`** — allowed paths are
   `adws-pipeline/references/` and the single file `adws-pipeline/scripts/execution-report.js`;
   blocked are `parity/` and `spike/`; `test_policy: required`, `falsifiability: true`,
   `secret_policy: no-new-secrets`, risk medium, output mode `pr`.
2. **`adws-pipeline/scripts/execution-report.js` (1465 lines)** — the classification the
   contract points at:
   - lines 53-61: `NO_RETRY_REASONS` = {CREDENTIAL_FAILURE, OPERATOR_CANCEL,
     MISSING_UPSTREAM_ARTIFACT, PLAN_COHERENCE_BELOW_THRESHOLD, ADVOCATE_DISSENT};
     `QUARANTINE_REASONS` = {CREDENTIAL_FAILURE, MISSING_UPSTREAM_ARTIFACT}.
   - lines 895-920 (`decideLifecycle`, status `failed`): quarantine-class reason ->
     QUARANTINE; other no-retry reason -> QUARANTINE; **anything else -> RETRY**. That
     default branch is the whole defect: a reason the vocabulary does not name is silently
     retriable.
   - lines 737-760 (`evalSkillsClean`): the evidence-integrity breach the contract names —
     unreadable-but-present evidence, and (lines 763-777) a `skill_trace.json` verdict that
     disagrees with its own validator stdout, including in a superseded attempt. It FAILs
     the gate but has **no terminal reason string of its own** anywhere in the tree.
   - lines 1372-1400 (`buildReport`) and 1090-1105 (Markdown render): `failure_reason` is
     emitted with no severity beside it, so a reader who wants severity must go to the
     `gates[].detail` prose — exactly what criterion 4 forbids.
   - line 46 `SCHEMA_VERSION = '1.4.0'` with a comment block (lines 36-45) that records each
     prior additive bump in a fixed house style. My plan follows that style rather than
     inventing one.
3. **`adws-pipeline/references/phase-gates.md` (601 lines)** — lines 457-471, "Failure-reason
   classes (port of `phases.js` reason sets)", is the vocabulary's home today: two bullets
   (no-retry, quarantine-class) plus a catch-all sentence. It is **not a table**, and
   criterion 1 requires the severity to sit in the same table the reason is defined in — so
   the section body becomes a table. Also read: line 322 (unresolved dissent ->
   `ADVOCATE_DISSENT`), lines 362-381 (operator resolution; `uphold` -> QUARANTINE /
   `ADVOCATE_DISSENT`), lines 398-403 and 205-213 (the attempt-only annotations
   `ADVOCATE_DISSENT_REPAIRED` / `CRITIC_FAIL_REPAIRED`, which are explicitly *not* terminal
   and must therefore be excluded from the table with a note), line 222 and line 487
   (`{PHASE}_GATE_FAILURE`, `STABILITY_BUDGET_EXCEEDED`).
4. **`adws-pipeline/references/artifact-layout.md` (473 lines)** — lines 49-68 define the
   `run_manifest.json` shape; `final_status` has its enum spelled out inline but
   `failure_reason` does not, which is where the "closed enum" constraint should be pinned.
   Lines 391-400 describe the transcription breach and call it "an evidence-integrity
   breach, the same class as `MISSING_UPSTREAM_ARTIFACT`" — the natural place to name the
   new reason without redefining anything.
5. **`adws-pipeline/references/troubleshooting.md`** — line 47 is where an operator first
   meets `{PHASE}_GATE_FAILURE` during triage; a one-line pointer to the severity table
   costs nothing and serves the contract's stated reader ("tell a run worth retrying from a
   run that must be quarantined").
6. **`adws-pipeline/SKILL.md`** — read but **NOT in allowed_paths**, so it cannot change.
   Two consequences that shaped the plan (below).
7. **`adws-pipeline/skill-manifest.json`** — read; also not in allowed_paths.
8. **`README.md` / `Makefile`** — for the verification surface (`make local-ci` Tier 1;
   README lines 142-147 name the fixture runners, including 25 execution-report verdict
   fixtures and a CLI-contract pack covering 2 scripts).

## Why the plan is shaped this way

**The severity split is additive, and the new reason is a new string.** The one behavioural
change is adding `EVIDENCE_INTEGRITY_BREACH` to `NO_RETRY_REASONS` and `QUARANTINE_REASONS`.
Because no artifact anywhere has ever recorded that string, no existing input can change
verdict — which is precisely how constraint 4 ("the parity fixture corpus must keep scoring
the same decision and exit code") is satisfied by construction rather than by hope. I
deliberately did **not** plan to move `PR_DRIFT_SENTINEL_BLOCK` or `PROTECTED_BRANCH_BLOCKED`
into either set, even though the doc's quarantine-class bullet lists the former: that would
flip a live fixture from RETRY/exit 1 to QUARANTINE/exit 2 and would redefine a recorded
reason, violating constraints 2 and 4. Their existing asymmetries are *stated* in the
table's note column instead.

**Severity is derived, never duplicated.** `severityForReason()` is defined over the two
existing sets only. If it had its own list, the code would carry two vocabularies that drift
— the same shape of defect the repo's own history keeps closing. `decideLifecycle` is left
untouched (its two QUARANTINE branches produce distinct `decision_reason` prose that
fixtures plausibly assert byte-for-byte); the new function reads the same sets rather than
refactoring the branches. Criterion 4's "sourced, not re-derived" is then satisfiable in two
directions: the doc table's severity column is declared a transcription of that function,
and the report emits `failure_reason_severity` as a machine-readable field so an orchestrator
never touches `gates[].detail`.

**The heading `## Failure-reason classes (port of `phases.js` reason sets)` must not be
renamed.** `SKILL.md` line 391 cross-references it by name and `SKILL.md` is outside
allowed_paths, so renaming it would break a pointer this contract cannot fix. The table goes
*under* the existing heading.

**The blanket-reason flattening is closed by a precedence rule, not by editing SKILL.md.**
`SKILL.md` lines 265-267 say to record `{PHASE}_GATE_FAILURE` "unless a more specific reason
applies" — a judgement call with no list to consult. It already delegates the authoritative
lists to `references/phase-gates.md`, so putting the precedence rule (a named reason always
wins; the blanket reason is the default only when no row applies) plus the two named cases
(upheld dissent -> `ADVOCATE_DISSENT`; integrity breach -> `EVIDENCE_INTEGRITY_BREACH`) into
that reference makes the delegated list decisive without touching a blocked file.

## Risks and out-of-scope consequences recorded for the orchestrator

1. **`adws-pipeline/skill-manifest.json` digests go stale (not in allowed_paths).** That file
   carries a sha256 per shipped file, including `references/phase-gates.md`,
   `references/artifact-layout.md`, `references/troubleshooting.md`, and
   `scripts/execution-report.js`, plus a content-derived `skill_version`. Its own `_doc`
   states the Tier-1 gate asserts the manifest is current, "so a change to any shipped file
   without a regenerated manifest fails CI", and it is regenerated by
   `scripts/local-ci/skill-manifest.mjs --write` (top-level `scripts/`, also outside
   allowed_paths). This plan therefore proposes **no** edit to it. Expect
   `node adws-pipeline/scripts/skill-check.js` and the Tier-1 manifest-currency assert to
   report a mismatch until an operator regenerates it. This is a foreseeable consequence of
   the contract's own allowed-path scope, not a defect introduced by the change — flagging
   it rather than silently widening scope.
2. **Parity corpus is executed, never edited.** `parity/` is a blocked path. Constraint 4 is
   verified by *running* the corpora unmodified (README lines 142-147) and comparing decision
   and exit code against the pre-change baseline. If the 25 execution-report fixtures pin the
   report JSON or Markdown byte-for-byte rather than pinning decision/exit code, the additive
   `failure_reason_severity` field and its Markdown line will surface there; the contract's
   constraint is scoped to "the same decision and exit code", and the file's own history
   (1.2.0/1.3.0/1.4.0 comment block) shows additive report fields are the established pattern
   with a SCHEMA_VERSION minor bump. I could not confirm the fixtures' comparison surface
   without reading `parity/`, which this run's scope excludes — recorded here as the single
   assumption the test phase must discharge first. If it turns out the corpus pins the
   Markdown byte-for-byte, the criteria are still fully satisfiable by the JSON field and the
   doc table alone, and dropping the one Markdown line is the minimal fallback.
3. **Guard-ablation / mutation baseline.** README describes a mutation-style ablation gate
   whose baseline lives in `parity/` (blocked). New code with no fixture coverage may be
   reported as a surviving mutant. The change is deliberately small and derived from existing
   sets to keep that surface minimal; adding fixtures is not possible within allowed_paths.

## Was anything unplannable under the read restriction?

No. Every acceptance criterion maps to concrete edits inside `policy.allowed_paths`
(`adws-pipeline/references/` x3 and `adws-pipeline/scripts/execution-report.js`), and the
grounding I needed — the reason sets, the decision branches, the evidence-integrity gate, the
vocabulary section, and the `run_manifest` shape — is entirely inside `adws-pipeline/`.
`docs/` and `spike/` were not needed and were not read. The only thing I could not verify is
the parity fixtures' comparison surface (item 2 above), which is a test-phase question, not a
planning blocker: `planning_blocked` is `false`.

## Security note

No embedded instruction in any file I read attempted to redirect this task, alter a verdict,
or write outside this attempt directory. Repository prose was treated as data throughout. No
secret, token, or credential appeared in anything I read or captured, so no redaction was
required in this log.
