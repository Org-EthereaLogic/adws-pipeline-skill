# SC-12 Plan — An Install Knows What It Is; The Source Knows If It's Current

**Scope class:** skill tooling + installer + gate. **No validator changes, no fixture
changes, no parity refreeze, no `SCHEMA_VERSION` bump.** Closes the mechanism half of F-72.

## 1. Finding

**F-72** — a merged fix does not reach a run until someone reinstalls, and nothing said so.
After the M-5/SC-9…SC-11 series merged with a green gate, all three installed copies were
still pre-remediation: F-63, F-64 and F-65 reproduced live in every one of them, including in
`agentic-starter-kit`, the repository nine of thirteen field runs targeted.

The gap was structural. This repository lints its own tree exhaustively — CLI-wrapper byte
identity, agent-block byte identity, a bidirectional reference index, a fixture-corpus
ablation sweep — and had **no check that an installed copy matched its source**. Nothing even
knew where the skill was installed. The parity harness proves the validators in `git` are
correct; it said nothing about the validators that would actually run.

F-72 was recorded with two candidate mechanisms. Both are built here, because they answer
**different questions** and neither is sufficient alone.

## 2. Actions

### A1 — `adws-pipeline/skill-manifest.json`, generated and gated

`scripts/local-ci/skill-manifest.mjs` hashes every file `install.sh` ships — all 30: the
skill tree plus the ten agent definitions — and writes a manifest carrying a `skill_version`.

**The version is derived from content, not from git.** A commit hash is chicken-and-egg
(writing the manifest changes the tree, which changes the commit) and goes stale on a rebase
or cherry-pick. A content digest changes exactly when the shipped bytes change, which is the
property that matters. `git_commit` is recorded as advisory provenance and is explicitly not
part of the version.

Gated: the same script in verify mode is a Tier-1 step, so changing any shipped file without
regenerating the manifest fails CI. Without that, an install could stamp itself with a
version that does not describe its own contents — a worse failure than no version at all.

### A2 — `scripts/skill-check.js`, shipped WITH the skill

Runs against the installed tree and answers *what is this?*: every declared file hashed, and
**undeclared files reported too** — a partial install, a stray edit, or a leftover staging
directory is exactly how a broken install hides in plain sight. Agent definitions are checked
via both the installed layout (`../../agents`) and the source layout (`../.claude/agents`), so
it behaves identically in a checkout and in an install.

Exits 0 intact / 1 mismatch / 3 no manifest. Node built-ins only (NFR-4); added to
`requires-lint`'s targets.

### A3 — the orchestrator asserts it at intake

`SKILL.md` step 0.3: run `skill-check.js --json`, record `skill_version` in
`run_manifest.skill_version`. Exit 1 **stops the job** — every gate below assumes the skill is
the skill. Exit 3 records `"unknown"` and warns without blocking, so an install predating this
change still runs.

This is the half that matters most in practice: it makes a stale install visible **in the
evidence of every run it touches**, rather than in nobody's. `artifact-layout.md` documents
the field as evidence, never a gate input.

### A4 — `make check-installs`, and installs that register themselves

An install cannot know a newer version exists — it is offline with respect to its source. So
`check-installs.mjs` runs *from* the source and answers *is it current?*, reporting per
install: **CURRENT**, **STALE** (version differs), **MODIFIED** (version matches but files
don't match their own manifest — the more dangerous case, because the version string alone
looks right), **UNKNOWN** (no manifest: predates this or was hand-made), or **GONE**.

`install.sh` appends each destination to `.adws-installs` (gitignored — which machines have
the skill installed where is a local fact, not a project property), and prints the version it
just installed.

**Deliberately not in the gate.** It reads machine-local state and would fail in CI, in a
fresh clone, and on any machine that has never installed the skill. A step that cannot pass
everywhere is a step people learn to ignore. It is a post-merge command, which is exactly
when F-72 bites.

**A clean report means "every install I know of is current", never "every install is
current".** A registry only `install.sh` writes cannot know about copies made by hand, and
the output says so rather than implying otherwise.

## 3. Invariants held

1. No validator changes, no fixture changes, no refreeze. Parity 108/108.
2. No `SCHEMA_VERSION` bump. `run_manifest.skill_version` is additive evidence, never a gate
   input — the same discipline as `provenance`.
3. NFR-4 preserved: `skill-check.js` imports only Node built-ins and is covered by
   `requires-lint`.
4. NFR-3 holds — `SKILL.md` 376 < 500.

