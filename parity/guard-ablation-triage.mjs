#!/usr/bin/env node
'use strict';

/**
 * guard-ablation-triage.mjs — re-derive the `class` of a guard-ablation baseline entry
 * (SC-14/A4, F-86). NOT a gate step. Run on demand, when an entry is being classified,
 * reclassified, or challenged.
 *
 * WHY THIS FILE EXISTS. SC-14 reclassified two baseline entries from `unpinned` to
 * `equivalent` on the strength of a 931-input sweep — and shipped the conclusion while the
 * sweep itself lived in a scratch directory. Review caught it. That is precisely the rule
 * the pipeline states about its own agents (SC-13/F-77): a reproduction that cannot be
 * re-run is a claim, not evidence. The sweep is the evidence for a `class` field that the
 * gate now enforces, so it belongs in the repository next to the baseline it justifies.
 *
 * WHAT IT DOES. For each baseline entry belonging to <pack>, apply that entry's recorded
 * mutation to the validator source, then run pristine and mutated `execute()` over a broad
 * input sweep in both gating modes. If ANY input makes them differ, the mutation can change
 * behaviour and the entry is `unpinned` — with a WITNESS naming the input, which is the
 * seed for the fixture that closes it. If none does, that is EVIDENCE OF equivalence and
 * never proof: a sweep cannot enumerate the input space.
 *
 *   class: equivalent  requires a structural argument in the entry's `reason` — a dead
 *                      branch, an algebraic identity — not merely a silent sweep.
 *   class: unpinned    is the correct home for "no witness found, no proof written". It
 *                      fails closed, which is the direction this register should fail in.
 *
 * KNOWN LIMIT. The baseline's `mutation` field is truncated with an ellipsis for long
 * conditions, so some entries cannot be replayed from the register at all. Those are
 * reported as PATTERN-MISS rather than silently skipped — an entry this tool cannot check
 * is a fact about the register, not an absence of findings.
 *
 * Usage:  node parity/guard-ablation-triage.mjs [pack]        (default: drift-sentinel)
 *         node parity/guard-ablation-triage.mjs --all
 * Exit 0 always — this reports, it does not gate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VALIDATOR_DIR = path.join(ROOT, 'adws-pipeline', 'scripts', 'validators');
const BASELINE_PATH = path.join(ROOT, 'parity', 'guard-ablation-baseline.json');

// Gating modes drift-sentinel reads at call time; harmless for other packs.
const MODES = ['on', 'off'];

/**
 * The sweep. Sized to cross every band boundary rather than to hit a round number:
 * COLLAPSE_ENTROPY_THRESHOLD 0.33 minus entropy gives ctm, and the CTM_LOW / CTM_YELLOW /
 * CTM_RED cuts at 0.2 / 0.1 / 0.05 put the interesting entropies between 0.13 and 0.28.
 * A 0.005 step crosses all three with room on both sides.
 */
function buildSweep() {
  const inputs = [];
  for (let e = -1; e <= 2.001; e += 0.005) {
    const v = +e.toFixed(3);
    inputs.push({ label: `entropy ${v} x2`, input: { entropy_history: [{ entropy: v }, { entropy: v }] } });
  }
  for (let e = -1; e <= 2.001; e += 0.02) {
    const v = +e.toFixed(2);
    inputs.push({ label: `entropy ${v} x1`, input: { entropy_history: [{ entropy: v }] } });
    inputs.push({
      label: `ramp via ${v}`,
      input: { entropy_history: [{ entropy: 0.1 }, { entropy: v }, { entropy: 0.9 }] },
    });
  }
  for (const s of [0, 1, 2, 5, 50, 1e6, -1, -100, 0.5, NaN, Infinity]) {
    inputs.push({
      label: `score ${s} x4`,
      input: { entropy_history: Array.from({ length: 4 }, () => ({ parseFailureScore: s })) },
    });
    inputs.push({
      label: `score mixed ${s}`,
      input: { entropy_history: [{ parseFailureScore: 0 }, { parseFailureScore: s }, { parseFailureScore: 1 }] },
    });
  }
  inputs.push({ label: 'numeric history', input: { entropy_history: [0.1, 0.2, 0.3] } });
  inputs.push({ label: 'numeric negative', input: { entropy_history: [-1, -2, -3] } });
  inputs.push({ label: 'mixed shapes', input: { entropy_history: [{ entropy: 0.2 }, { parseFailureScore: 3 }, 0.5] } });
  inputs.push({ label: 'empty objects', input: { entropy_history: [{}, {}, {}] } });
  inputs.push({ label: 'strings', input: { entropy_history: ['a', 'b'] } });
  inputs.push({ label: 'empty history', input: { entropy_history: [] } });
  inputs.push({
    label: 'long history',
    input: { entropy_history: Array.from({ length: 40 }, (_, k) => ({ parseFailureScore: k % 7 })) },
  });
  return inputs;
}

