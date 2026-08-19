// Crop-grounded explain through the service — BuildV5 G3.1 and G3.2.
//
// Run: npm test
//
// CE3 is the one worth reading. Crop grounding's most likely failure is not an
// error, it is silence: a metadata-only answer cached before crops existed, then
// served to every crop-grounded request forever. Nothing throws, the feature is
// simply absent. CE3.4 runs the pre-fix cache key through the same harness to
// show that is exactly what would happen.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { grantCredits, balance } = await import(path.join(DIST, "ledger.js"));
const { hostedExplain, CREDITS_PER_ANALYSIS } = await import(path.join(DIST, "explainService.js"));
const { enqueueCiBatch } = await import(path.join(DIST, "ciBatch.js"));
const { makeCacheKey } = await import(path.join(DIST, "resultCache.js"));
const { groundingFromSidecar } = await import(path.join(DIST, "cropGrounding.js"));
const { buildUserBlocks, promptVersionFor, PROMPT_VERSION_METADATA, PROMPT_VERSION_CROPS } = await import(
  path.join(DIST, "promptAssembly.js")
);

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const SONNET = "claude-sonnet-5";

async function makeOrg(name, credits = 100) {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, name]);
  if (credits > 0) await grantCredits(db, { orgId: id, kind: "plan_allotment", credits, expiresAt: farFuture });
  return id;
}
async function makeRepo(orgId) {
  const id = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, $3)", [id, orgId, `repo-${id.slice(0, 8)}`]);
  return id;
}
async function makeRun(orgId, repoId) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, summary, state) VALUES ($1,$2,$3,'c1','{}','committed')",
    [id, orgId, repoId]
  );
  return id;
}

function pngBase64(width, height) {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf.toString("base64");
}
const sidecar = (regions = 2) => ({
  version: 1,
  crops: Array.from({ length: regions }).flatMap((_, i) => {
    const region = { x: i * 100, y: i * 40, width: 300, height: 200 };
    return ["build", "reference"].map((kind) => ({
      kind,
      region,
      mediaType: "image/png",
      base64: pngBase64(640, 263),
    }));
  }),
});
const evidence = { frame: "hero.png", label: "Hero", threshold: 0.5, stats: { alignedMismatchPercent: 12.4 } };
const okResult = { kind: "ok", json: { findings: [] }, usage: { inputTokens: 100, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } };

// ═══ CE1 — crops reach the assembled request, labelled and paired (G3.1) ═══
{
  const crops = groundingFromSidecar(sidecar(2)).crops;
  const blocks = buildUserBlocks(evidence, null, crops);
  const images = blocks.filter((b) => b.type === "image");
  check("CE1.1", images.length === 4, `four crops become four image blocks (${images.length})`);
  check("CE1.2", blocks[0].type === "text" && blocks[0].text.includes("12.4"), "the metadata text still leads the turn");
  check(
    "CE1.3",
    blocks.filter((b) => b.type === "text" && /untrusted page pixels/.test(b.text)).length === 4,
    "every image is introduced as untrusted page pixels"
  );
  check(
    "CE1.4",
    blocks.some((b) => b.type === "text" && /x=100 y=40 w=300 h=200/.test(b.text)),
    "each label carries the region rectangle the crop was cut from, so findings can be reported against real coordinates"
  );
  check("CE1.5", images.every((b) => b.source.type === "base64" && b.source.media_type === "image/png"), "images are sent as base64 with their measured media type");

  const none = buildUserBlocks(evidence, null, []);
  check("CE1.6", none.length === 1 && none[0].type === "text", "a frame with no crops sends exactly what it sent before — one text block");
}

// ═══ CE2 — the provider sees the crops, and the request is priced for them ═══
{
  const orgId = await makeOrg("ce2");
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const crops = groundingFromSidecar(sidecar(2)).crops;

  let seen = null;
  const outcome = await hostedExplain(
    db,
    {
      provider: async (request) => {
        seen = request;
        return okResult;
      },
      dailyBudgetMicrodollars: 10_000_000_000,
      alert: () => {},
    },
    { orgId, runId, repoId, frame: "hero.png", buildHash: "b1", designHash: "d1", model: SONNET, pass: "analysis", crops }
  );
  check("CE2.1", outcome.ok === true, "a crop-grounded analysis completes");
  check("CE2.2", seen?.crops?.length === 4, `the provider seam receives the crops rather than the route holding them (${seen?.crops?.length})`);
  check(
    "CE2.3",
    outcome.creditsCharged === CREDITS_PER_ANALYSIS,
    `it costs the derived analysis price, unchanged by carrying crops (${outcome.creditsCharged} credits)`
  );

  const events = (await db.query("SELECT detail FROM usage_events WHERE org_id = $1 AND status = 'charged'", [orgId])).rows;
  check("CE2.4", events.some((e) => e.detail.includes("crops=4")), `the usage event records how many crops it carried, so G4 can separate the two request shapes (${events[0]?.detail})`);
}

