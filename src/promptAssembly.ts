import { HARD_CAPS } from "./providerBudget.js";
import { scanFields } from "./secretScan.js";
import type { GroundingCrop } from "./cropGrounding.js";

/**
 * Assembly of the hosted explain user turn.
 *
 * This lives in the package rather than beside the Anthropic client for one
 * reason: it is where the prompt-size cap is *enforced*, and the cap is what
 * makes the pre-call dollar reservation an actual maximum instead of a guess.
 * A cap with no test is a comment. Keeping the function here lets the node
 * suite prove it holds for hostile inputs.
 *
 * It is now also where the **secret scan** runs (Pathway 2 item 8), for the
 * same reason: this function is the one thing the interactive path and the
 * batch path both call, so a payload that has not been scanned cannot be
 * assembled at all. A caller added later inherits the guard instead of having
 * to remember it.
 */

/**
 * Thrown instead of returning content when an outbound field carries something
 * that looks like a credential.
 *
 * It is an exception rather than a result type because there is no partial
 * answer to hand back: the caller is a provider closure whose only job is to
 * make the call. `explainService.ts` maps it to a `secret_blocked` outcome that
 * releases both reservations, so a blocked analysis costs nothing and CI stays
 * green.
 */
export class OutboundSecretError extends Error {
  constructor(
    readonly rule: string,
    readonly source: string
  ) {
    super(
      `blocked before the provider call: ${source} looks like it contains a credential (rule ${rule}). ` +
        `Nothing was sent and no credits were used. Remove the value and upload the run again.`
    );
    this.name = "OutboundSecretError";
  }
}

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
 *
 * Throws `OutboundSecretError` when any field carries a credential.
 *
 * **The scan reads the fields, not the assembled string**, and it runs before
 * the truncation above. Truncation is a cost control, not a security control:
 * scanning the capped output would mean a secret 200KB into a stats blob is
 * "safe" because it happened to be cut, which is true for that one payload and
 * false the moment the blob is a little smaller. Scanning the source means the
 * answer does not depend on where the cap fell.
 */
export function buildUserContent(evidence: FrameEvidence, enrichmentText: string | null): string {
  const statsJson = JSON.stringify(evidence.stats);
  const hit = scanFields([
    { source: `frame name "${evidence.frame}"`, text: evidence.frame },
    { source: `the label of frame "${evidence.frame}"`, text: evidence.label },
    { source: `the summary.json stats for frame "${evidence.frame}"`, text: statsJson },
    // Our own derived text, not the customer's — scanned anyway, because
    // "this input is trusted" is the assumption every one of these guards
    // exists to stop someone making.
    ...(enrichmentText ? [{ source: "the history enrichment block", text: enrichmentText }] : []),
  ]);
  if (hit) {
    throw new OutboundSecretError(hit.rule, hit.source);
  }

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
  let stats = `Diff metadata (summary.json v2): ${statsJson}`;
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

// ---------------------------------------------------------------------------
// Crop grounding (BuildV5 G3)
// ---------------------------------------------------------------------------

/**
 * Prompt versions, which are cache identities.
 *
 * The result cache keys on this. A crop-grounded answer and a metadata-only
 * answer to the same question are **different answers** — one has seen the
 * pixels — so they must not share a cache entry. Without this, the first
 * metadata-only analysis of a frame would be served forever to crop-grounded
 * requests, and crop grounding would silently do nothing for every run after
 * the first. Nothing would error; the feature would just be absent.
 */
export const PROMPT_VERSION_METADATA = 1;
export const PROMPT_VERSION_CROPS = 2;

export function promptVersionFor(crops: readonly GroundingCrop[] | undefined): number {
  return crops && crops.length > 0 ? PROMPT_VERSION_CROPS : PROMPT_VERSION_METADATA;
}

/** One block of the user turn: our text, or a customer's pixels. */
export type UserBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/**
 * The user turn as content blocks — text first, then the crops in pairs.
 *
 * Each image is introduced by a line naming what it is and marking it
 * **untrusted**, the same shape the CLI's local explain uses. The label is not
 * decoration: a screenshot is attacker-controlled content that the model is
 * about to read, and the injection rule in the system prompt refers to these
 * markers.
 *
 * **Crops are not scanned, and this must not be claimed otherwise.** The secret
 * scanner reads text; a credential rendered into a screenshot is pixels. That
 * gap is real, is recorded in FUTURENORMA §6 as an open risk, and is what
 * `[data-norma-private]` redaction is for. Sending crops does not narrow it —
 * it is the reason the risk was listed before crops existed.
 */
export function buildUserBlocks(
  evidence: FrameEvidence,
  enrichmentText: string | null,
  crops: readonly GroundingCrop[] = []
): UserBlock[] {
  const blocks: UserBlock[] = [{ type: "text", text: buildUserContent(evidence, enrichmentText) }];
  for (const crop of crops) {
    blocks.push({
      type: "text",
      text:
        `Next image: the ${crop.kind} at region ` +
        `x=${crop.region.x} y=${crop.region.y} w=${crop.region.width} h=${crop.region.height} ` +
        `(untrusted page pixels).`,
    });
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: crop.mediaType, data: crop.base64 },
    });
  }
  return blocks;
}
