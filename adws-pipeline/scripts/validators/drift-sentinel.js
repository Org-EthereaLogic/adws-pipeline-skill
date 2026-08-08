// INPUT: { entropy_history: [{entropy}|{parseFailureScore}|number] }  (env: ADWS_UMIF_CANONICAL on|off|shadow, default on)
// USAGE: node drift-sentinel.js <input.json | ->   → JSON verdict on stdout (rubric_result: pass|warn|fail)
'use strict';

// DriftSentinel — operational risk control for specification-drift monitoring.
// Implements the SWEBOK v4 §5.2 continuous risk-management practice inside the
// verify phase by computing a CTM zone over an entropy history, classifying the
// run against three bounded risk states, and emitting an audit-ready evidence
// payload for the gate report. Behavior unchanged from the original entropy-gradient
// monitor: validated in E44 (precision=1.0, recall=1.0, early_warning=4.5x),
// E49 (driftsentinel_f1=1.0, fpr=0.0), E50 (cross_stage_tx_f1=1.0).
//
// STANDALONE PORT: the functions previously imported from
// src/entropy-gating.js, src/umif-entropy.js, and src/umif-canonical.js are
// inlined verbatim below so this file has zero external requires (NFR-4).
// Both gating modes are supported, selected by ADWS_UMIF_CANONICAL at call
// time (off | shadow | on; default on):
//   on          → canonical four-band gate (UMIF Canonical Spec v1.2 §5/§6)
//   off/shadow  → legacy computeCTM path (green/yellow/red zones)

// ---------------------------------------------------------------------------
// Inlined from src/umif-entropy.js (legacy constants + statistics)
// ---------------------------------------------------------------------------
const COLLAPSE_ENTROPY_THRESHOLD = 0.33;
const CTM_RED = 0.05;
const CTM_YELLOW = 0.1;
const CTM_LOW = 0.2;
const GRADIENT_THRESHOLD = 0.08;

// E61-validated dS/dTx entropy gradient — measures rate of entropy change
// normalized by fractal time scale. Ported from E61 DriftSentinel adapter.
function computeEntropyGradient(currentEntropy, referenceEntropy, tx) {
  if (!Number.isFinite(currentEntropy) || !Number.isFinite(referenceEntropy)) return 0;
  if (!Number.isFinite(tx) || tx === 0) return 0;
  return (currentEntropy - referenceEntropy) / tx;
}

// E61-validated Tx as ratio of spread to variation rate.
function computeStatisticalTx(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  let sum = 0;
  let sumSq = 0;
  let diffSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) return 0;
    sum += v;
    sumSq += v * v;
    if (i > 0) diffSum += Math.abs(v - Number(values[i - 1]));
  }
  const n = values.length;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const std = Math.sqrt(Math.max(0, variance));
  const meanAbsDiff = diffSum / (n - 1);
  return std / (meanAbsDiff + 1e-10);
}

// ---------------------------------------------------------------------------
// Inlined from src/umif-canonical.js (canonical primitives, Spec v1.2)
// ---------------------------------------------------------------------------
const CANONICAL_CONSTANTS = Object.freeze({
  DELTA_CRIT: 0.33,
  THETA_ACC: 0.17,
  LAMBDA_L: 0.22,
  EPSILON_L: 0.05,
  SIGMA_L: 0.05,
  W_C: Object.freeze([0.6, 0.4]),
  Q_WEIGHTS: Object.freeze([0.5, 0.3, 0.2]),
  CTM_BANDS: Object.freeze({ safe: 0.4, watch: 0.15, warn: 0 }),
  S_EQ: 0.3,
  G: 0.5,
  R: 0.5,
  DELTA_R_OPT: 0.3,
  EPS: 1e-12,
});

/** Four-band vocabulary — Spec §6/§11. Supersedes green/yellow/red. */
const BANDS = Object.freeze({
  SAFE: 'SAFE',
  WATCH: 'WATCH',
  WARN: 'WARN',
  COLLAPSE: 'COLLAPSE',
});

function invalid(name, value) {
  const err = new Error(name + ' must be finite, got ' + value);
  err.code = 'UMIF_INVALID_INPUT';
  return err;
}

function ensureFinite(value, name) {
  if (!Number.isFinite(value)) throw invalid(name, value);
  return value;
}

