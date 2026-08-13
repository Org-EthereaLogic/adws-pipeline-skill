#!/usr/bin/env node
'use strict';
/*
 * ab-analyze.js — analyzer for the reasoning A/B (condition 4 of the §6.2 GO).
 *
 * Implements the pre-registered protocol "Pre-registration — the reasoning A/B".
 * Node 20+, zero dependencies, zero network, read-only on every input.
 *
 * DESIGN COMMITMENT, restated because it is the whole point of this file:
 *   NOTHING about either arm is hardcoded. Every number emitted is derived from the
 *   transcript(s) passed on the command line. The only constants in this file are the
 *   protocol's own decision thresholds (§5, §6, §7) and the protocol's frozen anchor map
 *   (§4.2) — both are rules, not measurements. If you want to check a computed value
 *   against a frozen expectation, put the expectation in a JSON file and pass --expect;
 *   the script will diff it and report, but it will never silently substitute it.
 *
 * USAGE
 *   node ab-analyze.js --arm B armB.jsonl [--arm A armA.jsonl] [--json]
 *   node ab-analyze.js armB.jsonl --label B [--json]
 *   node ab-analyze.js --arm B part1.jsonl part2.jsonl        (resumed session: concatenated)
 *
 * OPTIONS
 *   --arm <LABEL> <path...>   one arm; repeatable. LABEL is free text; "A"/"B" enable the
 *                             arm-specific §7.12/§3-S12 rules and the §5 comparison.
 *   --label <LABEL>           label for bare positional paths (default "B")
 *   --json                    machine output (a single JSON document on stdout)
 *   --expect <path.json>      optional frozen expectations, checked and diffed (never used
 *                             as a source of truth)
 *   --contamination <a,b,c>   override the §7.12 contamination string list
 *
 * EXIT CODES
 *   0  analysis completed (a VOID/INDETERMINATE verdict is still a completed analysis)
 *   2  a structural assertion failed hard enough that no number may be printed
 *      (§4.9 tiling assertion — "the script refuses to print any number otherwise")
 *   3  bad invocation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ------------------------------------------------------------------------- *
 * PROTOCOL CONSTANTS — rules, not measurements.
 * ------------------------------------------------------------------------- */

const PROTOCOL = {
  // §4.2 the frozen anchor map. subagent_type -> segment label. Anything absent is
  // "not an anchor": the turn inherits the current label (a helper dispatch is not a
  // phase transition).
  ANCHOR_MAP: {
    'adws-planner': 'plan',
    'adws-builder': 'build',
    'adws-tester': 'test',
    'adws-critic': 'consensus',
    'adws-advocate': 'consensus',
    'adws-grader': 'consensus',
    'adws-reviewer': 'post',
    'adws-documenter': 'post',
    'adws-shipper': 'post',
    'adws-verifier': 'post',
  },
  // §4.8 COMMON SCOPE under each segmentation.
  COMMON_S1: ['plan', 'build', 'test'],
  COMMON_S2: ['to-build', 'to-test', 'to-consensus'],

  // §2.3 additivity tolerance for prefix(T_i-1) == cache_read(T_i)
  ADDITIVITY_TOL: 5,
  // §4.7 NOTIF turn definition
  NOTIF_OUT_MAX: 100,
  NOTIF_PREFIX: '<task-notification>',

  // §5 instrument 1 bands
  RESOLUTION_FLOOR: 1000,        // |Δ_P| below this cannot be resolved at n=1
  FLOOR_CONFIRM_DELTA_I: 14000,  // CONFIRM-AT-FLOOR requires Δ_I ≥ this
  N_STAR_KILL: 7,                // n* < 7  -> KILL
  N_STAR_CONFIRM: 14,            // n* ≥ 14 -> CONFIRM
  // §5 instrument 2 bands (round trips)
  RT_ABS_KILL: 3.5,
  RT_DELTA_KILL: 1.0,
  // §5 vetoes
  THINK_VETO_MIN: 1000,
  // §7.6 baseline drift
  BASELINE_DRIFT_TOK: 2000,
  // §7.10 covariate bands
  SUBAGENT_BAND: 1.5,
  CHANGESET_BAND: 2.0,
  // §5 "the scale of the bar" reference point for the per-phase tolerance arithmetic
  TOLERANCE_REFERENCE_N: 9,

  // §7.12 default contamination strings (applied as a VOID trigger to arm A only)
  CONTAMINATION_DEFAULT: ['thin-skill-sketch', 'FINDINGS', 'SPIKE_CONTROLLER_PLAN'],

  // §3 S12 forbidden-read rules, per arm.
  //   arm A: any read of spike/** or docs/**
  //   arm B: any read of adws-pipeline/** other than references/task-contract.md
  // NOTE the trailing slash in `adws-pipeline/` — it must not match the repo directory
  // name `adws-pipeline-skill/`, which appears in every absolute path in arm B.
  FORBIDDEN: {
    A: {
      describe: 'arm A: any read of spike/** or docs/**',
      test: (p) => /(^|[\s"'`=/])(spike|docs)\//.test(p),
    },
    B: {
      describe: 'arm B: any read of adws-pipeline/** other than references/task-contract.md',
      test: (p) => /(^|[\s"'`=/])adws-pipeline\//.test(p) &&
                   !/adws-pipeline\/references\/task-contract\.md$/.test(p),
    },
  },
};

// Bash verbs that constitute reading file CONTENT. §3 S12: "A bare `ls` is not a read."
const READ_VERBS = /(^|[;&|(]\s*|\s)(cat|head|tail|less|more|sed|awk|grep|rg|jq|xxd|od|strings|nl|column)\s/;

/* Documents that count as ORCHESTRATION INSTRUCTION for §3 S8 (the read ledger).
 * Kept as an explicit, arm-agnostic pattern list so both arms are scored identically:
 * the skill body, its references, and the thin-skill sketch. Deliberately EXCLUDED:
 * the launch prompt (it is the operator message, not an instruction document the
 * orchestrator chose to open) and the task contract fixture JSON (that is the task,
 * not the orchestration rules). Both are still reported, under `other_reads`. */
const INSTRUCTION_DOC = [
  { name: 'thin-skill-sketch', re: /thin-skill-sketch\.md$/ },
  { name: 'SKILL.md', re: /(^|\/)(adws-pipeline|skills\/adws-pipeline)\/SKILL\.md$/ },
  { name: 'references/*', re: /adws-pipeline\/references\/[\w.-]+\.md$/ },
];

/* §3 S9 handshake classification.
 *   controller       — arm B: the Bash calls invoking adws-run.js
 *   validator        — arm A: the Bash calls invoking a script under adws-pipeline/scripts/
 *   evidence_readback— either arm: reads of the job/evidence tree
 * The protocol defines S9 for arm A as "by validators and evidence read-back", so all
 * three buckets are computed for BOTH arms and reported separately; nothing is folded
 * into a single arm-specific number. */
const CONTROLLER_CMD = /adws-run\.js/;
const VALIDATOR_CMD = /(adws-pipeline|skills\/adws-pipeline)\/scripts\/[\w.-]+\.js/;
const EVIDENCE_PATH = /(^|\/)(artifacts|job_\d{8}_\d{4})(\/|$)|phase_output\.json|execution[_-]report|(^|\/)attempt_\d+\//;
// a controller/validator call is "mixed" if the same command also runs something else
const MIXED_CMD = /(^|[;&|]\s*)(git|find|cat|head|tail|ls|grep|jq|sed|awk)\s|node\s+-e/;

/* ------------------------------------------------------------------------- *
 * small helpers
 * ------------------------------------------------------------------------- */

const bytes = (s) => Buffer.byteLength(s == null ? '' : String(s), 'utf8');
const chars = (s) => (s == null ? '' : String(s)).length;
const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const round = (x, n) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n);

function resultText(block) {
  // A tool_result's `content` is either a string or an array of content blocks.
  if (block == null) return '';
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) {
    return block.content.map((b) => (typeof b === 'string' ? b : b && b.text ? b.text : JSON.stringify(b))).join('');
  }
  return JSON.stringify(block.content == null ? '' : block.content);
}

/* ------------------------------------------------------------------------- *
 * LOAD
 * ------------------------------------------------------------------------- */

function loadArm(label, paths) {
  const sources = [];
  const rows = [];
  for (const p of paths) {
    const buf = fs.readFileSync(p);
    const lines = buf.toString('utf8').split('\n');
    let n = 0;
    let bad = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
        n++;
      } catch (e) {
        bad++;
      }
    }
    sources.push({ path: path.resolve(p), bytes: buf.length, sha256: sha256(buf), rows_parsed: n, rows_unparseable: bad });
  }
  return { label, sources, rows };
}

/* ------------------------------------------------------------------------- *
 * TURNS — §2.2
 *   "Group by message.id. One group = one TURN. The JSONL writes one row per content
 *    block and repeats the byte-identical usage object on each."
 * ------------------------------------------------------------------------- */

function buildTurns(rows) {
  const problems = [];
  const assistantRows = [];
  rows.forEach((r, i) => {
    if (r && r.type === 'assistant' && !r.isSidechain) assistantRows.push({ r, i });
  });

  const groups = new Map();
  for (const { r, i } of assistantRows) {
    const id = r.message && r.message.id;
    if (id == null) {
      problems.push({ code: 'MISSING_MESSAGE_ID', row_index: i });
      continue;
    }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ r, i });
  }

  const turns = [];
  for (const [id, members] of groups) {
    const u0 = members[0].r.message.usage;
    if (!u0) {
      problems.push({ code: 'MISSING_USAGE', message_id: id });
      continue;
    }
    // §2.2 assertion: "Assert every group's usage objects are identical ... else VOID."
    let identical = true;
    for (const m of members) {
      if (JSON.stringify(m.r.message.usage) !== JSON.stringify(u0)) identical = false;
    }
    if (!identical) problems.push({ code: 'USAGE_DIFFERS_WITHIN_MESSAGE_ID', message_id: id });

    const blocks = [];
    for (const m of members) {
      const c = m.r.message.content;
      if (Array.isArray(c)) blocks.push(...c);
    }
    const toolUses = blocks.filter((b) => b && b.type === 'tool_use');
    const details = u0.output_tokens_details || {};
    // §2.3 prefix(T) — the true prompt length, invariant to how the cache splits it.
    const inp = u0.input_tokens || 0;
    const cc = u0.cache_creation_input_tokens || 0;
    const cr = u0.cache_read_input_tokens || 0;

    // usage.iterations: if a single message.id spans >1 inference iteration, then
    // "turn" under-counts actual model round trips (§5 instrument 2 depends on this).
    const iterations = Array.isArray(u0.iterations) ? u0.iterations.length : null;

    turns.push({
      message_id: id,
      request_ids: [...new Set(members.map((m) => m.r.requestId).filter(Boolean))],
      first_row_index: Math.min(...members.map((m) => m.i)),
      last_row_index: Math.max(...members.map((m) => m.i)),
      ts: members.map((m) => m.r.timestamp).filter(Boolean).sort()[0] || null,
      rows: members.length,
      model: members[0].r.message.model || null,
      version: members[0].r.version || null,
      effort: members[0].r.effort == null ? null : members[0].r.effort,
      service_tier: u0.service_tier || null,
      stop_reason: members[members.length - 1].r.message.stop_reason || null,
      inp, cc, cr,
      prefix: inp + cc + cr,
      out: u0.output_tokens || 0,
      think: details.thinking_tokens || 0,
      iterations,
      usage_identical: identical,
      blocks,
      tool_uses: toolUses,
      tool_names: toolUses.map((t) => t.name),
      agents: toolUses.filter((t) => t.name === 'Agent').map((t) => (t.input || {}).subagent_type || null),
      disp_chars: sum(toolUses.filter((t) => t.name === 'Agent').map((t) => chars((t.input || {}).prompt))),
      disp_bytes: sum(toolUses.filter((t) => t.name === 'Agent').map((t) => bytes((t.input || {}).prompt))),
      n_tools: toolUses.length,
    });
  }

  // ordered by the earliest timestamp in the group (§4.1); file order breaks ties.
  turns.sort((a, b) => (a.ts === b.ts ? a.first_row_index - b.first_row_index : String(a.ts) < String(b.ts) ? -1 : 1));
  turns.forEach((t, i) => { t.i = i; });

  // growth of a single turn (used by the read ledger)
  for (let i = 0; i < turns.length; i++) {
    turns[i].growth = i + 1 < turns.length ? turns[i + 1].prefix - turns[i].prefix : null;
  }

  return { turns, problems, assistant_rows_total: rows.filter((r) => r && r.type === 'assistant').length };
}

