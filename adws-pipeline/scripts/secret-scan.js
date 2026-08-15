#!/usr/bin/env node
'use strict';

/**
 * secret-scan.js — makes `references/artifact-layout.md` rule 7 executable.
 *
 * SC-19/F-96, closing F-81. Rule 7 has said since SC-2/C5 that agents MUST redact secrets
 * to `[REDACTED]` before writing them to any evidence file. `agent-blocks-lint.mjs` proves
 * all ten agents carry the same *text*, byte-identically, across three blocks — and cannot
 * prove any agent obeys it. The audit of 2026-08-09 recorded why that stopped being
 * acceptable: SC-11/A5 made every terminal run write `artifacts/{jobId}.tar.gz` to
 * `execution.evidence_archive_dir`, a durable destination OUTSIDE the worktree and outside
 * the target checkout, and SC-13/F-77 then added `consensus/repro/` — verbatim copies of
 * target-repo files — to that same tree. Both changes are correct. Their combined effect is
 * a growing, off-checkout corpus of untrusted-repository content whose only redaction
 * control was an instruction to a language model.
 *
 * THE FALSE-POSITIVE POLICY, which F-81 said was needed before any code (SC-8 house rule —
 * a FACT fails, an INFERENCE warns):
 *
 *   fail  A `fact` rule matches a string that is self-identifying: the format alone names
 *         it a credential, with no reference to its surroundings. `AKIA` + 16 uppercase
 *         base36 is an AWS access key id whatever file it sits in. There is no judgement
 *         in the match, so there is none in the verdict.
 *   warn  An `inference` rule matches a KEY suggesting the VALUE beside it is sensitive
 *         (`password = …`). That is a guess about meaning, and a guess must not halt a run.
 *         Same branch as evidence-integrity's midnight stamp, for the same reason.
 *
 * There is deliberately NO allowlist file. Two reasons, and the second is the real one:
 * an allowlist is a place to hide a live credential behind a plausible entry, and — more
 * to the point — the remedy for a false positive here is the same as the remedy for a true
 * one. A string shaped exactly like an AWS key has no business sitting unredacted in an
 * audit artifact either way, so `[REDACTED]` is the fix in both cases and the distinction
 * costs nothing. An exemption register would be a second thing to keep in sync (see
 * `parity/guard-ablation-baseline.json`, whose whole discipline is bidirectional for
 * exactly this reason) in exchange for a remedy nobody needs.
 *
 * THE REPORT NEVER ECHOES A MATCH. A scanner that prints what it found writes the secret
 * into a second file — and this report is itself evidence, so that file would be inside the
 * tree being scanned and inside the archive. Findings carry `rule`, `file`, `line`,
 * `column`, `match_length` and a `fingerprint` (sha256 prefix): enough to locate the string,
 * to diff two runs, and to confirm a redaction landed, and not enough to reconstruct it.
 * `parity/secret-scan-fixtures/run-tests.js` asserts this against planted values.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK:
 *   - High-entropy blobs with no distinguishing prefix. A 40-character hex string is a
 *     sha1, a build id, a nonce, or an API key, and nothing in the string says which. An
 *     entropy heuristic here would fire on the digests `carry_over.files[].sha256` is
 *     REQUIRED to contain, which is a guard that punishes the schema it guards.
 *   - Whether a redacted value was redacted correctly, or redacted at all before some
 *     earlier copy of the file was written. This reads a finished tree; it cannot see a
 *     write that already happened. Same limit evidence-integrity.js states about authorship.
 *   - The `.tar.gz` archive itself, which is binary and sits beside `artifacts/{jobId}/`
 *     rather than inside it. Scan the tree BEFORE it is archived — that ordering is the
 *     whole point, and SKILL.md §5 step 2 fixes it.
 *   - Any credential that is not literally present as text on one line. Probes run at
 *     SC-19 confirmed three misses, all by construction: a token WRAPPED across a line
 *     boundary, a token BASE64-ENCODED inside the file, and a token spelled with a
 *     Cyrillic homoglyph. Matching is per line and per literal, so these are limits of the
 *     method rather than gaps in the rule table, and none of them is a shape an agent
 *     transcribing command output produces by accident. The scanner is a floor under the
 *     agents' redaction rule, not a replacement for it — an adversary with write access to
 *     the evidence tree defeats any reader-side check, and defense in depth is the claim
 *     rule 7 makes.
 *
 * USAGE: node secret-scan.js <dir | file>   → JSON report on stdout
 * EXIT:  0 clean or warnings only · 1 findings · 3 unreadable path
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// A value that names itself as absent, or as already redacted. Compared case-insensitively
// after trimming and stripping one layer of quotes. Without this list the scanner warns on
// `password: [REDACTED]` — punishing the exact behaviour rule 7 demands, which is the
// fastest way to teach people to ignore a step.
const NON_VALUES = new Set([
  '[redacted]', 'redacted', '<redacted>', '***', '****', '*****', '********',
  'null', 'none', 'nil', 'undefined', 'false', 'true', '', '-', '--',
  'tbd', 'todo', 'n/a', 'na', 'xxx', 'xxxxxxxx', 'changeme', 'example',
  'placeholder', 'your-token-here', 'dummy', 'fake', 'test',
]);

// Base64url segment that round-trips to a JSON object. Used to tell a real JWT from any
// other dotted base64 string — the same discipline evidence-integrity.js applies when it
// round-trips a well-shaped stamp through Date to catch `2026-02-31T00:00:00Z`.
function decodesToJsonObject(segment) {
  try {
    const json = Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch (err) {
    return false;
  }
}

/**
 * `kind: 'fact'` → violation (exit 1). `kind: 'inference'` → warning (exit 0).
 * `verify` runs on the match and can reject it; a rule with a verifier is claiming its
 * regex alone is not self-identifying enough to be a fact.
 * `valueGroup` names the capture group holding the sensitive VALUE, for inference rules
 * whose match spans a key and a value.
 */