function clip(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** Bounded entropy law — one explicit-Euler step of dS/dTx (Spec §5). */
function stepEntropy(S, dTx, opts = {}) {
  ensureFinite(S, 'S');
  ensureFinite(dTx, 'dTx');
  if (dTx < 0) throw invalid('dTx (must be >= 0)', dTx);
  const g = ensureFinite(opts.g !== undefined ? opts.g : CANONICAL_CONSTANTS.G, 'g');
  const r = ensureFinite(opts.r !== undefined ? opts.r : CANONICAL_CONSTANTS.R, 'r');
  const sEq = ensureFinite(opts.sEq !== undefined ? opts.sEq : CANONICAL_CONSTANTS.S_EQ, 'sEq');
  const piRaw = ensureFinite(opts.pi !== undefined ? opts.pi : 0, 'pi');

  const piBound = r * Math.min(sEq, 1 - sEq);
  const pi = clip(piRaw, -piBound, piBound);
  const piClamped = pi !== piRaw;

  const s0 = clip(S, 0, 1);
  const dSdTx = g * s0 * (1 - s0) - r * (s0 - sEq) + pi;
  const next = clip(s0 + dSdTx * dTx, 0, 1); // safety-net clamp (Spec §5)
  return { S: next, dSdTx, pi, piClamped };
}

/** Relational-time increments — (1/2^n)·‖ΔR_n‖ terms (Spec §3). */
function computeTxIncrements(deltaRSequence) {
  if (!Array.isArray(deltaRSequence)) {
    throw new Error('deltaRSequence must be an array');
  }
  const increments = [];
  let weight = 1;
  for (let i = 0; i < deltaRSequence.length; i++) {
    const value = Number(deltaRSequence[i]);
    ensureFinite(value, 'deltaRSequence[' + i + ']');
    if (value < 0 || value > 1) {
      throw new Error('deltaRSequence[' + i + '] must be in [0, 1], got ' + value);
    }
    increments.push(value * weight);
    weight *= 0.5;
  }
  return increments;
}

/** dS/dTx and d²S/dTx² as finite differences over dTx increments (Spec §5). */
function entropyDerivatives(entropySeries, dTxSeries) {
  if (!Array.isArray(entropySeries) || !Array.isArray(dTxSeries)) {
    throw new Error('entropySeries and dTxSeries must be arrays');
  }
  const { EPS } = CANONICAL_CONSTANTS;
  const rates = [];
  let prevRate = 0;
  for (let i = 1; i < entropySeries.length; i++) {
    const s1 = ensureFinite(Number(entropySeries[i]), 'entropySeries[' + i + ']');
    const s0 = ensureFinite(Number(entropySeries[i - 1]), 'entropySeries[' + (i - 1) + ']');
    const dTx = ensureFinite(
      Number(dTxSeries[i - 1] !== undefined ? dTxSeries[i - 1] : 0),
      'dTxSeries[' + (i - 1) + ']'
    );
    const rate = dTx > EPS ? (s1 - s0) / dTx : prevRate;
    rates.push(rate);
    prevRate = rate;
  }
  if (rates.length === 0) return { rate: 0, accel: 0, rates };
  const rate = rates[rates.length - 1];
  let accel = 0;
  if (rates.length >= 2) {
    const lastDTx = Number(dTxSeries[rates.length - 1]) || 0;
    accel = lastDTx > EPS ? (rate - rates[rates.length - 2]) / lastDTx : 0;
  }
  return { rate, accel, rates };
}

/** Unified collapse score Ξ — Spec §6, floored at 0. */
function computeXi(rate, accel, opts = {}) {
  ensureFinite(rate, 'rate');
  ensureFinite(accel, 'accel');
  const dCrit = opts.deltaCrit !== undefined ? opts.deltaCrit : CANONICAL_CONSTANTS.DELTA_CRIT;
  const tAcc = opts.thetaAcc !== undefined ? opts.thetaAcc : CANONICAL_CONSTANTS.THETA_ACC;
  const w = opts.weights !== undefined ? opts.weights : CANONICAL_CONSTANTS.W_C;
  return Math.max(0, (w[0] * rate) / dCrit + (w[1] * accel) / tAcc);
}

/** Collapse predicate — Spec §6: collapse ⟺ Ξ > 1 ⟺ CTM < 0. */
function isCollapse(xi) {
  return ensureFinite(xi, 'xi') > 1;
}

/** Band classification — Spec §6/§11. CTM = 0 is WARN, not COLLAPSE. */
function bandFor(ctm, bands = CANONICAL_CONSTANTS.CTM_BANDS) {
  ensureFinite(ctm, 'ctm');
  if (ctm > bands.safe) return BANDS.SAFE;
  if (ctm >= bands.watch) return BANDS.WATCH;
  if (ctm >= bands.warn) return BANDS.WARN;
  return BANDS.COLLAPSE;
}

/** Canonical Collapse-Threshold Margin — Spec §6: CTM = 1 − Ξ. */
function computeCanonicalCTM(rate, accel, opts = {}) {
  const xi = computeXi(rate, accel, opts);
  const ctm = 1 - xi;
  return { xi, ctm, band: bandFor(ctm, opts.bands), collapse: isCollapse(xi) };
}

/** Canonical trace over a [0,1] perturbation-driving sequence (P2.1 adapter). */
function canonicalEntropyTrace(deltaRSequence, opts = {}) {
  const increments = computeTxIncrements(deltaRSequence);
  const g = opts.g !== undefined ? opts.g : CANONICAL_CONSTANTS.G;
  const r = opts.r !== undefined ? opts.r : CANONICAL_CONSTANTS.R;
  const sEq = opts.sEq !== undefined ? opts.sEq : CANONICAL_CONSTANTS.S_EQ;
  const piBound = r * Math.min(sEq, 1 - sEq);

  let S = clip(opts.s0 !== undefined ? ensureFinite(opts.s0, 's0') : sEq, 0, 1);
  const entropySeries = [S];
  let tx = 0;
  for (let i = 0; i < increments.length; i++) {
    const pi = clip(Number(deltaRSequence[i]), 0, 1) * piBound;
    const step = stepEntropy(S, increments[i], { g, r, sEq, pi });
    S = step.S;
    tx += increments[i];
    entropySeries.push(S);
  }
  const { rate, accel } = entropyDerivatives(entropySeries, increments);
  const { xi, ctm, band, collapse } = computeCanonicalCTM(rate, accel);
  return { S, tx, rate, accel, xi, ctm, band, collapse, entropySeries, increments };
}

/**
 * Feature flag — ADWS_UMIF_CANONICAL = off | shadow | on (default on).
 * Read from process.env at CALL time, matching the original.
 */
function canonicalMode(env = process.env) {
  const raw = String(env.ADWS_UMIF_CANONICAL || 'on').toLowerCase();
  return raw === 'off' || raw === 'shadow' ? raw : 'on';
}

// ---------------------------------------------------------------------------
// Inlined from src/entropy-gating.js (gate computations)
// ---------------------------------------------------------------------------
function round5(value) {
  return Math.round(value * 100000) / 100000;
}

// Mirrors the legacy normalizeSignal contract: |v|, scaled by the max only
// when the max exceeds 1, so the canonical trace sees the same [0,1] signal
// the legacy entropy pipeline sees.
// SC-9/A3. `Math.max(...abs)` spread the array into an argument list, which is
// bounded by the call-stack frame: reproduced OK at 50k entries and
// `RangeError: Maximum call stack size exceeded` at 200k. Reachable from
// entropy-gate.js over an append-only entropy_history.jsonl that nothing
// truncates, so the verify-phase gate became un-runnable rather than wrong.
// A fold is O(n) with a constant stack and returns the identical value for every
// input the spread survived, so no fixture output changes and drift-sentinel does
// not join DIVERGED_PACKS. `0` is the correct identity: every element is
// Math.abs(...) and so non-negative, matching the `abs.length ? ... : 0` fallback
// this replaces.
function maxOf(values) {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  return max;
}

function normalizeSignalWindow(signalWindow) {
  const abs = signalWindow.map((v) => Math.abs(Number(v) || 0));
  const max = abs.length ? maxOf(abs) : 0;
  if (max === 0) return abs.map(() => 0);
  if (max <= 1) return abs;
  return abs.map((v) => v / max);
}

/** Canonical gate values over the parse-failure proxy signal (Spec §5/§6). */
function computeCanonicalGate(signalWindow) {
  const normalized = normalizeSignalWindow(Array.isArray(signalWindow) ? signalWindow : []);
  const trace = canonicalEntropyTrace(normalized);
  return {
    S: round5(trace.S),
    tx: round5(trace.tx),
    rate: round5(trace.rate),
    accel: round5(trace.accel),
    xi: round5(trace.xi),
    ctm: round5(trace.ctm),
    band: trace.band,
    collapse: trace.collapse,
  };
}

function readEntropyValue(entry) {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (entry && typeof entry === 'object' && Number.isFinite(entry.entropy)) return entry.entropy;
  return 0;
}

/**
 * LEGACY gate metric — superseded per UMIF Canonical Specification v1.2 §1/§13
 * (audit F-02/F-03). The `ctm` output field is the entropy-headroom form
 * `S_c − S_current` (scale ≤ 0.33), NOT the canonical CTM = 1 − Ξ.
 * Retained behind ADWS_UMIF_CANONICAL for the off/shadow rollback path.
 */
function computeCTM(entropyHistory) {
  if (!Array.isArray(entropyHistory) || entropyHistory.length < 1) {
    return {
      ctm: COLLAPSE_ENTROPY_THRESHOLD,
      zone: 'green',
      risk_level: 'low',
      d_entropy: 0,
      current_entropy: 0,
      ds_dtx: 0,
      gradient_alert: false,
    };
  }

  const last = entropyHistory[entropyHistory.length - 1];
  const prev = entropyHistory.length > 1 ? entropyHistory[entropyHistory.length - 2] : last;
  const lastVal = readEntropyValue(last);
  const prevVal = readEntropyValue(prev);
  const d_entropy = Math.abs(lastVal - prevVal);
  const ctm = COLLAPSE_ENTROPY_THRESHOLD - lastVal;

  // E61-validated dS/dTx gradient: rate of entropy change over statistical Tx
  const rawValues = entropyHistory.map(readEntropyValue);
  const tx = computeStatisticalTx(rawValues);
  const refEntropy = rawValues.length > 1 ? rawValues[0] : lastVal;
  const ds_dtx = computeEntropyGradient(lastVal, refEntropy, tx);
  const gradientThreshold = Number(process.env.ADWS_GRADIENT_THRESHOLD) || GRADIENT_THRESHOLD;
  const gradient_alert = Math.abs(ds_dtx) > gradientThreshold;

  const base = {
    ctm,
    d_entropy,
    current_entropy: lastVal,
    ds_dtx: Math.round(ds_dtx * 100000) / 100000,
    gradient_alert,
  };
  if (ctm > CTM_LOW) return { ...base, zone: 'green', risk_level: gradient_alert ? 'medium' : 'low' };
  if (ctm > CTM_YELLOW) return { ...base, zone: 'yellow', risk_level: 'medium' };
  if (ctm > CTM_RED) return { ...base, zone: 'red', risk_level: 'high' };
  return { ...base, zone: 'red', risk_level: 'critical' };
}

// ---------------------------------------------------------------------------
// The skill pack itself (unchanged from src/skills/drift-sentinel/drift-sentinel.js)
// ---------------------------------------------------------------------------
const manifest = {
  skill_id: 'drift.sentinel',
  version: '1.2.0',
  phase_affinity: ['verify'],
  rubric: {
    // Canonical four-band vocabulary (UMIF Canonical Spec v1.2 §6/§11; plan
    // P2.6). CTM here is the Collapse-Threshold Margin 1 − Ξ when
    // ADWS_UMIF_CANONICAL=on; legacy zone strings from pre-migration
    // artifacts remain accepted on read.
    pass: 'Specification-drift risk is acceptable: canonical CTM is in the SAFE band (legacy: green zone, no gradient alert), so the run remains within the contracted risk envelope.',
    warn: 'Specification-drift risk is elevated: canonical CTM is in the WATCH or WARN band (legacy: yellow/red non-critical, or gradient alert), so the run requires review before promotion.',
    fail: 'Specification-drift risk is critical: canonical CTM is in the COLLAPSE band, Ξ > 1 (legacy: red-critical), so the run is held for operator triage under the SWEBOK v4 §5.2 continuous-risk-management practice.',
  },
  metrics: [
    'ctm',
    'band',
    'zone',
    'risk_level',
    'xi',
    'rate',
    'accel',
    'd_entropy',
    'ds_dtx',
    'gradient_alert',
    'current_entropy',
    'history_length',
  ],
};

const RISK_FROM_BAND = {
  [BANDS.SAFE]: 'low',
  [BANDS.WATCH]: 'medium',
  [BANDS.WARN]: 'high',
  [BANDS.COLLAPSE]: 'critical',
};

// Rebuild the parse-failure proxy signal the gate saw. Entries written by the
// runtime carry parseFailureScore; older/simpler histories fall back to their
// entropy values (both are [0,1]-normalizable signals).
function signalFromHistory(entropyHistory) {
  const scores = entropyHistory.map((e) =>
    e && typeof e === 'object' && Number.isFinite(e.parseFailureScore) ? e.parseFailureScore : null
  );
  if (scores.every((s) => s !== null)) return scores;
  return entropyHistory.map((e) =>
    e && typeof e === 'object' && Number.isFinite(e.entropy) ? e.entropy : typeof e === 'number' ? e : 0
  );
}

function executeCanonical(entropyHistory) {
  const gate = computeCanonicalGate(signalFromHistory(entropyHistory));
  const risk_level = RISK_FROM_BAND[gate.band] || 'low';
  const rubric_result = gate.band === BANDS.SAFE ? 'pass' : gate.band === BANDS.COLLAPSE ? 'fail' : 'warn';
  return {
    rubric_result,
    ctm: gate.ctm,
    band: gate.band,
    zone: gate.band, // four-band vocabulary; legacy zone kept as an alias key
    risk_level,
    xi: gate.xi,
    rate: gate.rate,
    accel: gate.accel,
    d_entropy: 0,
    ds_dtx: gate.rate,
    gradient_alert: gate.collapse,
    current_entropy: gate.S,
    history_length: entropyHistory.length,
    scale: 'canonical',
    cost_usd: 0,
    token_count: 0,
    model_used: null,
  };
}

function execute(input) {
  const entropyHistory = Array.isArray(input.entropy_history) ? input.entropy_history : [];
  const mode = canonicalMode();

  if (entropyHistory.length === 0) {
    return {
      rubric_result: 'pass',
      ctm: null,
      band: mode === 'on' ? BANDS.SAFE : undefined,
      zone: mode === 'on' ? BANDS.SAFE : 'green',
      risk_level: 'low',
      d_entropy: 0,
      ds_dtx: 0,
      gradient_alert: false,
      current_entropy: 0,
      history_length: 0,
      cost_usd: 0,
      token_count: 0,
      model_used: null,
    };
  }

  if (mode === 'on') {
    return executeCanonical(entropyHistory);
  }

  // Legacy path (off/shadow — rollback position; superseded zones, audit F-03)
  const ctmResult = computeCTM(entropyHistory);
  const { ctm, zone, risk_level, d_entropy, current_entropy, ds_dtx, gradient_alert } = ctmResult;

  let rubric_result;
  if (zone === 'green' && !gradient_alert) {
    rubric_result = 'pass';
  } else if (zone === 'green' && gradient_alert) {
    rubric_result = 'warn';
  } else if (zone === 'yellow' || zone === 'red') {
    rubric_result = risk_level === 'critical' ? 'fail' : 'warn';
  } else {
    rubric_result = 'fail';
  }

  return {
    rubric_result,
    ctm: typeof ctm === 'number' ? Math.round(ctm * 100000) / 100000 : null,
    zone,
    risk_level,
    d_entropy: typeof d_entropy === 'number' ? Math.round(d_entropy * 100000) / 100000 : 0,
    ds_dtx: typeof ds_dtx === 'number' ? ds_dtx : 0,
    gradient_alert: !!gradient_alert,
    current_entropy: typeof current_entropy === 'number' ? Math.round(current_entropy * 100000) / 100000 : 0,
    history_length: entropyHistory.length,
    cost_usd: 0,
    token_count: 0,
    model_used: null,
  };
}

module.exports = { manifest, execute };

// --- CLI wrapper (standalone invocation; NFR-4: Node built-ins only) ---
// Usage: node drift-sentinel.js <input.json | ->   ('-' reads the JSON object from stdin)
// Mode is selected by the ADWS_UMIF_CANONICAL env var (off | shadow | on; default on).
// Exit 0: execute ran (verdict is rubric_result in the printed JSON).
// Exit 3: unreadable input, invalid JSON, or execute threw on bad input.
if (require.main === module) {
  const fs = require('fs');
  const src = process.argv[2];
  // SC-9/A3(b). Every wrapper read stdin and files unbounded, with no size limit
  // anywhere in the codebase. The cap bounds the read and the parse before either
  // can become the failure. 64 MiB is far above any evidence payload a recorded
  // job has produced, so a legitimate input never approaches it. This is a floor,
  // NOT the fix for F-65: a 200k-entry entropy history is only ~2 MB, well under
  // the cap — the fix for that is the fold in drift-sentinel.js.
  const MAX_INPUT_BYTES = 64 * 1024 * 1024;
  let raw;
  try {
    if (!src) throw new Error('missing input path (use a file path or - for stdin)');
    const buf = src === '-' ? fs.readFileSync(0) : fs.readFileSync(src);
    if (buf.length > MAX_INPUT_BYTES) {
      throw new Error('input exceeds ' + MAX_INPUT_BYTES + ' bytes (' + buf.length + ')');
    }
    raw = buf.toString('utf8');
  } catch (err) {
    console.error('adws-validator: cannot read input: ' + err.message);
    process.exit(3);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    console.error('adws-validator: invalid JSON: ' + err.message);
    process.exit(3);
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    console.error('adws-validator: input must be a JSON object');
    process.exit(3);
  }
  let result;
  try {
    result = execute(input);
  } catch (err) {
    console.error('adws-validator: execute failed: ' + err.message);
    process.exit(3);
  }
  console.log(JSON.stringify(result, null, 2));
}
