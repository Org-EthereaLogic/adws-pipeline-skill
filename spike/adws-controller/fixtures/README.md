# Step-2 fixtures — MOCK dispatch outputs

The plan's §5.2 deliverable. Step 1 did not need it: it replayed
`parity/execution-report-fixtures/` directly, and deliberately so — the compatibility
question is worth asking against the corpus the shipped suite actually uses, and a private
second corpus is a thing to keep in sync.

Step 2 needs one anyway, because **no fixture in that corpus can exercise a rewind**. The
routing decision reads `phase_output.checks[].classification`, and 24 of the 25 corpus test
outputs carry no `checks` array at all (they are `{tests_run, tests_failed, coverage_pct}` —
minimal evidence for a tolerant reader, predating SC-5/F-31). There is nothing to classify,
so there is nothing to route.

Everything here is a **mock**: the files a subagent would have written, handed to
`adws-run.js record --from <dir>`. Nothing here is a record of a real agent run, and the
`assessed_at` stamps in `consensus_clean/` are fixture constants, not observations. What is
NOT mocked: `criteria-to-checks` and `review-risk-assess` really run (the controller runs the
first at test-phase entry; `mk-risk-trace.js` runs the second), so every `check_id` and every
`risk_level` in a driven tree is a real validator's output.

## The contract

`contract.json` is a conformant task contract — three behavioural acceptance criteria,
`policy.test_policy: required`, `risk.risk_level: medium`. The `required` policy is what puts
the test gate in FULL scope (coverage join, falsifiability, classification routing). None of
the 25 corpus contracts declares a `test_policy`, which is why they all run REDUCED.

`criteria-to-checks` turns the three criteria into `CHK001`, `CHK002`, `CHK003`, in order.

## The scenario

One defect, followed through: the retry worker's idempotency guard reads the ledger AFTER the
side effect, so a replayed delivery writes the ledger twice. That breaks criterion 2 —
`CHK002`.

`CHK002` deliberately carries TWO check rows in every variant:

- a **structural** row ("ledger schema declares a unique constraint on job_id") that passes
  even with the defect present, and
- the **behavioural** row the defect breaks.

That pair is what makes the SC-13/F-76 case constructible at all: "an OLDER row would satisfy
[the SC-5/F-31 criterion join] while the new regression assertion never ran." Without a
pre-existing passing row for the same id, that failure mode cannot be written down.

## Directories

| Directory | Stands in for |
|---|---|
| `plan/` | the planner's output |
| `build_initial/` | the first build — ships the defect |
| `build_code_repair/` | the rewind build: fixes it AND echoes `regression_check_ids: ["CHK002"]` |
| `build_code_repair_noecho/` | the same repair with no permanent check — F-76 builder half |
| `build_check_repair/` | an SC-3 A4 check-defect repair (the check was wrong, not the code) |
| `test_fail_code/` | CHK002 behavioural row fails, classified `code` → rewind |
| `test_fail_code_again/` | still failing after the repair, regression row RED → second occurrence |
| `test_fail_check/` | fails, classified `check` → check-defect repair |
| `test_fail_env/` | fails, classified `environment` → operator gap, no budget |
| `test_fail_unclassified/` | fails with `classification: null` → ordinary retry path |
| `test_pass/` | everything green, no rewind in the job |
| `test_pass_regression/` | green, with a NEW row carrying `CHK002` — satisfies F-76 |
| `test_pass_no_regression/` | green, but `CHK002` is answered only by the pre-existing row |
| `test_gate_weak_repaired/` | the repaired criterion comes back `gate_weak` |
| `consensus_clean/` | a clean Critic/Advocate round, composed into every test mock |
| `review/`, `document/`, `ship/`, `verify/` | the tail, so a rewind excursion can still reach PROMOTE |

The Critic and Advocate pass in every variant on purpose: the variable under test is the
tester's classification, not the consensus verdict. `run-step1-negative.sh` covers the
failing-Critic path against the real corpus.

## Two fixtures that exist because of the review round

`test_pass_mutated_structural` and `test_fail_check_after_repair` were added after CodeRabbit
found that the F-76 check identified a row by its whole serialized value.

- **`test_pass_mutated_structural`** — every `CHK002` row runs an assertion `attempt_1` already
  ran, but the structural row's `output` changed. Under serialized-row identity that counted as
  a new row and discharged the regression debt while the behavioural assertion never ran. Row
  identity is now the ASSERTION, `(check_id, check)`, and this fixture is the standing
  regression for it. Nothing else in the set could catch it: every other variant happens to
  change the row that matters.
- **`test_fail_check_after_repair`** — a `check`-classified failure on `CHK003` *after* the
  `CHK002` code repair landed and its regression assertion ran. The earlier fixture put the
  check defect on `CHK002` itself, which tangled the check-defect route together with the
  regression debt for the same criterion and made `S3` test two things at once.

Tightening row identity also exposed a semantic bug of my own: "pre-existing" means
pre-existing **at the time of the repair**, not at any earlier attempt. Comparing against every
earlier attempt made the first excursion's regression assertion "not new" on a second
excursion's re-run. A single-excursion fixture set cannot tell those two readings apart.
