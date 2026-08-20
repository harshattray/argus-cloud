import Anthropic from "@anthropic-ai/sdk";
import type { Provider, ProviderRequest, ProviderResult } from "argus-cloud/explainService.js";
import type { BatchSubmit, BatchFetch, BatchResult, BatchSubmission, FrameScan } from "argus-cloud/ciBatch.js";
import type { TokenUsage } from "argus-cloud/usage.js";
import { OPERATIONS } from "argus-cloud/providerBudget.js";
import { scanFields } from "argus-cloud/secretScan.js";

/**
 * The hosted provider seam (Build 4.0 Phase D). The provider key lives in
 * the server environment ONLY — it is read here, used in-process, and never
 * serialized into a response, header, log line, or client bundle (D5).
 *
 * Hosted analyses are grounded in image crops of the flagged regions when the
 * run carries them (BuildV5 G3), and in diff metadata plus history enrichment
 * when it does not — a run uploaded before crop grounding, or one whose sidecar
 * was unreadable. The two shapes get different system prompts and different
 * result-cache identities, so a metadata answer is never served to a
 * crop-grounded request.
 */

/**
 * Which model runs which pass — **read from `providerBudget.ts`, never declared
 * here**.
 *
 * This file used to carry its own copy, and `providerBudget.ts` claimed in a
 * comment that it did not. That is the drift the derived-credit rule exists to
 * stop: credits are computed from `OPERATIONS`, so a model changed here and not
 * there would have been priced as the old model — the request path calling one
 * model while the ledger charged for another. Nothing would have failed; the
 * margin would just have been wrong.
 */
export const HOSTED_MODELS = {
  analysis: OPERATIONS.analysis.model,
  deep: OPERATIONS.deep.model,
} as const;

// The findings schema, both system prompts, and the shape of one request now
// live in the package (`src/hostedPrompt.ts`) so the node suite can measure
// them against `HARD_CAPS.maxSystemPromptChars` — which claimed to be asserted
// against the real prompt and was not, because the prompt was here.
export {
  FINDING_CATEGORIES,
  FINDINGS_JSON_SCHEMA,
  HOSTED_SYSTEM_PROMPT,
  HOSTED_SYSTEM_PROMPT_CROPS,
} from "argus-cloud/hostedPrompt.js";
import { messageParams as buildParams } from "argus-cloud/hostedPrompt.js";

function requireKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server");
  }
  return key;
}

function toTokenUsage(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  };
}

// Prompt assembly and its size cap live in the package (`src/promptAssembly.ts`)
// so the node suite can prove the cap holds. Re-exported here because the routes
// import `FrameEvidence` from this module.
export { buildUserContent, type FrameEvidence } from "argus-cloud/promptAssembly.js";
import { buildUserBlocks, type FrameEvidence, type UserBlock } from "argus-cloud/promptAssembly.js";
import type { GroundingCrop } from "argus-cloud/cropGrounding.js";

/**
 * The system prompt follows the request shape — a call carrying crops gets the
 * prompt that describes crops, one without keeps the hedge that says so. Both
 * that choice and the parameters are the package's; the SDK type is applied
 * here, at the one place the SDK is actually used.
 */
function messageParams(model: string, blocks: UserBlock[], grounded: boolean): Anthropic.MessageCreateParamsNonStreaming {
  return buildParams(model, blocks, grounded) as unknown as Anthropic.MessageCreateParamsNonStreaming;
}

/** Interactive provider for hostedExplain (D1). */
export function makeProvider(evidence: FrameEvidence): Provider {
  return async (request: ProviderRequest): Promise<ProviderResult> => {
    const client = new Anthropic({ apiKey: requireKey() });
    const crops = request.crops ?? [];
    let response: Anthropic.Message;
    try {
      response = await client.messages.create(
        messageParams(
          request.model,
          buildUserBlocks(evidence, request.enrichmentText ?? null, crops),
          crops.length > 0
        )
      );
    } catch (err) {
      return { kind: "error", message: (err as Error).message };
    }
    if (response.stop_reason === "refusal") {
      return { kind: "refusal" };
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    try {
      return { kind: "ok", json: JSON.parse(text), usage: toTokenUsage(response.usage) };
    } catch {
      return { kind: "error", message: "response was not valid JSON" };
    }
  };
}

/**
 * The batch path's per-frame secret pre-flight (Pathway 2 item 8).
 *
 * It answers the same question `buildUserContent` asks, one frame at a time, so
 * a frame carrying a credential is skipped with a reason instead of throwing
 * out of `submit` and releasing the whole batch. A frame with no evidence is
 * treated as clean here: `makeBatchSubmit` refuses it a few lines later, and
 * inventing a security verdict for a frame we have nothing about would be the
 * wrong answer to the wrong question.
 */
export function makeScan(evidenceByFrame: Map<string, FrameEvidence>): FrameScan {
  return (frame: string) => {
    const evidence = evidenceByFrame.get(frame);
    if (!evidence) {
      return null;
    }
    return scanFields([
      { source: `frame name "${evidence.frame}"`, text: evidence.frame },
      { source: `the label of frame "${evidence.frame}"`, text: evidence.label },
      { source: `the summary.json stats for frame "${evidence.frame}"`, text: JSON.stringify(evidence.stats) },
    ]);
  };
}

/** Batch submit/fetch for enqueueCiBatch/collectCiBatch (D2, 50% rate). */
export function makeBatchSubmit(evidenceByFrame: Map<string, FrameEvidence>): BatchSubmit {
  return async (submission: BatchSubmission): Promise<string> => {
    const client = new Anthropic({ apiKey: requireKey() });
    const batch = await client.messages.batches.create({
      requests: submission.requests.map((r) => {
        const evidence = evidenceByFrame.get(r.frame);
        if (!evidence) {
          throw new Error(`no evidence for frame ${r.frame}`);
        }
        return {
          custom_id: r.customId,
          params: messageParams(
            r.model,
            buildUserBlocks(evidence, r.enrichmentText, r.crops),
            r.crops.length > 0
          ),
        };
      }),
    });
    return batch.id;
  };
}

export function makeBatchFetch(): BatchFetch {
  return async (batchId: string): Promise<Map<string, BatchResult> | null> => {
    const client = new Anthropic({ apiKey: requireKey() });
    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") {
      return null;
    }
    const results = new Map<string, BatchResult>();
    for await (const entry of await client.messages.batches.results(batchId)) {
      if (entry.result.type !== "succeeded") {
        results.set(entry.custom_id, { kind: "error", message: `batch result: ${entry.result.type}` });
        continue;
      }
      const message = entry.result.message;
      if (message.stop_reason === "refusal") {
        results.set(entry.custom_id, { kind: "refusal" });
        continue;
      }
      const text = message.content.find((b) => b.type === "text")?.text ?? "";
      try {
        results.set(entry.custom_id, {
          kind: "ok",
          json: JSON.parse(text),
          usage: toTokenUsage(message.usage as Anthropic.Usage),
        });
      } catch {
        results.set(entry.custom_id, { kind: "error", message: "response was not valid JSON" });
      }
    }
    return results;
  };
}