/* §4.7 NOTIF turns: ALL THREE of — zero tool_use, output_tokens < 100, and the
 * immediately preceding user row begins <task-notification>.
 *
 * The third clause is applied literally. A zero-tool, sub-100-token turn whose preceding
 * user row is a tool_result (e.g. an orchestrator acknowledging that it just launched an
 * async dispatch) satisfies two clauses and fails the third: it is NOT a NOTIF turn under
 * this rule, and it is reported as a near-miss rather than silently promoted or dropped. */
function markNotif(turns, rows) {
  const nearMisses = [];
  for (const t of turns) {
    let prevUser = null;
    for (let i = t.first_row_index - 1; i >= 0; i--) {
      if (rows[i] && rows[i].type === 'user') { prevUser = rows[i]; break; }
    }
    const c = prevUser && prevUser.message ? prevUser.message.content : null;
    const isNotifPrev = typeof c === 'string' && c.startsWith(PROTOCOL.NOTIF_PREFIX);
    const quiet = t.n_tools === 0 && t.out < PROTOCOL.NOTIF_OUT_MAX;
    t.is_notif = quiet && !!isNotifPrev;
    t.notif_clauses = { zero_tool_use: t.n_tools === 0, output_under_threshold: t.out < PROTOCOL.NOTIF_OUT_MAX, preceded_by_task_notification: !!isNotifPrev };
    if (quiet && !isNotifPrev) {
      nearMisses.push({
        turn: t.i, out: t.out,
        preceding_user_row_index: prevUser ? rows.indexOf(prevUser) : null,
        preceding_user_row_kind: prevUser == null ? 'none'
          : typeof c === 'string' ? 'plain string: ' + JSON.stringify(String(c).slice(0, 60))
            : 'content blocks: ' + (Array.isArray(c) ? c.map((b) => b && b.type).join('/') : typeof c),
      });
    }
  }
  return nearMisses;
}

/* ------------------------------------------------------------------------- *
 * ANCHORS — §4.2, §4.3
 * ------------------------------------------------------------------------- */

function findAnchors(turns) {
  const problems = [];
  const raw = [];
  for (const t of turns) {
    if (!t.agents.length) continue;
    // §4.2 "anything else (general-purpose, Explore, …) -> not an anchor, the turn
    // inherits the current label. A helper dispatch is not a phase transition."
    const labels = new Set(t.agents.map((s) => PROTOCOL.ANCHOR_MAP[s]).filter(Boolean));
    if (labels.size === 0) continue;
    if (labels.size > 1) {
      // §4.2 "If one turn's Agent blocks map to two different labels -> VOID."
      problems.push({ code: 'SPLIT_LABEL_ANCHOR', turn: t.i, agents: t.agents.slice(), labels: [...labels] });
      continue;
    }
    raw.push({ i: t.i, label: [...labels][0], types: t.agents.filter((s) => PROTOCOL.ANCHOR_MAP[s]) });
  }
  // §4.3 "a maximal run of consecutive consensus anchors becomes one anchor at the first
  // of them. Adjacency-free" — consecutive in the ANCHOR sequence, not in turn index, so
  // it survives an arm that splits the critic/advocate pair across turns.
  const collapsed = [];
  for (const a of raw) {
    const last = collapsed[collapsed.length - 1];
    if (last && a.label === 'consensus' && last.label === 'consensus') {
      last.types = last.types.concat(a.types);
      last.collapsed_from = (last.collapsed_from || [last.i]).concat([a.i]);
      continue;
    }
    collapsed.push(Object.assign({}, a));
  }
  return { anchors: collapsed, raw_anchors: raw, problems };
}

/* §4.6 report cut: scanning backwards from the final turn, relabel every turn containing
 * no tool_use as `report`; stop at the first turn that has one. Symmetric across arms. */
function reportCut(turns) {
  let k = turns.length;
  while (k > 0 && turns[k - 1].n_tools === 0) k--;
  return k;
}

/* §4.4 S1 — PRIMARY SEGMENTATION (anchor OPENS its segment).
 * Turns before the first anchor = setup. Each anchor and every turn up to (not
 * including) the next anchor carry that anchor's label. */
function segmentS1(turns, anchors, rc) {
  const segs = [];
  if (!anchors.length) {
    segs.push({ name: 'setup', lo: 0, hi: turns.length });
  } else {
    if (anchors[0].i > 0) segs.push({ name: 'setup', lo: 0, hi: anchors[0].i });
    anchors.forEach((a, k) => {
      const hi = k + 1 < anchors.length ? anchors[k + 1].i : turns.length;
      segs.push({ name: a.label, lo: a.i, hi });
    });
  }
  return clipReport(segs, rc, turns.length);
}

/* §4.11 S2 — SENSITIVITY SEGMENTATION (anchor CLOSES its segment, inclusive).
 * Segment k = every turn after anchor k-1 through anchor k. Names: intake+<first>,
 * to-<label>..., plus `tail` and the same report cut. */
function segmentS2(turns, anchors, rc) {
  const segs = [];
  if (!anchors.length) {
    segs.push({ name: 'tail', lo: 0, hi: turns.length });
  } else {
    let prev = -1;
    anchors.forEach((a, k) => {
      segs.push({ name: k === 0 ? 'intake+' + a.label : 'to-' + a.label, lo: prev + 1, hi: a.i + 1 });
      prev = a.i;
    });
    segs.push({ name: 'tail', lo: prev + 1, hi: turns.length });
  }
  return clipReport(segs, rc, turns.length);
}

function clipReport(segs, rc, n) {
  const out = [];
  for (const s of segs) {
    if (s.lo >= rc) continue;
    out.push({ name: s.name, lo: s.lo, hi: Math.min(s.hi, rc) });
  }
  if (rc < n) out.push({ name: 'report', lo: rc, hi: n });
  return out.filter((s) => s.lo < s.hi);
}

/* §4.9 TILING ASSERTION. Sigma|segments| == |turns|, no turn carries two labels.
 * "the script refuses to print any number otherwise and exits non-zero." */
function checkTiling(segs, nTurns) {
  const cover = new Array(nTurns).fill(0);
  for (const s of segs) for (let i = s.lo; i < s.hi; i++) cover[i]++;
  const doubled = [];
  const uncovered = [];
  cover.forEach((c, i) => { if (c > 1) doubled.push(i); if (c === 0) uncovered.push(i); });
  const total = sum(segs.map((s) => s.hi - s.lo));
  return { ok: total === nTurns && !doubled.length && !uncovered.length, total_segment_turns: total, n_turns: nTurns, doubled, uncovered };
}

/* Per-segment metrics. §4.4 growth = prefix(first turn AFTER S) - prefix(first turn OF S). */
function summarizeSegment(turns, seg) {
  const m = turns.slice(seg.lo, seg.hi);
  const growth = seg.hi < turns.length ? turns[seg.hi].prefix - m[0].prefix : null;
  const nonAgent = {};
  for (const t of m) for (const n of t.tool_names) if (n !== 'Agent') nonAgent[n] = (nonAgent[n] || 0) + 1;
  const notif = m.filter((t) => t.is_notif).map((t) => ({ turn: t.i, out: t.out }));
  return {
    name: seg.name,
    lo: seg.lo,
    hi: seg.hi - 1,
    turns: m.length,
    // §3 S1: "count of turns in the segment, excluding NOTIF turns (§4.7)"
    round_trips: m.length - notif.length,
    round_trips_incl_notif: m.length,
    notif_turns: notif,
    growth,
    growth_defined: growth != null,
    out: sum(m.map((t) => t.out)),
    think: sum(m.map((t) => t.think)),
    disp_chars: sum(m.map((t) => t.disp_chars)),
    disp_bytes: sum(m.map((t) => t.disp_bytes)),
    non_agent_tools: nonAgent,
    non_agent_tool_count: sum(Object.values(nonAgent)),
    agents: m.flatMap((t) => t.agents),
    max_prefix: Math.max(...m.map((t) => t.prefix)),
    attempts: 1,
    parts: [[seg.lo, seg.hi - 1]],
  };
}

/* §4.5 Merge segments sharing a label (a retried phase's attempts aggregate into one
 * phase total). Growth of a merged phase = the sum of its parts' growths; a null part
 * makes the merged growth undefined and is flagged rather than silently dropped. */
function mergeByLabel(rows) {
  const order = [];
  const byName = new Map();
  for (const r of rows) {
    if (!byName.has(r.name)) { byName.set(r.name, Object.assign({}, r, { parts: r.parts.slice(), agents: r.agents.slice() })); order.push(r.name); continue; }
    const m = byName.get(r.name);
    m.turns += r.turns;
    m.round_trips += r.round_trips;
    m.round_trips_incl_notif += r.round_trips_incl_notif;
    m.notif_turns = m.notif_turns.concat(r.notif_turns);
    if (m.growth == null || r.growth == null) { m.growth = null; m.growth_defined = false; }
    else m.growth += r.growth;
    m.out += r.out; m.think += r.think; m.disp_chars += r.disp_chars; m.disp_bytes += r.disp_bytes;
    for (const [k, v] of Object.entries(r.non_agent_tools)) m.non_agent_tools[k] = (m.non_agent_tools[k] || 0) + v;
    m.non_agent_tool_count += r.non_agent_tool_count;
    m.agents = m.agents.concat(r.agents);
    m.max_prefix = Math.max(m.max_prefix, r.max_prefix);
    m.attempts += 1;
    m.parts = m.parts.concat(r.parts);
    m.hi = r.hi;
  }
  return order.map((n) => byName.get(n));
}

/* ------------------------------------------------------------------------- *
 * TOOL CALL / RESULT PAIRING — needed for S8, S9, S10, S12
 * ------------------------------------------------------------------------- */

function pairToolCalls(rows, turns) {
  const uses = new Map(); // tool_use_id -> {name, input, turn}
  for (const t of turns) for (const b of t.tool_uses) uses.set(b.id, { id: b.id, name: b.name, input: b.input || {}, turn: t.i });

  const results = new Map(); // tool_use_id -> {text, chars, bytes, toolUseResult, is_error}
  rows.forEach((r, idx) => {
    if (!r || r.type !== 'user' || !r.message) return;
    const c = r.message.content;
    if (!Array.isArray(c)) return;
    for (const b of c) {
      if (!b || b.type !== 'tool_result') continue;
      const txt = resultText(b);
      results.set(b.tool_use_id, {
        row_index: idx,
        text: txt,
        chars: chars(txt),
        bytes: bytes(txt),
        is_error: b.is_error === true,
        toolUseResult: r.toolUseResult || null,
      });
    }
  });
  return { uses, results };
}

/* ------------------------------------------------------------------------- *
 * SECONDARY METRICS
 * ------------------------------------------------------------------------- */

/* §3 S8 INSTRUCTION READS (the read ledger): every Read/Skill of an orchestration
 * document: path, bytes, and the prefix growth of the turn that pulled it in, minus
 * that turn's output_tokens. */