// Same instantiation guard-ablation uses: run the source in-process so env read at call
// time is honoured and no module cache is shared between pristine and mutant.
function instantiate(source, filename) {
  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', source);
  const mod = { exports: {} };
  fn(mod, mod.exports, () => {
    throw new Error('validators take no requires (NFR-4)');
  }, filename, path.dirname(filename));
  return mod.exports;
}

function runOne(mod, input) {
  try {
    return JSON.stringify(mod.execute(structuredClone(input)));
  } catch (err) {
    return 'THROW:' + err.message;
  }
}

const args = process.argv.slice(2);
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const allPacks = [...new Set(baseline.accepted.map((e) => e.id.split(':')[0]))].sort();
const packs = args.includes('--all') ? allPacks : [args.find((a) => !a.startsWith('--')) || 'drift-sentinel'];

const sweep = buildSweep();
console.log(`[triage] ${sweep.length} input(s) x ${MODES.length} mode(s) per entry\n`);

for (const pack of packs) {
  const scriptPath = path.join(VALIDATOR_DIR, pack + '.js');
  if (!fs.existsSync(scriptPath)) {
    console.log(`[triage] ${pack}: no such validator`);
    continue;
  }
  const raw = fs.readFileSync(scriptPath, 'utf8');
  const entries = baseline.accepted.filter((e) => e.id.startsWith(pack + ':'));
  console.log(`=== ${pack} — ${entries.length} accepted entr(ies) ===`);

  for (const entry of entries) {
    const parsed = entry.mutation && entry.mutation.match(/^(.*?) → (.*)$/);
    if (!parsed) {
      console.log(`  ?  ${entry.id.padEnd(30)} MUTATION-UNPARSEABLE`);
      continue;
    }
    const [, before, after] = parsed;
    const occurrences = raw.split(before).length - 1;
    if (occurrences === 0) {
      console.log(
        `  ?  ${entry.id.padEnd(30)} PATTERN-MISS — \`mutation\` is truncated or stale; cannot replay from the register`
      );
      continue;
    }
    if (occurrences > 1) {
      // Replacing the first of several textual matches mutates the wrong site and
      // manufactures a false witness. This bit the SC-14 triage before it was caught.
      console.log(
        `  ?  ${entry.id.padEnd(30)} AMBIGUOUS — \`${before.slice(0, 40)}…\` matches ${occurrences} sites; cannot target ${entry.site || 'the recorded line'}`
      );
      continue;
    }

    const mutatedSource = raw.replace(before, after);
    let witness = null;
    for (const mode of MODES) {
      process.env.ADWS_UMIF_CANONICAL = mode;
      const pristine = instantiate(raw, scriptPath);
      const mutant = instantiate(mutatedSource, scriptPath);
      for (const { label, input } of sweep) {
        if (runOne(pristine, input) !== runOne(mutant, input)) {
          witness = `${mode} / ${label}`;
          break;
        }
      }
      if (witness) break;
    }

    if (witness) {
      console.log(
        `  >> ${entry.id.padEnd(30)} UNPINNED — witness: ${witness}\n` +
          `     recorded class: ${entry.class}. Build a fixture from that witness; it kills the mutant.`
      );
    } else {
      console.log(
        `     ${entry.id.padEnd(30)} no witness in this sweep (recorded class: ${entry.class})` +
          (entry.class === 'equivalent' ? '' : ' — evidence only, NOT proof; keep it `unpinned` unless the reason carries a structural argument')
      );
    }
  }
  console.log('');
}