const RULES = [
  {
    id: 'aws_access_key_id',
    kind: 'fact',
    re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
  },
  {
    id: 'github_token',
    kind: 'fact',
    // ghp_ / gho_ / ghu_ / ghs_ / ghr_ + 36. GitHub's own format, fixed length.
    re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'private_key_block',
    kind: 'fact',
    re: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
  {
    id: 'slack_token',
    kind: 'fact',
    re: /\bxox[baprse]-[A-Za-z0-9-]{10,}/g,
  },
  {
    id: 'google_api_key',
    kind: 'fact',
    re: /\bAIza[A-Za-z0-9_-]{35}\b/g,
  },
  {
    id: 'stripe_secret_key',
    kind: 'fact',
    re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: 'openai_api_key',
    kind: 'fact',
    re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    id: 'npm_token',
    kind: 'fact',
    re: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'pypi_token',
    kind: 'fact',
    re: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/g,
  },
  {
    id: 'jwt',
    kind: 'fact',
    re: /\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
    // Three dotted base64url segments are common enough by accident; a JWT is the subset
    // whose first segment decodes to a JSON object carrying `alg`. Without this the rule
    // is an inference wearing a fact's verdict.
    verify(match) {
      const header = match.split('.')[0];
      if (!decodesToJsonObject(header)) return false;
      const parsed = JSON.parse(Buffer.from(header.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      return Object.prototype.hasOwnProperty.call(parsed, 'alg');
    },
  },
  {
    id: 'sensitive_assignment',
    kind: 'inference',
    // `(?<![A-Za-z0-9_])key(?![A-Za-z0-9_])` and not `\b`: `\b` would match `secret` inside
    // `secret_policy`, and `"secret_policy": "no-new-secrets"` is in EVERY task contract
    // this pipeline writes. A guard that fires on every run of the thing it guards is not a
    // guard. The underscore-aware boundary is what keeps `api_key` matchable while
    // `secret_policy`, `token_budget` and `auth_mode` are not.
    re: /(?<![A-Za-z0-9_])(?:pass(?:word|wd|phrase)|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|credential|bearer)(?![A-Za-z0-9_])["']?\s*[:=]\s*["'`]?([^\s"'`,;)}\]]{8,})/gi,
    valueGroup: 1,
    verify(match, groups) {
      const value = (groups[0] || '').trim().replace(/^["'`]|["'`]$/g, '');
      // `]` and `}` terminate the value so a JSON array or object end is not swallowed,
      // which means the canonical marker arrives here as `[REDACTED` — nine characters and
      // not in NON_VALUES. Stripping the bracket run off both ends before the lookup is
      // what stops the scanner warning about the literal string rule 7 mandates; the first
      // cut of this rule did exactly that, on the fixture written to catch it.
      const bare = value.replace(/^[[<({]+/, '').replace(/[\]>)}]+$/, '');
      if (NON_VALUES.has(value.toLowerCase()) || NON_VALUES.has(bare.toLowerCase())) return false;
      // `$TOKEN`, `${TOKEN}`, `<your-token>`, `{{token}}` — a reference to a secret is not
      // a secret, and evidence that names the variable is evidence doing its job.
      if (/^[$<{]/.test(value)) return false;
      // A run of one repeated character is a mask, whatever character was chosen.
      if (/^(.)\1*$/.test(value)) return false;
      return true;
    },
  },
];

const RULE_IDS = RULES.map((r) => r.id);

function fingerprint(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12);
}

function scanText(text, file, out) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        // A zero-length match would spin the loop forever; no rule can produce one today,
        // and relying on that is how the loop becomes infinite two edits from now.
        if (m[0].length === 0) {
          rule.re.lastIndex += 1;
          continue;
        }
        const groups = m.slice(1);
        if (typeof rule.verify === 'function' && !rule.verify(m[0], groups)) continue;
        // Fingerprint the VALUE for inference rules, not the whole `key = value` match:
        // the fingerprint is what lets two runs be compared, and including the key name
        // would make an unchanged secret look different after a rename.
        const secret = rule.valueGroup != null ? groups[rule.valueGroup - 1] : m[0];
        const finding = {
          file,
          line: i + 1,
          column: m.index + 1,
          rule: rule.id,
          match_length: secret.length,
          fingerprint: fingerprint(secret),
        };
        if (rule.kind === 'fact') out.findings.push(finding);
        else out.warnings.push(finding);
      }
    }
  }
}

