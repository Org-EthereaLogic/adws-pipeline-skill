# ADWS Pipeline Field Run — 2026-07-18 — agentic-starter-kit issue #103

Operator: Anthony (Cowork cloud session, orchestrated by Claude).
Target: `Org-EthereaLogic/agentic-starter-kit` — issue #103, `--gate audit` dead
(`rule` vs `rules` key), `area:governance`.
Job: `job_20260718_0001` / `tsk_20260718_0001`. Verdict: **PROMOTE** (exit 0,
no warnings). 7/7 gates, 1 attempt per phase, grader 4/4 satisfied, both
consensus rounds clean, all 9 validator rubrics `pass`, zero entropy events.
Evidence tree: `artifacts/job_20260718_0001/` (40 files) in the target repo.

## Run environment

Cowork cloud sandbox (Node 22, Python 3.11, PyYAML, pytest; no `gh`, no push
credentials). Target repo mirrored from the operator's machine via tarball;
patch ship mode; results returned to the operator's machine as a patch +
plumbing-created local branch (`adws/job_20260718_0001/fix-gate-audit`).
The `adws-*` agent definitions were NOT registered as subagent types in this
runtime — the orchestrator inlined each agent's spec verbatim into
general-purpose subagent prompts, with model tiers applied via the Agent
tool's `model` parameter (low risk → sonnet architects, haiku consensus,
opus grader). This fallback worked end to end.

## What worked well (measured)

- **Gate discipline held.** Every phase produced its manifest/output/log;
  validators ran deterministically from the header-comment input contracts;
  the terminal verdict came from `execution-report.js` over evidence, not
  narrative (FR-10 held in practice).
- **F-9 honest degradation worked.** `cookiecutter` was unavailable; the
  tester substituted the unrendered template dir for "rendered project root"
  only after grepping the three relevant files for Jinja and recording the
  justification in `phase_log.md`. The substitution was later independently
  re-verified by the reviewer and grader.
- **Consensus independence was real.** Critic and Advocate ran in parallel
  with fresh context at both gates; both re-derived their own evidence (the
  test-gate Critic re-ran checks rather than trusting `phase_output.json`).
- **F-10 troubleshooting paid off.** On the operator's device VM
  (deletion-restricted mount), `git status` left a stale zero-byte
  `.git/index.lock`. The skill's three-step recovery (zero-byte check, no
  live git process, explicit-path removal — via rename, since unlink is
  blocked there) resolved it exactly as documented.

## Findings → suggested skill improvements

1. **Agents set `gate_result` themselves.** The tester wrote
   `gate_result: "pass"` into its own `phase_manifest.json` despite the
   layout reserving that field for the orchestrator (and the dispatch prompt
   saying `null`). Suggest: add an explicit "leave `gate_result: null`; the
   orchestrator writes the gate decision" line to every phase agent spec's Do
   list, not just artifact-layout.md.
2. **Placeholder timestamps from consensus agents.** Both test-gate haiku
   agents wrote `assessed_at: "2026-07-18T00:00:00Z"` (midnight placeholder,
   `date -u` never run). After the orchestrator added "real UTC iso from
   `date -u`" to the review-gate briefings, timestamps were real. Suggest:
   bake "obtain timestamps by running `date -u +%Y-%m-%dT%H:%M:%SZ`; never
   estimate" into adws-critic.md / adws-advocate.md (and all agent specs) —
   this is an evidence-integrity requirement, cheap to enforce at the spec.
3. **Schema drift tolerated silently.** The test-gate Critic added an extra
   `summary` field beyond the "EXACTLY one file / nothing else" schema.
   `execution-report.js` accepted it. Decide and document: either extra
   fields are allowed (say so in artifact-layout.md) or the consensus gate
   should `warn` on unexpected keys.
4. **Reviewer used `git stash` in a read-only role.** To baseline
   pre-existing test failures it stashed/unstashed the change set in the
   worktree — state restored correctly, but a crash mid-stash would have
   orphaned the change set. Suggest: adws-reviewer.md should name safe
   baseline techniques (`git show main:<path>`, temp clone, `git worktree`
   on main) and prohibit stash/checkout mutations.
5. **drift-sentinel input undefined when no entropy history exists.**
   SKILL.md maps verify → `drift-sentinel.js`, but on a clean run there is
   no `entropy_history.jsonl`. The orchestrator passed
   `{"entropy_history": []}` and got `pass`; confirm that is the intended
   convention and document it in SKILL.md's validator table footnote.