// ═══ CE3 — a metadata answer is never served to a crop request ═══
{
  const orgId = await makeOrg("ce3");
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const crops = groundingFromSidecar(sidecar(1)).crops;
  const identity = { orgId, runId, repoId, frame: "hero.png", buildHash: "b1", designHash: "d1", model: SONNET, pass: "analysis" };

  let calls = 0;
  const provider = async () => {
    calls++;
    return okResult;
  };
  const deps = { provider, dailyBudgetMicrodollars: 10_000_000_000, alert: () => {} };

  const first = await hostedExplain(db, deps, identity); // metadata only
  const second = await hostedExplain(db, deps, { ...identity, crops }); // same frame, now with crops
  check("CE3.1", first.ok && !first.cached, "the metadata analysis runs and is cached");
  check("CE3.2", second.ok && second.cached === false && calls === 2, `the crop-grounded request is not served the metadata answer (${calls} provider calls)`);

  const third = await hostedExplain(db, deps, { ...identity, crops });
  check("CE3.3", third.ok && third.cached === true && calls === 2, "a second crop-grounded request does hit the cache — the split is by grounding, not a cache bypass");

  // Teeth: the pre-fix key, which did not carry the grounding.
  const before = makeCacheKey({ ...identity, promptVersion: 1 });
  const alsoBefore = makeCacheKey({ ...identity, promptVersion: 1 });
  const metaKey = makeCacheKey({ ...identity, promptVersion: promptVersionFor([]) });
  const cropKey = makeCacheKey({ ...identity, promptVersion: promptVersionFor(crops) });
  check("CE3.4", before === alsoBefore && metaKey !== cropKey, "with a fixed prompt version both requests hashed to one key — the metadata answer would have been served to every crop request, silently");
  check("CE3.5", promptVersionFor([]) === PROMPT_VERSION_METADATA && promptVersionFor(crops) === PROMPT_VERSION_CROPS, "the two groundings are two prompt versions");
}

// ═══ CE4 — no crops is a supported shape, not a degraded one (G3.2) ═══
{
  const orgId = await makeOrg("ce4");
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);

  let seen = null;
  const outcome = await hostedExplain(
    db,
    { provider: async (r) => { seen = r; return okResult; }, dailyBudgetMicrodollars: 10_000_000_000, alert: () => {} },
    { orgId, runId, repoId, frame: "old.png", buildHash: "b1", designHash: "d1", model: SONNET, pass: "analysis" }
  );
  check("CE4.1", outcome.ok === true, "a pre-crop run still explains — never an error");
  check("CE4.2", Array.isArray(seen.crops) && seen.crops.length === 0, "the provider is told there are none rather than being handed undefined");

  // An unreadable sidecar must land in the same place as no sidecar at all.
  const garbage = groundingFromSidecar({ crops: [{ kind: "build", region: {}, base64: "!!!!" }] });
  check("CE4.3", garbage.crops.length === 0, "a hostile sidecar grounds on metadata instead of failing the paid request");
}

// ═══ CE5 — the batch path carries crops to submit, but never into the row ═══
{
  const orgId = await makeOrg("ce5");
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const crops = groundingFromSidecar(sidecar(2)).crops;

  const submissions = [];
  const enq = await enqueueCiBatch(
    db,
    {
      submit: async (s) => {
        submissions.push(s);
        return `batch_${randomUUID().slice(0, 8)}`;
      },
      fetch: async () => null,
      scan: () => null,
      dailyBudgetMicrodollars: 10_000_000_000,
      alert: () => {},
    },
    {
      orgId,
      repoId,
      runId,
      model: SONNET,
      frames: [
        { frame: "a.png", buildHash: "b1", designHash: "d", crops },
        { frame: "b.png", buildHash: "b2", designHash: "d" },
      ],
    }
  );

  const requests = submissions[0].requests;
  check("CE5.1", requests.find((r) => r.frame === "a.png").crops.length === 4, "the submission carries the frame's crops");
  check("CE5.2", requests.find((r) => r.frame === "b.png").crops.length === 0, "a frame with no sidecar submits with none, in the same batch");

  const row = (await db.query("SELECT entries FROM explain_batches WHERE id = $1", [enq.batchId])).rows[0];
  const stored = typeof row.entries === "string" ? row.entries : JSON.stringify(row.entries);
  check("CE5.3", !stored.includes("base64") && !stored.includes(crops[0].base64.slice(0, 24)), `base64 images are not written into explain_batches (${stored.length} chars stored for 2 frames)`);
}

console.log(failures === 0 ? "\ncropExplain: all checks green" : `\ncropExplain: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
