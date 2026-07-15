# ADWS Pipeline — a gated, evidence-producing coding pipeline for Claude Code

A [Claude Code](https://claude.com/claude-code) **skill** that runs a single coding task
through seven gated phases — **plan → build → test → review → document → ship → verify** —
with deterministic validators at every gate, an independent Critic/Advocate consensus,
isolated git worktrees, and a script-computed **PROMOTE / RETRY / QUARANTINE** verdict.

You describe one task; the skill turns Claude into the *orchestrator* of the pipeline.
Every phase runs as a fresh subagent, every gate is backed by a standalone validator, and
every decision is written to an append-only evidence tree — so job outcomes are decided by
evidence, not by narrative.

> Ported from the internal **ADWS_Pro** system; the 9 deterministic validators are verified
> byte-for-byte against the originals (see [Validation](#validation)).

---

## What you get

| Piece | Path | Role |
|---|---|---|
| The skill | `adws-pipeline/` | `SKILL.md` (orchestration), `references/` (contract, gates, layout), `scripts/` (validators + report + stability gate) |
| The agents | `.claude/agents/adws-*.md` | 10 subagents: 7 phase agents + Critic + Advocate + AC-coverage Grader |

Everything else (`docs/`, `parity/`) is development and verification material — not needed
to *use* the skill, only to understand or re-verify it.

## Requirements

- A **git repository** to run against
- **Node.js ≥ 20** on `PATH` (validators + report are dependency-free Node scripts)
- **[`gh`](https://cli.github.com/) authenticated** — only for `pr` mode
- If your repo signs commits, a loaded signing key (e.g. `ssh-add -l` shows your key)

## Install / port into a project

One command (from a clone of this repo):

```bash
./install.sh /path/to/your/project      # install into a project's .claude/
./install.sh --global                   # install into ~/.claude/ (all projects)
```

Or copy the two pieces by hand:

```bash
cp -R adws-pipeline           <target>/.claude/skills/adws-pipeline
cp    .claude/agents/adws-*.md <target>/.claude/agents/
```

## Usage

Describe **one** task and mention the pipeline. The skill auto-triggers on “adws”,
“pipeline run”, or “ship as PR with full validation evidence”:

> *Run this through the adws pipeline: add a `retryWithBackoff(fn, opts)` helper in
> `src/util/` with tests, and open a PR.*

The orchestrator normalizes your request into a **task contract**, and — by design — will
**ask for missing fields rather than guess** if the task has no verifiable outcome.

**Tips for a smooth run** (learned from live end-to-end drills):

- **Keep tasks small and single-purpose** — one behavior per run.
- **Phrase acceptance criteria with verifiable verbs** — “returns / passes / contains / is
  exported”, not “improve / clean up”. Vague verbs draw a (non-blocking) warning.
- **Scope `allowed_paths` tightly** (e.g. `src/`, `test/`) — anything proposed outside is a
  hard build-gate failure. That's the guardrail working.
- **Read the execution report** for the verdict; the evidence tree under `artifacts/{jobId}/`
  is the audit trail.

## How it works

```
intake ─▶ plan ─▶ build ─▶ test ─▶ review ─▶ document ─▶ ship ─▶ verify ─▶ REPORT
             │       │       │        │           │         │        │
          task-   repo-   criteria  review-    document-  ship-   verify-
          normalize context -to-    risk-      coverage-  mode-   evidence-map
                  -scan   checks    assess      map       select  + drift-sentinel
                                  + Critic/   + Critic/          + patch-  + AC-coverage
                                   Advocate    Advocate           compose    grader
```

- **Gated & append-only.** No phase starts while an earlier gate is failing; every attempt
  writes a fresh `artifacts/{jobId}/{phase}/attempt_{n}/` directory that is never mutated.
- **Deterministic validators.** Each gate runs a standalone Node validator (`pass|warn|fail`);
  a `fail` blocks promotion, a `warn` is recorded but never blocks.
- **Independent consensus.** At the test and review gates, a Critic and an Advocate run in
  *fresh context* (they see only the contract + change set). An Advocate dissent is recorded
  verbatim and **blocks promotion** — enforced by the execution report, not just by narrative.
- **Worktree isolation.** Build/test/review happen in a throwaway git worktree; your primary
  checkout stays clean until ship. Evidence is written to the primary checkout.
- **Safe shipping.** `pr` (opens a real PR), `direct_branch` (refuses protected branches
  *before* committing — no orphan commit), or `patch` (`git format-patch`, no push).
- **Stability gate (X-2).** A parse-failure “entropy” signal can escalate a model tier
  (`WARN`) or halt a spiraling job (`COLLAPSE → STABILITY_BUDGET_EXCEEDED`).
- **One authoritative verdict.** `scripts/execution-report.js` reads the evidence tree and
  emits PROMOTE (exit 0) / PROMOTE-with-warnings (10) / RETRY (1) / QUARANTINE (2).

See [`adws-pipeline/SKILL.md`](adws-pipeline/SKILL.md) and
[`adws-pipeline/references/`](adws-pipeline/references/) for the full specification.

## Repository layout

```
adws-pipeline/            the skill (install this)
  SKILL.md                orchestration procedure + hard rules
  references/             task-contract.md · phase-gates.md · artifact-layout.md
  scripts/                validators/ (9) · execution-report.js · entropy-gate.js
.claude/agents/           the 10 subagents (install these)
parity/                   verification harness + fixtures (dev only)
docs/                     design & acceptance docs (DPPD, WBS, VERIFICATION, acceptance/)
install.sh                one-command install/port helper
```

## Validation

Run the suites (dependency-free, plain Node):

```bash
node parity/run-parity.js                       # 84/84 validator-parity fixtures
node parity/execution-report-fixtures/run-tests.js   # 10/10 report verdict fixtures
node parity/entropy-gate-fixtures/run-tests.js       # 7/7 stability-gate fixtures
```

- **Validator parity:** 8 of 9 validators are verified byte-for-byte against the ADWS_Pro
  originals; `criteria-to-checks` is deliberately diverged (v1.1.0, see `docs/DPPD.md` §9) and
  verified against a frozen baseline. Parity reproduces from a fresh clone via each fixture's
  frozen `expected` field — no access to the private original is required.
- The skill was exercised **live end-to-end** (real PRs, real gate-failure and rewind drills);
  see [`docs/acceptance/`](docs/acceptance/).

## Status & scope

Validated end-to-end on small, well-scoped tasks — a solid place to start; scale task size as
you build confidence. Cross-provider (OpenAI/Gemini) Critic/Advocate consensus (**X-3**)
remains deferred (no cross-provider keys); consensus runs on Claude models.

## License

[Apache License 2.0](LICENSE).
