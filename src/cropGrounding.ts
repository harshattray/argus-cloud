import { HARD_CAPS } from "./providerBudget.js";

/**
 * Crop grounding (BuildV5 G3) — turning an uploaded crops sidecar into image
 * blocks the provider can be sent, without ever decoding a customer image.
 *
 * ## Why the server does not crop
 *
 * G3 as written has the server fetch the uploaded PNGs and cut the regions
 * itself. That predates the 2026-08-19 decision that customer bytes never reach
 * `sharp`: uploaded artifacts render as plain `<img>` from presigned URLs for
 * exactly that reason. Decoding an attacker-supplied PNG inside our own
 * function is the same hazard with a worse blast radius, so the crops are cut
 * in the CLI — where the images are already decoded — and uploaded.
 *
 * ## What this module is for
 *
 * The sidecar is **client-supplied JSON**, so everything in it is a claim. Two
 * of those claims cost money:
 *
 *   - how many crops there are, and
 *   - how big each one is.
 *
 * Provider vision billing is `pixels / 750`, so a caller who could put an
 * arbitrary number of arbitrarily large images in the request would decide what
 * one analysis costs us — and the dollar reservation taken before the call
 * (Doctrine 11) would stop being a maximum and go back to being a guess. That is
 * the same argument `maxUserContentChars` exists for; images just cost more.
 *
 * **Dimensions come from the image header, never from the sidecar's own
 * numbers, and never from decoding.** Twenty-four bytes of PNG IHDR or a walk
 * to the JPEG SOF marker gives the true width and height without touching a
 * single compressed pixel. A client that declares `100x100` and attaches a
 * 1568x1568 image is measured at 1568x1568 and dropped.
 *
 * ## The budget, and why it is 1.5M pixels
 *
 * Chosen from what it costs, not from what looks generous. **The deep pass is
 * what binds it:** opus input is 2.5× sonnet's, so the same pixels cost it
 * more, and 1.59M is the largest budget that still prices a deep analysis at 8
 * credits rather than 9. 1.5M sits just under that line.
 *
 * Carrying crops costs an analysis exactly one credit — 3 without, 4 with — at
 * any budget worth having. Raise the budget and the credit price follows in the
 * same commit, because it is the same number (`providerBudget.ts`).
 *
 * ## The server can only drop, never shrink
 *
 * The CLI owns the truncation ladder from A3.1 — fewer crops, then smaller
 * crops — because shrinking requires decoding. All this side can do is stop
 * accepting them, so it takes crops in order until the budget is spent and
 * drops the rest. **Crops are dropped in build/reference pairs**: a build crop
 * with no reference beside it is not evidence of a difference, it is one
 * picture, and the model would be comparing it against its own imagination.
 */

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One crop as it will be sent: bytes plus the rectangle they were cut from. */
export interface GroundingCrop {
  kind: "build" | "reference";
  region: CropRegion;
  mediaType: "image/png" | "image/jpeg";
  base64: string;
  /** Measured from the image header, not from what the sidecar claimed. */
  width: number;
  height: number;
}

export interface GroundingResult {
  crops: GroundingCrop[];
  /** What was dropped and why — recorded on the usage event, not shown to the model. */
  dropped: string[];
  /** Sum of `width * height` across the crops that survived. */
  pixels: number;
}

const MEDIA_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * Largest base64 payload one crop may carry, before decoding anything.
 *
 * A byte cap is not a pixel cap — a highly compressible 4000x4000 image can be
 * small — so this does not replace the pixel budget. It bounds the work done
 * *before* the pixel budget can be applied: base64-decoding 40MB to read a
 * 24-byte header is a denial of service with extra steps.
 */
const MAX_CROP_BASE64_CHARS = 4 * 1024 * 1024;

function isRect(value: unknown): value is CropRegion {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (["x", "y", "width", "height"] as const).every(
    (k) => typeof r[k] === "number" && Number.isFinite(r[k] as number) && (r[k] as number) >= 0
  );
}

/**
 * True pixel dimensions from the file header. Returns null when the bytes are
 * not a PNG or JPEG we recognise — which is itself a reason to drop the crop:
 * we do not forward bytes we cannot account for.
 *
 * No decompression happens here. PNG dimensions live in the IHDR chunk at a
 * fixed offset; JPEG's are in the first SOF marker, reached by walking the
 * marker lengths. Both are header reads.
 */
export function imageDimensions(bytes: Buffer): { width: number; height: number } | null {
  // PNG: 8-byte signature, then IHDR length+type (8 bytes), then width, height.
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  // JPEG: SOI, then a chain of markers. The frame header (SOF0-SOF15, minus the
  // four that are not frame headers) carries height then width.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++; // resync rather than trust a length we just read
        continue;
      }
      const marker = bytes[offset + 1];
      // Standalone markers carry no length.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) {
        return null; // end of image, or start of scan — no frame header found
      }
      const length = bytes.readUInt16BE(offset + 2);
      const isFrameHeader =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrameHeader) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (length < 2) {
        return null; // malformed: a length that cannot advance would spin forever
      }
      offset += 2 + length;
    }
  }
  return null;
}