function readLedger(turns, uses, results) {
  const items = [];
  const other = [];
  for (const [id, u] of uses) {
    let source = null;
    let p = null;
    if (u.name === 'Read') { source = 'Read'; p = u.input.file_path || u.input.path || ''; }
    else if (u.name === 'Skill') { source = 'Skill'; p = 'skill:' + (u.input.skill || u.input.name || '?'); }
    else continue;

    const res = results.get(id);
    const tur = res && res.toolUseResult;
    // Prefer the raw file content when the harness records it; fall back to the rendered
    // tool_result text (which carries line-number prefixes and is therefore larger).
    const raw = tur && tur.file && typeof tur.file.content === 'string' ? tur.file.content : null;
    const t = turns[u.turn];
    const turnGrowth = t ? t.growth : null;
    const attributed = turnGrowth == null ? null : turnGrowth - t.out;
    const entry = {
      tool_use_id: id,
      source,
      path: p,
      turn: u.turn,
      turn_out_tokens: t ? t.out : null,
      turn_growth_tokens: turnGrowth,
      // "the prefix growth of the turn that pulled it in, minus that turn's output_tokens"
      attributed_tokens: attributed,
      // the attribution is exact only when this read was the turn's sole tool call
      sole_tool_on_turn: t ? t.n_tools === 1 : null,
      other_tools_on_turn: t ? t.tool_names.filter((n, i) => !(n === u.name && i === t.tool_names.indexOf(u.name))) : null,
      content_bytes_utf8: raw == null ? null : bytes(raw),
      content_chars: raw == null ? null : chars(raw),
      rendered_result_bytes_utf8: res ? res.bytes : null,
      rendered_result_chars: res ? res.chars : null,
      content_source: raw == null ? 'tool_result(rendered)' : 'toolUseResult.file.content',
    };
    const hit = INSTRUCTION_DOC.find((d) => d.re.test(p)) ||
      (source === 'Skill' && /adws-pipeline/.test(p) ? { name: 'skill-load' } : null);
    if (hit) { entry.doc_class = hit.name; items.push(entry); }
    else { entry.doc_class = null; other.push(entry); }
  }
  items.sort((a, b) => a.turn - b.turn);
  other.sort((a, b) => a.turn - b.turn);
  const defined = items.filter((i) => i.attributed_tokens != null);
  return {
    rule: '§3 S8 — Read/Skill of an orchestration document; tokens = turn prefix growth minus that turn output_tokens',
    instruction_reads: items,
    total_attributed_tokens: defined.length === items.length ? sum(items.map((i) => i.attributed_tokens)) : null,
    total_content_bytes_utf8: items.every((i) => i.content_bytes_utf8 != null) ? sum(items.map((i) => i.content_bytes_utf8)) : null,
    total_content_chars: items.every((i) => i.content_chars != null) ? sum(items.map((i) => i.content_chars)) : null,
    unattributed_reads: items.length - defined.length,
    other_reads: other,
  };
}

/* §3 S9 HANDSHAKE VOLUME.
 * Reported in BOTH units. The pre-registration writes S9 in "B" (bytes); a UTF-8 byte
 * count and a Unicode code-unit (String.length) count differ whenever the payload holds
 * a non-ASCII character (§, em dash, arrows), so both are emitted and neither is
 * silently substituted for the other. */
function handshake(uses, results, turns) {
  const buckets = {
    controller: { calls: [], describe: 'Bash calls invoking adws-run.js (arm B controller handshake)' },
    validator: { calls: [], describe: 'Bash calls invoking a script under adws-pipeline/scripts/ (arm A validators)' },
    evidence_readback: { calls: [], describe: 'Read (or content-reading Bash) of the job/evidence tree' },
  };
  for (const [id, u] of uses) {
    const res = results.get(id);
    const inbound = res ? { chars: res.chars, bytes: res.bytes, is_error: res.is_error } : { chars: 0, bytes: 0, is_error: null };
    if (u.name === 'Bash') {
      const cmd = u.input.command || '';
      let key = null;
      if (CONTROLLER_CMD.test(cmd)) key = 'controller';
      else if (VALIDATOR_CMD.test(cmd)) key = 'validator';
      else if (READ_VERBS.test(cmd) && EVIDENCE_PATH.test(cmd)) key = 'evidence_readback';
      if (!key) continue;
      const stdout = res && res.toolUseResult && typeof res.toolUseResult.stdout === 'string' ? res.toolUseResult.stdout : null;
      const stderr = res && res.toolUseResult && typeof res.toolUseResult.stderr === 'string' ? res.toolUseResult.stderr : null;
      buckets[key].calls.push({
        tool_use_id: id, turn: u.turn, via: 'Bash',
        outbound_chars: chars(cmd), outbound_bytes: bytes(cmd),
        inbound_chars: inbound.chars, inbound_bytes: inbound.bytes,
        stdout_bytes: stdout == null ? null : bytes(stdout),
        stderr_bytes: stderr == null ? null : bytes(stderr),
        is_error: inbound.is_error,
        // a command that also runs git/find/node -e alongside the handshake: its inbound
        // bytes are not purely handshake payload
        mixed: MIXED_CMD.test(cmd.replace(CONTROLLER_CMD, '').replace(VALIDATOR_CMD, '')),
        command_preview: cmd.length > 160 ? cmd.slice(0, 160) + '…' : cmd,
      });
    } else if (u.name === 'Read') {
      const p = u.input.file_path || u.input.path || '';
      if (!EVIDENCE_PATH.test(p)) continue;
      buckets.evidence_readback.calls.push({
        tool_use_id: id, turn: u.turn, via: 'Read', path: p,
        outbound_chars: chars(p), outbound_bytes: bytes(p),
        inbound_chars: inbound.chars, inbound_bytes: inbound.bytes,
        is_error: inbound.is_error, mixed: false,
      });
    }
  }
  const out = {};
  for (const [k, v] of Object.entries(buckets)) {
    const pure = v.calls.filter((c) => !c.mixed);
    out[k] = {
      describe: v.describe,
      n_calls: v.calls.length,
      outbound_chars: sum(v.calls.map((c) => c.outbound_chars)),
      outbound_bytes_utf8: sum(v.calls.map((c) => c.outbound_bytes)),
      inbound_chars: sum(v.calls.map((c) => c.inbound_chars)),
      inbound_bytes_utf8: sum(v.calls.map((c) => c.inbound_bytes)),
      n_calls_pure: pure.length,
      inbound_chars_pure: sum(pure.map((c) => c.inbound_chars)),
      inbound_bytes_utf8_pure: sum(pure.map((c) => c.inbound_bytes)),
      calls: v.calls.sort((a, b) => a.turn - b.turn),
    };
  }
  out.comparable_total = {
    n_calls: out.controller.n_calls + out.validator.n_calls + out.evidence_readback.n_calls,
    inbound_chars: out.controller.inbound_chars + out.validator.inbound_chars + out.evidence_readback.inbound_chars,
    inbound_bytes_utf8: out.controller.inbound_bytes_utf8 + out.validator.inbound_bytes_utf8 + out.evidence_readback.inbound_bytes_utf8,
    outbound_chars: out.controller.outbound_chars + out.validator.outbound_chars + out.evidence_readback.outbound_chars,
    outbound_bytes_utf8: out.controller.outbound_bytes_utf8 + out.validator.outbound_bytes_utf8 + out.evidence_readback.outbound_bytes_utf8,
  };
  return out;
}

/* §3 S10 SUBAGENT COST: toolUseResult.totalTokens / totalToolUseCount / totalDurationMs
 * per dispatch. An async dispatch carries no totals -> UNRECOVERABLE, never estimated. */
function subagents(rows, uses, results) {
  const list = [];
  for (const [id, u] of uses) {
    if (u.name !== 'Agent') continue;
    const res = results.get(id);
    const t = res && res.toolUseResult;
    const rec = {
      tool_use_id: id, turn: u.turn,
      subagent_type: u.input.subagent_type || null,
      requested_model: u.input.model || null,
      run_in_background: u.input.run_in_background === true,
      prompt_chars: chars(u.input.prompt), prompt_bytes_utf8: bytes(u.input.prompt),
    };
    if (t && typeof t === 'object' && 'totalTokens' in t) {
      rec.recoverable = true;
      rec.agent_type_reported = t.agentType || null;
      rec.resolved_model = t.resolvedModel || null;
      rec.total_tokens = t.totalTokens;
      rec.total_tool_use_count = t.totalToolUseCount == null ? null : t.totalToolUseCount;
      rec.total_duration_ms = t.totalDurationMs == null ? null : t.totalDurationMs;
      rec.tool_stats = t.toolStats || null;
      rec.status = t.status || null;
    } else if (t && typeof t === 'object' && t.isAsync) {
      rec.recoverable = false;
      rec.reason = 'UNRECOVERABLE — async dispatch: the harness returns no totalTokens/totalToolUseCount/totalDurationMs';
      rec.agent_id = t.agentId || null;
      rec.resolved_model = t.resolvedModel || null;
      rec.status = t.status || null;
      rec.output_file = t.outputFile || null;
    } else {
      rec.recoverable = false;
      rec.reason = 'no toolUseResult totals found for this dispatch';
    }
    list.push(rec);
  }
  list.sort((a, b) => a.turn - b.turn);
  const rec = list.filter((r) => r.recoverable);
  return {
    dispatches: list,
    n_dispatches: list.length,
    n_recoverable: rec.length,
    n_unrecoverable: list.length - rec.length,
    total_tokens_recoverable: sum(rec.map((r) => r.total_tokens)),
    note: list.length !== rec.length ? 'subagent totals are INCOMPLETE; any per-arm subagent comparison is bounded below, never estimated' : null,
  };
}

/* §3 S12 FORBIDDEN READS — recomputed for both arms, never assumed. */
function forbiddenReads(label, uses) {
  const rule = PROTOCOL.FORBIDDEN[label];
  if (!rule) {
    return { rule: 'no forbidden-read rule defined for arm label ' + JSON.stringify(label), strict_count: null, hits: [], bash_advisory: [] };
  }
  const hits = [];
  const advisory = [];
  for (const [id, u] of uses) {
    if (u.name === 'Read') {
      const p = u.input.file_path || u.input.path || '';
      if (rule.test(p)) hits.push({ tool_use_id: id, turn: u.turn, via: 'Read', path: p });
    } else if (u.name === 'Skill') {
      const s = 'skill:' + (u.input.skill || u.input.name || '');
      if (rule.test(s)) hits.push({ tool_use_id: id, turn: u.turn, via: 'Skill', path: s });
    } else if (u.name === 'Bash') {
      // "A bare `ls` is not a read." A Bash command counts only when a content-reading
      // verb is applied; anything else that merely MENTIONS a forbidden path is listed
      // as advisory so a human decides, rather than the script minting a false VOID.
      const cmd = u.input.command || '';
      if (!rule.test(cmd)) continue;
      if (READ_VERBS.test(cmd)) hits.push({ tool_use_id: id, turn: u.turn, via: 'Bash(read-verb)', command_preview: cmd.slice(0, 200) });
      else advisory.push({ tool_use_id: id, turn: u.turn, via: 'Bash(mention-only)', command_preview: cmd.slice(0, 200) });
    }
  }
  return { rule: rule.describe, strict_count: hits.length, hits, bash_advisory: advisory };
}

/* §3 S13 HUMAN TURNS: type:"user" rows whose message.content is a plain string not
 * starting <task-notification>. */