6. **Runtime registration gap (Cowork).** `install.sh` targets Claude Code
   agent registration; in Cowork/cloud sessions the `adws-*` subagent types
   are absent. The inline-spec-in-prompt fallback worked well. Suggest a
   short "Runtime fallback" note in SKILL.md: when agent types are not
   registered, dispatch general-purpose subagents with the agent .md body
   inlined and the tier applied via the dispatch mechanism's model option.
7. **Validator input assembly is the orchestrator's largest manual surface.**
   All 9 header contracts were accurate, but each input had to be
   hand-assembled from contract/phase outputs. A `--print-input-schema` flag
   (or one `references/validator-inputs.md` table) would reduce assembly
   errors on higher-pressure runs.

## Deviations from spec recorded for this run

- Phase agents ran as general-purpose subagents with inlined specs (see
  Runtime registration gap). Tier table honored.
- "Rendered project root" acceptance criteria satisfied against the
  unrendered template dir per the verified Jinja-free equivalence (F-9),
  plus post-run CLI replay on the operator's machine from the shipped
  branch content (audit rc=0 listing CRIT-004/005, IMP-001/003/005;
  hooks_test rc=0; unknown gate rc=1).
- Ship was `patch` mode (no credentials in either environment); the local
  branch on the operator's machine was created post-PROMOTE by the
  orchestrator via plumbing (`read-tree`/`apply --cached`/`commit-tree`
  with a temp index), outside pipeline scope, to avoid mutating the
  operator's checked-out `main`.

## Resolution — 2026-07-18 (same day)

All seven findings examined against the scripts and resolved on branch
`fix/field-run-2026-07-18-findings`. Verification of the claims behind each
finding preceded the fix: `evalConsensus()` in `execution-report.js` confirmed
a tolerant reader (documented fields only, unknown keys ignored);
`drift-sentinel` on `{"entropy_history": []}` confirmed SAFE/`pass` rc 0;
`entropy-gate` on a missing file confirmed exit 3.

1. **gate_result self-set** → all 7 phase-agent specs now carry an explicit
   "write `gate_result: null`; the gate decision is the ORCHESTRATOR'S
   designated post-hoc field, never yours" line (previously only
   `adws-planner.md` had a softer parenthetical).
2. **Placeholder timestamps** → all 10 agent specs gained an
   "Evidence integrity — timestamps" paragraph requiring real
   `date -u +%Y-%m-%dT%H:%M:%SZ` values; codified repo-wide as
   `references/artifact-layout.md` rule 9.
3. **Schema drift** → decision: tolerant reader, strict writer. Documented as
   `references/artifact-layout.md` rule 8; `adws-critic.md` and
   `adws-advocate.md` now state "exactly these fields, no extra keys" with the
   rationale inline.
4. **Reviewer `git stash`** → `adws-reviewer.md` Rules now prohibit all
   worktree-mutating git commands (stash/checkout/switch/restore/reset) and
   name the non-mutating baselines: `git show {target_branch}:<path>`,
   `git diff {target_branch}`, or a temporary clone/worktree outside the
   job worktree.
5. **drift-sentinel empty-history convention** → documented in SKILL.md
   (validator map section): missing `entropy_history.jsonl` at verify →
   pass `{ "entropy_history": [] }` (SAFE by design); distinct from an
   unreadable history at the stability gate (exit 3, evidence-integrity
   failure). Also carried in the new validator-inputs reference.
6. **Runtime registration gap** → SKILL.md gained "Agent-type fallback (F-11)"
   in the Environment section (inline the agent .md verbatim into a
   general-purpose subagent prompt, tier via the dispatch model option,
   contract unchanged), plus a pointer at the dispatch step.
7. **Validator input assembly** → new `references/validator-inputs.md`:
   per-validator input shape + assembly-source table, entropy-gate/
   execution-report CLI notes, reader/writer discipline. Script headers
   remain canonical; the doc-table option was chosen over a
   `--print-input-schema` flag to keep validator scripts untouched (P4 —
   proportionality; parity fixtures stay frozen).

Regression evidence: `parity/run-parity.js` 84/84 identical,
`entropy-gate-fixtures/run-tests.js` 7/7, `execution-report-fixtures/run-tests.js`
13/13 — all green before and after (no script was modified; docs and agent
specs only). Front-matter of all 10 agent files re-validated post-edit.
