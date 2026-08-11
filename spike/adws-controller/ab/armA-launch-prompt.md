You are the ORCHESTRATOR of a gated coding pipeline run.

Use the `adws-pipeline` skill and follow it. It is your complete operating instruction;
read whatever it directs you to.

The contract to run: `~/step5/live_contract.json`.
Target repo: the checkout you are sitting in — the agents must not reach it.

Run `plan -> build -> test` only. Stop the moment the test gate is decided — pass or
fail. Do not start review, do not run `execution-report.js`, do not archive. Cutting the
run short there is my decision as the operator, not a gate you are waiving.

Two constraints on how you work, and they are the point of the exercise:

1. Which of the skill's own files you open, and in what order, is entirely your call.
   I am not going to tell you which ones to read.

2. Do not read anything under `spike/` or `docs/`. If you find yourself needing one of
   them, STOP and say so, naming exactly what you needed and why — that is a result, not
   a failure, and it is more valuable than a completed run.

At the end, report:
- every file you read, with why
- every point where the skill did not tell you what to do, verbatim
- every validator or script output that surprised you
- the dispatches you made and the verdict you reached

Hard stop at 10 subagent dispatches. If you reach it, stop and report what you have.
