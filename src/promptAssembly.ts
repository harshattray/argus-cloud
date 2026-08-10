import { HARD_CAPS } from "./providerBudget.js";

/**
 * Assembly of the hosted explain user turn.
 *
 * This lives in the package rather than beside the Anthropic client for one
 * reason: it is where the prompt-size cap is *enforced*, and the cap is what
 * makes the pre-call dollar reservation an actual maximum instead of a guess.
 * A cap with no test is a comment. Keeping the function here lets the node
 * suite prove it holds for hostile inputs.
 */

export interface FrameEvidence {
  frame: string;
  label: string;
  threshold: number;
  stats: Record<string, unknown>;
}

export const TRUNCATION_NOTE = "…[truncated to fit the prompt cap]";

/**
 * Builds the user turn, guaranteeing it never exceeds
 * `HARD_CAPS.maxUserContentChars`.
 *
 * Frame stats come from an uploaded `summary.json` — customer-supplied, and
 * bounded only by the upload route's 2MB body limit. Without a cap here the
 * "maximum possible cost" reserved before the call would have nothing enforcing
 * it. The stats block is truncated rather than refused: it is untrusted data,
 * the model is told it was cut, and a large frame still gets an answer instead
 * of an error.
 */
export function buildUserContent(evidence: FrameEvidence, enrichmentText: string | null): string {
  const header = [
    "<frame-diff-data>",
    `Frame: ${evidence.frame} (label: ${evidence.label})`,
    `Flag threshold: ${evidence.threshold}% aligned mismatch`,
    "",
  ].join("\n");
  const footer = [
    "</frame-diff-data>",
    ...(enrichmentText ? [enrichmentText] : []),
    "Explain the most likely causes of this frame's drift as structured findings.",
  ].join("\n");

  const budget = HARD_CAPS.maxUserContentChars - header.length - footer.length - 2;
  let stats = `Diff metadata (summary.json v2): ${JSON.stringify(evidence.stats)}`;
  if (stats.length > budget) {
    stats = stats.slice(0, Math.max(0, budget - TRUNCATION_NOTE.length)) + TRUNCATION_NOTE;
  }

  const content = `${header}${stats}\n${footer}`;
  // Belt and braces. The stats budget above assumes the header and footer fit;
  // an oversized enrichment block would break that assumption, and the cap this
  // function promises must hold whatever any caller passes.
  return content.length > HARD_CAPS.maxUserContentChars
    ? content.slice(0, HARD_CAPS.maxUserContentChars)
    : content;
}