// 8 KB is enough to decide: every text format this tree holds (.json, .md, .jsonl, .txt,
// .patch, .diff) puts printable bytes in its first block, and every binary format worth
// skipping puts a NUL there. Reading the whole file to decide would mean loading an
// archive into memory to conclude it should not have been read.
function looksBinary(buffer) {
  const window = buffer.subarray(0, 8192);
  return window.includes(0);
}

function collectFiles(root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  const found = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) found.push(full);
    }
  }
  // Sorted so the report is byte-identical across runs on the same tree; an
  // order-dependent report cannot be diffed between attempts.
  return found.sort();
}

function execute(root) {
  const files = collectFiles(root);
  const out = { findings: [], warnings: [] };
  let scanned = 0;
  let skippedBinary = 0;

  for (const file of files) {
    const rel = path.relative(root, file) || path.basename(file);
    let buffer;
    try {
      buffer = fs.readFileSync(file);
    } catch (err) {
      // Unlike evidence-integrity, an unreadable file here is NOT a finding: this scanner
      // asserts the absence of a thing, and "could not look" is not "looked and found
      // nothing". It is reported so the caller can see the tree was not fully covered.
      out.findings.push({
        file: rel, line: 0, column: 0, rule: 'unreadable_file', match_length: 0, fingerprint: null,
      });
      continue;
    }
    if (looksBinary(buffer)) {
      skippedBinary += 1;
      continue;
    }
    scanned += 1;
    scanText(buffer.toString('utf8'), rel, out);
  }

  // A tree with nothing to scan is not a clean tree — it is a wrong path, or a run that
  // wrote nothing. Reporting `pass` here would be this script committing the defect it
  // exists to catch: absence reading as success. Exactly the branch evidence-integrity.js
  // grew after an early run of its own suite pointed at a directory that had failed to copy.
  if (scanned === 0) {
    out.findings.push({
      file: null, line: 0, column: 0, rule: 'no_files_scanned', match_length: 0, fingerprint: null,
    });
  }

  const rubric_result = out.findings.length > 0 ? 'fail' : out.warnings.length > 0 ? 'warn' : 'pass';
  return {
    rubric_result,
    files_scanned: scanned,
    files_skipped_binary: skippedBinary,
    rules_applied: RULE_IDS.length,
    findings: out.findings,
    warnings: out.warnings,
  };
}

module.exports = { execute, RULES, RULE_IDS, NON_VALUES, fingerprint };

if (require.main === module) {
  const target = process.argv[2];
  let result;
  try {
    if (!target) throw new Error('missing path (pass an evidence directory or a file)');
    result = execute(target);
  } catch (err) {
    console.error('adws-secret-scan: cannot read input: ' + err.message);
    process.exit(3);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.rubric_result === 'fail' ? 1 : 0);
}