function humanTurns(rows) {
  const items = [];
  rows.forEach((r, i) => {
    if (!r || r.type !== 'user' || !r.message) return;
    const c = r.message.content;
    if (typeof c !== 'string') return;
    if (c.startsWith(PROTOCOL.NOTIF_PREFIX)) return;
    items.push({ row_index: i, chars: chars(c), bytes_utf8: bytes(c), sha256: sha256(Buffer.from(c, 'utf8')), preview: c.slice(0, 200), origin: r.origin || null, promptSource: r.promptSource || null });
  });
  return { count: items.length, turns: items };
}

/* §3 S14 TERMINAL STATE: the verbatim gate verdict reached. Reported as EVIDENCE
 * (what the transcript literally contains), not as an assertion by this script. */
const VERDICT_TOKEN = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:GATE_)?(?:FAILURE|FAIL|PASS|BLOCKED)|TEST_GATE_FAILURE|PROMOTE|QUARANTINE)\b/g;
function terminalState(turns, uses, results) {
  const textHits = {};
  const finalTexts = [];
  turns.forEach((t) => {
    for (const b of t.blocks) {
      if (!b || b.type !== 'text' || typeof b.text !== 'string') continue;
      const m = b.text.match(VERDICT_TOKEN);
      if (m) for (const x of m) { textHits[x] = textHits[x] || []; textHits[x].push(t.i); }
      if (t.i === turns.length - 1) finalTexts.push(b.text.slice(0, 4000));
    }
  });
  // gate_result values as emitted by any tool stdout, in turn order
  const gates = [];
  for (const [id, u] of uses) {
    const res = results.get(id);
    if (!res) continue;
    const re = /"gate_result"\s*:\s*("(?:[^"\\]|\\.)*"|null)/g;
    let m;
    while ((m = re.exec(res.text)) !== null) {
      const ctx = res.text.slice(Math.max(0, m.index - 220), m.index + 60);
      const ph = /"(?:recorded|phase)"\s*:\s*"([^"]+)"/.exec(ctx);
      gates.push({ turn: u.turn, tool_use_id: id, gate_result: JSON.parse(m[1] === 'null' ? 'null' : m[1]), context_hint: ph ? ph[1] : null });
    }
  }
  gates.sort((a, b) => a.turn - b.turn);
  return {
    note: 'evidence extracted from the transcript; this script does not adjudicate a terminal state',
    verdict_tokens_in_assistant_text: Object.fromEntries(Object.entries(textHits).map(([k, v]) => [k, { count: v.length, turns: v }])),
    gate_results_in_tool_output: gates,
    last_gate_result: gates.length ? gates[gates.length - 1] : null,
    final_turn_text_preview: finalTexts.length ? finalTexts[0].slice(0, 400) : null,
  };
}

/* §3 S11 COVARIATES: build change-set file count, best-effort from any tool output that
 * contains a `git status --porcelain` block. Reported with the matched text so the
 * derivation is auditable rather than asserted. */
function covariates(uses, results, subs) {
  const candidates = [];
  for (const [id, u] of uses) {
    if (u.name !== 'Bash') continue;
    const cmd = u.input.command || '';
    if (!/git\b[^|;&]*\bstatus\b[^|;&]*--porcelain|git\b[^|;&]*\bdiff\b[^|;&]*--stat/.test(cmd)) continue;
    const res = results.get(id);
    if (!res) continue;
    const lines = res.text.split('\n');
    const files = lines
      .map((l) => /^\s?([ MADRCU?!]{1,2})\s+(.+)$/.exec(l))
      .filter(Boolean)
      .map((m) => ({ status: m[1].trim(), path: m[2].trim() }))
      .filter((f) => f.path && !/^===/.test(f.path) && !/\s=$/.test(f.path));
    candidates.push({ tool_use_id: id, turn: u.turn, command_preview: cmd.slice(0, 200), file_count: files.length, files });
  }
  const best = candidates.length ? candidates[candidates.length - 1] : null;
  return {
    change_set: best ? { source_turn: best.turn, file_count: best.file_count, files: best.files, derivation: 'parsed from a `git status --porcelain` tool result in the transcript', command_preview: best.command_preview } : { file_count: null, derivation: 'no `git status --porcelain` output found in this transcript' },
    change_set_candidates: candidates.length,
    per_subagent_tool_counts: subs.dispatches.map((d) => ({ subagent_type: d.subagent_type, turn: d.turn, total_tool_use_count: d.total_tool_use_count == null ? null : d.total_tool_use_count, tool_stats: d.tool_stats || null })),
  };
}

/* §7.12 contamination grep. VOID trigger for arm A only; computed and reported for both,
 * because reporting it only where it is convenient is the failure mode §10 names. */
function contamination(rows, strings) {
  const raw = rows.map((r) => JSON.stringify(r));
  const hits = [];
  strings.forEach((s) => {
    let n = 0;
    const where = [];
    raw.forEach((line, i) => { if (line.includes(s)) { n++; if (where.length < 12) where.push(i); } });
    if (n) hits.push({ string: s, rows_matched: n, first_row_indexes: where });
  });
  return { strings_checked: strings, hits, any: hits.length > 0 };
}

/* ------------------------------------------------------------------------- *
 * ARM REPORT
 * ------------------------------------------------------------------------- */

