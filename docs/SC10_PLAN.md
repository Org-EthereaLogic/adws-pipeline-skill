# SC-10 Plan — The Agents Can Write; The Skill Can Shrink

**Scope class:** agent definitions, skill prose, installer. **No validator changes, no
fixture changes, no parity refreeze, no count sites moved.**

**Correction: this is NOT independent of SC-9, as originally planned.** A3 restructures
`SKILL.md`, which SC-9 also edits (the `{slug}` definition and the pre-git-gate
instruction), and A1 adds a `gate.sh` step alongside M-5a's. The plan claimed independence
before those overlaps existed; the branch is stacked on SC-9 and the dependency is real,
not an artifact of how it was branched. See `docs/M5B_PLAN.md` §0 for the actual topology.

## 1. Findings register

| ID | Finding | Evidence | Action |
|---|---|---|---|
| **F-66** | Agents whose body instructs them to write evidence files declared no `Write` tool; their only writer was a `Bash` heredoc. Three field runs record haiku single-file writers returning the verdict in their message instead of writing the file, mitigated only by prose in `SKILL.md`. | `AUDIT_2026-08-08.md` §2; `issue106:57`, `issue103:58`, `issue105:91` | A1 |
| — | The evidence-integrity and security paragraphs are byte-identical in all ten agent files with nothing preventing drift. Ten copies of a security rule are ten places a hardening can miss one, and no test reads agent prose. | `AUDIT_2026-08-08.md` §7 | A2 |
| — | `SKILL.md` is always resident and carried ~125 lines of reference-grade material: a macOS bash-3.2 case study, a dispatch-fallback contingency, two recovery procedures, and a near-verbatim duplicate of `phase-gates.md`'s failure-reason lists. | `AUDIT_2026-08-08.md` §7 | A3 |
| **F-68** | `install.sh` ran `rm -rf` + `cp` over an existing install with no backup, prompt, or diff, destroying local edits; an interrupted copy left a half-written skill directory. | `AUDIT_2026-08-08.md` §2 | A4 |

## 2. Actions

### A1 — grant `Write`, then assert it from the BODY

**Six agents, not five.** The audit named critic, advocate, grader, verifier and planner.
Writing the lint immediately found a sixth: `adws-reviewer`, whose instruction reads *"Write
to your attempt directory"* rather than *"Write EXACTLY one file"* and which writes three
evidence files. A hand-maintained list would have shipped that gap.

So the lint reads the agent **body** and requires `Write` in `tools:` whenever the body
instructs a write. That is why it is a regex over prose rather than a list of names: the
list was already wrong once, on its first day.

`Bash` stays on all six — it is the only source of `date -u +%Y-%m-%dT%H:%M:%SZ`, which the
timestamp-integrity paragraph makes mandatory in all ten agents, and verifier/grader need it
for mechanical checks and `gh pr diff`. `adws-planner`'s `Bash` is not an over-grant: its
"you change no code" line governs the repository, and "never write outside your attempt
directory" already scopes it.

**`adws-advocate` stays `model: haiku`.** The recorded write-failures are best explained by
the missing tool, not the tier — and that explanation is a hypothesis, not a finding, since
`Bash` can write. Fix the cause, keep the tier, and record the reasoning so a later audit
does not "fix" it by raising cost. A recurrence *after* the grant would be new evidence and
the tier would then be the right lever.

### A2 — assert the shared blocks, do not extract them

Canonical copy in `adws-pipeline/references/agent-shared-blocks.md` — a genuinely useful
reference, since it is what the F-11 fallback must inline verbatim when an `adws-*` type is
not registered. `scripts/local-ci/agent-blocks-lint.mjs` asserts both blocks appear
byte-identically in all ten agents and in the reference.

Not extracted, because agent definitions have no transclusion mechanism and `install.sh`
ships each `.md` as the artifact — the file *is* what the runtime loads. The duplication also
costs no context: agent files load per dispatch and never co-load. The only real risk is
drift, and a lint closes it for ~100 lines.

### A3 — `SKILL.md` 425 → 337 lines

| Moved | To |
|---|---|
| `## Environment & runtimes` narrative + the macOS bash-3.2 case study + `### Agent-type fallback (F-11)` | new `references/runtimes.md` |
| both `## Troubleshooting` subsections (F-10 `.lock` recovery, F-12 transient errors) | new `references/troubleshooting.md` |
| `## Failure-reason classes` — a near-verbatim duplicate of `references/phase-gates.md:403` | a two-line pointer |

**What stayed** is the load-bearing sentence from each: a check that could not run is
`NOT RUN`, never an assumed pass, and never a valid falsifiability red; container-green is
necessary, not sufficient. Those decide gates. The case study explaining *why* does not.

