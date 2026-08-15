import { verifyPresigned } from "argus-cloud/storage/filesystem.js";
import { getStorage } from "../../../lib/storage";

/**
 * Serves the filesystem driver's presigned URLs.
 *
 * **Why this exists.** `presignPut` and `presignGet` on the filesystem driver
 * sign URLs pointing back at this application — `storage.ts` says so plainly:
 * "a filesystem presigned GET points at *our own* app, so some route has to
 * turn that URL back into bytes." That route was never written. The verifier
 * for it was (`verifyPresigned`, "the serving route"), which is how the gap
 * survived: everything around it looked finished.
 *
 * The consequence was larger than a missing dev convenience. The transfer phase
 * of the three-phase upload — the leg where the client PUTs straight to storage
 * — could not run at all outside R2, and the suite bypasses it by calling
 * `storage.put` directly. So the one part of the protocol where the application
 * is deliberately not in the byte path had never actually been exercised. A
 * real upload from the CLI failed here with a bare 404.
 *
 * **In production this route is not the byte path.** With R2 configured,
 * presigned URLs point at R2 and this is never called. It exists so the
 * filesystem driver is a complete implementation of the port rather than one
 * with a hole where the network would be — which is what makes local and CI
 * runs evidence about the real protocol.
 *
 * **Every refusal is the same 403 with no reason.** `verifyPresigned` returns
 * why it refused so this can log it; the response never says. A probe must not
 * be able to tell an expired signature from a forged one from a key that does
 * not exist.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One shape for every refusal. */
function refuse(): Response {
  return new Response("forbidden", { status: 403 });
}

function paramsFrom(request: Request, method: "PUT" | "GET") {
  const url = new URL(request.url);
  const q = url.searchParams;
  const len = q.get("len");
  return {
    key: q.get("key") ?? "",
    method,
    expires: Number(q.get("expires") ?? 0),
    contentLength: len === null || len === "" ? undefined : Number(len),
    nonce: q.get("nonce") ?? undefined,
    signature: q.get("sig") ?? "",
  };
}

function signingSecret(): string | null {
  return process.env.NORMA_STORAGE_SIGNING_SECRET?.trim() || null;
}

export async function PUT(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) {
    // Without the secret the driver signed with, nothing can verify. Fail
    // closed and say nothing useful.
    return refuse();
  }
  const params = paramsFrom(request, "PUT");
  const verdict = verifyPresigned(params, secret);
  if (!verdict.ok) {
    return refuse();
  }

  const body = new Uint8Array(await request.arrayBuffer());

  // The signature pins the length, so this is not a courtesy check — it is the
  // same guarantee R2 gives by rejecting a body that disagrees with the signed
  // `Content-Length`. Without it a presigned PUT accepts anything up to the
  // object limit and every size cap upstream becomes decorative.
  if (params.contentLength !== undefined && body.byteLength !== params.contentLength) {
    return refuse();
  }

  const storage = await getStorage();
  await storage.put(params.key, body, {
    contentType: request.headers.get("content-type") ?? undefined,
  });
  return new Response(null, { status: 200 });
}

export async function GET(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) {
    return refuse();
  }
  const params = paramsFrom(request, "GET");
  const verdict = verifyPresigned(params, secret);
  if (!verdict.ok) {
    return refuse();
  }

  const storage = await getStorage();
  const bytes = await storage.get(params.key);
  if (!bytes) {
    // A verified signature for an absent object. Deliberately the same 403
    // rather than a 404: the difference would tell a holder of one signature
    // whether some other object exists.
    return refuse();
  }
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.byteLength),
      // These bytes are customer artifacts reached through a short-lived
      // bearer URL. Nothing in front of us may keep a copy.
      "cache-control": "private, no-store",
    },
  });
}
