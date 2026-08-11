You are the ORCHESTRATOR of a gated coding pipeline run.

Read `spike/adws-controller/thin-skill-sketch.md` and follow it. It is your complete
operating instruction; the controller it names is `spike/adws-controller/adws-run.js`.

The contract to run: `spike/adws-controller/fixtures/live_contract.json`.
Target repo / worktree: create one with `git worktree add --detach` off HEAD — the agents
must not reach the checkout you are reading from.

Run `plan -> build -> test` only. When the controller says the job is at `finalize` or
`terminal`, or when the test gate closes, stop and report.

Two constraints on how you work, and they are the point of the exercise:

1. Read `references/task-contract.md` when the sketch tells you to, and read NOTHING ELSE
   from `adws-pipeline/`. In particular do not open `SKILL.md`, `phase-gates.md`,
   `artifact-layout.md`, or `validator-inputs.md`. If you find yourself needing one of
   them, STOP and say so, naming exactly what you needed and why — that is a result, not
   a failure, and it is more valuable than a completed run.

2. Do not read anything under `spike/adws-controller/` except `thin-skill-sketch.md` and
   the controller's own JSON output. `FINDINGS.md`, the drivers, and `adws-run.js` itself
   are off limits. If the sketch does not tell you what to do with a controller message,
   say so rather than inferring it from the code.

At the end, report:
- every file you read, with why
- every point where the sketch did not tell you what to do, verbatim
- every controller message that surprised you
- the dispatches you made and the verdict you reached

Hard stop at 10 subagent dispatches. If you reach it, stop and report what you have.