function analyzeArm(arm, opts) {
  const rows = arm.rows;
  const built = buildTurns(rows);
  const turns = built.turns;
  const VOID = [];
  const discrepancies = [];

  if (!turns.length) {
    return { label: arm.label, sources: arm.sources, fatal: 'no assistant turns found in this transcript', void: ['NO_TURNS'] };
  }

  const notifNearMisses = markNotif(turns, rows);
  if (notifNearMisses.length) {
    discrepancies.push({
      code: 'NOTIF_NEAR_MISS',
      detail: notifNearMisses.length + ' turn(s) are zero-tool and under ' + PROTOCOL.NOTIF_OUT_MAX +
        ' output tokens but are NOT preceded by a <task-notification> user row, so §4.7 does NOT classify them as NOTIF turns. ' +
        'They are counted as round trips. Any statement of the form "this arm has N NOTIF turns" must be checked against this list.',
      turns: notifNearMisses,
    });
  }
  const { uses, results } = pairToolCalls(rows, turns);

  /* ---- integrity, §2.2 / §7.4 ---- */
  const messageIds = new Set(turns.map((t) => t.message_id));
  const requestIds = new Set();
  rows.forEach((r) => { if (r && r.type === 'assistant' && !r.isSidechain && r.requestId) requestIds.add(r.requestId); });
  const idMatch = messageIds.size === requestIds.size;
  if (!idMatch) VOID.push('MESSAGE_ID_REQUESTID_MISMATCH (§2.2: |distinct message.id| == |distinct requestId|)');
  for (const p of built.problems) { VOID.push(p.code + ' ' + JSON.stringify(p)); }

  // §2.3 additivity: cache_read(T_i) == prefix(T_{i-1}) within tolerance
  const violations = [];
  for (let i = 1; i < turns.length; i++) {
    const d = turns[i].cr - turns[i - 1].prefix;
    if (Math.abs(d) > PROTOCOL.ADDITIVITY_TOL) violations.push({ turn: i, cache_read: turns[i].cr, prev_prefix: turns[i - 1].prefix, delta: d });
  }

  const models = [...new Set(turns.map((t) => t.model))];
  const versions = [...new Set(turns.map((t) => t.version))];
  const efforts = [...new Set(turns.map((t) => t.effort))];
  const tiers = [...new Set(turns.map((t) => t.service_tier))];
  if (models.length !== 1 || versions.length !== 1 || efforts.length !== 1) {
    VOID.push('HARNESS_CONFIG_NOT_SINGLE_VALUED (§7.4) models=' + JSON.stringify(models) + ' versions=' + JSON.stringify(versions) + ' efforts=' + JSON.stringify(efforts));
  }
  const multiIter = turns.filter((t) => t.iterations != null && t.iterations > 1).map((t) => ({ turn: t.i, iterations: t.iterations }));
  if (multiIter.length) {
    discrepancies.push({
      code: 'TURN_SPANS_MULTIPLE_INFERENCE_ITERATIONS',
      detail: 'usage.iterations > 1 on ' + multiIter.length + ' turn(s): a "turn" is then NOT one model round trip and §5 instrument 2 under-counts',
      turns: multiIter,
    });
  }

  const sidechainRows = rows.filter((r) => r && r.isSidechain === true).length;

  /* ---- anchors + segmentation ---- */
  const anch = findAnchors(turns);
  for (const p of anch.problems) VOID.push(p.code + ' ' + JSON.stringify(p));
  const rc = reportCut(turns);

  const rawS1 = segmentS1(turns, anch.anchors, rc);
  const rawS2 = segmentS2(turns, anch.anchors, rc);
  const tileS1 = checkTiling(rawS1, turns.length);
  const tileS2 = checkTiling(rawS2, turns.length);
  if (!tileS1.ok || !tileS2.ok) {
    // §4.9 "the script refuses to print any number otherwise and exits non-zero"
    process.stderr.write('TILING ASSERTION FAILED (§4.9) for arm ' + arm.label + '\n' +
      JSON.stringify({ S1: tileS1, S2: tileS2 }, null, 2) + '\n');
    process.exit(2);
  }

  const segsS1 = mergeByLabel(rawS1.map((s) => summarizeSegment(turns, s)));
  const segsS2 = mergeByLabel(rawS2.map((s) => summarizeSegment(turns, s)));

  function primaryOf(segs, common, tag) {
    const found = common.map((n) => segs.find((s) => s.name === n) || null);
    const missing = common.filter((n, i) => !found[i]);
    const present = found.filter(Boolean);
    const growths = present.map((s) => s.growth);
    const undefinedGrowth = present.filter((s) => s.growth == null).map((s) => s.name);
    const ok = !missing.length && !undefinedGrowth.length;
    const P = ok ? mean(growths) : null;
    const spread = ok && P ? (Math.max(...growths) - Math.min(...growths)) / P * 100 : null;
    return {
      segmentation: tag,
      common_scope: common,
      per_phase: Object.fromEntries(present.map((s) => [s.name, {
        growth: s.growth, round_trips: s.round_trips, out: s.out, think: s.think,
        disp_chars: s.disp_chars, non_agent_tools: s.non_agent_tools, attempts: s.attempts,
        turns: s.turns, max_prefix: s.max_prefix, parts: s.parts,
      }])),
      missing_phases: missing,
      undefined_growth_phases: undefinedGrowth,
      P: ok ? Math.round(P * 100) / 100 : null,
      P_sum: ok ? sum(growths) : null,
      within_run_spread_pct: round(spread, 2),
      // §4.10: with a phase missing there is no mean to quote. Averaging over the phases
      // that happen to be present is how "arm A was cheap" gets manufactured.
      round_trips_mean: ok ? round(mean(present.map((s) => s.round_trips)), 4) : null,
      round_trips_mean_over_present_only: present.length ? round(mean(present.map((s) => s.round_trips)), 4) : null,
      round_trips_per_phase: Object.fromEntries(present.map((s) => [s.name, s.round_trips])),
      output_tokens_sum: sum(present.map((s) => s.out)),
      thinking_tokens_sum: sum(present.map((s) => s.think)),
      dispatch_chars_sum: sum(present.map((s) => s.disp_chars)),
      attempts_per_phase: Object.fromEntries(present.map((s) => [s.name, s.attempts])),
      max_prefix_per_phase: Object.fromEntries(present.map((s) => [s.name, s.max_prefix])),
      defined: ok,
    };
  }

  const primaryS1 = primaryOf(segsS1, PROTOCOL.COMMON_S1, 'S1');
  const primaryS2 = primaryOf(segsS2, PROTOCOL.COMMON_S2, 'S2');

  // §4.10 GUARD: fewer than three anchors covering {plan,build,test} -> VOID, not "cheap".
  const phaseAnchorLabels = new Set(anch.anchors.map((a) => a.label));
  const coversAll = PROTOCOL.COMMON_S1.every((l) => phaseAnchorLabels.has(l));
  if (!coversAll) {
    VOID.push('GUARD_§4.10 — anchors do not cover {plan,build,test} (found: ' + [...phaseAnchorLabels].join(',') + '); the primary is UNDEFINED, not "this arm was cheap"');
  }
  if (!anch.anchors.length) {
    discrepancies.push({ code: 'NO_AGENT_DISPATCHES', detail: 'this transcript contains zero Agent dispatches; every turn falls in one segment and the primary is undefined' });
  }

  /* ---- S6 intake mass ---- */
  const firstDispatch = anch.anchors.length ? anch.anchors[0].i : null;
  const S6 = firstDispatch == null ? {
    I_net: null, I_raw: null, first_dispatch_turn: null,
    note: 'no dispatch in this transcript; intake mass is undefined',
  } : {
    first_dispatch_turn: firstDispatch,
    first_dispatch_label: anch.anchors[0].label,
    // §3 S6: prefix(first dispatch turn) - prefix(turn 0)
    I_net: turns[firstDispatch].prefix - turns[0].prefix,
    // §3 S6b disclosure: prefix(first dispatch turn) - cache_read(turn 0)
    I_raw: turns[firstDispatch].prefix - turns[0].cr,
  };

  /* ---- S7 session baseline ---- */
  const S7 = { prefix: turns[0].prefix, input_tokens: turns[0].inp, cache_creation_input_tokens: turns[0].cc, cache_read_input_tokens: turns[0].cr };

  /* ---- the rest ---- */
  const S8 = readLedger(turns, uses, results);
  const S9 = handshake(uses, results, turns);
  const S10 = subagents(rows, uses, results);
  const S11 = covariates(uses, results, S10);
  const S12 = forbiddenReads(arm.label, uses);
  const S13 = humanTurns(rows);
  const S14 = terminalState(turns, uses, results);

  const reportSeg = segsS1.find((s) => s.name === 'report') || null;
  const runOut = sum(turns.map((t) => t.out));
  const S15 = reportSeg ? {
    turns: reportSeg.turns, out: reportSeg.out, think: reportSeg.think,
    pct_of_run_output: round(reportSeg.out / runOut * 100, 2),
  } : { turns: 0, out: 0, think: 0, pct_of_run_output: 0, note: 'no trailing no-tool_use run: the report cut is empty' };

  const S16 = {
    S1_excluded: segsS1.filter((s) => !PROTOCOL.COMMON_S1.includes(s.name)).map(stripSeg),
    S2_excluded: segsS2.filter((s) => !PROTOCOL.COMMON_S2.includes(s.name)).map(stripSeg),
  };

  // §7.12 the grep is for the OTHER arm's job id and evidence root. An arm's own job id
  // is not contamination — `foreign_job_ids` is supplied by main() from the other arms.
  const contam = contamination(rows, opts.contamination || PROTOCOL.CONTAMINATION_DEFAULT.concat(opts.foreign_job_ids || []));
  contam.own_job_ids = deriveJobIds(uses, results);
  contam.foreign_job_ids_checked = opts.foreign_job_ids || [];
  if (arm.label === 'A' && contam.any) VOID.push('CONTAMINATION_§7.12 — ' + contam.hits.map((h) => h.string).join(', '));
  if (S12.strict_count) VOID.push('FORBIDDEN_READS_§3.S12 — ' + S12.strict_count + ' hit(s)');

  return {
    label: arm.label,
    sources: arm.sources,
    integrity: {
      assistant_rows_total: built.assistant_rows_total,
      assistant_rows_used: rows.filter((r) => r && r.type === 'assistant' && !r.isSidechain).length,
      turns: turns.length,
      row_to_turn_inflation: round(built.assistant_rows_total / turns.length, 4),
      distinct_message_ids: messageIds.size,
      distinct_request_ids: requestIds.size,
      message_id_equals_request_id_count: idMatch,
      usage_identical_within_message_id: turns.every((t) => t.usage_identical),
      additivity: { tolerance: PROTOCOL.ADDITIVITY_TOL, pairs_checked: Math.max(0, turns.length - 1), violations },
      harness: { models, versions, efforts, service_tiers: tiers, single_valued: models.length === 1 && versions.length === 1 && efforts.length === 1 },
      inference_iterations_per_turn: { max: Math.max(...turns.map((t) => t.iterations || 1)), turns_over_1: multiIter },
      sidechain_rows_in_file: sidechainRows,
      row_type_histogram: rows.reduce((h, r) => { const k = r && r.type ? r.type : '(none)'; h[k] = (h[k] || 0) + 1; return h; }, {}),
      permission_modes: rows.filter((r) => r && r.type === 'permission-mode').map((r) => r.permissionMode),
      modes: rows.filter((r) => r && r.type === 'mode').map((r) => r.mode),
    },
    turns: turns.map((t) => ({
      i: t.i, message_id: t.message_id, ts: t.ts, rows: t.rows,
      inp: t.inp, cc: t.cc, cr: t.cr, prefix: t.prefix, growth: t.growth,
      out: t.out, think: t.think, iterations: t.iterations, stop_reason: t.stop_reason,
      tools: t.tool_names, agents: t.agents, disp_chars: t.disp_chars,
      is_notif: t.is_notif, notif_clauses: t.notif_clauses,
    })),
    notif_near_misses: notifNearMisses,
    anchors: anch.anchors,
    raw_anchors: anch.raw_anchors,
    report_cut_turn_index: rc,
    segmentations: {
      S1: { rule: '§4.4 anchor OPENS its segment; turns before the first anchor = setup', tiling: tileS1, segments: segsS1.map(stripSeg), primary: primaryS1 },
      S2: { rule: '§4.11 anchor CLOSES its segment (inclusive)', tiling: tileS2, segments: segsS2.map(stripSeg), primary: primaryS2 },
    },
    secondary: {
      S1_round_trips: { S1: primaryS1.round_trips_per_phase, S1_mean: primaryS1.round_trips_mean, S2: primaryS2.round_trips_per_phase, S2_mean: primaryS2.round_trips_mean },
      S2_output_tokens: { S1: Object.fromEntries(Object.entries(primaryS1.per_phase).map(([k, v]) => [k, v.out])), S1_sum: primaryS1.output_tokens_sum, S2_sum: primaryS2.output_tokens_sum },
      S3_thinking_tokens: { S1: Object.fromEntries(Object.entries(primaryS1.per_phase).map(([k, v]) => [k, v.think])), S1_sum: primaryS1.thinking_tokens_sum, S2_sum: primaryS2.thinking_tokens_sum },
      S4_dispatch_briefing_chars: { S1: Object.fromEntries(Object.entries(primaryS1.per_phase).map(([k, v]) => [k, v.disp_chars])), S1_sum: primaryS1.dispatch_chars_sum, per_dispatch: S10.dispatches.map((d) => ({ turn: d.turn, subagent_type: d.subagent_type, prompt_chars: d.prompt_chars, prompt_bytes_utf8: d.prompt_bytes_utf8 })) },
      S5_non_agent_tool_calls: Object.fromEntries(Object.entries(primaryS1.per_phase).map(([k, v]) => [k, v.non_agent_tools])),
      S6_intake_mass: S6,
      S7_session_baseline: S7,
      S8_instruction_reads: S8,
      S9_handshake_volume: S9,
      S10_subagent_cost: S10,
      S11_covariates: S11,
      S12_forbidden_reads: S12,
      S13_human_turns: S13,
      S14_terminal_state: S14,
      S15_report_segment: S15,
      S16_excluded_segments: S16,
    },
    contamination: contam,
    run_totals: {
      WARNING: '§10.1 — reporting any of these as a headline, a comparison, or "for context" is FORBIDDEN by the protocol',
      turns: turns.length,
      output_tokens: runOut,
      thinking_tokens: sum(turns.map((t) => t.think)),
      final_prefix: turns[turns.length - 1].prefix,
      cache_read_total: sum(turns.map((t) => t.cr)),
      cache_creation_total: sum(turns.map((t) => t.cc)),
    },
    void: VOID,
    discrepancies,
  };
}

function stripSeg(s) {
  return {
    name: s.name, lo: s.lo, hi: s.hi, turns: s.turns,
    round_trips: s.round_trips, round_trips_incl_notif: s.round_trips_incl_notif,
    notif_turns: s.notif_turns, growth: s.growth, out: s.out, think: s.think,
    disp_chars: s.disp_chars, non_agent_tools: s.non_agent_tools,
    non_agent_tool_count: s.non_agent_tool_count, agents: s.agents,
    max_prefix: s.max_prefix, attempts: s.attempts, parts: s.parts,
  };
}

/* job ids seen in the transcript, added to the contamination string list so an arm A run
 * is checked against whatever arm B's job id actually was, without hardcoding it. */
function deriveJobIds(uses, results) {
  const ids = new Set();
  const re = /\bjob_\d{8}_\d{4}\b/g;
  for (const [, u] of uses) {
    const s = JSON.stringify(u.input || {});
    let m; while ((m = re.exec(s)) !== null) ids.add(m[0]);
  }
  return [...ids];
}

/* ------------------------------------------------------------------------- *
 * COMPARISON — §5 decision rule
 * ------------------------------------------------------------------------- */

function bandOf(dP, dI) {
  // §5 order of application: the resolution floor is a band in the same table and is
  // applied FIRST, because a |Δ_P| under the floor is not resolvable regardless of sign.
  if (dP == null || dI == null) return { band: 'UNDEFINED', reason: 'Δ_P or Δ_I is undefined' };
  if (Math.abs(dP) < PROTOCOL.RESOLUTION_FLOOR) {
    return dI >= PROTOCOL.FLOOR_CONFIRM_DELTA_I
      ? { band: 'CONFIRM-AT-FLOOR', reason: '|Δ_P| < ' + PROTOCOL.RESOLUTION_FLOOR + ' and Δ_I ≥ ' + PROTOCOL.FLOOR_CONFIRM_DELTA_I, n_star: null }
      : { band: 'INDETERMINATE', reason: '|Δ_P| < ' + PROTOCOL.RESOLUTION_FLOOR + ' (resolution floor) and Δ_I < ' + PROTOCOL.FLOOR_CONFIRM_DELTA_I, n_star: null };
  }
  if (dP >= 0 && dI > 0) return { band: 'CONFIRM', reason: 'Δ_P ≥ 0 and Δ_I > 0: cheaper at intake and per phase; no crossover exists', n_star: null };
  if (dP < 0) {
    const n = dI / -dP;
    if (n < PROTOCOL.N_STAR_KILL) return { band: 'KILL', reason: 'n* = ' + round(n, 3) + ' < ' + PROTOCOL.N_STAR_KILL, n_star: round(n, 3) };
    if (n < PROTOCOL.N_STAR_CONFIRM) return { band: 'INDETERMINATE-LEANING-KILL', reason: PROTOCOL.N_STAR_KILL + ' ≤ n* = ' + round(n, 3) + ' < ' + PROTOCOL.N_STAR_CONFIRM + ' (§11 argues from the pessimistic end: treated as a kill unless a replicate moves it)', n_star: round(n, 3) };
    return { band: 'CONFIRM', reason: 'n* = ' + round(n, 3) + ' ≥ ' + PROTOCOL.N_STAR_CONFIRM, n_star: round(n, 3) };
  }
  return { band: 'INDETERMINATE', reason: 'Δ_P ≥ ' + PROTOCOL.RESOLUTION_FLOOR + ' but Δ_I ≤ 0 — the §5 table has no row for a controller that is cheaper per phase and dearer at intake', n_star: null };
}