/**
 * Validates an uploaded crops sidecar and bounds it to the pixel budget.
 *
 * Never throws on bad input and never returns an error: a malformed or hostile
 * sidecar yields **no crops**, and the caller falls back to metadata grounding
 * (G3.2, "never errors"). A frame whose extra evidence is unreadable is still a
 * frame worth explaining — refusing the analysis would turn a bad upload into a
 * failed paid request.
 */
export function groundingFromSidecar(json: unknown): GroundingResult {
  const dropped: string[] = [];
  const empty: GroundingResult = { crops: [], dropped, pixels: 0 };

  if (typeof json !== "object" || json === null) {
    dropped.push("sidecar is not an object");
    return empty;
  }
  const raw = (json as { crops?: unknown }).crops;
  if (!Array.isArray(raw)) {
    dropped.push("sidecar has no crops array");
    return empty;
  }

  // Parse and measure first, bound second. Doing it in one pass would let the
  // budget decide which crops get validated, which makes the validation depend
  // on ordering.
  const measured: GroundingCrop[] = [];
  raw.forEach((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      dropped.push(`crop ${i}: not an object`);
      return;
    }
    const c = entry as Record<string, unknown>;
    if (c.kind !== "build" && c.kind !== "reference") {
      dropped.push(`crop ${i}: kind must be build or reference`);
      return;
    }
    if (!isRect(c.region)) {
      dropped.push(`crop ${i}: region is not a rectangle of non-negative numbers`);
      return;
    }
    const mediaType = typeof c.mediaType === "string" ? c.mediaType : "";
    if (!MEDIA_TYPES.has(mediaType)) {
      dropped.push(`crop ${i}: mediaType must be image/png or image/jpeg`);
      return;
    }
    if (typeof c.base64 !== "string" || c.base64.length === 0) {
      dropped.push(`crop ${i}: base64 missing`);
      return;
    }
    if (c.base64.length > MAX_CROP_BASE64_CHARS) {
      dropped.push(`crop ${i}: ${c.base64.length} base64 chars exceeds the per-crop cap`);
      return;
    }
    const bytes = Buffer.from(c.base64, "base64");
    const dims = imageDimensions(bytes);
    if (!dims) {
      // Includes the case that matters most: bytes that are not the image type
      // they claim to be. We do not forward what we cannot measure.
      dropped.push(`crop ${i}: not a readable ${mediaType} header`);
      return;
    }
    if (dims.width === 0 || dims.height === 0) {
      dropped.push(`crop ${i}: zero-sized image`);
      return;
    }
    measured.push({
      kind: c.kind,
      region: c.region,
      mediaType: mediaType as GroundingCrop["mediaType"],
      base64: c.base64,
      width: dims.width,
      height: dims.height,
    });
  });

  // Pair each region's build crop with its reference crop, in arrival order. A
  // crop whose partner did not survive validation goes with it.
  const pairs: GroundingCrop[][] = [];
  const pending = new Map<string, GroundingCrop>();
  for (const crop of measured) {
    const key = `${crop.region.x},${crop.region.y},${crop.region.width},${crop.region.height}`;
    const waiting = pending.get(key);
    if (waiting && waiting.kind !== crop.kind) {
      pairs.push(waiting.kind === "build" ? [waiting, crop] : [crop, waiting]);
      pending.delete(key);
    } else {
      pending.set(key, crop);
    }
  }
  for (const orphan of pending.values()) {
    dropped.push(`crop for region ${orphan.region.x},${orphan.region.y}: no ${orphan.kind === "build" ? "reference" : "build"} crop to compare it against`);
  }

  const crops: GroundingCrop[] = [];
  let pixels = 0;
  for (const pair of pairs) {
    const cost = pair.reduce((sum, c) => sum + c.width * c.height, 0);
    if (crops.length + pair.length > HARD_CAPS.maxCrops) {
      dropped.push(`region ${pair[0].region.x},${pair[0].region.y}: over the ${HARD_CAPS.maxCrops}-crop limit`);
      continue;
    }
    if (pixels + cost > HARD_CAPS.maxCropPixels) {
      dropped.push(`region ${pair[0].region.x},${pair[0].region.y}: ${cost} pixels would exceed the ${HARD_CAPS.maxCropPixels}-pixel budget`);
      continue;
    }
    crops.push(...pair);
    pixels += cost;
  }
  return { crops, dropped, pixels };
}