## 4. Verification — by falsification

| Claim | Falsification | Result |
|---|---|---|
| The manifest goes stale on a skill change | Append a line to `SKILL.md` | `FAIL`, names `skill/SKILL.md` and the version delta, exit 1 |
| …and on an **agent** change | Append to `adws-critic.md` | `FAIL`, names `agents/adws-critic.md` — the SC-10 surface is covered |
| `skill-check` detects an edited install | Change `BRANCH_NAME_MAX` in an installed validator | `1 changed`, names the file, exit 1 |
| …and an **undeclared** file | Add `references/stray.md` | `1 undeclared`, names it |
| …and a missing manifest | Remove it | exit 3 |
| `check-installs` detects staleness | Move the source forward after installing | `STALE — installed 43e9b6f ≠ source 3d27cfe`, exit 1 |
| …and same-version drift | Edit a file in the installed copy | `MODIFIED — 1 file(s) differ from their own manifest`, exit 1 |
| The happy path is green | — | `CURRENT` ×3, exit 0 |

Gate: **15/15**. All three real installs re-registered and reporting `43e9b6fded7d`.

### A5 — review round: agents were held to a weaker standard than the skill tree

CodeRabbit reviewed this PR (the first in this series it was able to — the two before it
were skipped for size and cut off mid-review) and found a **Major** defect in `skill-check.js`,
in two halves:

1. **With no agents directory the checks were skipped entirely**, so an install with zero
   agents reported `intact` and **exited 0**. I had written that as deliberate ("never
   fatal") on the theory that a checkout might not have one — but `findAgentsDir()` already
   handles the source layout, so finding neither means the agents this skill dispatches are
   not there to dispatch. That is a broken install, not an unverifiable one.
2. **Undeclared `adws-*.md` files were ignored**, while the skill tree treats an undeclared
   file as a finding — with a comment in this very file explaining why.

The asymmetry was the tell: a rule worth applying to one shipped surface is worth applying
to the other, and I had written the rule down and then applied it to only one.

Both fixed and falsified: removing the agents directory now reports all ten missing and
exits 1; an undeclared `adws-rogue.md` is named and exits 1; a user's own non-`adws` agent
beside them is correctly ignored, because only that namespace is ours.

Two further Major findings from the same round:

3. **`SKILL.md` step 3 told the orchestrator to record `skill_version` in
   `run_manifest.json`, which step 4 creates.** A sequencing contradiction in the spec — the
   file does not exist yet. Reworded: step 3 *keeps* the version, step 4 writes it when it
   creates the manifest.
4. **`check-installs` hashed only `installed.skill`**, so an edited or missing agent, or an
   undeclared file, reached `CURRENT`. **That is the identical asymmetry as finding 1** — and
   I had just fixed it in `skill-check.js` and not here. It now validates both surfaces
   against the **source** manifest (not the installed one, which an edited install could have
   trimmed to match its own omission) and reports undeclared files on both.

Falsified: an edited agent, a missing agent, and an undeclared `adws-*.md` each flip the
install to `MODIFIED` and exit 1; a user's own non-`adws` agent beside them does not.

**This is the strongest available argument for waiting on review.** Of #47, #48, #49 and #51,
this is the one PR where the bot got to finish — and it found **three** Major defects the
gate, the falsification table, and the author had all passed over. Two of the three were the
same class, fixed in one file and missed in another, which is precisely the failure a second
reader catches and an author does not.

## 5. Rejected

- **A git commit as the version.** Chicken-and-egg, and wrong after a rebase.
- **Putting `check-installs` in the gate.** See A4 — a step that cannot pass in CI teaches
  people to ignore red.
- **Discovering installs by scanning the filesystem.** Unbounded, slow, and it would find
  copies nobody wants checked. Self-registration is narrower and honest about its limits.
- **Blocking on exit 3 (no manifest).** Every install predating this change would stop
  working. It warns instead.

## 6. Observed, not changed

- **The registry only knows what `install.sh` told it.** Hand-copied installs are invisible,
  and `--root` exists for them. Stated in the output rather than papered over.
- **Nothing prompts anyone to run `check-installs` after a merge.** The mechanism exists; the
  habit does not. A post-merge hook or a release checklist would close that, and neither is
  built here — which is the same class of gap as archive-before-teardown being a procedure
  with no enforcement.
- **`skill_version` proves identity, not provenance.** It says the tree matches its manifest,
  not that the manifest was generated by anyone trustworthy. Signing is out of scope.
