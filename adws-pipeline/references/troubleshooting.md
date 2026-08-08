# Troubleshooting

Recovery procedures. Nothing here is needed until a specific failure occurs.

## Contents

- Stale worktree / ref `.lock` files (F-10)
- Transient subagent API errors vs. gate failures (F-12)

## Stale worktree / ref `.lock` files (F-10)

On sandbox-mounted or overlay filesystems, `git worktree add` can leave behind
zero-byte `*.lock` files (e.g. `.git/worktrees/{name}/HEAD.lock`, or a
`.git/refs/.../{ref}.lock`) that git itself then refuses to remove
(`unlink: Operation not permitted`). Every subsequent ref update on that target fails
with `cannot lock ref … Unable to create '….lock': File exists`.

Recovery — run all three checks BEFORE deleting anything:
1. Confirm the file is a lock AND is **zero bytes** (`ls -l` shows size 0). A non-empty
   `.lock` may be a real in-progress git transaction — do NOT delete it.
2. Confirm **no live git process** is touching this repo (`pgrep -fl git`). If one is,
   wait for it to finish; the lock is legitimate.
3. Only then remove the specific stale lock file(s) by **explicit path** (never a
   wildcard sweep), using elevated permission if the mount requires it. Re-run the
   failed git command.

Prefer the Agent tool's `isolation: "worktree"` where available — it sidesteps this by
not manipulating the primary checkout's `.git/worktrees` under the sandbox mount.

## Transient subagent API errors vs. gate failures (F-12)

A phase subagent can die on a transient infrastructure error (e.g. a stream idle
timeout, a terminal API error after retries) rather than on the merits of its work.
This is NOT a gate failure and MUST NOT consume the phase's retry budget:

1. Inspect the attempt directory. If the subagent wrote NO evidence (no
   `phase_output.json`/`phase_manifest.json`), nothing in the append-only tree was
   committed — re-dispatch the SAME agent into the SAME `attempt_{n}` directory. It is
   not a new attempt (FR-4 is about attempts that produced evidence; an empty directory
   from a dead dispatch has recorded nothing to preserve).
2. If the subagent wrote PARTIAL/malformed evidence before dying, treat those files as
   this attempt's record (append-only — do not edit them), count the malformed outputs
   toward the X-2 parse-failure signal, and open a NEW `attempt_{n+1}` for the re-run
   (which now escalates a tier as a normal retry).
3. Only a completed dispatch whose OUTPUT fails the gate (validator `fail`, Critic
   `fail`, checks fail, etc.) consumes the retry budget. Never record an
   infrastructure death as a `{PHASE}_GATE_FAILURE`.

Field-validated: the issue-#105 run's first planner dispatch died on a stream idle
timeout having written nothing; re-dispatch into the same empty `plan/attempt_1/`
proceeded cleanly with no budget consumed.