function compare(A, B) {
  if (!A || !B) return null;
  const out = { note: 'Δ = arm A minus arm B; positive Δ_P / Δ_I means the CONTROLLER (arm B) is cheaper' };
  const dI = (A.secondary.S6_intake_mass.I_net == null || B.secondary.S6_intake_mass.I_net == null)
    ? null : A.secondary.S6_intake_mass.I_net - B.secondary.S6_intake_mass.I_net;
  out.delta_I = dI;
  out.I_net = { A: A.secondary.S6_intake_mass.I_net, B: B.secondary.S6_intake_mass.I_net };

  /* §7.4 cross-arm harness equality — AMENDED 2026-08-12 after arm A3, see the block
     comment below before reading this as a rationalization.

     §7.4 freezes model/version/effort as "single value per arm AND EQUAL ACROSS ARMS".
     Only the first half lived here (the per-arm single-valued check that pushes
     HARNESS_CONFIG_NOT_SINGLE_VALUED); the second half lived in run-ab.sh as an assertion
     hand-written once per arm-A run. Each half was correct. The composition meant this
     script could hold both transcripts, have every byte needed to decide the question, and
     print a full verdict on a void pair — which is exactly what it did for arm A3: model
     and effort finally matched, `version` did not (2.1.229 against arm B's 2.1.228, the CLI
     having updated itself between the two run dates — confound 18, "model-serving drift",
     which the protocol flagged as UNKNOWN direction and mitigated only with "run arm A as
     soon as possible"). The analyzer returned CONFIRM. Nothing but a driver assertion that
     did not exist yet stood between that and a published result.

     This is finding 51's shape — a gate declared in one file, implemented in another,
     correct in both, broken by neither — found inside the instrument that was written to
     police it.

     §10.4 forbids amending after the data because amendments then rationalize. This one is
     permitted, and the reason is directional: it can only ADD voids. It cannot turn a VOID
     into a verdict, cannot move a band, and cannot change a single number — it moves the
     result AWAY from the outcome the experimenter wants. An amendment that can only cost
     you the answer is not a rationalization. The measure-ab.js digest in
     PREREGISTRATION.json changes with this edit, which is the freeze working, and arm B's
     frozen numbers were recomputed under the new digest and verified identical. */
  const crossArmVoid = [];
  for (const [key, a, b] of [
    ['MODEL', A.integrity.harness.models, B.integrity.harness.models],
    ['VERSION', A.integrity.harness.versions, B.integrity.harness.versions],
    ['EFFORT', A.integrity.harness.efforts, B.integrity.harness.efforts],
  ]) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      crossArmVoid.push('HARNESS_' + key + '_NOT_EQUAL_ACROSS_ARMS (§7.4) A=' + JSON.stringify(a) + ' B=' + JSON.stringify(b));
    }
  }
  out.cross_arm_harness = {
    equal: crossArmVoid.length === 0,
    mismatches: crossArmVoid,
    A: A.integrity.harness,
    B: B.integrity.harness,
  };

  out.instrument_1 = {};
  for (const tag of ['S1', 'S2']) {
    const pa = A.segmentations[tag].primary;
    const pb = B.segmentations[tag].primary;
    const dP = pa.P == null || pb.P == null ? null : round(pa.P - pb.P, 2);
    const b = bandOf(dP, dI);
    out.instrument_1[tag] = { P_A: pa.P, P_B: pb.P, delta_P: dP, band: b.band, n_star: b.n_star, reason: b.reason, per_phase_A: pa.per_phase && Object.fromEntries(Object.entries(pa.per_phase).map(([k, v]) => [k, v.growth])), per_phase_B: Object.fromEntries(Object.entries(pb.per_phase).map(([k, v]) => [k, v.growth])) };
  }

  // §5 instrument 2 — round trips
  const rtA = A.segmentations.S1.primary.round_trips_mean;
  const rtB = B.segmentations.S1.primary.round_trips_mean;
  const i2 = { RT_A: rtA, RT_B: rtB, delta: rtA == null || rtB == null ? null : round(rtB - rtA, 4) };
  i2.kills = (rtB != null && rtB > PROTOCOL.RT_ABS_KILL) || (rtA != null && rtB != null && rtB - rtA > PROTOCOL.RT_DELTA_KILL);
  i2.confirms = rtA != null && rtB != null && rtA >= rtB;
  i2.verdict = i2.kills ? 'KILL' : i2.confirms ? 'CONFIRM' : 'DOES-NOT-DISCRIMINATE';
  i2.per_call_context_note = '§5 instrument 2 limb 2 (per-call context) is reported, not banded — see max_prefix_per_phase. §10.2: this re-measures step 4 axis at runtime and is NOT condition 4 answer.';
  i2.max_prefix_per_phase = { A: A.segmentations.S1.primary.max_prefix_per_phase, B: B.segmentations.S1.primary.max_prefix_per_phase };
  out.instrument_2 = i2;

  /* §5 vetoes */
  const v = [];
  const dPs1 = out.instrument_1.S1.delta_P;
  const sgn = (x) => (x == null ? null : x > 0 ? 1 : x < 0 ? -1 : 0);

  const dOut = round((A.segmentations.S1.primary.output_tokens_sum - B.segmentations.S1.primary.output_tokens_sum) / 3, 2);
  v.push({ id: 1, name: 'sign disagreement with output tokens', fired: sgn(dOut) != null && sgn(dPs1) != null && sgn(dOut) !== 0 && sgn(dPs1) !== 0 && sgn(dOut) !== sgn(dPs1), detail: { delta_output_per_phase: dOut, delta_P: dPs1 } });

  const dThink = round((A.segmentations.S1.primary.thinking_tokens_sum - B.segmentations.S1.primary.thinking_tokens_sum) / 3, 2);
  v.push({ id: 2, name: 'thinking veto (may veto, may never confirm)', fired: sgn(dThink) !== sgn(dPs1) && Math.abs(dThink || 0) >= PROTOCOL.THINK_VETO_MIN, detail: { delta_thinking_per_phase: dThink, threshold: PROTOCOL.THINK_VETO_MIN } });

  /* Veto 3 "Displacement: |Δ(setup growth)| ≥ |Δ_I|".
   * PROTOCOL DEFECT, computed not assumed: under §4.4 the `setup` segment is [turn 0,
   * first anchor) and its growth is prefix(first anchor) − prefix(turn 0) — which is
   * §3 S6's I_net, character for character. So Δ(setup growth) ≡ Δ_I and the veto's
   * condition is |x| ≥ |x|: it fires on every possible pair of runs. The script does not
   * silently "fix" the rule and does not silently apply a tautology that would make every
   * comparison INDETERMINATE. It marks the veto UNEVALUATED, proves the identity from
   * each arm's own numbers, and computes the non-degenerate reading for information only. */
  const setupA = (A.segmentations.S1.segments.find((s) => s.name === 'setup') || {}).growth;
  const setupB = (B.segmentations.S1.segments.find((s) => s.name === 'setup') || {}).growth;
  const dSetup = setupA == null || setupB == null ? null : setupA - setupB;
  const identityHolds = setupA === A.secondary.S6_intake_mass.I_net && setupB === B.secondary.S6_intake_mass.I_net;
  // non-degenerate reading: did the common-scope phases absorb the intake difference?
  const dPhaseTotal = (A.segmentations.S1.primary.P_sum == null || B.segmentations.S1.primary.P_sum == null)
    ? null : A.segmentations.S1.primary.P_sum - B.segmentations.S1.primary.P_sum;
  v.push({
    id: 3, name: 'displacement',
    fired: identityHolds ? null : (dSetup != null && dI != null && Math.abs(dSetup) >= Math.abs(dI)),
    status: identityHolds ? 'UNEVALUATED — DEGENERATE AS WRITTEN' : 'evaluated',
    detail: {
      delta_setup_growth: dSetup, delta_I: dI,
      setup_growth_equals_I_net: { A: setupA === A.secondary.S6_intake_mass.I_net, B: setupB === B.secondary.S6_intake_mass.I_net },
      protocol_defect: identityHolds
        ? '§4.4 setup growth == §3 S6 I_net by construction, so |Δ(setup growth)| ≥ |Δ_I| is |x| ≥ |x| and always true. §5 veto 3 needs an amendment before it can decide anything.'
        : null,
      nondegenerate_reading_for_information_only: {
        question: 'did the common-scope phases absorb the intake difference?',
        delta_common_scope_total: dPhaseTotal,
        would_fire: dPhaseTotal != null && dI != null && Math.abs(dPhaseTotal) >= Math.abs(dI),
        caveat: 'NOT the protocol rule; reported so the amendment can be made with a number in hand, never used in the verdict',
      },
    },
  });

  const bandsDisagree = out.instrument_1.S1.band !== out.instrument_1.S2.band;
  v.push({ id: 4, name: 'segmentation disagreement (§4.11 binding rule)', fired: bandsDisagree, detail: { S1: out.instrument_1.S1.band, S2: out.instrument_1.S2.band } });

  const subA = A.secondary.S10_subagent_cost;
  const subB = B.secondary.S10_subagent_cost;
  const subComplete = subA.n_unrecoverable === 0 && subB.n_unrecoverable === 0;
  const dSub = subComplete ? subA.total_tokens_recoverable - subB.total_tokens_recoverable : null;
  const orchTotal = dPs1 == null ? null : dPs1 * 3;
  v.push({
    id: 5, name: 'under-briefing (finding 38)',
    fired: subComplete && dSub != null && orchTotal != null && sgn(dSub) !== 0 && sgn(orchTotal) !== 0 && sgn(dSub) !== sgn(orchTotal) && Math.abs(dSub) > Math.abs(orchTotal),
    detail: subComplete
      ? { delta_subagent_total_tokens: dSub, delta_orchestrator_common_scope: orchTotal }
      : { status: 'UNDETERMINED', reason: 'subagent totals incomplete (async dispatches are UNRECOVERABLE); this veto cannot be evaluated and must be disclosed as such', A_unrecoverable: subA.n_unrecoverable, B_unrecoverable: subB.n_unrecoverable },
  });

  v.push({ id: 6, name: 'HUMAN_TURNS(A) > 1 — the run was steered', fired: A.secondary.S13_human_turns.count > 1, detail: { human_turns_A: A.secondary.S13_human_turns.count, human_turns_B: B.secondary.S13_human_turns.count } });
  v.push({
    id: 7,
    name: 'a VOID assertion fired (§7)',
    fired: (A.void.length + B.void.length + crossArmVoid.length) > 0,
    detail: { A: A.void, B: B.void, cross_arm: crossArmVoid },
  });
  v.push({ id: 8, name: 'S12 FORBIDDEN_READS > 0 in either arm', fired: (A.secondary.S12_forbidden_reads.strict_count || 0) + (B.secondary.S12_forbidden_reads.strict_count || 0) > 0, detail: { A: A.secondary.S12_forbidden_reads.strict_count, B: B.secondary.S12_forbidden_reads.strict_count } });
  out.vetoes = v;
  const fired = v.filter((x) => x.fired === true);
  // a veto whose condition cannot be evaluated is neither fired nor cleared; it is
  // carried as an open item so it cannot vanish from the write-up.
  out.unevaluated_vetoes = v.filter((x) => x.fired === null).map((x) => ({ id: x.id, name: x.name, status: x.status, why: (x.detail && x.detail.protocol_defect) || (x.detail && x.detail.reason) || null }));
  out.any_veto_fired = fired.length > 0;

  /* §6.3 leave-one-out stability — recompute Δ_P dropping each matched phase in turn. */
  const loo = [];
  for (const tag of ['S1', 'S2']) {
    const common = tag === 'S1' ? PROTOCOL.COMMON_S1 : PROTOCOL.COMMON_S2;
    for (const drop of common) {
      const keep = common.filter((c) => c !== drop);
      const gA = keep.map((k) => (A.segmentations[tag].primary.per_phase[k] || {}).growth);
      const gB = keep.map((k) => (B.segmentations[tag].primary.per_phase[k] || {}).growth);
      if (gA.some((x) => x == null) || gB.some((x) => x == null)) { loo.push({ segmentation: tag, dropped: drop, status: 'UNDEFINED' }); continue; }
      const dP = round(mean(gA) - mean(gB), 2);
      const b = bandOf(dP, dI);
      loo.push({ segmentation: tag, dropped: drop, P_A: round(mean(gA), 2), P_B: round(mean(gB), 2), delta_P: dP, n_star: b.n_star, band: b.band });
    }
  }
  const looS1 = loo.filter((x) => x.segmentation === 'S1' && x.band);
  const baseSign = sgn(dPs1);
  out.leave_one_out = {
    rows: loo,
    sign_stable: looS1.every((x) => sgn(x.delta_P) === baseSign),
    band_stable: looS1.every((x) => x.band === out.instrument_1.S1.band),
  };

  /* §7.6 baseline drift */
  const bl = { A: A.secondary.S7_session_baseline.prefix, B: B.secondary.S7_session_baseline.prefix };
  out.baseline_drift = { A: bl.A, B: bl.B, delta: bl.A - bl.B, tolerance: PROTOCOL.BASELINE_DRIFT_TOK, fired: Math.abs(bl.A - bl.B) > PROTOCOL.BASELINE_DRIFT_TOK };

  /* §7.10 covariate bands */
  const cfA = A.secondary.S11_covariates.change_set.file_count;
  const cfB = B.secondary.S11_covariates.change_set.file_count;
  const ratio = cfA && cfB ? Math.max(cfA, cfB) / Math.min(cfA, cfB) : null;
  out.covariate_bands = {
    change_set_files: { A: cfA, B: cfB, ratio: round(ratio, 3), band: PROTOCOL.CHANGESET_BAND, fired: ratio != null && ratio > PROTOCOL.CHANGESET_BAND },
    subagent_totals: subComplete ? { A: subA.total_tokens_recoverable, B: subB.total_tokens_recoverable, band: PROTOCOL.SUBAGENT_BAND } : { status: 'UNDETERMINED — subagent totals incomplete' },
  };

  /* §6 replication rule */
  const attemptsEqual = JSON.stringify(A.segmentations.S1.primary.attempts_per_phase) === JSON.stringify(B.segmentations.S1.primary.attempts_per_phase);
  const bandS1 = out.instrument_1.S1.band;
  const bandS2 = out.instrument_1.S2.band;
  const cond = {
    '1_verdict_is_confirm_or_kill': ['CONFIRM', 'KILL'].includes(bandS1),
    '2_abs_delta_P_at_or_above_floor': dPs1 != null && Math.abs(dPs1) >= PROTOCOL.RESOLUTION_FLOOR,
    '3_leave_one_out_stable': out.leave_one_out.sign_stable && out.leave_one_out.band_stable,
    '4_instruments_and_segmentations_agree_no_veto': bandS1 === bandS2 && !out.any_veto_fired && (i2.verdict !== 'KILL' || bandS1 === 'KILL'),
    '5_three_matched_phases_equal_attempts': A.segmentations.S1.primary.defined && B.segmentations.S1.primary.defined && attemptsEqual,
  };
  out.replication = { n1_sufficient: Object.values(cond).every(Boolean), conditions: cond, attempts_per_phase: { A: A.segmentations.S1.primary.attempts_per_phase, B: B.segmentations.S1.primary.attempts_per_phase }, replicate_forced: !Object.values(cond).every(Boolean), which_arm_to_replicate: 'A (§6 — the unmeasured arm, and the only one that can produce a run-to-run variance estimate)' };

  /* final verdict */
  let verdict;
  if (out.vetoes.some((x) => x.fired && [7, 8].includes(x.id))) verdict = 'VOID';
  else if (bandS1 !== bandS2) verdict = 'INDETERMINATE (§4.11 binding rule: S1 and S2 returned different bands)';
  else if (out.any_veto_fired) verdict = 'INDETERMINATE (a §5 veto fired: ' + fired.map((f) => f.id).join(',') + ')';
  else if (bandS1 === 'KILL' || i2.verdict === 'KILL') verdict = 'KILL';
  else if (bandS1.startsWith('CONFIRM') && i2.verdict === 'CONFIRM') verdict = bandS1;
  else if (bandS1.startsWith('CONFIRM')) verdict = bandS1 + ' on instrument 1; instrument 2 ' + i2.verdict + ' (§10.7: a §9 tie is not controller support — say so)';
  else verdict = bandS1;
  out.verdict = verdict;
  out.limits_that_travel_with_any_verdict = [
    '§8 #7 consensus work-shifting is undetectable here unless the archived subagent JSONLs are recovered',
    '§8 #8 the two arms reach different terminal states; run totals are forbidden (§10.1)',
    '§8 #9 advocate tier divergence would make the pair path-divergent',
    '§8 #10 n=1 with uncontrolled subagent output size',
    '§9 this experiment sees only the orchestrator, a few percent of the bill',
  ];
  return out;
}

