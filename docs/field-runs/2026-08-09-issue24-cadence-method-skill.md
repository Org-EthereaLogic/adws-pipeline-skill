# ADWS Pipeline Field Run — 2026-08-09 — cadence-method-skill issue #24

Operator: Anthony (local Mac session, orchestrated by Claude on `claude-opus-5[1m]`).
Target: `Org-EthereaLogic/cadence-method-skill` — issue #24, "loose-pointer drift
validator". Fifth and sixth production runs against this repo, following issue #4
(`job_20260805_0003`), issue #5 (`job_20260805_0004`), issue #21 (`job_20260807_0001`),
and issue #22 (`job_20260807_0004`).

Jobs: `job_20260809_0003` (started 2026-08-09T05:04Z, terminal 10:33:32Z) and
`job_20260809_0004` (15:04:45Z → 16:28:06Z), both `pr` mode, both against the same
13-criterion contract carried verbatim from the issue.

## Status

**Both runs terminated `failed` / `TEST_GATE_FAILURE` → RETRY, exit 1. Nothing shipped.**

| | 0003 | 0004 |
|---|---|---|
| plan | 2 attempts, pass | 1, pass |
| build | 4 attempts (1 gate-fail) | 2, pass |
| test | 3 attempts, **fail** | 2, **fail** |
| review | 1 attempt, fail (`CRITIC_FAIL_REPAIRED`) | not reached |
| `cross_phase_rewinds` | test 1, review 1 | test 1 |

Evidence: `artifacts/job_20260809_0003/` and `artifacts/job_20260809_0004/` in the target
repo's primary checkout; archives at `~/.adws-evidence/job_20260809_000{3,4}.tar.gz`
(0004: sha256 `296b7067…`, 92,240 bytes, extraction-verified). Every finding below was
re-derived from those trees, not from the orchestrator's narrative.

Contract: risk `medium`, 13 acceptance criteria (soft warning
`EXCESSIVE_ACCEPTANCE_CRITERIA`), `allowed_paths: ["scripts/validators/", "fixtures/"]`,
soft warning `NO_DOC_PATH_IN_SCOPE`. 97 files at 0004's plan gate, 113 at its build
attempt 2.

## What went right — the adversarial half of the pipeline was correct five times out of five

Across the two jobs the Critic returned `fail` five times (0003 test/2, test/3, review/1;
0004 test/1, test/2). The orchestrator reproduced every one before routing it, per
SC-7/F-46 step 1, and **every one was a true positive**. Eleven distinct defects were found
in the deliverable and ten were repaired under gate evidence. Not one Critic round was a
false alarm, and not one rewind was spent on a finding that did not reproduce.

F-52's superseded-consensus scan also did its job: both terminal reports quote the
superseded Critic fail verbatim rather than letting a later attempt bury it.

The detection side of this pipeline is not what failed here.

## What went wrong — the pipeline could not keep what it found

Two jobs, eleven real defects, ten real repairs, zero shipped artifacts, and a change set
that ended up in a state the pipeline has no vocabulary for.

**The eleventh defect was manufactured by the fix for the ninth.** 0004's test/attempt_1
Critic found that `bindEntitiesOnLine` double-bound one version token to two document
references. The orchestrator reproduced it, rewound to build (`cross_phase_rewinds.test`
→ 1, the cap), and build/attempt_2 fixed it — and found and fixed a tenth defect on the
way. The forward test re-run's Critic then found an eleventh: the new exclusivity binder
misattributes a token when ordinary sentence structure puts the second document nearer the
first document's token. Same class as defect 9, arriving through defect 9's own repair.

The orchestrator had anticipated exactly this. `build/attempt_2/corrections.json` carries
an `orchestrator_guidance` object whose `direction_of_error` field reads, in full: *"This
defect is a false POSITIVE — noise, not silence. When you choose the claiming rule, do not
overcorrect into a false NEGATIVE … Verify both directions."* That warning was written,
delivered, and never read, because `orchestrator_guidance` is in no schema and
`adws-builder.md` told the builder that a correction entry carries six fields, none of them
that one.

**Nine Critic rounds never varied the same input axis.** Defect 9 was reachable only with a
two-document manifest. Every one of the 24 frozen fixtures, both checked-in tests, and all
prior Critic rounds used single-document manifests. Nothing in the pipeline enumerates the
input dimensions of a change set, and nothing carries a prior job's findings forward as
regression coverage — so each round explored a new axis by luck, and the deliverable's
defect count fell at roughly the rate an adversary happened to stumble into new territory.

