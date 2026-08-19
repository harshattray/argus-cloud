// Crop grounding — BuildV5 G3. The sidecar is client-supplied, so this suite is
// about one question: can a caller decide what an analysis costs us?
//
// Run: npm test
//
// CG5 is the teeth check. It prices the same request with the budget removed and
// shows the reservation would understate the bill — which is the failure the
// caps exist to stop, and the reason CG2 and CG4 are not decoration.

import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { groundingFromSidecar, imageDimensions } = await import(path.join(DIST, "cropGrounding.js"));
const { HARD_CAPS, maxInputTokens, hardMaxCostMicrodollars, creditsRequired, marginReport, MARGIN_FLOOR,
  CREDIT_REVENUE_FLOOR_MICRODOLLARS: CREDIT_REVENUE_FLOOR } = await import(path.join(DIST, "providerBudget.js"));
const { computeCostMicrodollars } = await import(path.join(DIST, "usage.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

// --- Synthetic image headers -------------------------------------------------
// Real bytes, not fixtures: these are the exact fields `imageDimensions` reads,
// so a test that passes here is reading a genuine header, not a mock.
function pngBytes(width, height) {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
function jpegBytes(width, height) {
  // SOI, an APP0 segment to prove the marker walk works, then SOF0.
  const app0 = Buffer.alloc(4 + 12);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(14, 2); // segment length, covering the 12 bytes that follow
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(8, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}
const png = (w, h) => pngBytes(w, h).toString("base64");
const jpeg = (w, h) => jpegBytes(w, h).toString("base64");

const region = (i) => ({ x: i * 100, y: i * 50, width: 300, height: 200 });
const pair = (i, w, h, mediaType = "image/png") => [
  { kind: "build", region: region(i), mediaType, base64: mediaType === "image/png" ? png(w, h) : jpeg(w, h) },
  { kind: "reference", region: region(i), mediaType, base64: mediaType === "image/png" ? png(w, h) : jpeg(w, h) },
];

// ═══ CG1 — dimensions come from the header, never from the client ═══
{
  check("CG1.1", JSON.stringify(imageDimensions(pngBytes(640, 444))) === '{"width":640,"height":444}', "PNG IHDR is read");
  const j = imageDimensions(jpegBytes(480, 333));
  check("CG1.2", j?.width === 480 && j?.height === 333, `JPEG SOF0 is read past an APP0 segment (${JSON.stringify(j)})`);
  check("CG1.3", imageDimensions(Buffer.from("not an image at all")) === null, "unrecognised bytes measure as nothing, and are not forwarded");
  check("CG1.4", imageDimensions(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(40)])) === null, "a JPEG with no frame header does not hang or guess");

  // The claim that matters: a client that lies about size is measured anyway.
  const lying = groundingFromSidecar({
    crops: [
      { kind: "build", region: region(0), mediaType: "image/png", base64: png(4000, 4000), width: 10, height: 10 },
      { kind: "reference", region: region(0), mediaType: "image/png", base64: png(4000, 4000), width: 10, height: 10 },
    ],
  });
  check(
    "CG1.5",
    lying.crops.length === 0 && lying.dropped.some((d) => d.includes("pixel budget")),
    "a sidecar declaring 10x10 while attaching 4000x4000 is measured at 4000x4000 and dropped"
  );

  // Bytes that are not the type they claim never reach the provider.
  const mislabelled = groundingFromSidecar({
    crops: [
      { kind: "build", region: region(0), mediaType: "image/png", base64: Buffer.from("<html>hi</html>").toString("base64") },
      { kind: "reference", region: region(0), mediaType: "image/png", base64: png(320, 200) },
    ],
  });
  check("CG1.6", mislabelled.crops.length === 0, "bytes that are not a PNG cannot be uploaded as one");
}

// ═══ CG2 — the pixel budget, and dropping in pairs ═══
{
  // Four pairs at 640x444 = 284,160 px each pair-half; 8 crops = 2,272,320 px,
  // over the 1.5M budget. The budget takes whole pairs until it runs out.
  const many = groundingFromSidecar({ crops: [0, 1, 2, 3].flatMap((i) => pair(i, 640, 444)) });
  check("CG2.1", many.pixels <= HARD_CAPS.maxCropPixels, `what survives is inside the budget (${many.pixels} of ${HARD_CAPS.maxCropPixels} px)`);
  check("CG2.2", many.crops.length % 2 === 0, `crops survive in build/reference pairs (${many.crops.length} crops)`);
  check(
    "CG2.3",
    many.crops.filter((c) => c.kind === "build").length === many.crops.filter((c) => c.kind === "reference").length,
    "every surviving build crop still has its reference to be compared against"
  );
  check("CG2.4", many.dropped.some((d) => d.includes("pixel budget")), `the drop is reported, not silent (${many.dropped[0]})`);

  // An orphan is useless on its own — one picture is not a comparison.
  const orphan = groundingFromSidecar({
    crops: [{ kind: "build", region: region(0), mediaType: "image/png", base64: png(320, 200) }],
  });
  check("CG2.5", orphan.crops.length === 0 && orphan.dropped.some((d) => d.includes("no reference")), "a build crop with no reference is dropped, not sent alone");

  // A realistic payload passes through whole.
  const realistic = groundingFromSidecar({ crops: [0, 1, 2, 3].flatMap((i) => pair(i, 640, 263)) });
  check("CG2.6", realistic.crops.length === 8 && realistic.dropped.length === 0, `four real-sized regions fit with nothing dropped (${realistic.pixels} px)`);
  check("CG2.7", realistic.crops.every((c) => c.width === 640 && c.height === 263), "measured dimensions ride along for the cost model");
}

// ═══ CG3 — hostile or broken input yields no crops and never throws (G3.2) ═══
{
  const hostile = [
    ["null", null],
    ["a string", "crops"],
    ["no crops array", { version: 1 }],
    ["crops not an array", { crops: "all of them" }],
    ["a crop that is a number", { crops: [42] }],
    ["a negative region", { crops: [{ kind: "build", region: { x: -1, y: 0, width: 10, height: 10 }, mediaType: "image/png", base64: png(10, 10) }] }],
    ["an unknown kind", { crops: [{ kind: "diff", region: region(0), mediaType: "image/png", base64: png(10, 10) }] }],
    ["an svg content type", { crops: [{ kind: "build", region: region(0), mediaType: "image/svg+xml", base64: png(10, 10) }] }],
    ["an enormous base64 blob", { crops: [{ kind: "build", region: region(0), mediaType: "image/png", base64: "A".repeat(5 * 1024 * 1024) }] }],
  ];
  hostile.forEach(([what, input], i) => {
    let result = null;
    let threw = null;
    try {
      result = groundingFromSidecar(input);
    } catch (err) {
      threw = err;
    }
    check(`CG3.${i + 1}`, threw === null && result.crops.length === 0, `${what}: no crops, no throw — the caller falls back to metadata grounding`);
  });
}

// ═══ CG4 — the crop count cap ═══
{
  const tiny = groundingFromSidecar({ crops: [0, 1, 2, 3, 4, 5].flatMap((i) => pair(i, 64, 64)) });
  check("CG4.1", tiny.crops.length === HARD_CAPS.maxCrops, `twelve tiny crops are cut to the ${HARD_CAPS.maxCrops}-crop limit (${tiny.crops.length})`);
  check("CG4.2", tiny.pixels < HARD_CAPS.maxCropPixels, "the count cap binds even when the pixel budget would not — a request is not free because its images are small");
}

// ═══ CG5 — the budget is the price, and the teeth check ═══
{
  const { system, user, image } = maxInputTokens();
  check("CG5.1", image === Math.ceil(HARD_CAPS.maxCropPixels / HARD_CAPS.imagePixelsPerToken), `the image allowance is derived from the budget, not typed in (${image} tokens)`);

  const report = marginReport();
  const analysis = report.find((r) => r.pass === "analysis");
  const deep = report.find((r) => r.pass === "deep");
  // What crops actually cost, stated rather than assumed.
  //
  // The first version of this check asserted "crops did not move the price",
  // and that was true only against a sonnet price of $3/$15 per MTok that was
  // never going to happen. At the real $2/$10 an analysis is 3 credits without
  // images and 4 with them, so **crops cost exactly one credit** — at any
  // budget worth having, including 0.5M pixels. Hiding that behind a literal
  // would have been the fabricated economics the doctrine forbids.
  const creditsFor = (micro) => { let n = 1; while (n * CREDIT_REVENUE_FLOOR * (1 - MARGIN_FLOOR) < micro) n++; return n; };
  const withBudget = (model, px) =>
    creditsFor(computeCostMicrodollars(model, {
      inputTokens: user + Math.ceil(px / HARD_CAPS.imagePixelsPerToken),
      outputTokens: HARD_CAPS.maxOutputTokens,
      cacheCreationInputTokens: system, cacheReadInputTokens: 0,
    }));
  check(
    "CG5.2",
    analysis.credits === withBudget("claude-sonnet-5", HARD_CAPS.maxCropPixels) &&
      deep.credits === withBudget("claude-opus-4-8", HARD_CAPS.maxCropPixels),
    `the charged price is the one the budget derives — analysis ${analysis.credits}, deep ${deep.credits}`
  );
  check(
    "CG5.2b",
    withBudget("claude-sonnet-5", 0) === analysis.credits - 1,
    `and crops cost exactly one credit: ${withBudget("claude-sonnet-5", 0)} without them, ${analysis.credits} with`
  );
  // The budget is sized by the *deep* pass, which is the binding constraint:
  // opus input is 2.5x sonnet's, so the same pixels cost it more. Anything above
  // ~1.59M pixels takes deep from 8 credits to 9.
  check(
    "CG5.2c",
    withBudget("claude-opus-4-8", HARD_CAPS.maxCropPixels) === 8 && withBudget("claude-opus-4-8", 2_000_000) === 9,
    `the budget sits under the point where deep would cost a ninth credit (${HARD_CAPS.maxCropPixels} px holds 8; 2M px would not)`
  );

  // Teeth: price the same call as it would be if the sidecar set the size.
  // Eight crops at 1568x1568 — the largest the provider will bill without
  // resizing — is what "no budget" actually means.
  const unbounded = 8 * 1568 * 1568;
  const withoutBudget = computeCostMicrodollars("claude-sonnet-5", {
    inputTokens: user + Math.ceil(unbounded / HARD_CAPS.imagePixelsPerToken),
    outputTokens: HARD_CAPS.maxOutputTokens,
    cacheCreationInputTokens: system,
    cacheReadInputTokens: 0,
  });
  const reserved = hardMaxCostMicrodollars("claude-sonnet-5");
  check(
    "CG5.4",
    withoutBudget > reserved,
    `without the budget one call costs $${(withoutBudget / 1e6).toFixed(4)} against a $${(reserved / 1e6).toFixed(4)} reservation — ${(withoutBudget / reserved).toFixed(1)}x what was authorized, so the reservation stops being a maximum`
  );
  // Not "sells below cost" — 5 credits earn $0.1767 and would still cover
  // $0.1571. What breaks is the rule that actually governs: no scenario may
  // earn under the margin floor.
  const revenue = analysis.credits * CREDIT_REVENUE_FLOOR;
  check(
    "CG5.5",
    withoutBudget > revenue * (1 - MARGIN_FLOOR),
    `and margin at that cost is ${(100 * (1 - withoutBudget / revenue)).toFixed(1)}%, under the ${MARGIN_FLOOR * 100}% floor — the price would no longer be derived from the worst case`
  );
}

console.log(failures === 0 ? "\ncropGrounding: all checks green" : `\ncropGrounding: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