/* ------------------------------------------------------------------------- *
 * HUMAN OUTPUT
 * ------------------------------------------------------------------------- */

function pad(s, n, right) { s = String(s == null ? '' : s); return right ? s.padStart(n) : s.padEnd(n); }
function hr(c) { return (c || '-').repeat(96); }

function printArm(a) {
  const L = [];
  const p = (s) => L.push(s == null ? '' : s);
  p(hr('='));
  p('ARM ' + a.label + '   ' + a.sources.map((s) => path.basename(s.path)).join(', '));
  p(hr('='));
  if (a.fatal) { p('FATAL: ' + a.fatal); return L.join('\n'); }

  for (const s of a.sources) p('  source   ' + s.path + '\n           ' + s.bytes + ' B  sha256 ' + s.sha256 + '  rows ' + s.rows_parsed + (s.rows_unparseable ? '  UNPARSEABLE ' + s.rows_unparseable : ''));
  const I = a.integrity;
  p('');
  p('INTEGRITY (§2.2, §2.3, §7.4)');
  p('  assistant rows ' + I.assistant_rows_total + ' -> turns ' + I.turns + '  (inflation ' + I.row_to_turn_inflation + 'x)');
  p('  distinct message.id ' + I.distinct_message_ids + '  distinct requestId ' + I.distinct_request_ids + '  equal=' + I.message_id_equals_request_id_count);
  p('  usage identical within message.id: ' + I.usage_identical_within_message_id);
  p('  additivity cache_read(T_i) == prefix(T_i-1) +/-' + I.additivity.tolerance + ': ' + I.additivity.violations.length + ' violation(s) over ' + I.additivity.pairs_checked + ' pairs');
  p('  harness: model=' + JSON.stringify(I.harness.models) + ' version=' + JSON.stringify(I.harness.versions) + ' effort=' + JSON.stringify(I.harness.efforts) + ' single_valued=' + I.harness.single_valued);
  p('  inference iterations per turn: max=' + I.inference_iterations_per_turn.max + (I.inference_iterations_per_turn.turns_over_1.length ? '  OVER-1 ON ' + JSON.stringify(I.inference_iterations_per_turn.turns_over_1) : '  (turn == one model round trip)'));
  p('  isSidechain rows in file: ' + I.sidechain_rows_in_file + '   permission modes: ' + I.permission_modes.join(' -> '));

  p('');
  p('TURNS');
  p('  ' + pad('#', 4) + pad('out', 7, 1) + pad('think', 7, 1) + pad('prefix', 9, 1) + pad('growth', 8, 1) + pad('cc', 7, 1) + '  tools');
  for (const t of a.turns) {
    p('  ' + pad('T' + t.i, 4) + pad(t.out, 7, 1) + pad(t.think, 7, 1) + pad(t.prefix, 9, 1) + pad(t.growth == null ? '-' : t.growth, 8, 1) + pad(t.cc, 7, 1) + '  ' + (t.tools.length ? t.tools.join(',') : (t.is_notif ? '(NOTIF §4.7)' : (t.out < PROTOCOL.NOTIF_OUT_MAX ? '(quiet, NOT §4.7 NOTIF)' : '(no tool_use)'))) + (t.agents.length ? '  <' + t.agents.join('+') + '>' : ''));
  }

  p('');
  p('ANCHORS (§4.2 frozen map; §4.3 consensus collapse)');
  p('  ' + (a.anchors.length ? a.anchors.map((x) => 'T' + x.i + ':' + x.label + '[' + x.types.join('+') + ']').join('  ') : '(none — the primary is UNDEFINED, §4.10)'));
  p('  report cut at turn index ' + a.report_cut_turn_index + ' (§4.6)');

  for (const tag of ['S1', 'S2']) {
    const S = a.segmentations[tag];
    p('');
    p(tag + ' — ' + S.rule + '   [tiling ' + (S.tiling.ok ? 'OK ' + S.tiling.total_segment_turns + '/' + S.tiling.n_turns : 'FAILED') + ']');
    p('  ' + pad('segment', 22) + pad('turns', 6, 1) + pad('RT', 4, 1) + pad('growth', 9, 1) + pad('out', 8, 1) + pad('think', 7, 1) + pad('dispCh', 8, 1) + pad('nonAg', 6, 1) + pad('maxPrefix', 10, 1) + pad('att', 4, 1));
    for (const s of S.segments) {
      p('  ' + pad(s.name + '[' + s.lo + '-' + s.hi + ']', 22) + pad(s.turns, 6, 1) + pad(s.round_trips, 4, 1) + pad(s.growth == null ? 'n/a' : s.growth, 9, 1) + pad(s.out, 8, 1) + pad(s.think, 7, 1) + pad(s.disp_chars, 8, 1) + pad(s.non_agent_tool_count, 6, 1) + pad(s.max_prefix, 10, 1) + pad(s.attempts, 4, 1));
    }
    const pr = S.primary;
    p('  PRIMARY over ' + JSON.stringify(pr.common_scope) + ': ' + (pr.defined
      ? 'P = ' + pr.P + ' tok/phase   (' + Object.entries(pr.per_phase).map(([k, v]) => k + ' ' + v.growth).join(' / ') + ')   spread ' + pr.within_run_spread_pct + '%'
      : 'UNDEFINED — missing ' + JSON.stringify(pr.missing_phases) + ' undefined-growth ' + JSON.stringify(pr.undefined_growth_phases)));
    p('  round trips: ' + JSON.stringify(pr.round_trips_per_phase) + '  mean ' + (pr.defined ? pr.round_trips_mean : 'UNDEFINED (a phase is missing; ' + pr.round_trips_mean_over_present_only + ' over present phases only, NOT a comparable RT)'));
  }

  const S = a.secondary;
  p('');
  p('SECONDARY');
  p('  S6  intake mass  I_net=' + S.S6_intake_mass.I_net + '   I_raw=' + S.S6_intake_mass.I_raw + '   (first dispatch turn T' + S.S6_intake_mass.first_dispatch_turn + ')');
  p('  S7  session baseline prefix=' + S.S7_session_baseline.prefix + '  (inp ' + S.S7_session_baseline.input_tokens + ' + cc ' + S.S7_session_baseline.cache_creation_input_tokens + ' + cr ' + S.S7_session_baseline.cache_read_input_tokens + ')');
  p('  S8  instruction reads (read ledger):');
  for (const r of S.S8_instruction_reads.instruction_reads) {
    p('        T' + r.turn + '  ' + pad(r.doc_class, 18) + pad(r.attributed_tokens == null ? '?' : r.attributed_tokens + ' tok', 11, 1) + pad(r.content_bytes_utf8 == null ? '?' : r.content_bytes_utf8 + ' B', 10, 1) + '  ' + r.path + (r.sole_tool_on_turn ? '' : '   [NOT the sole tool call on its turn — attribution is an upper bound]'));
  }
  p('        TOTAL ' + S.S8_instruction_reads.total_attributed_tokens + ' tok / ' + S.S8_instruction_reads.total_content_bytes_utf8 + ' B (utf8) / ' + S.S8_instruction_reads.total_content_chars + ' chars');
  if (S.S8_instruction_reads.other_reads.length) {
    p('        other reads (NOT counted as instruction mass):');
    for (const r of S.S8_instruction_reads.other_reads) p('          T' + r.turn + '  ' + pad(r.attributed_tokens + ' tok', 11, 1) + pad(r.content_bytes_utf8 + ' B', 10, 1) + '  ' + r.path);
  }
  p('  S9  handshake volume:');
  for (const k of ['controller', 'validator', 'evidence_readback']) {
    const h = S.S9_handshake_volume[k];
    if (!h.n_calls) { p('        ' + pad(k, 18) + '0 calls'); continue; }
    p('        ' + pad(k, 18) + h.n_calls + ' calls   inbound ' + h.inbound_chars + ' chars / ' + h.inbound_bytes_utf8 + ' B utf8   outbound ' + h.outbound_chars + ' chars / ' + h.outbound_bytes_utf8 + ' B utf8');
    if (h.n_calls_pure !== h.n_calls) p('        ' + pad('', 18) + 'of which PURE (command does nothing but the handshake): ' + h.n_calls_pure + ' calls, inbound ' + h.inbound_chars_pure + ' chars / ' + h.inbound_bytes_utf8_pure + ' B');
  }
  p('  S10 subagent cost:');
  for (const d of S.S10_subagent_cost.dispatches) {
    p('        T' + d.turn + '  ' + pad(d.subagent_type, 16) + (d.recoverable
      ? 'totalTokens=' + pad(d.total_tokens, 8, 1) + '  tools=' + pad(d.total_tool_use_count, 4, 1) + '  dur=' + Math.round(d.total_duration_ms / 1000) + 's  model=' + d.resolved_model
      : 'UNRECOVERABLE (' + (d.status || (d.reason || 'no totals')) + ') model=' + (d.resolved_model || '?')));
  }
  p('  S11 change set: ' + (S.S11_covariates.change_set.file_count == null ? '(not derivable from this transcript)' : S.S11_covariates.change_set.file_count + ' file(s) — ' + S.S11_covariates.change_set.files.map((f) => f.path).join(', ')));
  p('  S12 forbidden reads: ' + S.S12_forbidden_reads.strict_count + '   [' + S.S12_forbidden_reads.rule + ']');
  if (S.S12_forbidden_reads.bash_advisory.length) p('        advisory (path mentioned, no read verb — a bare ls is not a read): ' + S.S12_forbidden_reads.bash_advisory.map((x) => 'T' + x.turn).join(','));
  p('  S13 human turns: ' + S.S13_human_turns.count + (S.S13_human_turns.count ? '   sha256[0] ' + S.S13_human_turns.turns[0].sha256.slice(0, 16) + '…  ' + JSON.stringify(S.S13_human_turns.turns[0].preview.slice(0, 80)) : ''));
  p('  S14 terminal state (evidence): tokens ' + JSON.stringify(Object.keys(S.S14_terminal_state.verdict_tokens_in_assistant_text)) + '   last gate_result=' + JSON.stringify(S.S14_terminal_state.last_gate_result && S.S14_terminal_state.last_gate_result.gate_result));
  p('  S15 report segment: ' + S.S15_report_segment.turns + ' turn(s) / ' + S.S15_report_segment.out + ' out / ' + S.S15_report_segment.think + ' think = ' + S.S15_report_segment.pct_of_run_output + '% of run output');
  p('  S16 excluded segments (S1): ' + S.S16_excluded_segments.S1_excluded.map((s) => s.name + ' ' + s.turns + 't/' + (s.growth == null ? 'n-a' : s.growth) + 'g').join('  '));

  p('');
  p('CONTAMINATION GREP (§7.12; a VOID trigger for arm A only)');
  p('  strings: ' + JSON.stringify(a.contamination.strings_checked));
  p('  hits: ' + (a.contamination.hits.length ? a.contamination.hits.map((h) => h.string + ' x' + h.rows_matched).join(', ') : 'none'));

  p('');
  p('RUN TOTALS — ' + a.run_totals.WARNING);
  p('  turns ' + a.run_totals.turns + '  output ' + a.run_totals.output_tokens + '  thinking ' + a.run_totals.thinking_tokens + '  final prefix ' + a.run_totals.final_prefix);

  if (a.void.length) { p(''); p('VOID ASSERTIONS FIRED:'); for (const x of a.void) p('  ! ' + x); }
  if (a.discrepancies.length) {
    p(''); p('DISCREPANCIES (trust the file):');
    for (const d of a.discrepancies) {
      p('  * ' + d.code + ': ' + d.detail);
      if (d.turns) for (const t of d.turns) p('      ' + JSON.stringify(t));
    }
  }
  return L.join('\n');
}