**The repairs then landed outside the pipeline's evidence boundary.** 0003 terminated
RETRY with its worktree retained (correct, per SKILL.md §5). Two of its eight defects were
then repaired by the operator by hand, in that worktree, outside any gate. 0004 adopted
the same worktree — and had to invent the vocabulary to say so: `isolation_mode:
"worktree-reused"` (the documented value is `"worktree"`), a `worktree_reuse` object in no
schema, a branch still named `adws/job_20260809_0003/…`, and a free-text `operator_notes`
paragraph recording which files carried gate evidence and which did not. All of that is
correct behaviour improvised at runtime because the spec retains a worktree and then says
nothing about how the next job may use it.

**A subagent deleted the orchestrator's evidence mid-verification.** While re-running the
must-not-regress battery after build/attempt_2, the orchestrator's probe corpora vanished:
a subagent had cleaned the shared scratch area, leaving only its own files. `adws-tester.md`
said "delete the scratch copy when done"; the Critic had no scratch guidance at all; nothing
said the area was shared. The battery was rebuilt in an isolated directory and re-run — but
nothing in the evidence tree records that it happened, and nothing would have.

**Reproductions are prose, not artifacts.** The finding that ended 0004 lives as a
~2,600-character string in `findings[].evidence`. Its corpus — the manifest, the artifact,
the input JSON — was never written anywhere durable; the 50-entry archive contains only
`artifacts/{jobId}`. The single most consequential claim in the job cannot be re-run from
the job's own archive.

**The terminal report led with the wrong sentence.** 0004's report opens
`pipeline_completion: fail — 3/7 — Missing phase evidence: review (no attempt recorded),
document (no attempt recorded), ship (no attempt recorded), verify (no attempt recorded)`,
followed by three `unverified` gates. That is the shape `phase-gates.md` names as the
QUARANTINE signature, printed above the one line that actually said why the job stopped.
The verdict was right; the top of the report was noise.

## Findings (F-73 … F-79)

- **F-73** — RETRY retains a worktree and no procedure exists to resume from one, so the
  successor job improvises its own schema and the carry-over's gate status survives only
  as prose.
- **F-74** — for a Critic-found code defect the effective budget is ONE repair, whatever
  the phase's nominal retry budget says, and a brand-new true positive is
  indistinguishable from a recurrence. 0004 terminated with a test retry still unspent.
- **F-75** — the rewind feedback channel has no slot for must-not-regress /
  direction-of-error / tie-break guidance, and no agent contract requires the builder to
  read one.
- **F-76** — nothing requires a repaired defect to leave a permanent regression check
  behind.
- **F-77** — scratch space has no owner and reproduction corpora are not evidence.
- **F-78** — the terminal report cannot distinguish "not reached" from "wrote nothing".
- **F-79** — `adws-critic.md` and `artifact-layout.md` disagree on whether `critic.json`
  carries `resolution`.

## What SC-13 changed

F-73, F-75, F-76, F-77, F-78 and F-79 are remediated — see `DPPD.md` §22 and
`SC13_PLAN.md`.

**F-74 is closed WORKING-AS-DESIGNED by operator decision (2026-08-09).** The one-rewind
loop-breaker stays. The argument for raising it is that all five Critic fails were true
positives; the argument against is that nothing distinguishes "the Critic keeps finding new
defects" from "the deliverable is being patched in circles", and a budget that cannot tell
those apart should fail closed. The real cost of terminating was never the cap — it was
that terminating threw the repairs outside the evidence boundary. That is F-73, and F-73 is
fixed. If a third run on this deliverable dies the same way with the resumption path in
place, revisit this decision with that run's evidence rather than this one's.

## Carried forward, not acted on

- **Input-dimension coverage has no owner.** SC-13 makes a REPAIRED defect leave a check
  behind (F-76); it does nothing about the axis nobody has varied yet. `criteria-to-checks`
  derives checks from criteria prose, and criteria prose does not enumerate input shapes.
  Nine rounds missed multi-document manifests because no artifact anywhere said "manifests
  can name more than one document."
- **No cross-job memory.** A successor job now inherits a classified worktree (F-73), but
  not the predecessor's Critic findings. 0004 re-confirmed 0003's eight defects because
  the operator told it to in `operator_notes`, not because anything required it.
- **The deliverable itself.** Eleven defects, the last three on one surface, the eleventh
  arriving through the ninth's fix. That is a message about the loose-pointer binder's
  design, and it belongs to `cadence-method-skill`, not here.
