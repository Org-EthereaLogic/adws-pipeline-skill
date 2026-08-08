# Runtimes and dispatch fallbacks

Background for the test and verify phases, and for runtimes where the `adws-*` agent types
are not registered. Read this when a required runtime is missing, when a change touches
shell or any version-sensitive interpreter, or when a phase agent's type fails to dispatch.

## Contents

- Environment & runtimes (F-9)
- Host-runtime blindness (F-13)
- Agent-type fallback (F-11)

## Environment & runtimes (F-9)

The bundled scripts need only Node ≥ 20 (and `gh` for `pr` mode). But the TARGET
repository's test and verify phases usually need repo-specific runtimes the pipeline
does not ship — a PHP project needs PHP, a Python one needs Python, etc. These are the
tester's and verifier's concern, not the orchestrator's: when a required runtime is
absent, a check must degrade HONESTLY — record `"pass": false` with output `NOT RUN`,
or use a documented substitute (E2E-1 ran PHP checks via php-wasm under Node) — and
NEVER an assumed pass. A skipped or unrunnable check is evidence of a gap, not a
green light; plan checks around the runtimes actually available and say so in the
phase log.

The same honesty governs the SC-3 falsifiability baseline (A2): a pre-change check that is
red only because it could not execute (`NOT RUN` / collection error) is NOT a valid red —
the runtime is missing, not the feature — so its criterion is recorded `gate_weak`
(unverified), never `verified`. See `references/phase-gates.md` "Falsifiability at the
test gate."

## Host-runtime blindness (F-13, field-validated issue #111)
 The test and verify
phases run wherever the ORCHESTRATOR runs — often a Linux / bash-5 cloud container —
which can differ from the TARGET runtime a generated project actually executes on.
macOS ships bash 3.2, where expanding an empty array `"${arr[@]}"` under `set -u`
raises `unbound variable` and aborts (a bash bug fixed only in 4.4); a change can
PROMOTE green in-container yet crash on the target host. Container-green is NECESSARY,
NOT SUFFICIENT. When a change touches shell — or any runtime whose behavior is
version/OS-sensitive — the tester MUST exercise it on the target runtime, or the ship
step MUST re-validate there before merge: render a scaffold and run the affected
scripts under the target's own interpreter, driving edge inputs (empty lists/arrays,
embedded tabs/newlines) that trip version-specific behavior, and diff against a
baseline render. A failure-set parity check alone misses this unless the new tests
themselves exercise those edges under the target interpreter.

## Agent-type fallback (F-11)

The `adws-*` agent definitions in `.claude/agents/` register as subagent types in
Claude Code, but other runtimes (e.g. Cowork/cloud sessions) may not load them. When a
phase agent's type is not registered, do NOT skip the phase or run it yourself:
dispatch a general-purpose subagent with the corresponding `adws-*.md` body inlined
VERBATIM into its prompt (spec first, then the phase inputs), apply the model tier via
the dispatch mechanism's model option, and record the usual `agent` name in
`phase_manifest.json`. The inlined spec must include the agent's Security paragraph
and evidence-integrity rules — the fallback changes the transport, never the contract.
For the single-file writers (Critic, Advocate, Grader) — and for ANY dispatch at `haiku`
tier, whichever agent it is — the dispatch prompt must ALSO explicitly instruct: write
the output file with the file-writing tool at the exact given path, take timestamps from
a live `date -u +%Y-%m-%dT%H:%M:%SZ`, and verify the file exists (e.g. `ls -l` it) before
finishing — at haiku tier the spec text alone has not been sufficient (an agent may
return its verdict in its final message without writing the file); the orchestrator still
verifies the file exists and parses before deciding the gate. The hazard was first
observed on a single-file writer, but it is a property of the tier, not of the role.
Field-validated end to end on issue #103 of the agentic-starter-kit; the
single-file-writer dispatch note comes from the issue-#107 run. (Both runs are recorded
in the adws-pipeline-skill source repository's field-run log; that log is development
material and is not installed alongside the skill.)