function printComparison(c) {
  if (!c) return '';
  const L = [];
  const p = (s) => L.push(s == null ? '' : s);
  p('');
  p(hr('='));
  p('COMPARISON — §5 decision rule    (' + c.note + ')');
  p(hr('='));
  p('  Δ_I = I_net(A) − I_net(B) = ' + c.I_net.A + ' − ' + c.I_net.B + ' = ' + c.delta_I);
  for (const tag of ['S1', 'S2']) {
    const x = c.instrument_1[tag];
    p('  instrument 1 [' + tag + ']  P_A=' + x.P_A + '  P_B=' + x.P_B + '  Δ_P=' + x.delta_P + '  n*=' + x.n_star + '  ->  ' + x.band);
    p('                       ' + x.reason);
  }
  const i2 = c.instrument_2;
  p('  instrument 2 (§9 round trips)  RT_A=' + i2.RT_A + '  RT_B=' + i2.RT_B + '  RT_B−RT_A=' + i2.delta + '  -> ' + i2.verdict);
  p('  vetoes:');
  for (const v of c.vetoes) p('     ' + (v.fired === true ? 'FIRED ' : v.fired === null ? ' ????? ' : '  ok  ') + '#' + v.id + ' ' + v.name + '   ' + JSON.stringify(v.detail));
  if (c.unevaluated_vetoes.length) {
    p('  UNEVALUATED VETOES — these are open items, not passes:');
    for (const u of c.unevaluated_vetoes) p('     #' + u.id + ' ' + u.name + ' — ' + u.status + '\n        ' + u.why);
  }
  p('  leave-one-out (§6.3): sign_stable=' + c.leave_one_out.sign_stable + '  band_stable=' + c.leave_one_out.band_stable);
  for (const r of c.leave_one_out.rows) p('     ' + r.segmentation + ' drop ' + pad(r.dropped, 14) + ' Δ_P=' + pad(r.delta_P, 10, 1) + ' n*=' + pad(r.n_star, 8, 1) + ' ' + r.band);
  p('  baseline drift (§7.6): Δ=' + c.baseline_drift.delta + ' (tolerance ' + c.baseline_drift.tolerance + ') fired=' + c.baseline_drift.fired);
  p('  replication (§6): n=1 sufficient = ' + c.replication.n1_sufficient + '   ' + JSON.stringify(c.replication.conditions));
  p('');
  p('  VERDICT: ' + c.verdict);
  p('  Limits that travel with it:');
  for (const l of c.limits_that_travel_with_any_verdict) p('    - ' + l);
  return L.join('\n');
}

/* ------------------------------------------------------------------------- *
 * MAIN
 * ------------------------------------------------------------------------- */

function parseArgs(argv) {
  const arms = [];
  let json = false;
  let label = 'B';
  let expect = null;
  let contamination = null;
  const bare = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { json = true; continue; }
    if (a === '--label') { label = argv[++i]; continue; }
    if (a === '--expect') { expect = argv[++i]; continue; }
    if (a === '--contamination') { contamination = argv[++i].split(',').map((s) => s.trim()).filter(Boolean); continue; }
    if (a === '--arm') {
      const lab = argv[++i];
      const paths = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) paths.push(argv[++i]);
      if (!lab || !paths.length) { process.stderr.write('--arm needs a label and at least one path\n'); process.exit(3); }
      arms.push({ label: lab, paths });
      continue;
    }
    if (a.startsWith('--')) { process.stderr.write('unknown option ' + a + '\n'); process.exit(3); }
    bare.push(a);
  }
  if (bare.length) arms.push({ label, paths: bare });
  if (!arms.length) {
    process.stderr.write('usage: node ab-analyze.js --arm B armB.jsonl [--arm A armA.jsonl] [--json]\n');
    process.exit(3);
  }
  return { arms, json, expect, contamination };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const selfHash = sha256(fs.readFileSync(__filename));
  const reports = {};
  const order = [];
  // Two passes: the §7.12 contamination grep looks for the OTHER arm's job id, so every
  // arm must be scanned for its own job ids before any arm is scored against them.
  const loaded = opts.arms.map((spec) => loadArm(spec.label, spec.paths));
  const jobIdRe = /\bjob_\d{8}_\d{4}\b/g;
  const perArmJobIds = loaded.map((arm) => {
    const ids = new Set();
    for (const r of arm.rows) { const s = JSON.stringify(r); let m; while ((m = jobIdRe.exec(s)) !== null) ids.add(m[0]); }
    return ids;
  });
  loaded.forEach((arm, i) => {
    const foreign = new Set();
    perArmJobIds.forEach((ids, j) => { if (j !== i) for (const id of ids) if (!perArmJobIds[i].has(id)) foreign.add(id); });
    reports[arm.label] = analyzeArm(arm, Object.assign({}, opts, { foreign_job_ids: [...foreign] }));
    order.push(arm.label);
  });
  const cmp = reports.A && reports.B && !reports.A.fatal && !reports.B.fatal ? compare(reports.A, reports.B) : null;

  let expectations = null;
  if (opts.expect) {
    const exp = JSON.parse(fs.readFileSync(opts.expect, 'utf8'));
    expectations = { source: path.resolve(opts.expect), checks: [] };
    for (const [pathExpr, want] of Object.entries(exp)) {
      const got = pathExpr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), { arms: reports, comparison: cmp });
      expectations.checks.push({ path: pathExpr, expected: want, actual: got === undefined ? null : got, match: JSON.stringify(got) === JSON.stringify(want) });
    }
    expectations.all_match = expectations.checks.every((c) => c.match);
  }

  const doc = {
    schema: 'ab-analyze/1',
    protocol: 'Pre-registration — the reasoning A/B (condition 4 of the §6.2 GO)',
    script: { path: path.resolve(__filename), sha256: selfHash, node: process.version },
    generated_at: new Date().toISOString(),
    thresholds: PROTOCOL,
    arms: reports,
    comparison: cmp,
    expectations,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
    return;
  }
  const out = [];
  out.push('ab-analyze  script sha256 ' + selfHash);
  out.push('node ' + process.version + '   generated ' + doc.generated_at);
  for (const l of order) out.push(printArm(reports[l]));
  if (cmp) out.push(printComparison(cmp));
  else if (order.length < 2) {
    out.push('');
    out.push(hr('='));
    out.push('COMPARISON: not computed — only one arm supplied. §5 needs both arms.');
    out.push(hr('='));
  }
  if (expectations) {
    out.push('');
    out.push('EXPECTATIONS (--expect ' + expectations.source + ')  all_match=' + expectations.all_match);
    for (const c of expectations.checks) out.push('  ' + (c.match ? 'ok   ' : 'DIFF ') + c.path + '  expected ' + JSON.stringify(c.expected) + '  actual ' + JSON.stringify(c.actual));
  }
  process.stdout.write(out.join('\n') + '\n');
}

main();
