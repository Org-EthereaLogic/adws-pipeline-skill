# `live_plan_attempt/` — the recorded output of the one live dispatch (spike step 3)

Everything else under `fixtures/` is hand-authored to exercise a route. This directory is
not: it is what a **real `adws-planner` subagent actually wrote** on 2026-08-11, dispatched
through the controller's own handshake at the tier the controller advertised.

It exists so the step-3 result is re-checkable without spending another dispatch.
`run-step3.sh` replays it through `record` in LIVE mode and asserts the same gate outcome.

## Provenance

| | |
|---|---|
| job | `job_20260811_0001` |
| contract | `fixtures/live_contract.json` |
| worktree | a detached `git worktree` of `ba2f9d2`, discarded after the run |
| agent | `adws-planner`, dispatched via the Agent tool with `model: opus` |
| tier | `opus`, from `tier_input: { source: "contract.risk_level", value: "medium" }` |
| agent-observed span | `07:08:50Z → 07:22:21Z` (811 s), the agent's own stamps |
| orchestrator-observed span | `07:08:17Z → 07:24:23Z` (966 s), dispatch stamp to `record` |
| gate | `pass` |

The two spans differ by design and both are honest — see FINDINGS.md finding 21. The
controller records the orchestrator-observed one, because `provenance.started_at` is the
dispatch stamp only the dispatcher holds.

## Layout

- **`agent_authored/`** — the three files the subagent wrote, verbatim, before the
  controller touched anything. `phase_manifest.json` carries `"gate_result": null`, which
  is what `adws-planner.md` line 21 instructs it to write and what broke the sequencing
  oracle (finding 18). It is transcribed from the run rather than copied, because `record`
  overwrote the original in place; the values are the recorded ones.
- **`controller_recorded/`** — what `record` produced from it: the canonical
  `phase_manifest.json` (with the gate decision, `tier_input` and full `provenance`) and the
  `task-normalize` `skill_trace.json` the controller ran and transcribed.

## What it is not

One dispatch of one phase. It says nothing about the six phases the spike never ran live,
and nothing about cost or token behaviour beyond the single figure recorded in FINDINGS.md.
