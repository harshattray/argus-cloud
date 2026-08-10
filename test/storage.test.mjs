// Storage port suite — PATHWAYS.md Pathway 1 item 2 / §10.3 "1D"; BuildV5 F3.
//
// Run: npm test — filesystem driver only.
// Against a real S3 API:  DATABASE_URL not needed, but set
//   NORMA_STORAGE_BUCKET / _ENDPOINT / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY
// or just:  scripts/test-s3.sh start   (MinIO — see the script)
//
// The point of this file is that ONE contract runs against BOTH drivers. A
// filesystem driver that is quietly laxer than S3 is worse than no local
// driver, because every later suite would be testing a fiction.

import { mkdtemp, rm, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");

const storage = await import(path.join(DIST, "storage.js"));
const { createFilesystemStorage, verifyPresigned } = await import(path.join(DIST, "storage/filesystem.js"));
const { blobKey, orgPrefix, assertSafeKey, StorageKeyError, MAX_TTL_SECONDS } = storage;

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const bytes = (s) => new TextEncoder().encode(s);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// =======================================================================
// The shared contract. Every assertion here must hold for every driver.
// =======================================================================
async function runContract(label, store) {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const payload = bytes("normascope build frame");
  const digest = sha256("normascope build frame");
  const keyA = blobKey(orgA, digest, "png");

  // --- round trip -------------------------------------------------------
  await store.put(keyA, payload, { contentType: "image/png" });
  const head = await store.head(keyA);
  check(`${label}.1`, head !== null && head.size === payload.byteLength, `head reports the real byte length (${head?.size})`);
  check(`${label}.2`, head?.contentType === "image/png", `head round-trips content type (${head?.contentType})`);
  const got = await store.get(keyA);
  check(`${label}.3`, got !== null && Buffer.from(got).equals(Buffer.from(payload)), "get returns the exact bytes");

  // --- absence is an answer, not an error -------------------------------
  const missingKey = blobKey(orgA, sha256("nothing here"), "png");
  check(`${label}.4`, (await store.head(missingKey)) === null, "head on a missing key is null, not a throw");
  check(`${label}.5`, (await store.get(missingKey)) === null, "get on a missing key is null, not a throw");

  // --- delete is idempotent --------------------------------------------
  await store.delete(keyA);
  let doubleDeleteThrew = false;
  try {
    await store.delete(keyA);
  } catch {
    doubleDeleteThrew = true;
  }
  check(`${label}.6`, !doubleDeleteThrew, "deleting an already-deleted key succeeds — retries must not fail");
  check(`${label}.7`, (await store.head(keyA)) === null, "the object is actually gone after delete");

  // --- cross-tenant isolation ------------------------------------------
  // Identical bytes in two orgs must be two objects. If content-addressing
  // were global, deleting org A would corrupt org B — or worse, knowing a
  // hash would be enough to read another tenant's blob.
  const sameDigest = sha256("shared content");
  const inA = blobKey(orgA, sameDigest, "png");
  const inB = blobKey(orgB, sameDigest, "png");
  check(`${label}.8`, inA !== inB, "identical content in two orgs yields two distinct keys");
  await store.put(inA, bytes("shared content"));
  await store.put(inB, bytes("shared content"));

  const removed = await store.deletePrefix(orgPrefix(orgA));
  check(`${label}.9`, removed === 1, `deletePrefix removed org A's ${removed} object and reported the count`);
  check(`${label}.10`, (await store.head(inA)) === null, "org A's object is gone");
  check(`${label}.11`, (await store.head(inB)) !== null, "org B's identical-content object survives — no cross-tenant sharing");

  // --- deletePrefix is resumable ---------------------------------------
  const again = await store.deletePrefix(orgPrefix(orgA));
  check(`${label}.12`, again === 0, "re-running deletePrefix on an emptied prefix returns 0 and does not throw");

  // --- prefix boundary --------------------------------------------------
  // `org/{a}` must not match `org/{a}extra`. The trailing slash in orgPrefix
  // is the whole defence, so it gets its own check.
  check(`${label}.13`, orgPrefix(orgB).endsWith("/"), "orgPrefix ends with a separator so it cannot match a sibling tenant");

  // --- presigning -------------------------------------------------------
  const put = await store.presignPut(inB, { contentLength: 14, contentType: "image/png", ttlSeconds: 60 });
  check(`${label}.14`, put.method === "PUT" && put.url.startsWith("http"), "presignPut returns an absolute PUT url");
  check(
    `${label}.15`,
    put.headers["content-length"] === "14",
    "presignPut pins content-length into the required headers"
  );
  check(`${label}.16`, put.expiresAt.getTime() > Date.now(), "presignPut expiry is in the future");

  const get = await store.presignGet(inB, { ttlSeconds: 60 });
  check(`${label}.17`, get.url.startsWith("http") && get.expiresAt.getTime() > Date.now(), "presignGet returns a live url");

  let ttlRefused = false;
  try {
    await store.presignGet(inB, { ttlSeconds: MAX_TTL_SECONDS + 1 });
  } catch {
    ttlRefused = true;
  }
  check(`${label}.18`, ttlRefused, `a TTL past the ${MAX_TTL_SECONDS}s ceiling is refused, not clamped`);

  // --- hostile keys -----------------------------------------------------
  const hostile = ["../escape.png", "org/../../etc/passwd", "/absolute.png", "a//b.png", "back\\slash.png", ""];
  let allRefused = true;
  for (const key of hostile) {
    try {
      await store.put(key, bytes("x"));
      allRefused = false;
    } catch {
      /* expected */
    }
  }
  check(`${label}.19`, allRefused, `every hostile key refused (${hostile.length} variants)`);

  await store.deletePrefix(orgPrefix(orgB));
}

// =======================================================================
// Key helpers — driver-independent
// =======================================================================
{
  const org = randomUUID();
  const digest = sha256("k");
  check("S0.1", blobKey(org, digest, "png") === `org/${org}/blob/${digest}.png`, "blobKey matches the BuildV5 G2 layout");
  check("S0.2", blobKey(org, digest.toUpperCase(), ".PNG") === `org/${org}/blob/${digest}.png`, "hash and extension are normalised");

  const bad = [
    () => blobKey("not-a-uuid", digest, "png"),
    () => blobKey(org, "short", "png"),
    () => blobKey(org, digest, "svg"), // not on the allowlist — active content
    () => blobKey(org, digest, "exe"),
  ];
  let refused = 0;
  for (const fn of bad) {
    try {
      fn();
    } catch (e) {
      if (e instanceof StorageKeyError) refused++;
    }
  }
  check("S0.3", refused === bad.length, `blobKey refuses bad org/hash/extension (${refused}/${bad.length})`);

  let dotDotRefused = false;
  try {
    assertSafeKey("org/x/../y.png");
  } catch {
    dotDotRefused = true;
  }
  check("S0.4", dotDotRefused, "assertSafeKey refuses a traversal segment");
  let lookalikeAllowed = true;
  try {
    assertSafeKey("org/x/..png");
  } catch {
    lookalikeAllowed = false;
  }
  check("S0.5", lookalikeAllowed, "…but allows '..png', which is a filename and not a traversal");
}

// =======================================================================
// Filesystem driver
// =======================================================================
const tmpRoot = await mkdtemp(path.join(HERE, ".tmp-storage-"));
try {
  const SECRET = "test-signing-secret";
  const fsStore = createFilesystemStorage({
    root: path.join(tmpRoot, "blobs"),
    publicBaseUrl: "http://localhost:3000/api/blob",
    signingSecret: SECRET,
  });
  check("S1.0", fsStore.driver === "filesystem", "driver identifies itself as filesystem");
  await runContract("S1", fsStore);

  // --- signature verification (filesystem only) -------------------------
  const org = randomUUID();
  const key = blobKey(org, sha256("sig"), "png");
  const signed = await fsStore.presignGet(key, { ttlSeconds: 60 });
  const q = new URL(signed.url).searchParams;
  const params = {
    key: q.get("key"),
    method: "GET",
    expires: Number(q.get("expires")),
    signature: q.get("sig"),
  };

  check("S2.1", verifyPresigned(params, SECRET).ok === true, "a freshly signed url verifies");
  check(
    "S2.2",
    verifyPresigned({ ...params, key: blobKey(randomUUID(), sha256("sig"), "png") }, SECRET).ok === false,
    "swapping the key to another org's object fails verification"
  );
  check("S2.3", verifyPresigned({ ...params, expires: params.expires + 60_000 }, SECRET).ok === false, "extending the expiry fails verification");
  check("S2.4", verifyPresigned(params, "a-different-secret").ok === false, "a url signed with another secret fails");
  check(
    "S2.5",
    verifyPresigned({ ...params, expires: Date.now() - 1000 }, SECRET).ok === false,
    "an expired url fails even with a valid-looking signature"
  );
  check("S2.6", verifyPresigned({ ...params, signature: "" }, SECRET).ok === false, "an empty signature fails");
  check(
    "S2.7",
    verifyPresigned({ ...params, signature: "zz" }, SECRET).ok === false,
    "a malformed signature fails cleanly rather than throwing on length mismatch"
  );

  // Containment: nothing may be written outside the configured root.
  const strays = await readdir(tmpRoot);
  check("S3.1", strays.every((e) => e === "blobs"), `nothing written outside the storage root (found: ${strays.join(", ") || "nothing"})`);
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

// =======================================================================
// S3 driver — real S3 API when configured
// =======================================================================
const S3_READY = Boolean(process.env.NORMA_STORAGE_BUCKET?.trim());
if (S3_READY) {
  const s3Store = await storage.createStorage();
  check("S4.0", s3Store.driver === "s3", "createStorage() selects the S3 driver when a bucket is configured");
  await runContract("S4", s3Store);

  // --- S5: presigned URLs actually work ---------------------------------
  // The contract above only checks their shape. A presigned URL that returns
  // 403 when used is a silent failure, and this is the one place we can drive
  // it end to end against a genuine S3 implementation.
  const org = randomUUID();
  const body = bytes("presigned round trip");
  const key = blobKey(org, sha256("presigned round trip"), "png");

  const put = await s3Store.presignPut(key, {
    contentLength: body.byteLength,
    contentType: "image/png",
    ttlSeconds: 60,
  });
  const putRes = await fetch(put.url, { method: "PUT", headers: put.headers, body });
  check("S5.1", putRes.ok, `an unauthenticated PUT to the presigned url succeeds (${putRes.status})`);

  const stored = await s3Store.head(key);
  check("S5.2", stored?.size === body.byteLength, "the bytes landed at the expected key");

  const get = await s3Store.presignGet(key, { ttlSeconds: 60 });
  const getRes = await fetch(get.url);
  const roundTripped = new Uint8Array(await getRes.arrayBuffer());
  check(
    "S5.3",
    getRes.ok && Buffer.from(roundTripped).equals(Buffer.from(body)),
    "an unauthenticated GET to the presigned url returns the exact bytes"
  );

  // The pinned content-length is the reason a declare-time quota reservation
  // still means something at transfer time. If this passes, a client could
  // reserve 20 bytes and upload 20MB.
  const oversized = bytes("x".repeat(body.byteLength * 4));
  const cheat = await fetch(put.url, {
    method: "PUT",
    headers: { ...put.headers, "content-length": String(oversized.byteLength) },
    body: oversized,
  });
  check("S5.4", !cheat.ok, `uploading more bytes than the signature pinned is rejected (${cheat.status})`);

  // Unsigned access must fail, or the presigning is decoration.
  const naked = await fetch(get.url.split("?")[0]);
  check("S5.5", !naked.ok, `the same url without its signature is refused (${naked.status})`);

  const brief = await s3Store.presignGet(key, { ttlSeconds: 1 });
  await new Promise((r) => setTimeout(r, 2100));
  const stale = await fetch(brief.url);
  check("S5.6", !stale.ok, `an expired presigned url is refused by the server (${stale.status})`);

  await s3Store.deletePrefix(orgPrefix(org));

  // --- S6: deletePrefix past the 1000-key boundary ----------------------
  // ListObjectsV2 pages at 1000 and DeleteObjects caps at 1000, so an org with
  // more objects than that takes a code path nothing else exercises. It is
  // also the path a real organization deletion hits first, and an off-by-one
  // in the batching loop would leave a tenant's data behind while reporting
  // success.
  const bigOrg = randomUUID();
  const COUNT = 1050;
  const keys = Array.from({ length: COUNT }, (_, i) => blobKey(bigOrg, sha256(`obj-${i}`), "png"));

  const CONCURRENCY = 60;
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    await Promise.all(keys.slice(i, i + CONCURRENCY).map((k) => s3Store.put(k, bytes("x"))));
  }
  check("S6.1", (await s3Store.head(keys[COUNT - 1])) !== null, `seeded ${COUNT} objects across the 1000-key boundary`);

  const wiped = await s3Store.deletePrefix(orgPrefix(bigOrg));
  check("S6.2", wiped === COUNT, `deletePrefix removed and counted all ${COUNT} objects (reported ${wiped})`);
  check("S6.3", (await s3Store.head(keys[0])) === null && (await s3Store.head(keys[COUNT - 1])) === null, "first and last objects are both gone — the pagination loop did not stop early");
  check("S6.4", (await s3Store.deletePrefix(orgPrefix(bigOrg))) === 0, "a second pass over the emptied prefix is a clean no-op");
} else {
  console.log("\nSKIP  S4  S3 driver — set NORMA_STORAGE_BUCKET (see scripts/test-s3.sh)");
}

// =======================================================================
// S9 — the architectural rule: no S3 SDK above the port (BuildV5 F3.2)
// =======================================================================
{
  const offenders = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
      const rel = path.relative(ROOT, full);
      if (rel === path.join("src", "storage", "s3.ts")) continue; // the one permitted file
      const text = await readFile(full, "utf-8");
      if (/@aws-sdk\//.test(text)) offenders.push(rel);
    }
  }
  await walk(path.join(ROOT, "src"));
  await walk(path.join(ROOT, "web", "app"));
  await walk(path.join(ROOT, "web", "lib"));
  check(
    "S9.1",
    offenders.length === 0,
    `no @aws-sdk import above the port${offenders.length ? ` — offenders: ${offenders.join(", ")}` : ""}`
  );

  const s3Source = await readFile(path.join(ROOT, "src", "storage", "s3.ts"), "utf-8");
  check("S9.2", /@aws-sdk\/client-s3/.test(s3Source), "…and the R2 driver genuinely is the file that imports it");

  const portSource = await readFile(path.join(ROOT, "src", "storage.ts"), "utf-8");
  check(
    "S9.3",
    /await import\("\.\/storage\/s3\.js"\)/.test(portSource),
    "the port reaches the S3 driver by dynamic import, so the filesystem path never evaluates the SDK"
  );
}

console.log(failures === 0 ? "\nstorage: all checks passed" : `\nstorage: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