**The reference index is now bidirectional.** `frontmatter-lint.mjs` already checked that
every path `SKILL.md` names exists; the converse was never checked, so a file could sit in
`references/` that nothing pointed at. That inversion is exactly how reference-grade prose
accumulates in the always-loaded file. Added an advisory `SKILL_MD_TARGET_LINES = 350` that
warns without failing, so the trend is visible before it reaches the 500-line ceiling —
357 → 367 → 379 → 412 was monotonic and nothing was watching it.

### A4 — atomic `install.sh` (F-68)

1. **Stage and validate first** into `.adws-pipeline.incoming.$$`, checking `SKILL.md`
   exists, ≥9 validators, ≥10 agents. A failure here leaves the existing install untouched.
2. **Back up only installer-owned paths** — `skills/adws-pipeline/` and the specific
   `agents/adws-*.md` names this repo ships. Never a recursive snapshot of `.claude/`, which
   would accumulate copies of the user's whole configuration on every run.
3. **Show the diff, then decide** — `diff -rq` installed → staged, plus per-agent `cmp`; on
   a tty prompt `[y/N]`, otherwise hard-error directing to `--force` / `FORCE=1`.
4. **Swap by rename.** `mv` within one filesystem is atomic, so an interruption leaves
   either the old tree or the new one — never the half-written directory `rm -rf` + `cp`
   could produce. Agent files are individually staged and renamed for the same reason.
5. **Backups are never auto-deleted**, and the final output says so.

The flag parser expands `"${ARGS[@]}"` defensively — bash 3.2 raises `unbound variable` on
an empty array under `set -u`. That is the repo's own F-13 lesson applied to its installer.

## 3. Invariants held

1. **No validator behaviour changes.** Parity 108/108, no refreeze, `EXPECTED_FIXTURE_TOTAL`
   untouched, no count site moved.
2. **No `SCHEMA_VERSION` bump, no new decision, no new exit code.**
3. **Every agent's contract is unchanged** — only the `tools:` line moved, plus one
   clarifying clause on the planner. No agent's procedure, output shape, or rules changed.
4. **`SKILL.md` lost no gate-affecting rule.** Every move left the operative sentence in
   place and relocated only the explanation; the reference index is now checked both ways.

## 4. Verification — by falsification

| Claim | Falsification | Result |
|---|---|---|
| The `Write` assertion is real | Remove `Write` from `adws-critic`'s `tools:` | `frontmatter-lint` FAIL naming the file and the rule |
| It reads the body, not a list | — | Found `adws-reviewer`, which the audit's hand-written list of five had missed |
| The block lint is real | Change `[REDACTED]` → `[HIDDEN]` in one agent's security paragraph | `agent-blocks-lint` FAIL naming the file and the block |
| The reference index is bidirectional | — | 7 reference files, all indexed; an unindexed file now fails by name |
| `install.sh` no longer destroys edits | Append a line to an installed `SKILL.md`, re-run non-interactively | Refuses, prints the diff, **preserves the edit**, exits non-zero |
| `--force` still backs up | Re-run with `--force` | Install replaced; the edit survives in `.adws-backup-<stamp>/` |
| Staging is validated | — | An incomplete payload aborts before touching the install |

**Gate at HEAD:** 13/13 steps pass.

## 5. Rejected

- **Extracting the shared agent paragraphs.** No transclusion mechanism exists; inventing
  one breaks the "the `.md` file IS the artifact" property `install.sh` depends on. And the
  duplication costs no context — agent files never co-load. Asserted instead.
- **Raising `adws-advocate` to sonnet.** Fix the cause, keep the tier, record why.
- **Removing `Bash` from the read-only agents.** It is their only source of the live
  `date -u` the evidence-integrity rule requires, and the verifier and grader genuinely need
  a shell. A scoped Bash allowlist would be the right answer if the tool layer offered one.
- **Cutting `SKILL.md` to the ~285 originally sketched.** The remaining compression targets
  are restatements of gate rules that the orchestrator acts on directly. 337 with a 350-line
  advisory target is where the prose stops being reference-grade.

## 6. Observed, not changed

- **`adws-reviewer` was missing from the audit's list of five agents.** Recorded because the
  correction came from the lint rather than from re-reading — which is the argument for the
  lint reading bodies instead of trusting a list.
- **The secret-redaction and prompt-injection rules remain LLM-honoured with no mechanical
  enforcement.** The lint now guarantees all ten agents carry the same text; it cannot
  guarantee any agent obeys it. That gap is real and unaddressed.
- **`install.sh` backups accumulate** — deliberately. Auto-pruning would delete the one
  artifact a user reaches for after a bad upgrade. The output names the directory.
