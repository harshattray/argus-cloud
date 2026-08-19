/**
 * Outbound secret scanner — the server half of PATHWAYS Pathway 2 item 8
 * ("secret-scan DOM and code context before provider submission") and
 * BuildV5 G3.4.
 *
 * **A hit blocks. It never redacts.** A redaction that misses is an
 * exfiltration, and there is no way to be sure a regex caught every copy of a
 * value inside a JSON blob. Blocking names the field and costs the customer
 * nothing; redacting would ship a payload nobody has checked.
 *
 * **Where it runs:** `promptAssembly.ts`, over the exact strings the outbound
 * user turn interpolates, before any provider call. That is the only point both
 * the interactive and the batch paths share, so it cannot be skipped by adding a
 * caller — which is the same argument `economicPath.ts` makes about money.
 *
 * ## Why the rules are a copy
 *
 * These are the rules from Argus `src/explain/scanner.ts` (Build 4.0 A3,
 * SECURITY-LLM.md S1–S8), which protects the CLI's local BYO-key path. This
 * repo cannot import them: `argus-cloud` does not depend on `norma-scope`, the
 * published bundle carries no declarations, and Doctrine 6 keeps paid logic out
 * of the published package in the other direction.
 *
 * So this is a deliberate second copy, and the repo's first working rule says a
 * second copy of a fact drifts. What holds them together is a **shared corpus
 * rather than a shared import**: `test/secretScan.test.mjs` plants one payload
 * per rule and asserts the rule id that fires, so the two implementations are
 * pinned to the same observable behaviour. If a rule changes in Argus, change it
 * here in the same commit and extend the corpus.
 *
 * **They already differ in one place, and the corpus is how it was found.**
 * S8's token charset excludes `/` here and includes it in Argus, because with
 * `/` an ordinary file path scores as a secret — see the note on
 * `ENTROPY_TOKEN`. Argus's copy scans DOM and code context, where paths are far
 * more common than they are in summary metadata, so it has the same false
 * positive with more chance of hitting it. Taking the fix there is a CLI change
 * with a publish attached, so it is recorded rather than done here.
 */

export interface SecretHit {
  /** Rule ID from SECURITY-LLM.md (S1–S8). */
  rule: string;
  /** Human-readable source: which field of the outbound request carried it. */
  source: string;
}

interface Rule {
  id: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { id: "S1", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "S2", pattern: /\bsk-ant-[A-Za-z0-9_-]{10,}/ },
  { id: "S3", pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { id: "S4", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { id: "S5", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: "S6", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  // Named assignments: FIGMA_TOKEN=…, API_KEY: "…", password = …
  // The value charset excludes dots so `apiKey: process.env.API_KEY` and
  // similar code references don't false-positive.
  { id: "S7", pattern: /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_?KEY)\s*[:=]\s*['"]?[A-Za-z0-9+/_=-]{8,}/i },
];

// S8 — high-entropy strings. Threshold 4.5 bits/char: random base64 sits
// near 6, English prose near 4, hex at exactly 4 (hex-shaped secrets are
// covered by S1/S6/S7). Length ≥ 32 keeps CSS-module hashes and short IDs
// out — and, on this side of the boundary, commit SHAs and UUIDs, both of
// which appear in ordinary summary and enrichment data.
//
// **`/` is a separator here, and it is not in Argus's copy — a deliberate
// divergence, found by the clean corpus in `test/secretScan.test.mjs`.**
// With `/` in the alphabet, `artifacts/build/marketing-hero-desktop-1440x900`
// is one 47-character token scoring 4.52 bits — over the threshold, because
// entropy measures the variety of several ordinary words plus their
// separators, not the randomness of any value in it. That is a screenshot
// path: a false positive there refuses a paying customer's analysis for
// naming a file.
//
// The cost, stated plainly: a *standard* base64 value whose slashes break
// every 32-character run can now slip past S8 (base64url, which is what
// tokens actually use, has no slashes and is unaffected). S8 is the backstop
// for an unprefixed random string; S1–S7 are what catch named credentials,
// and S7 catches the assignment shape a leaked value nearly always arrives in.
const ENTROPY_TOKEN = /[A-Za-z0-9+=_-]{32,}/g;
const ENTROPY_THRESHOLD_BITS = 4.5;

function shannonEntropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Returns the first matching rule ID, or null when the text is clean. */
export function scanText(text: string): string | null {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return rule.id;
    }
  }
  for (const match of text.matchAll(ENTROPY_TOKEN)) {
    if (shannonEntropy(match[0]) >= ENTROPY_THRESHOLD_BITS) {
      return "S8";
    }
  }
  return null;
}

/** Scans a set of named fields; returns the first hit or null. */
export function scanFields(fields: Array<{ source: string; text: string }>): SecretHit | null {
  for (const field of fields) {
    const rule = scanText(field.text);
    if (rule) {
      return { rule, source: field.source };
    }
  }
  return null;
}
